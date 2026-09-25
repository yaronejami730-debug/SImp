import { NextResponse } from "next/server";
import { listUsers, createUser, deleteUser, updateUserFlags } from "@/lib/users";
import { nameAndSlugForCallCenter } from "@/lib/callcenters";
import { getAuth } from "@/lib/auth";
import { agenceScopeCcIds } from "@/lib/agence-scope";
import { sendEmail } from "@/lib/brevo";
import { accountReadyEmail } from "@/lib/account-email";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Admin (super) OU responsable de call center peuvent gérer des comptes.
function requireManager(req: Request) {
  const s = getAuth(req);
  return s && (s.role === "admin" || s.role === "responsable") ? s : null;
}

/** GET -> comptes. Super-admin = tous ; responsable = ceux de SON call center. */
export async function GET(req: Request) {
  const s = requireManager(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const allUsers = s.role === "admin" ? await listUsers() : await listUsers(s.callCenterId);
    // Navigation sous un slug d'agence : restreint même un super-admin à cette agence.
    const agenceScope = await agenceScopeCcIds(req);
    const users = agenceScope ? allUsers.filter((u) => agenceScope.includes(Number(u.call_center_id))) : allUsers;
    return NextResponse.json({ ok: true, users, role: s.role, callCenterId: s.callCenterId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> crée un compte commercial OU téléprospecteur.
 *  Super-admin : les deux, call center 1. Responsable : téléprospecteur seulement, dans SON call center. */
export async function POST(req: Request) {
  const s = requireManager(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      type?: "commercial" | "telepro" | "admin";
      email?: string; password?: string; name?: string; phone?: string; callCenterId?: number; username?: string;
      commissionBase?: number; commissionPct?: number; notifyEmail?: boolean;
    };
    if (!b.username?.trim() || !b.password?.trim() || !b.name?.trim()) {
      return NextResponse.json({ error: "Nom, pseudo et mot de passe requis." }, { status: 400 });
    }
    // Un responsable ne peut créer QUE des téléprospecteurs, dans son propre call center.
    if (s.role === "responsable" && b.type !== "telepro") {
      return NextResponse.json({ error: "Un responsable ne peut ajouter que des téléprospecteurs." }, { status: 403 });
    }
    // Seul un super-admin peut créer un autre super-admin.
    if (b.type === "admin" && s.role !== "admin") {
      return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
    }
    if (b.type === "admin") {
      const user = await createUser({ email: b.email, username: b.username, password: b.password, name: b.name, role: "admin", callCenterId: 1 });
      return NextResponse.json({ ok: true, user });
    }
    // Barème libre (€ fixe + % négo) — RIEN par défaut, c'est l'admin qui le fixe. Sert de
    // fallback pour un téléprospecteur sans affiliation plateforme/commercial (voir /api/accords-telepro).
    const commissionBase = Number(b.commissionBase ?? 0);
    const commissionPct = Number(b.commissionPct ?? 0);
    const isCommercial = b.type === "commercial";
    const isTeleprospector = b.type === "telepro";
    // Admin peut cibler un call center précis (panneau call center) ; sinon son propre CC.
    const callCenterId = s.role === "admin" ? (b.callCenterId && b.callCenterId > 0 ? b.callCenterId : 1) : s.callCenterId;
    // Le type choisi à la création ne fait que poser le PREMIER rôle — cumulable ensuite
    // (toggles Commercial/Téléprospecteur dans la fiche du compte).
    const user = await createUser({
      email: b.email, username: b.username, password: b.password, name: b.name, role: "collab",
      callCenterId, commissionBase, commissionPct, phone: b.phone,
      isCommercial, isTeleprospector,
    });
    // Lien de connexion PERMANENT de l'agence rattachée (pas un lien d'activation à usage
    // unique) — tout le monde chez elle se connecte toujours à la même adresse.
    const cc = await nameAndSlugForCallCenter(callCenterId).catch(() => null);
    const base = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
    const connexionUrl = cc?.slug ? `${base}/${cc.slug}` : undefined;
    // Mail auto "compte prêt" — seulement si demandé (case cochée) + vrai email fourni (pas le placeholder auto).
    if (b.notifyEmail !== false && b.email?.trim() && !/@no-mail\.local$/i.test(b.email.trim()) && connexionUrl) {
      const { html, subject } = accountReadyEmail({
        name: b.name, agenceName: cc?.name, identifiant: b.username, password: b.password, loginUrl: connexionUrl,
      });
      sendEmail({ to: b.email.trim(), toName: b.name, subject, html, senderName: "Activer votre compte" }).catch(() => {});
    }
    return NextResponse.json({ ok: true, user, connexionUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur.";
    return NextResponse.json({ error: /duplicate|unique/i.test(msg) ? "Ce pseudo (ou cet email) existe déjà." : msg }, { status: 500 });
  }
}

/** PATCH -> flags/infos d'un compte. Responsable : uniquement les comptes de son call center. */
export async function PATCH(req: Request) {
  const s = requireManager(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      id?: number; isCommercial?: boolean; isTeleprospector?: boolean; active?: boolean; phone?: string;
      commissionBase?: number; commissionPct?: number; password?: string; autoAssign?: boolean;
    };
    if (!b.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
    if (s.role === "responsable" && !(await sameCallCenter(b.id, s.callCenterId))) {
      return NextResponse.json({ error: "Compte hors de votre call center." }, { status: 403 });
    }
    const patch: Parameters<typeof updateUserFlags>[1] = {
      isCommercial: b.isCommercial, isTeleprospector: b.isTeleprospector, active: b.active, phone: b.phone,
      autoAssign: b.autoAssign,
    };
    // Barème (montants libres) — admin uniquement.
    if (s.role === "admin" && (b.commissionBase !== undefined || b.commissionPct !== undefined)) {
      if (b.commissionBase !== undefined) patch.commissionBase = Number(b.commissionBase);
      if (b.commissionPct !== undefined) patch.commissionPct = Number(b.commissionPct);
    }
    await updateUserFlags(b.id, patch);

    // Nouveau mot de passe posé par l'admin (les mots de passe existants sont hachés,
    // donc illisibles : la seule façon d'accéder à un compte est d'en poser un nouveau).
    if (b.password !== undefined) {
      if (s.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
      if (b.password.trim().length < 6) return NextResponse.json({ error: "Mot de passe : 6 caractères minimum." }, { status: 400 });
      const { setUserPassword } = await import("@/lib/users");
      await setUserPassword(b.id, b.password.trim());
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> supprime un compte (pas un admin). Responsable : uniquement son call center. */
export async function DELETE(req: Request) {
  const s = requireManager(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
  try {
    if (s.role === "responsable" && !(await sameCallCenter(id, s.callCenterId))) {
      return NextResponse.json({ error: "Compte hors de votre call center." }, { status: 403 });
    }
    await deleteUser(id, s.callCenterId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

// Un compte appartient-il au call center du responsable ? (via la liste scopée)
async function sameCallCenter(userId: number, callCenterId: number): Promise<boolean> {
  const users = await listUsers(callCenterId);
  return users.some((u) => u.id === userId && u.role === "collab");
}

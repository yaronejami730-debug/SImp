import { NextResponse } from "next/server";
import { listUsers, createUser, deleteUser, updateUserFlags } from "@/lib/users";
import { schemeByKey } from "@/lib/commission";
import { getAuth } from "@/lib/auth";

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
    const users = s.role === "admin" ? await listUsers() : await listUsers(s.callCenterId);
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
      type?: "commercial" | "telepro" | "admin" | "gestionnaire" | "associe";
      email?: string; password?: string; name?: string; phone?: string; schemeKey?: string; callCenterId?: number; username?: string;
      commissionBase?: number; commissionPct?: number;
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
    // Barème libre (€ fixe + % négo) si fourni, sinon le schéma par défaut — sans objet pour
    // gestionnaire/associé (leur argent vient des deals, pas d'un commission_base sur le compte).
    const sch = schemeByKey(b.schemeKey);
    const commissionBase = b.type === "gestionnaire" || b.type === "associe" ? 0 : b.commissionBase !== undefined ? Number(b.commissionBase) : sch.base;
    const commissionPct = b.type === "gestionnaire" || b.type === "associe" ? 0 : b.commissionPct !== undefined ? Number(b.commissionPct) : sch.pct;
    const isCommercial = b.type === "commercial";
    const isTeleprospector = b.type === "telepro";
    // Admin peut cibler un call center précis (panneau call center) ; sinon son propre CC.
    const callCenterId = s.role === "admin" ? (b.callCenterId && b.callCenterId > 0 ? b.callCenterId : 1) : s.callCenterId;
    // Le type choisi à la création ne fait que poser le PREMIER rôle — cumulable ensuite
    // (toggles Commercial/Téléprospecteur/Gestionnaire/Associé dans la fiche du compte).
    const user = await createUser({
      email: b.email, username: b.username, password: b.password, name: b.name, role: "collab",
      callCenterId, commissionBase, commissionPct, phone: b.phone,
      isCommercial, isTeleprospector,
      isGestionnaire: b.type === "gestionnaire", isAssocie: b.type === "associe",
    });
    return NextResponse.json({ ok: true, user });
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
      id?: number; isCommercial?: boolean; isTeleprospector?: boolean; isGestionnaire?: boolean; isAssocie?: boolean; active?: boolean; phone?: string;
      schemeKey?: string; commissionBase?: number; commissionPct?: number; password?: string;
    };
    if (!b.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
    if (s.role === "responsable" && !(await sameCallCenter(b.id, s.callCenterId))) {
      return NextResponse.json({ error: "Compte hors de votre call center." }, { status: 403 });
    }
    // Gestionnaire/associé : rôles cumulables, réservés au super-admin (comme la création).
    if (s.role !== "admin" && (b.isGestionnaire !== undefined || b.isAssocie !== undefined)) {
      return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
    }
    const patch: Parameters<typeof updateUserFlags>[1] = {
      isCommercial: b.isCommercial, isTeleprospector: b.isTeleprospector, active: b.active, phone: b.phone,
      isGestionnaire: b.isGestionnaire, isAssocie: b.isAssocie,
    };
    if (b.schemeKey) { const sch = schemeByKey(b.schemeKey); patch.commissionBase = sch.base; patch.commissionPct = sch.pct; }
    // Accord direct sur-mesure (montants libres, ex: 60€ négociés avec ce commercial précis) — admin uniquement.
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

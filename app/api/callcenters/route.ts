import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { listCallCenters, createCallCenter, createAgence, setCallCenterParent, setBrandTheme, setGestionnaire, setResponsable2, setTeleproPayMode, renameCallCenter, deleteCallCenter, assignCommercial, unassignCommercial, listAssignments, assignTeleproCommercial, unassignTeleproCommercial, listTeleproAssignments } from "@/lib/callcenters";
import { listAccords, upsertCcAccords } from "@/lib/remuneration";
import { sendEmail } from "@/lib/brevo";
import { accountReadyEmail } from "@/lib/account-email";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

function requireAdmin(req: Request) {
  const s = getAuth(req);
  return s && s.role === "admin" ? s : null;
}

/** GET -> call centers + affectations commerciaux (super-admin). */
export async function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
  try {
    const [callCenters, assignments, accords, teleproAssignments] = await Promise.all([listCallCenters(), listAssignments(), listAccords(), listTeleproAssignments()]);
    return NextResponse.json({ ok: true, callCenters, assignments, accords, teleproAssignments });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> crée une AGENCE { agence:true, name } OU un call center { name, agenceOnly, responsable }. */
export async function POST(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
  try {
    const b = (await req.json()) as { agence?: boolean; name?: string; agenceOnly?: boolean; parentId?: number; notifyEmail?: boolean; responsable?: { name?: string; email?: string; username?: string; password?: string; phone?: string } };
    // Création d'une agence (call center racine).
    if (b.agence) {
      if (!b.name?.trim()) return NextResponse.json({ error: "Nom de l'agence requis." }, { status: 400 });
      const ag = await createAgence(b.name);
      return NextResponse.json({ ok: true, callCenter: ag });
    }
    if (!b.name?.trim() || !b.responsable?.name?.trim() || !b.responsable?.username?.trim() || !b.responsable?.password?.trim()) {
      return NextResponse.json({ error: "Nom du call center + nom/pseudo/mot de passe du responsable requis." }, { status: 400 });
    }
    const cc = await createCallCenter({
      name: b.name, agenceOnly: !!b.agenceOnly, parentId: b.parentId,
      responsable: { name: b.responsable.name, email: b.responsable.email, username: b.responsable.username, password: b.responsable.password, phone: b.responsable.phone },
    });
    // Lien de connexion PERMANENT de cette agence (pas un lien d'activation à usage unique) —
    // tout le monde chez elle s'y connecte, toujours la même adresse.
    const base = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
    const connexionUrl = cc.slug ? `${base}/${cc.slug}` : undefined;
    if (b.notifyEmail !== false && b.responsable.email?.trim() && !/@no-mail\.local$/i.test(b.responsable.email.trim()) && connexionUrl) {
      const { html, subject } = accountReadyEmail({
        name: b.responsable.name, agenceName: cc.name, identifiant: b.responsable.username, password: b.responsable.password, loginUrl: connexionUrl,
      });
      sendEmail({ to: b.responsable.email.trim(), toName: b.responsable.name, subject, html, senderName: "Activer votre compte" }).catch(() => {});
    }
    return NextResponse.json({ ok: true, callCenter: cc, connexionUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur.";
    return NextResponse.json({ error: /duplicate|unique/i.test(msg) ? "Cet email de responsable existe déjà." : msg }, { status: 500 });
  }
}

/** PATCH -> assigne/désassigne un commercial, OU rattache un call center à une agence.
 *  { callCenterId, email, action:"assign"|"unassign" }  ou  { callCenterId, parentId, action:"setAgence" } */
export async function PATCH(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
  try {
    const b = (await req.json()) as { callCenterId?: number; email?: string; parentId?: number; action?: "assign" | "unassign" | "setAgence" | "setTheme" | "rename" | "setSlug" | "setGestionnaire" | "setResponsable2" | "setAccords" | "setPayMode" | "assignTelepro" | "unassignTelepro"; primary?: string; dark?: string; logo?: string; headerDark?: boolean; name?: string; slug?: string; teleproEmail?: string; commercialEmail?: string; priority?: number; payMode?: "gestionnaire" | "responsable" };
    if (b.action === "assignTelepro" || b.action === "unassignTelepro") {
      if (!b.teleproEmail?.trim() || !b.commercialEmail?.trim()) {
        return NextResponse.json({ error: "teleproEmail et commercialEmail requis." }, { status: 400 });
      }
      if (b.action === "assignTelepro") await assignTeleproCommercial(b.teleproEmail, b.commercialEmail, b.priority ?? 0);
      else await unassignTeleproCommercial(b.teleproEmail, b.commercialEmail);
      return NextResponse.json({ ok: true });
    }
    if (!b.callCenterId) return NextResponse.json({ error: "callCenterId requis." }, { status: 400 });
    if (b.action === "setAgence") {
      if (!b.parentId) return NextResponse.json({ error: "parentId (agence) requis." }, { status: 400 });
      await setCallCenterParent(b.callCenterId, b.parentId);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "setAccords") {
      const bb = b as unknown as { callEur?: number; gestEur?: number; respEmail?: string; gestEmail?: string };
      await upsertCcAccords(b.callCenterId, Number(bb.callEur ?? 0), Number(bb.gestEur ?? 0), bb.respEmail ?? "", bb.gestEmail ?? "");
      return NextResponse.json({ ok: true });
    }
    if (b.action === "setGestionnaire") {
      if (!b.email?.trim()) return NextResponse.json({ error: "email requis." }, { status: 400 });
      await setGestionnaire(b.callCenterId, b.email);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "setResponsable2") {
      await setResponsable2(b.callCenterId, b.email ?? "");
      return NextResponse.json({ ok: true });
    }
    if (b.action === "setPayMode") {
      if (b.payMode !== "gestionnaire" && b.payMode !== "responsable") return NextResponse.json({ error: "payMode invalide." }, { status: 400 });
      await setTeleproPayMode(b.callCenterId, b.payMode);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "rename") {
      if (!b.name?.trim()) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
      await renameCallCenter(b.callCenterId, b.name);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "setSlug") {
      const slug = (b.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug) return NextResponse.json({ error: "Slug requis." }, { status: 400 });
      try {
        await getPool().query(`update call_centers set slug = $2 where id = $1`, [b.callCenterId, slug]);
      } catch {
        return NextResponse.json({ error: "Ce slug est déjà pris par une autre agence." }, { status: 409 });
      }
      return NextResponse.json({ ok: true, slug });
    }
    if (b.action === "setTheme") {
      await setBrandTheme(b.callCenterId, { primary: b.primary, dark: b.dark, logo: b.logo, headerDark: b.headerDark });
      return NextResponse.json({ ok: true });
    }
    if (!b.email?.trim() || (b.action !== "assign" && b.action !== "unassign")) {
      return NextResponse.json({ error: "email et action requis." }, { status: 400 });
    }
    if (b.action === "assign") await assignCommercial(b.callCenterId, b.email);
    else await unassignCommercial(b.callCenterId, b.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> supprime une agence / un call center (si rien n'en dépend). */
export async function DELETE(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
  try {
    await deleteCallCenter(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 400 });
  }
}

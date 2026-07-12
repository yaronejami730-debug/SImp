import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listCallCenters, createCallCenter, createAgence, setCallCenterParent, setBrandTheme, setGestionnaire, renameCallCenter, deleteCallCenter, assignCommercial, unassignCommercial, listAssignments } from "@/lib/callcenters";
import { listAccords, upsertCcAccords } from "@/lib/remuneration";

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
    const [callCenters, assignments, accords] = await Promise.all([listCallCenters(), listAssignments(), listAccords()]);
    return NextResponse.json({ ok: true, callCenters, assignments, accords });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> crée une AGENCE { agence:true, name } OU un call center { name, agenceOnly, responsable }. */
export async function POST(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
  try {
    const b = (await req.json()) as { agence?: boolean; name?: string; agenceOnly?: boolean; responsable?: { name?: string; email?: string; username?: string; password?: string; phone?: string } };
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
      name: b.name, agenceOnly: !!b.agenceOnly,
      responsable: { name: b.responsable.name, email: b.responsable.email, username: b.responsable.username, password: b.responsable.password, phone: b.responsable.phone },
    });
    return NextResponse.json({ ok: true, callCenter: cc });
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
    const b = (await req.json()) as { callCenterId?: number; email?: string; parentId?: number; action?: "assign" | "unassign" | "setAgence" | "setTheme" | "rename" | "setGestionnaire" | "setAccords"; primary?: string; dark?: string; logo?: string; headerDark?: boolean; name?: string };
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
    if (b.action === "rename") {
      if (!b.name?.trim()) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
      await renameCallCenter(b.callCenterId, b.name);
      return NextResponse.json({ ok: true });
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

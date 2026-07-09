import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listCallCenters, createCallCenter, assignCommercial, unassignCommercial, listAssignments } from "@/lib/callcenters";

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
    const [callCenters, assignments] = await Promise.all([listCallCenters(), listAssignments()]);
    return NextResponse.json({ ok: true, callCenters, assignments });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { name, agenceOnly, responsable:{name,email,password,phone} } -> crée un call center + son responsable. */
export async function POST(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
  try {
    const b = (await req.json()) as { name?: string; agenceOnly?: boolean; responsable?: { name?: string; email?: string; password?: string; phone?: string } };
    if (!b.name?.trim() || !b.responsable?.name?.trim() || !b.responsable?.email?.trim() || !b.responsable?.password?.trim()) {
      return NextResponse.json({ error: "Nom du call center + nom/email/mot de passe du responsable requis." }, { status: 400 });
    }
    const cc = await createCallCenter({
      name: b.name, agenceOnly: !!b.agenceOnly,
      responsable: { name: b.responsable.name, email: b.responsable.email, password: b.responsable.password, phone: b.responsable.phone },
    });
    return NextResponse.json({ ok: true, callCenter: cc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur.";
    return NextResponse.json({ error: /duplicate|unique/i.test(msg) ? "Cet email de responsable existe déjà." : msg }, { status: 500 });
  }
}

/** PATCH { callCenterId, email, action:"assign"|"unassign" } -> (dé)rattache un commercial à un call center. */
export async function PATCH(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
  try {
    const b = (await req.json()) as { callCenterId?: number; email?: string; action?: "assign" | "unassign" };
    if (!b.callCenterId || !b.email?.trim() || (b.action !== "assign" && b.action !== "unassign")) {
      return NextResponse.json({ error: "callCenterId, email et action requis." }, { status: 400 });
    }
    if (b.action === "assign") await assignCommercial(b.callCenterId, b.email);
    else await unassignCommercial(b.callCenterId, b.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { updateMobileAppt, deleteMobileAppt, getMobileAppt, type MobileStatus } from "@/lib/mobile";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** PATCH -> met à jour un RDV déplacement (statut, infos…) + resync Google. */
export async function PATCH(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  try {
    const patch = (await req.json()) as Record<string, unknown> & { status?: MobileStatus };
    const appt = await updateMobileAppt(Number(id), patch);
    if (!appt) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
    return NextResponse.json({ ok: true, appointment: appt });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE -> supprime un RDV déplacement (+ event Google). */
export async function DELETE(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  try {
    if (!(await getMobileAppt(Number(id)))) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
    await deleteMobileAppt(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

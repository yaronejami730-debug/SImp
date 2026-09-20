import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { updateSlot, deleteSlot } from "@/lib/formation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { id } = await params;
  try {
    const patch = (await req.json()) as { startTime?: string; endTime?: string; type?: string; partnerId?: number; capacity?: number; active?: boolean };
    await updateSlot(Number(id), patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { id } = await params;
  const result = await deleteSlot(Number(id));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ ok: true });
}

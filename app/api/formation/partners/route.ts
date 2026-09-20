import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listPartners, createPartner, updatePartner } from "@/lib/formation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  return NextResponse.json({ ok: true, partners: await listPartners() });
}

export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  try {
    const { name } = (await req.json()) as { name?: string };
    if (!name?.trim()) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
    const partner = await createPartner(name.trim());
    return NextResponse.json({ ok: true, partner });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  try {
    const { id, name, active } = (await req.json()) as { id?: number; name?: string; active?: boolean };
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    await updatePartner(id, { name, active });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

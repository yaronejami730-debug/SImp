import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { dismissScan } from "@/lib/scan";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const { id } = (await req.json()) as { id?: number };
    if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
    await dismissScan(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

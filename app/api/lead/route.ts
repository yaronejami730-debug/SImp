import { NextResponse } from "next/server";
import { getLeadByRef } from "@/lib/leads";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET ?ref=SP-2026-001 */
export async function GET(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  if (!ref) return NextResponse.json({ error: "ref manquant." }, { status: 400 });
  try {
    const lead = await getLeadByRef(ref);
    if (!lead) return NextResponse.json({ error: "Lead introuvable." }, { status: 404 });
    return NextResponse.json({ ok: true, lead });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { markConfirmed } from "@/lib/google";
import { getAuth } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** POST { eid, confirmed } -> confirme (ou dé-confirme) un RDV.
 *  Tant que non confirmé, le SMS au commercial 10 min avant n'est pas envoyé. */
export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const { eid, confirmed } = (await req.json()) as { eid?: string; confirmed?: boolean };
    if (!eid) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    await markConfirmed(eid, confirmed !== false);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

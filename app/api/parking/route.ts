import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { setParkingRequested } from "@/lib/google";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** POST { eid, requested } -> active/désactive la réservation parking pour un RDV.
 *  Le mail parking sera envoyé automatiquement par le cron, ~2h avant le RDV. */
export async function POST(req: Request) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const { eid, requested } = (await req.json()) as { eid?: string; requested?: boolean };
    if (!eid) return NextResponse.json({ error: "eid manquant." }, { status: 400 });

    await setParkingRequested(eid, requested !== false);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

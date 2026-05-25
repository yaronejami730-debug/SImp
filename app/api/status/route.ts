import { NextResponse } from "next/server";
import { patchTracking } from "@/lib/google";
import { getAuth } from "@/lib/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST { eid, present?, signStatus?, negotiation? } -> maj suivi du RDV. Connecté requis. */
export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const { eid, present, signStatus, negotiation } = (await req.json()) as {
      eid?: string;
      present?: boolean;
      signStatus?: string;
      negotiation?: number;
    };
    if (!eid) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }

    await patchTracking(eid, { present, signStatus, negotiation });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

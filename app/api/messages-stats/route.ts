import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { messageStatsByEvent } from "@/lib/messages";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET -> nb de mails/SMS envoyés par RDV (event_id). Pour le module Bilan. */
export async function GET(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const stats = await messageStatsByEvent();
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

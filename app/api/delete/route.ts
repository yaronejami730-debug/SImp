import { NextResponse } from "next/server";
import { deleteEvent } from "@/lib/google";
import { getAuth } from "@/lib/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST { eid } -> supprime DÉFINITIVEMENT l'événement Google (aucun mail, aucun retour).
 *  Réservé au nettoyage des dossiers test/erronés depuis le bilan. */
export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const { eid } = (await req.json()) as { eid?: string };
    if (!eid) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    await deleteEvent(eid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

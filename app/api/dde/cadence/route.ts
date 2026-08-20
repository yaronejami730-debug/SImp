import { NextResponse } from "next/server";
import {
  getDdeAuth, ddeProductionTelepro, ddeProductionEquipe,
  enregistreRaisonCadence, listeRaisonsCadence, DDE_RAISONS_CADENCE,
} from "@/lib/dde";

export const dynamic = "force-dynamic";

/** GET -> production par jour : la sienne, plus celle de l'équipe pour l'admin. */
export async function GET(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const jours = await ddeProductionTelepro(s.email);
    const equipe = s.role === "admin" ? await ddeProductionEquipe() : null;
    const raisons = s.role === "admin" ? await listeRaisonsCadence() : null;
    return NextResponse.json({ ok: true, jours, equipe, raisons });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> la téléprospectrice explique une cadence faible. */
export async function POST(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as { jour?: string; heure?: number; raison?: string };
    if (!b.jour || typeof b.heure !== "number" || !b.raison) {
      return NextResponse.json({ error: "jour, heure et raison requis." }, { status: 400 });
    }
    if (!DDE_RAISONS_CADENCE.includes(b.raison as (typeof DDE_RAISONS_CADENCE)[number])) {
      return NextResponse.json({ error: "Raison inconnue." }, { status: 400 });
    }
    await enregistreRaisonCadence(s, b.jour, b.heure, b.raison);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

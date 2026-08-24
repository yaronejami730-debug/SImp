import { NextResponse } from "next/server";
import { rappelsAvertir, envoyerSmsRappel, texteVeille, texteDeuxHeures } from "@/lib/dde-rappels";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** GET (Bearer CRON_SECRET) -> SMS de rappel DDE : la veille et 2h avant.
 *  Appelé par Supabase pg_cron toutes les 10 minutes (voir supabase/dde_pg_cron.sql). */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  // SMS de rappel désactivés : on ne prévient pas le client d'un rappel téléphonique.
  // Le code reste en place, réactivable avec DDE_RAPPELS_SMS=1.
  if (process.env.DDE_RAPPELS_SMS !== "1") {
    return NextResponse.json({ ok: true, desactive: true });
  }

  try {
    const { veille, deuxHeures } = await rappelsAvertir();
    let envoyes24h = 0, envoyes2h = 0;

    for (const r of veille) {
      if (await envoyerSmsRappel(r.id, r.telephone, texteVeille(r), "sms_24h_at")) envoyes24h++;
    }
    for (const r of deuxHeures) {
      if (await envoyerSmsRappel(r.id, r.telephone, texteDeuxHeures(r), "sms_2h_at")) envoyes2h++;
    }

    return NextResponse.json({ ok: true, candidats24h: veille.length, envoyes24h, candidats2h: deuxHeures.length, envoyes2h });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

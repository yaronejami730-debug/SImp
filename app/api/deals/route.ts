import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listAccords, explainAccord, linesFor } from "@/lib/remuneration";
import { listAppointments } from "@/lib/google";
import { listCallCenters, ancestryMap } from "@/lib/callcenters";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Vue "Mon deal" (page /paiements) : ce qu'un commercial paie à un téléprospecteur affilié à
 *  lui en direct (voir /api/accords-telepro), en plus de son barème de base. Moteur unique —
 *  un accord = une ligne, pas de chaîne gestionnaire/associé. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const me = s.email.toLowerCase();
    const [accords, ccs, users] = await Promise.all([listAccords(), listCallCenters(), listUsers()]);
    const ancestry = ancestryMap(ccs);
    const nameFor = (email: string) => users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.name ?? email;

    const mesAccordsPayeur = accords.filter((a) => a.payer_email.toLowerCase() === me);
    const mesDealsSimplifies = mesAccordsPayeur.map((a) => ({
      ref: String(a.id),
      montant: a.base_eur,
      explain: explainAccord(a, { payeeName: nameFor(a.payee_email) }),
      paymentMethod: a.payment_method, paymentDelayDays: a.payment_delay_days,
    }));

    const now = new Date();
    const appts = (await listAppointments(new Date(now.getTime() - 90 * 86400e3), new Date(now.getTime() + 86400e3)))
      .filter((a) => !a.cancelled);
    const mesRdvDus = appts
      .map((appt) => {
        const lignes = linesFor(appt, mesAccordsPayeur, undefined, ancestry).filter((l) => l.payer === me);
        if (!lignes.length) return null;
        const total = Math.round(lignes.reduce((n, l) => n + l.amount, 0));
        const premiere = lignes[0];
        const accord = accords.find((a) => a.id === premiere.accordId);
        return {
          apptId: appt.id, date: appt.startDateTime, client: `${appt.firstName} ${appt.lastName}`.trim(),
          total, declencheur: accord?.trigger_kind === "honored" ? "RDV honoré" : "mandat signé",
          payeeName: nameFor(premiere.payee),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());

    return NextResponse.json({ ok: true, mesDealsSimplifies, mesRdvDus, myEmail: me });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

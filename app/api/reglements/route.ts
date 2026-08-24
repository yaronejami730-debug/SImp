import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const ETATS = ["a_payer", "facturation", "paye"] as const;
type Etat = (typeof ETATS)[number];

/** POST { appointmentId, commercialEmail, montant, etat } -> pose l'état de règlement d'un dossier.
 *  Réservé à l'admin : c'est lui qui constate une facture émise ou un paiement reçu.
 *  L'état vit dans la table invoices (une ligne par rendez-vous facturé). */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });

  try {
    const b = (await req.json()) as {
      appointmentId?: string; commercialEmail?: string; montant?: number; etat?: string;
      clientName?: string; vehicule?: string; appointmentDate?: string;
    };
    if (!b.appointmentId || !b.commercialEmail || !b.etat) {
      return NextResponse.json({ error: "appointmentId, commercialEmail et etat sont requis." }, { status: 400 });
    }
    if (!ETATS.includes(b.etat as Etat)) return NextResponse.json({ error: "État inconnu." }, { status: 400 });

    // Retour à « à payer » = on efface la trace de facture.
    if (b.etat === "a_payer") {
      await getPool().query(`delete from invoices where appointment_id = $1`, [b.appointmentId]);
      return NextResponse.json({ ok: true, etat: "a_payer" });
    }

    const { rows } = await getPool().query(
      `select call_center_id from users where lower(email) = lower($1)`,
      [b.commercialEmail],
    );
    const callCenterId = Number(rows[0]?.call_center_id ?? 1);
    const status = b.etat === "paye" ? "paid" : "pending";

    await getPool().query(
      `insert into invoices (call_center_id, commercial_email, appointment_id, client_name, vehicle, amount, status, appointment_date, signed_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8)
       on conflict (appointment_id) do update set
         amount = excluded.amount, status = excluded.status, client_name = excluded.client_name,
         vehicle = excluded.vehicle, updated_at = now()`,
      [
        callCenterId, b.commercialEmail.toLowerCase(), b.appointmentId,
        b.clientName ?? "", b.vehicule ?? "", Number(b.montant ?? 0), status,
        b.appointmentDate ?? null,
      ],
    );
    return NextResponse.json({ ok: true, etat: b.etat });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

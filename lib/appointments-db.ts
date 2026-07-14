import { getPool } from "./db";
import type { calendar_v3 } from "googleapis";

/** P1 — Miroir Postgres des RDV (cible : source de vérité).
 *  upsertAppointmentRow(ev) projette un événement Google (extendedProperties.private)
 *  vers la table appointments. Idempotent, appelé après chaque écriture calendrier
 *  (double écriture) + par la réconciliation pg_cron toutes les 10 min. */

export async function upsertAppointmentRow(ev: calendar_v3.Schema$Event): Promise<void> {
  const p = ev.extendedProperties?.private ?? {};
  const isApp = p.app === "simplici-rdv" || !!p.clientEmail;
  if (!ev.id || !isApp) return;
  await getPool().query(
    `insert into appointments (
       google_event_id, call_center_id, start_at, end_at,
       first_name, last_name, email, phone,
       commercial, commercial_email, owner, teleprospector,
       sign_status, cancelled, mandat_removed, present,
       bc_signed, vehicle_sold, confirmed, deplacement,
       negotiation, platform, car_brand, car_model, immatriculation,
       summary, location, props, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29, now())
     on conflict (google_event_id) do update set
       call_center_id=$2, start_at=$3, end_at=$4,
       first_name=$5, last_name=$6, email=$7, phone=$8,
       commercial=$9, commercial_email=$10, owner=$11, teleprospector=$12,
       sign_status=$13, cancelled=$14, mandat_removed=$15, present=$16,
       bc_signed=$17, vehicle_sold=$18, confirmed=$19, deplacement=$20,
       negotiation=$21, platform=$22, car_brand=$23, car_model=$24, immatriculation=$25,
       summary=$26, location=$27, props=$28, created_at=$29, updated_at=now()`,
    [
      ev.id, Number(p.cc ?? "1"),
      ev.start?.dateTime ?? null, ev.end?.dateTime ?? null,
      p.clientFirstName ?? "", p.clientLastName ?? "", p.clientEmail ?? "", p.clientPhone ?? "",
      p.commercial ?? "", (p.commercialEmail ?? "").toLowerCase(), (p.owner ?? "").toLowerCase(), p.teleprospector ?? "",
      p.signStatus ?? "", p.cancelled === "1", p.mandatRemoved === "1", p.present ?? "",
      p.bcSigned === "1", p.vehicleSold === "1", p.confirmed === "1", p.deplacement === "1",
      p.negotiation ? Number(p.negotiation) : 0, p.platform ?? "", p.carBrand ?? "", p.carModel ?? "", p.immatriculation ?? "",
      ev.summary ?? "", ev.location ?? "", JSON.stringify(p), ev.created ?? null,
    ],
  );
}

export async function deleteAppointmentRow(eventId: string): Promise<void> {
  await getPool().query(`delete from appointments where google_event_id = $1`, [eventId]);
}

/** Lit les RDV depuis Postgres sous la MÊME forme que les événements Google
 *  (id/start/created/location + extendedProperties.private = props) : le mapping
 *  existant de listAppointments s'applique tel quel. Bascule via READ_APPTS_FROM_DB=1. */
export async function listEventShapesFromDb(timeMin: Date, timeMax: Date): Promise<calendar_v3.Schema$Event[]> {
  const { rows } = await getPool().query<{ google_event_id: string; start_at: Date | null; end_at: Date | null; created_at: Date | null; location: string; summary: string; props: Record<string, string> }>(
    `select google_event_id, start_at, end_at, created_at, location, summary, props
       from appointments
      where start_at >= $1 and start_at <= $2
      order by start_at asc`,
    [timeMin, timeMax],
  );
  return rows.map((r) => ({
    id: r.google_event_id,
    start: { dateTime: r.start_at ? new Date(r.start_at).toISOString() : undefined },
    end: { dateTime: r.end_at ? new Date(r.end_at).toISOString() : undefined },
    created: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    location: r.location || undefined,
    summary: r.summary || undefined,
    extendedProperties: { private: r.props ?? {} },
  }));
}

export async function appointmentsCount(): Promise<number> {
  const { rows } = await getPool().query<{ c: string }>(`select count(*)::int as c from appointments`);
  return Number(rows[0]?.c ?? 0);
}

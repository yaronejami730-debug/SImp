import { getPool } from "./db";
import { SLOT_MIN } from "./slots";
import { createMobileEvent, updateMobileEvent, deleteMobileEvent } from "./google";
import { geocode } from "./geocode";

export type MobileStatus = "prospect" | "booked" | "confirmed" | "done" | "cancelled";

export type MobileAppt = {
  id: number;
  call_center_id: number;
  teleprospecteur: string;
  commercial: string;
  civility: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  car_brand: string;
  car_model: string;
  immatriculation: string;
  address: string;
  start_datetime: string;
  notes: string;
  status: MobileStatus;
  google_event_id: string;       // event sur l'agenda Bonamy
  google_event_id_own: string;   // event sur ton agenda (tagué mobile)
  reminder24_sent: boolean;
  reminder2_sent: boolean;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

export type MobileInput = {
  callCenterId: number;
  teleprospecteur?: string;
  commercial?: string;
  civility?: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  carBrand?: string;
  carModel?: string;
  immatriculation?: string;
  address?: string;
  startDateTime: string;
  notes?: string;
  status?: MobileStatus;
};

const evt = (a: MobileAppt) => ({
  firstName: a.first_name, lastName: a.last_name, email: a.email, phone: a.phone,
  vehicle: [a.car_brand, a.car_model].filter(Boolean).join(" "), immatriculation: a.immatriculation, commercial: a.commercial,
  address: a.address, startDateTime: a.start_datetime, durationMin: SLOT_MIN, notes: a.notes,
});

/** Créneau libre côté DÉPLACEMENT pour CE call center (n'interagit pas avec les RDV physiques). */
export async function isMobileSlotFree(callCenterId: number, startISO: string, ignoreId?: number): Promise<boolean> {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + SLOT_MIN * 60000);
  const { rows } = await getPool().query<{ start_datetime: string }>(
    `select start_datetime from appointments_mobile
     where call_center_id = $5 and status <> 'cancelled'
       and ($3::bigint is null or id <> $3)
       and start_datetime < $2 and (start_datetime + ($4 || ' minutes')::interval) > $1`,
    [start.toISOString(), end.toISOString(), ignoreId ?? null, String(SLOT_MIN), callCenterId],
  );
  return rows.length === 0;
}

export async function createMobileAppt(input: MobileInput): Promise<MobileAppt> {
  const { rows } = await getPool().query<MobileAppt>(
    `insert into appointments_mobile
       (call_center_id, teleprospecteur, commercial, civility, first_name, last_name, email, phone, car_brand, car_model, immatriculation, address, start_datetime, notes, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     returning *`,
    [
      input.callCenterId, input.teleprospecteur ?? "", input.commercial ?? "Jeremy Bonamy", input.civility ?? "",
      input.firstName.trim(), input.lastName ?? "", input.email ?? "", input.phone ?? "",
      input.carBrand ?? "", input.carModel ?? "", input.immatriculation ?? "", input.address ?? "",
      input.startDateTime, input.notes ?? "", input.status ?? "booked",
    ],
  );
  const a = rows[0];
  // Géocodage de l'adresse (best-effort) pour la tournée.
  if (a.address) {
    try {
      const c = await geocode(a.address);
      if (c) { await getPool().query(`update appointments_mobile set lat = $2, lng = $3 where id = $1`, [a.id, c.lat, c.lng]); a.lat = c.lat; a.lng = c.lng; }
    } catch { /* non-bloquant */ }
  }
  // Sync Google (best-effort) : ton agenda + Bonamy.
  const ids = await createMobileEvent(evt(a));
  if (ids.ownId || ids.mobileId) {
    await getPool().query(`update appointments_mobile set google_event_id = $2, google_event_id_own = $3 where id = $1`, [a.id, ids.mobileId, ids.ownId]);
    a.google_event_id = ids.mobileId;
    a.google_event_id_own = ids.ownId;
  }
  return a;
}

const idsOf = (a: MobileAppt) => ({ ownId: a.google_event_id_own, mobileId: a.google_event_id });

export async function listMobileAppts(callCenterId: number, opts?: { from?: string; to?: string; status?: MobileStatus }): Promise<MobileAppt[]> {
  const where: string[] = ["call_center_id = $1"];
  const params: unknown[] = [callCenterId];
  if (opts?.from) { params.push(opts.from); where.push(`start_datetime >= $${params.length}`); }
  if (opts?.to) { params.push(opts.to); where.push(`start_datetime <= $${params.length}`); }
  if (opts?.status) { params.push(opts.status); where.push(`status = $${params.length}`); }
  const { rows } = await getPool().query<MobileAppt>(
    `select * from appointments_mobile ${where.length ? "where " + where.join(" and ") : ""} order by start_datetime asc limit 500`,
    params,
  );
  return rows;
}

export async function getMobileAppt(id: number): Promise<MobileAppt | null> {
  const { rows } = await getPool().query<MobileAppt>(`select * from appointments_mobile where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function updateMobileAppt(id: number, patch: Partial<MobileInput>): Promise<MobileAppt | null> {
  const map: Record<string, string> = {
    civility: "civility", firstName: "first_name", lastName: "last_name", email: "email", phone: "phone",
    carBrand: "car_brand", carModel: "car_model", immatriculation: "immatriculation", address: "address",
    startDateTime: "start_datetime", notes: "notes", status: "status", commercial: "commercial",
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) { params.push(v); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) return getMobileAppt(id);
  params.push(id);
  const { rows } = await getPool().query<MobileAppt>(
    `update appointments_mobile set ${sets.join(", ")} where id = $${params.length} returning *`,
    params,
  );
  const a = rows[0];
  if (a) {
    const hasEvent = a.google_event_id || a.google_event_id_own;
    if (a.status === "cancelled" && hasEvent) {
      await deleteMobileEvent(idsOf(a));
      await getPool().query(`update appointments_mobile set google_event_id = '', google_event_id_own = '' where id = $1`, [a.id]);
    } else if (hasEvent) {
      await updateMobileEvent(idsOf(a), evt(a));
    } else if (a.status !== "cancelled") {
      const ids = await createMobileEvent(evt(a));
      if (ids.ownId || ids.mobileId) await getPool().query(`update appointments_mobile set google_event_id = $2, google_event_id_own = $3 where id = $1`, [a.id, ids.mobileId, ids.ownId]);
    }
  }
  return a ?? null;
}

export async function deleteMobileAppt(id: number): Promise<void> {
  const a = await getMobileAppt(id);
  if (a && (a.google_event_id || a.google_event_id_own)) await deleteMobileEvent(idsOf(a));
  await getPool().query(`delete from appointments_mobile where id = $1`, [id]);
}

/** RDV déplacement à venir non annulés (pour les rappels cron). */
export async function upcomingMobileAppts(withinMs: number): Promise<MobileAppt[]> {
  const now = new Date();
  const { rows } = await getPool().query<MobileAppt>(
    `select * from appointments_mobile
     where status <> 'cancelled' and start_datetime > $1 and start_datetime <= $2
     order by start_datetime asc`,
    [now.toISOString(), new Date(now.getTime() + withinMs).toISOString()],
  );
  return rows;
}

export async function markMobileReminderSent(id: number, kind: "24h" | "2h"): Promise<void> {
  const col = kind === "24h" ? "reminder24_sent" : "reminder2_sent";
  await getPool().query(`update appointments_mobile set ${col} = true where id = $1`, [id]);
}

/** Géocode (et persiste) les RDV sans coordonnées. Pour la tournée. */
export async function ensureCoords(appts: MobileAppt[]): Promise<void> {
  for (const a of appts) {
    if ((a.lat == null || a.lng == null) && a.address) {
      const c = await geocode(a.address);
      if (c) { a.lat = c.lat; a.lng = c.lng; await getPool().query(`update appointments_mobile set lat = $2, lng = $3 where id = $1`, [a.id, c.lat, c.lng]); }
      await new Promise((r) => setTimeout(r, 1100)); // respect Nominatim ~1 req/s
    }
  }
}

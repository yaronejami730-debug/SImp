import { getPool } from "./db";
import { SLOT_MIN } from "./slots";
import { createMobileEvent, updateMobileEvent, deleteMobileEvent } from "./google";

export type MobileStatus = "prospect" | "booked" | "confirmed" | "done" | "cancelled";

export type MobileAppt = {
  id: number;
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
  google_event_id: string;
  created_at: string;
};

export type MobileInput = {
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
  firstName: a.first_name, lastName: a.last_name, phone: a.phone, address: a.address,
  startDateTime: a.start_datetime, durationMin: SLOT_MIN, notes: a.notes,
});

/** Créneau libre côté DÉPLACEMENT uniquement (n'interagit pas avec les RDV physiques). */
export async function isMobileSlotFree(startISO: string, ignoreId?: number): Promise<boolean> {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + SLOT_MIN * 60000);
  const { rows } = await getPool().query<{ start_datetime: string }>(
    `select start_datetime from appointments_mobile
     where status <> 'cancelled'
       and ($3::bigint is null or id <> $3)
       and start_datetime < $2 and (start_datetime + ($4 || ' minutes')::interval) > $1`,
    [start.toISOString(), end.toISOString(), ignoreId ?? null, String(SLOT_MIN)],
  );
  return rows.length === 0;
}

export async function createMobileAppt(input: MobileInput): Promise<MobileAppt> {
  const { rows } = await getPool().query<MobileAppt>(
    `insert into appointments_mobile
       (teleprospecteur, commercial, civility, first_name, last_name, email, phone, car_brand, car_model, immatriculation, address, start_datetime, notes, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning *`,
    [
      input.teleprospecteur ?? "", input.commercial ?? "Jeremy Bonamy", input.civility ?? "",
      input.firstName.trim(), input.lastName ?? "", input.email ?? "", input.phone ?? "",
      input.carBrand ?? "", input.carModel ?? "", input.immatriculation ?? "", input.address ?? "",
      input.startDateTime, input.notes ?? "", input.status ?? "booked",
    ],
  );
  const a = rows[0];
  // Sync Google (best-effort).
  const gid = await createMobileEvent(evt(a));
  if (gid) {
    await getPool().query(`update appointments_mobile set google_event_id = $2 where id = $1`, [a.id, gid]);
    a.google_event_id = gid;
  }
  return a;
}

export async function listMobileAppts(opts?: { from?: string; to?: string; status?: MobileStatus }): Promise<MobileAppt[]> {
  const where: string[] = [];
  const params: unknown[] = [];
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
    if (a.status === "cancelled" && a.google_event_id) {
      await deleteMobileEvent(a.google_event_id);
      await getPool().query(`update appointments_mobile set google_event_id = '' where id = $1`, [a.id]);
    } else if (a.google_event_id) {
      await updateMobileEvent(a.google_event_id, evt(a));
    } else if (a.status !== "cancelled") {
      const gid = await createMobileEvent(evt(a));
      if (gid) await getPool().query(`update appointments_mobile set google_event_id = $2 where id = $1`, [a.id, gid]);
    }
  }
  return a ?? null;
}

export async function deleteMobileAppt(id: number): Promise<void> {
  const a = await getMobileAppt(id);
  if (a?.google_event_id) await deleteMobileEvent(a.google_event_id);
  await getPool().query(`delete from appointments_mobile where id = $1`, [id]);
}

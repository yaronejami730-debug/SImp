import { getPool } from "./db";

/** MOTEUR DE DISPONIBILITÉS PAR COMMERCIAL — tout paramétrable, rien en dur.
 *  - commercial_settings : durée RDV, fréquence, battement, planning hebdo (jsonb)
 *  - commercial_time_off : vacances / périodes bloquées (plages de dates)
 *  - commercial_exceptions : créneau exceptionnel ('open') ou indispo ponctuelle ('closed')
 *  Les créneaux proposés = hebdo + exceptions - vacances - RDV existants (avec battement). */

export type Weekly = Record<string, [string, string][]>; // "1".."7" (lundi..dimanche) -> [["09:00","12:00"], ...]
export type Settings = { user_email: string; slot_duration_min: number; frequency_min: number; buffer_min: number; weekly: Weekly };
export type TimeOff = { id: number; start_date: string; end_date: string; label: string };
export type ExceptionSlot = { id: number; date: string; kind: "open" | "closed"; start_time: string; end_time: string };

/** Hebdo par défaut = horaires historiques de l'agence (lun-ven, pause déjeuner). */
export const DEFAULT_WEEKLY: Weekly = {
  "1": [["11:00", "13:00"], ["14:00", "19:40"]],
  "2": [["11:00", "13:00"], ["14:00", "19:40"]],
  "3": [["11:00", "13:00"], ["14:00", "19:40"]],
  "4": [["11:00", "13:00"], ["14:00", "19:40"]],
  "5": [["11:00", "13:00"], ["14:00", "19:40"]],
};

export async function getSettings(email: string): Promise<Settings | null> {
  const { rows } = await getPool().query(
    `select user_email, slot_duration_min, frequency_min, buffer_min, weekly from commercial_settings where lower(user_email) = lower($1)`,
    [email],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return { user_email: r.user_email, slot_duration_min: Number(r.slot_duration_min), frequency_min: Number(r.frequency_min), buffer_min: Number(r.buffer_min), weekly: r.weekly ?? {} };
}

export async function saveSettings(email: string, s: { slotDurationMin: number; frequencyMin: number; bufferMin: number; weekly: Weekly }) {
  await getPool().query(
    `insert into commercial_settings (user_email, slot_duration_min, frequency_min, buffer_min, weekly, updated_at)
     values (lower($1),$2,$3,$4,$5, now())
     on conflict (user_email) do update set slot_duration_min=$2, frequency_min=$3, buffer_min=$4, weekly=$5, updated_at=now()`,
    [email, s.slotDurationMin, s.frequencyMin, s.bufferMin, JSON.stringify(s.weekly)],
  );
}

export async function listTimeOff(email: string): Promise<TimeOff[]> {
  const { rows } = await getPool().query(
    `select id, to_char(start_date,'YYYY-MM-DD') as start_date, to_char(end_date,'YYYY-MM-DD') as end_date, label
       from commercial_time_off where lower(user_email)=lower($1) order by start_date`,
    [email],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}
export async function addTimeOff(email: string, start: string, end: string, label = "") {
  await getPool().query(`insert into commercial_time_off (user_email, start_date, end_date, label) values (lower($1),$2,$3,$4)`, [email, start, end, label]);
}
export async function removeTimeOff(email: string, id: number) {
  await getPool().query(`delete from commercial_time_off where id=$1 and lower(user_email)=lower($2)`, [id, email]);
}

export async function listExceptions(email: string): Promise<ExceptionSlot[]> {
  const { rows } = await getPool().query(
    `select id, to_char(date,'YYYY-MM-DD') as date, kind, start_time, end_time
       from commercial_exceptions where lower(user_email)=lower($1) order by date`,
    [email],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}
export async function addException(email: string, e: { date: string; kind: "open" | "closed"; start?: string; end?: string }) {
  await getPool().query(
    `insert into commercial_exceptions (user_email, date, kind, start_time, end_time) values (lower($1),$2,$3,$4,$5)`,
    [email, e.date, e.kind, e.start ?? "", e.end ?? ""],
  );
}
export async function removeException(email: string, id: number) {
  await getPool().query(`delete from commercial_exceptions where id=$1 and lower(user_email)=lower($2)`, [id, email]);
}

// ── Calcul des créneaux ──
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && a2 > b1;

/** Créneaux disponibles d'un commercial pour une date, à partir de ses réglages.
 *  busy = RDV existants du commercial ce jour-là, en minutes locales [start, end]. */
export function computeSlots(
  s: Settings, date: string, weekday: number, // 1=lundi..7=dimanche
  timeOff: TimeOff[], exceptions: ExceptionSlot[], busy: [number, number][],
): string[] {
  // Vacances / période bloquée -> aucun créneau.
  if (timeOff.some((t) => date >= t.start_date && date <= t.end_date)) return [];
  const dayEx = exceptions.filter((e) => e.date === date);
  // Journée fermée exceptionnellement (closed sans heures).
  if (dayEx.some((e) => e.kind === "closed" && !e.start_time)) return [];

  // Plages du jour : hebdo + créneaux exceptionnels 'open'.
  const ranges: [number, number][] = (s.weekly[String(weekday)] ?? []).map(([a, b]) => [toMin(a), toMin(b)] as [number, number]);
  for (const e of dayEx) if (e.kind === "open" && e.start_time && e.end_time) ranges.push([toMin(e.start_time), toMin(e.end_time)]);
  if (!ranges.length) return [];

  const closed = dayEx.filter((e) => e.kind === "closed" && e.start_time && e.end_time).map((e) => [toMin(e.start_time), toMin(e.end_time)] as [number, number]);
  const dur = s.slot_duration_min, freq = Math.max(s.frequency_min, 5), buf = s.buffer_min;

  const out: string[] = [];
  for (const [start, end] of ranges.sort((x, y) => x[0] - y[0])) {
    for (let t = start; t + dur <= end; t += freq) {
      const sEnd = t + dur;
      if (closed.some(([c1, c2]) => overlaps(t, sEnd, c1, c2))) continue;
      // Battement : le nouveau créneau ne doit pas toucher [RDV - battement, RDV fin + battement].
      if (busy.some(([b1, b2]) => overlaps(t, sEnd, b1 - buf, b2 + buf))) continue;
      out.push(fromMin(t));
    }
  }
  return [...new Set(out)].sort();
}

// Configuration des créneaux de rendez-vous.
export const SLOT_MIN = Number(process.env.SLOT_MINUTES ?? 40);
const OPEN = process.env.OPEN_TIME ?? "11:00"; // ouverture
const LUNCH_START = process.env.LUNCH_START ?? "13:00";
const LUNCH_END = process.env.LUNCH_END ?? "14:00";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Créneaux AGENCE : toutes les 40 min de 11:00 à 19:00, pause déjeuner exclue. Lun-Ven. */
export function slotTimes(): string[] {
  const open = toMin(OPEN);
  const lastStart = toMin(process.env.AGENCE_LAST_START ?? "19:00"); // dernier créneau démarre à 19:00
  const ls = toMin(LUNCH_START);
  const le = toMin(LUNCH_END);
  const out: string[] = [];
  for (let s = open; s <= lastStart; s += SLOT_MIN) {
    const e = s + SLOT_MIN;
    if (s < le && e > ls) continue; // chevauche la pause déjeuner
    out.push(fromMin(s));
  }
  return out;
}

/** Créneaux DÉPLACEMENT : toutes les 2 h de 10:00 à 20:00 (10,12,14,16,18,20).
 *  Configurable : MOBILE_OPEN (10:00), MOBILE_LAST (20:00), MOBILE_STEP (120). */
export function slotTimesMobile(): string[] {
  const open = toMin(process.env.MOBILE_OPEN ?? "10:00");
  const last = toMin(process.env.MOBILE_LAST ?? "20:00");
  const step = Number(process.env.MOBILE_STEP ?? 120);
  const out: string[] = [];
  for (let s = open; s <= last; s += step) out.push(fromMin(s));
  return out;
}

/** Créneaux selon le type de RDV. */
export function slotTimesForType(type?: string): string[] {
  return type === "deplacement" ? slotTimesMobile() : slotTimes();
}

/** date "YYYY-MM-DD" -> jour de semaine (1=lundi … 7=dimanche). */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dim
  return wd === 0 ? 7 : wd;
}

export function isWeekday(date: string): boolean {
  const wd = weekday(date);
  return wd >= 1 && wd <= 5;
}

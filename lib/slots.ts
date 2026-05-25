// Configuration des créneaux de rendez-vous.
export const SLOT_MIN = Number(process.env.SLOT_MINUTES ?? 40);
const OPEN = process.env.OPEN_TIME ?? "11:00"; // ouverture
const END = process.env.CLOSE_TIME ?? "20:00"; // dernier créneau doit finir avant
const LUNCH_START = process.env.LUNCH_START ?? "13:00";
const LUNCH_END = process.env.LUNCH_END ?? "14:00";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Heures de début des créneaux (HH:MM), pause déjeuner exclue. Lun-Ven. */
export function slotTimes(): string[] {
  const open = toMin(OPEN);
  const end = toMin(END);
  const ls = toMin(LUNCH_START);
  const le = toMin(LUNCH_END);
  const out: string[] = [];
  for (let s = open; s + SLOT_MIN <= end; s += SLOT_MIN) {
    const e = s + SLOT_MIN;
    if (s < le && e > ls) continue; // chevauche la pause déjeuner
    out.push(fromMin(s));
  }
  return out;
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

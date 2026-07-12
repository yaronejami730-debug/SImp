import { NextResponse } from "next/server";
import { listEvents, halfDay } from "@/lib/google";
import { slotTimesForType, isWeekday, weekday, SLOT_MIN } from "@/lib/slots";
import { toParisISO } from "@/lib/parse";
import { getAuth } from "@/lib/auth";
import { commercialEmailByName } from "@/lib/users";
import { getSettings, listTimeOff, listExceptions, computeSlots } from "@/lib/availability";

const parisMin = (d: Date) => {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
};

export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Normalise un nom pour comparer les commerciaux (accents/casse/ordre).
const ctok = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

/** GET ?date=YYYY-MM-DD&type=agence|deplacement&commercial=Nom
 *  Créneaux du jour. Si `commercial` fourni : disponibilité PAR COMMERCIAL
 *  (seuls ses RDV bloquent) + règle demi-journée (physique vs déplacement). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date");
  const type = sp.get("type") ?? "agence";
  const commercial = sp.get("commercial") ?? "";
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  getAuth(req); // auth facultative (formulaire interne)

  try {
    const dayStart = new Date(toParisISO(date, "00:00"));
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const events = await listEvents(dayStart, dayEnd);
    const isDep = type === "deplacement";
    const cset = ctok(commercial);

    // Événements retenus : si un commercial est ciblé, on ne garde que les siens.
    const evs = events
      .map((ev) => {
        const pr = ev.extendedProperties?.private ?? {};
        return {
          s: ev.start?.dateTime ? new Date(ev.start.dateTime) : null,
          e: ev.end?.dateTime ? new Date(ev.end.dateTime) : null,
          dep: pr.deplacement === "1",
          comm: ctok(pr.commercial ?? ""),
          cancelled: pr.cancelled === "1",
        };
      })
      .filter((b): b is { s: Date; e: Date; dep: boolean; comm: string; cancelled: boolean } => !!b.s && !!b.e && !b.cancelled)
      .filter((b) => (cset ? b.comm === cset : true));

    // ── MOTEUR DE DISPONIBILITÉS : si le commercial a configuré ses réglages,
    //    ses créneaux remplacent totalement la grille legacy (hebdo, durée, fréquence,
    //    battement, vacances, exceptions — voir lib/availability). ──
    const commEmail = commercial ? await commercialEmailByName(commercial) : "";
    const settings = commEmail ? await getSettings(commEmail) : null;
    if (settings) {
      const [timeOff, exceptions] = await Promise.all([listTimeOff(commEmail), listExceptions(commEmail)]);
      const busy: [number, number][] = evs.map((b) => [parisMin(b.s), parisMin(b.e)]);
      const times = computeSlots(settings, date, weekday(date), timeOff, exceptions, busy);
      const nowE = new Date();
      const slots = times
        .filter((time) => new Date(toParisISO(date, time)) > nowE)
        .map((time) => ({ time, taken: false }));
      return NextResponse.json({ ok: true, date, slots, engine: true });
    }

    // ── Grille legacy (aucun réglage commercial) : lun-ven, pas fixe ──
    if (!isWeekday(date)) {
      return NextResponse.json({ ok: true, date, slots: [], closed: true });
    }
    // Demi-journées déjà dédiées à l'AUTRE modalité (uniquement en mode par-commercial).
    const oppHalfDays = new Set<string>();
    if (cset) for (const b of evs) if (b.dep !== isDep) oppHalfDays.add(halfDay(b.s));

    const now = new Date();
    const slots = slotTimesForType(type).map((time) => {
      const start = new Date(toParisISO(date, time));
      const end = new Date(start.getTime() + SLOT_MIN * 60 * 1000);
      const overlap = evs.some((b) => b.s < end && b.e > start);
      const halfBlocked = cset ? oppHalfDays.has(halfDay(start)) : false;
      const taken = start < now || overlap || halfBlocked;
      return { time, taken };
    });

    return NextResponse.json({ ok: true, date, slots });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

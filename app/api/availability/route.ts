import { NextResponse } from "next/server";
import { listEvents, halfDay } from "@/lib/google";
import { slotTimesForType, isWeekday, SLOT_MIN } from "@/lib/slots";
import { toParisISO } from "@/lib/parse";
import { getAuth } from "@/lib/auth";

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
  if (!isWeekday(date)) {
    return NextResponse.json({ ok: true, date, slots: [], closed: true });
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

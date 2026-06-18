import { NextResponse } from "next/server";
import { listEvents } from "@/lib/google";
import { slotTimes, isWeekday, SLOT_MIN } from "@/lib/slots";
import { toParisISO } from "@/lib/parse";
import { getAuth, verifyBooking } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD[&t=token] -> créneaux du jour, dispo PAR ENTITÉ. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  if (!isWeekday(date)) {
    return NextResponse.json({ ok: true, date, slots: [], closed: true });
  }

  // Entité : session (interne) sinon token de réservation (client). Sinon entité 1.
  const s = getAuth(req);
  const tok = sp.get("t") ? verifyBooking(sp.get("t")!) : null;
  const cc = s?.callCenterId ?? tok?.callCenterId ?? 1;

  try {
    const dayStart = new Date(toParisISO(date, "00:00"));
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const events = await listEvents(dayStart, dayEnd);
    const busy = events
      .filter((ev) => ev.extendedProperties?.private?.mobile !== "1") // RDV déplacement -> ne bloque pas le physique
      .filter((ev) => Number(ev.extendedProperties?.private?.cc ?? "1") === cc) // seule l'entité bloque ses créneaux
      .map((ev) => ({
        s: ev.start?.dateTime ? new Date(ev.start.dateTime) : null,
        e: ev.end?.dateTime ? new Date(ev.end.dateTime) : null,
      }))
      .filter((b): b is { s: Date; e: Date } => !!b.s && !!b.e);

    const now = new Date();
    const slots = slotTimes().map((time) => {
      const iso = toParisISO(date, time);
      const s = new Date(iso);
      const e = new Date(s.getTime() + SLOT_MIN * 60 * 1000);
      const taken = s < now || busy.some((b) => b.s < e && b.e > s);
      return { time, taken };
    });

    return NextResponse.json({ ok: true, date, slots });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

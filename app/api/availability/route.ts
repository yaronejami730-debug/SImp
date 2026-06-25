import { NextResponse } from "next/server";
import { listEvents } from "@/lib/google";
import { slotTimesForType, isWeekday, SLOT_MIN } from "@/lib/slots";
import { toParisISO } from "@/lib/parse";
import { getAuth } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD&type=agence|deplacement -> créneaux du jour selon le type. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date");
  const type = sp.get("type") ?? "agence";
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
    const busy = events
      .map((ev) => ({
        s: ev.start?.dateTime ? new Date(ev.start.dateTime) : null,
        e: ev.end?.dateTime ? new Date(ev.end.dateTime) : null,
      }))
      .filter((b): b is { s: Date; e: Date } => !!b.s && !!b.e);

    const now = new Date();
    const slots = slotTimesForType(type).map((time) => {
      const iso = toParisISO(date, time);
      const start = new Date(iso);
      const end = new Date(start.getTime() + SLOT_MIN * 60 * 1000);
      const taken = start < now || busy.some((b) => b.s < end && b.e > start);
      return { time, taken };
    });

    return NextResponse.json({ ok: true, date, slots });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

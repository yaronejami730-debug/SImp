import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { slotTimes, isWeekday, SLOT_MIN } from "@/lib/slots";
import { toParisISO } from "@/lib/parse";
import { listMobileAppts } from "@/lib/mobile";

export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD -> créneaux DÉPLACEMENT (dispo indépendante des RDV physiques). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  if (!isWeekday(date)) return NextResponse.json({ ok: true, date, slots: [], closed: true });

  try {
    const dayStart = new Date(toParisISO(date, "00:00"));
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const appts = (await listMobileAppts({ from: dayStart.toISOString(), to: dayEnd.toISOString() })).filter((a) => a.status !== "cancelled");
    const busy = appts.map((a) => {
      const sd = new Date(a.start_datetime);
      return { s: sd, e: new Date(sd.getTime() + SLOT_MIN * 60000) };
    });
    const now = new Date();
    const slots = slotTimes().map((time) => {
      const sdt = new Date(toParisISO(date, time));
      const e = new Date(sdt.getTime() + SLOT_MIN * 60000);
      const taken = sdt < now || busy.some((b) => b.s < e && b.e > sdt);
      return { time, taken };
    });
    return NextResponse.json({ ok: true, date, slots });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

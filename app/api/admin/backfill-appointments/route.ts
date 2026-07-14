import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listEvents } from "@/lib/google";
import { upsertAppointmentRow, appointmentsCount } from "@/lib/appointments-db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST (admin) -> backfill : importe tous les RDV du calendrier maître vers Postgres.
 *  Idempotent (upsert). Fenêtre : 2025-01-01 -> +1 an. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const events = await listEvents(new Date("2025-01-01T00:00:00Z"), new Date(Date.now() + 365 * 86400e3));
    let imported = 0;
    for (const ev of events) {
      const p = ev.extendedProperties?.private ?? {};
      if (!(p.app === "simplici-rdv" || p.clientEmail)) continue;
      await upsertAppointmentRow(ev);
      imported++;
    }
    const total = await appointmentsCount();
    return NextResponse.json({ ok: true, scanned: events.length, imported, totalInDb: total });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

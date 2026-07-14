import { NextResponse } from "next/server";
import { google } from "googleapis";
import { upsertAppointmentRow, deleteAppointmentRow } from "@/lib/appointments-db";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** POST (Bearer CRON_SECRET, pg_cron toutes les 10 min) -> réconciliation incrémentale :
 *  tout événement modifié dans les 2 dernières heures est re-projeté vers Postgres.
 *  Filet de sécurité de la double écriture (rien ne peut diverger plus de 10 min). */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  try {
    const oauth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    oauth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    const cal = google.calendar({ version: "v3", auth: oauth });
    const updatedMin = new Date(Date.now() - 2 * 3600e3).toISOString();
    let pageToken: string | undefined;
    let upserted = 0, deleted = 0;
    do {
      const r = await cal.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
        updatedMin, showDeleted: true, maxResults: 2500, pageToken, singleEvents: true,
      });
      for (const ev of r.data.items ?? []) {
        if (!ev.id) continue;
        if (ev.status === "cancelled") { await deleteAppointmentRow(ev.id); deleted++; continue; }
        const p = ev.extendedProperties?.private ?? {};
        if (p.app === "simplici-rdv" || p.clientEmail) { await upsertAppointmentRow(ev); upserted++; }
      }
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    return NextResponse.json({ ok: true, upserted, deleted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

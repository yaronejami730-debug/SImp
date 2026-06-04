import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listEvents, colorIdForStatus } from "@/lib/google";
import { google } from "googleapis";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? "primary";

function calClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth });
}

/** POST → réapplique colorId à TOUS les events simplici-rdv et simplici-reminder. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Admin requis." }, { status: 403 });

  try {
    const now = new Date();
    const min = new Date(now.getTime() - 365 * 24 * 3600 * 1000); // -1 an
    const max = new Date(now.getTime() + 365 * 24 * 3600 * 1000); // +1 an
    const items = await listEvents(min, max);

    const cal = calClient();
    let updated = 0;
    let rdvCount = 0;
    let reminderCount = 0;
    const errors: string[] = [];

    for (const ev of items) {
      if (!ev.id) continue;
      const p = ev.extendedProperties?.private ?? {};
      let targetColor: string | null = null;
      if (p.app === "simplici-rdv") {
        targetColor = colorIdForStatus({
          cancelled: p.cancelled === "1",
          signStatus: p.signStatus,
          bcSigned: p.bcSigned === "1",
          vehicleSold: p.vehicleSold === "1",
        });
        rdvCount++;
      } else if (p.app === "simplici-reminder") {
        targetColor = "3"; // violet
        reminderCount++;
      }
      if (!targetColor || ev.colorId === targetColor) continue;
      try {
        await cal.events.patch({
          calendarId: CALENDAR_ID,
          eventId: ev.id,
          requestBody: { colorId: targetColor },
        });
        updated++;
      } catch (e) {
        errors.push(`${ev.id}: ${e instanceof Error ? e.message : "err"}`);
      }
    }

    return NextResponse.json({
      ok: true,
      checked: items.length,
      rdvCount,
      reminderCount,
      updated,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}

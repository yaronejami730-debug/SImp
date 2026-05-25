import { google, type calendar_v3 } from "googleapis";
import type { Appointment } from "./parse";

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? "primary";
const BUSINESS = process.env.BUSINESS_NAME ?? "Simplisicar";

function calendarClient(): calendar_v3.Calendar {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  auth.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  });
  return google.calendar({ version: "v3", auth });
}

/** Crée l'événement dans Google Agenda. Les infos client sont stockées
 *  dans extendedProperties.private pour que le cron retrouve l'e-mail. */
export async function createEvent(a: Appointment) {
  const cal = calendarClient();
  const start = new Date(a.startDateTime);
  const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min par défaut

  const res = await cal.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: `RDV ${a.firstName} ${a.lastName} — ${BUSINESS}`,
      description: [
        `Client : ${a.firstName} ${a.lastName}`,
        `E-mail : ${a.email}`,
        `Plateforme : ${a.platform}`,
        `Annonce : ${a.listingUrl}`,
        `Lieu : ${a.location}`,
      ].join("\n"),
      location: a.location,
      start: { dateTime: start.toISOString(), timeZone: "Europe/Paris" },
      end: { dateTime: end.toISOString(), timeZone: "Europe/Paris" },
      extendedProperties: {
        private: {
          clientEmail: a.email,
          clientFirstName: a.firstName,
          clientLastName: a.lastName,
          platform: a.platform,
          listingUrl: a.listingUrl,
        },
      },
    },
  });

  return res.data;
}

/** Liste les événements entre deux dates (cron de relance). */
export async function listEvents(timeMin: Date, timeMax: Date) {
  const cal = calendarClient();
  const res = await cal.events.list({
    calendarId: CALENDAR_ID,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });
  return res.data.items ?? [];
}

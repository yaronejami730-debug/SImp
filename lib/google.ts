import { google, type calendar_v3 } from "googleapis";
import type { Appointment } from "./parse";

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? "primary";
const BUSINESS = process.env.BUSINESS_NAME ?? "Simplisicar";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function calendarClient(): calendar_v3.Calendar {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  // Voie A : compte de service (recommandé, aucun navigateur / redirect).
  if (clientEmail && privateKey) {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: SCOPES,
    });
    return google.calendar({ version: "v3", auth });
  }

  // Voie B : OAuth utilisateur via refresh token.
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
        `Téléphone : ${a.phone}`,
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
          clientPhone: a.phone,
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

/** Récupère un événement par son id (page de reprogrammation). */
export async function getEvent(eventId: string) {
  const cal = calendarClient();
  const res = await cal.events.get({
    calendarId: CALENDAR_ID,
    eventId,
  });
  return res.data;
}

/** Supprime (annule) un événement. */
export async function deleteEvent(eventId: string) {
  const cal = calendarClient();
  await cal.events.delete({ calendarId: CALENDAR_ID, eventId });
}

/** RDV simplifié pour le dashboard. */
export type AppointmentItem = {
  id: string;
  startDateTime: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  platform: string;
  listingUrl: string;
  location: string;
  present: boolean;
  signStatus: "" | "signed" | "thinking" | "unsigned";
  negotiation: number; // montant de la négociation en euros (0 si non saisi)
};

/** Liste les RDV (events) entre deux dates, format simplifié pour le dashboard. */
export async function listAppointments(
  timeMin: Date,
  timeMax: Date,
): Promise<AppointmentItem[]> {
  const items = await listEvents(timeMin, timeMax);
  return items.map((ev) => {
    const p = ev.extendedProperties?.private ?? {};
    return {
      id: ev.id ?? "",
      startDateTime: ev.start?.dateTime ?? null,
      firstName: p.clientFirstName ?? "",
      lastName: p.clientLastName ?? "",
      email: p.clientEmail ?? "",
      phone: p.clientPhone ?? "",
      platform: p.platform ?? "",
      listingUrl: p.listingUrl ?? "",
      location: ev.location ?? "",
      present: p.present === "1",
      signStatus: (p.signStatus as AppointmentItem["signStatus"]) ?? "",
      negotiation: p.negotiation ? Number(p.negotiation) : 0,
    };
  });
}

/** Met à jour les champs de suivi (présent / signature / négociation) d'un RDV. */
export async function patchTracking(
  eventId: string,
  fields: { present?: boolean; signStatus?: string; negotiation?: number },
) {
  const cal = calendarClient();
  const priv: Record<string, string> = {};
  if (fields.present !== undefined) priv.present = fields.present ? "1" : "0";
  if (fields.signStatus !== undefined) priv.signStatus = fields.signStatus;
  if (fields.negotiation !== undefined) priv.negotiation = String(fields.negotiation);
  await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: priv } },
  });
}

/** Déplace un événement à une nouvelle heure de début (reprogrammation).
 *  Garde la même durée (30 min par défaut). */
export async function updateEvent(eventId: string, newStartISO: string) {
  const cal = calendarClient();
  const start = new Date(newStartISO);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const res = await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: {
      start: { dateTime: start.toISOString(), timeZone: "Europe/Paris" },
      end: { dateTime: end.toISOString(), timeZone: "Europe/Paris" },
      // Reset des rappels : la nouvelle heure déclenchera de nouveaux 24h/2h.
      extendedProperties: {
        private: { reminder24Sent: null, reminder2Sent: null } as unknown as {
          [k: string]: string;
        },
      },
    },
  });
  return res.data;
}

/** Marque qu'un rappel (24h ou 2h) a été envoyé pour cet événement. */
export async function markReminderSent(eventId: string, kind: "24h" | "2h") {
  const cal = calendarClient();
  const key = kind === "24h" ? "reminder24Sent" : "reminder2Sent";
  await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { [key]: "1" } } },
  });
}

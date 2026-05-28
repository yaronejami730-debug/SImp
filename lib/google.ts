import { google, type calendar_v3 } from "googleapis";
import type { Appointment } from "./parse";

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? "primary";
const BUSINESS = process.env.BUSINESS_NAME ?? "Simplisicar";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/contacts",
];

function googleAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    return new google.auth.JWT({ email: clientEmail, key: privateKey, scopes: SCOPES });
  }
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return auth;
}

/** Crée un contact dans Google Contacts (People API). Requiert le scope
 *  `https://www.googleapis.com/auth/contacts` dans le refresh token OAuth. */
export async function createGoogleContact(opts: {
  firstName: string;
  lastName?: string;
  phone: string;
  email?: string;
  note?: string;
  websites?: string[];
}): Promise<string> {
  const auth = googleAuth();
  const people = google.people({ version: "v1", auth });
  const res = await people.people.createContact({
    requestBody: {
      names: [{ givenName: opts.firstName || "Lead", familyName: opts.lastName || "" }],
      phoneNumbers: opts.phone ? [{ value: opts.phone, type: "mobile" }] : [],
      emailAddresses: opts.email ? [{ value: opts.email }] : [],
      biographies: opts.note ? [{ value: opts.note, contentType: "TEXT_PLAIN" }] : [],
      urls: (opts.websites ?? []).filter(Boolean).map((u) => ({ value: u })),
    },
  });
  return res.data.resourceName ?? "";
}

/** Met à jour un contact Google existant (par resourceName). */
export async function updateGoogleContact(resourceName: string, opts: {
  firstName?: string;
  lastName?: string;
  websites?: string[];
}): Promise<void> {
  const auth = googleAuth();
  const people = google.people({ version: "v1", auth });
  const existing = await people.people.get({ resourceName, personFields: "names,urls,metadata" });
  const etag = existing.data.etag;
  const updateFields: string[] = [];
  const body: Record<string, unknown> = { etag };
  if (opts.firstName !== undefined || opts.lastName !== undefined) {
    body.names = [{ givenName: opts.firstName ?? "", familyName: opts.lastName ?? "" }];
    updateFields.push("names");
  }
  if (opts.websites) {
    body.urls = opts.websites.filter(Boolean).map((u) => ({ value: u }));
    updateFields.push("urls");
  }
  await people.people.updateContact({
    resourceName,
    updatePersonFields: updateFields.join(","),
    requestBody: body,
  });
}

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
export async function createEvent(a: Appointment, owner = "") {
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
          app: "simplici-rdv",
          owner,
          clientCivility: a.civility ?? "",
          clientEmail: a.email,
          clientPhone: a.phone,
          clientFirstName: a.firstName,
          clientLastName: a.lastName,
          platform: a.platform,
          listingUrl: a.listingUrl,
          history: JSON.stringify([{ t: "created", at: new Date().toISOString() }]),
        },
      },
    },
  });

  return res.data;
}

/** Crée un événement "rappel téléphonique" (15 min) dans Google Agenda.
 *  - clientEmail (si fourni) -> ajouté comme attendee : Google le voit alors
 *    comme un "contact fréquent" (Contacts > Autres contacts). */
export async function createReminderEvent(opts: {
  firstName: string;
  lastName: string;
  phone: string;
  listingUrl?: string;
  note?: string;
  remindAt: string; // ISO
  owner: string;
  clientEmail?: string;
}): Promise<string> {
  const cal = calendarClient();
  const start = new Date(opts.remindAt);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const name = `${opts.firstName} ${opts.lastName}`.trim() || opts.phone;

  const attendees: { email: string; displayName?: string }[] = [];
  if (opts.clientEmail) attendees.push({ email: opts.clientEmail, displayName: name });

  const res = await cal.events.insert({
    calendarId: CALENDAR_ID,
    sendUpdates: "none", // on envoie nos propres mails via Brevo, pas l'invite Google
    requestBody: {
      summary: `📞 Rappel ${name}`,
      description: [
        `Téléphone : ${opts.phone}`,
        opts.clientEmail ? `E-mail : ${opts.clientEmail}` : "",
        opts.listingUrl ? `Annonce : ${opts.listingUrl}` : "",
        opts.note ? `Note : ${opts.note}` : "",
      ].filter(Boolean).join("\n"),
      start: { dateTime: start.toISOString(), timeZone: "Europe/Paris" },
      end: { dateTime: end.toISOString(), timeZone: "Europe/Paris" },
      ...(attendees.length ? { attendees } : {}),
      extendedProperties: {
        private: {
          app: "simplici-reminder",
          kind: "reminder",
          owner: opts.owner,
          phone: opts.phone,
          clientEmail: opts.clientEmail ?? "",
          clientFirstName: opts.firstName,
          clientLastName: opts.lastName,
        },
      },
    },
  });
  return res.data.id ?? "";
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

/** Vrai si aucun événement ne chevauche [start, start+durationMin].
 *  ignoreEventId : exclure un event (cas reprogrammation du même RDV). */
export async function isSlotFree(
  startISO: string,
  durationMin: number,
  ignoreEventId?: string,
): Promise<boolean> {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const items = await listEvents(
    new Date(start.getTime() - 6 * 3600 * 1000),
    new Date(end.getTime() + 6 * 3600 * 1000),
  );
  for (const ev of items) {
    if (ignoreEventId && ev.id === ignoreEventId) continue;
    const es = ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
    const ee = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
    if (!es || !ee) continue;
    if (es < end && ee > start) return false; // chevauchement
  }
  return true;
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
  owner: string; // email du collaborateur ayant créé le RDV
  civility: string;
  createdAt: string | null;
  history: { t: string; at: string; info?: string }[];
  parkingRequested: boolean;
  parkingSent: boolean;
};

/** Liste les RDV (events) entre deux dates, format simplifié pour le dashboard. */
export async function listAppointments(
  timeMin: Date,
  timeMax: Date,
): Promise<AppointmentItem[]> {
  const items = await listEvents(timeMin, timeMax);
  return items
    // Ne garder que les RDV créés par l'app (pas les events perso de l'agenda).
    .filter((ev) => {
      const p = ev.extendedProperties?.private;
      return p?.app === "simplici-rdv" || !!p?.clientEmail;
    })
    .map((ev) => {
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
      owner: p.owner ?? "",
      civility: p.clientCivility ?? "",
      createdAt: ev.created ?? null,
      history: (() => { try { return JSON.parse(p.history ?? "[]"); } catch { return []; } })(),
      parkingRequested: p.parkingRequested === "1",
      parkingSent: p.parkingSent === "1",
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

  // Lire l'historique existant pour y ajouter la reprogrammation.
  let hist = await readHistory(eventId);
  hist.push({ t: "rescheduled", at: new Date().toISOString(), info: newStartISO });

  const res = await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: {
      start: { dateTime: start.toISOString(), timeZone: "Europe/Paris" },
      end: { dateTime: end.toISOString(), timeZone: "Europe/Paris" },
      extendedProperties: {
        // Reset des rappels + ajout historique.
        private: { reminder24Sent: null, reminder2Sent: null, history: JSON.stringify(hist.slice(-40)) } as unknown as {
          [k: string]: string;
        },
      },
    },
  });
  return res.data;
}

export type HistEntry = { t: string; at: string; info?: string };

async function readHistory(eventId: string): Promise<HistEntry[]> {
  try {
    const ev = await getEvent(eventId);
    return JSON.parse(ev.extendedProperties?.private?.history ?? "[]");
  } catch {
    return [];
  }
}

/** Ajoute une entrée à l'historique (timeline) de l'événement. */
export async function appendHistory(eventId: string, t: string, info?: string) {
  const hist = await readHistory(eventId);
  hist.push({ t, at: new Date().toISOString(), ...(info ? { info } : {}) });
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { history: JSON.stringify(hist.slice(-40)) } } },
  });
}

/** Active/désactive la réservation parking pour un RDV. */
export async function setParkingRequested(eventId: string, requested: boolean) {
  const hist = await readHistory(eventId);
  hist.push({ t: requested ? "parking_requested" : "parking_cancelled", at: new Date().toISOString() });
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: {
      extendedProperties: {
        private: {
          parkingRequested: requested ? "1" : "",
          ...(requested ? {} : { parkingSent: "" }),
          history: JSON.stringify(hist.slice(-40)),
        } as unknown as { [k: string]: string },
      },
    },
  });
}

/** Marque que le mail parking a été envoyé. */
export async function markParkingSent(eventId: string) {
  const hist = await readHistory(eventId);
  hist.push({ t: "parking_sent", at: new Date().toISOString() });
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { parkingSent: "1", history: JSON.stringify(hist.slice(-40)) } } },
  });
}

/** Marque qu'un rappel (24h ou 2h) a été envoyé + historique. */
export async function markReminderSent(eventId: string, kind: "24h" | "2h") {
  const key = kind === "24h" ? "reminder24Sent" : "reminder2Sent";
  const hist = await readHistory(eventId);
  hist.push({ t: kind === "24h" ? "reminder_24h" : "reminder_2h", at: new Date().toISOString() });
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { [key]: "1", history: JSON.stringify(hist.slice(-40)) } } },
  });
}

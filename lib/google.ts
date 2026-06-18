import { google, type calendar_v3 } from "googleapis";
import type { Appointment } from "./parse";
import { commercialInviteEmail } from "./commerciaux";
import { genRef } from "./ref";

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
export async function createEvent(a: Appointment, owner = "", callCenterId = 1) {
  const cal = calendarClient();
  const start = new Date(a.startDateTime);
  const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min par défaut

  const vehicle = [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ");
  const invite = commercialInviteEmail(a.commercial); // ex: Bonamy -> bonamy.mimi@gmail.com
  const ref = genRef();
  const requestBody: calendar_v3.Schema$Event = {
      summary: `RDV ${a.firstName} ${a.lastName}${vehicle ? ` — ${vehicle}` : ""} — ${BUSINESS}`,
      colorId: "9", // Blueberry = bleu (RDV pris, sans statut)
      description: [
        `Client : ${a.firstName} ${a.lastName}`,
        `E-mail : ${a.email}`,
        `Téléphone : ${a.phone}`,
        vehicle ? `Véhicule : ${vehicle}` : "",
        `Plateforme : ${a.platform}`,
        `Annonce : ${a.listingUrl}`,
        a.commercial ? `Commercial : ${a.commercial}` : "",
        `Lieu : ${a.location}`,
      ].filter(Boolean).join("\n") + `\n\nRéférence : ${ref}`,
      location: a.location,
      attendees: invite ? [{ email: invite }] : undefined,
      start: { dateTime: start.toISOString(), timeZone: "Europe/Paris" },
      end: { dateTime: end.toISOString(), timeZone: "Europe/Paris" },
      extendedProperties: {
        private: {
          app: "simplici-rdv",
          owner,
          cc: String(callCenterId),
          ref,
          clientCivility: a.civility ?? "",
          clientEmail: a.email,
          clientPhone: a.phone,
          clientFirstName: a.firstName,
          clientLastName: a.lastName,
          platform: a.platform,
          listingUrl: a.listingUrl,
          commercial: a.commercial ?? "",
          carBrand: a.carBrand ?? "",
          carModel: a.carModel ?? "",
          carFinish: a.carFinish ?? "",
          history: JSON.stringify([{ t: "created", at: new Date().toISOString() }]),
        },
      },
  };

  // Invite auto (ex: Bonamy -> bonamy.mimi). Si le compte refuse les invités, on réinsère sans.
  try {
    const res = await cal.events.insert({ calendarId: CALENDAR_ID, requestBody, sendUpdates: "none" });
    return res.data;
  } catch (e) {
    if (requestBody.attendees?.length) {
      const { attendees, ...noAtt } = requestBody; void attendees;
      const res = await cal.events.insert({ calendarId: CALENDAR_ID, requestBody: noAtt });
      return res.data;
    }
    throw e;
  }
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
      colorId: "3", // Grape = violet (rappel téléphonique)
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
  callCenterId?: number,
): Promise<boolean> {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const items = await listEvents(
    new Date(start.getTime() - 6 * 3600 * 1000),
    new Date(end.getTime() + 6 * 3600 * 1000),
  );
  for (const ev of items) {
    if (ignoreEventId && ev.id === ignoreEventId) continue;
    if (ev.extendedProperties?.private?.mobile === "1") continue; // RDV déplacement -> ne bloque pas le physique
    // Dispo par entité : seuls les RDV de la même entité bloquent le créneau.
    if (callCenterId != null && Number(ev.extendedProperties?.private?.cc ?? "1") !== callCenterId) continue;
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
  callCenterId: number;
  ref: string;
  startDateTime: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  platform: string;
  listingUrl: string;
  carBrand: string;
  carModel: string;
  carFinish: string;
  location: string;
  present: boolean;
  signStatus: "" | "signed" | "thinking" | "unsigned";
  negotiation: number; // montant de la négociation en euros (0 si non saisi)
  owner: string; // email du collaborateur ayant créé le RDV
  commercial: string; // nom du commercial qui gère le RDV
  civility: string;
  createdAt: string | null;
  history: { t: string; at: string; info?: string }[];
  parkingRequested: boolean;
  parkingSent: boolean;
  cancelled: boolean;
  bcSigned: boolean;
  bcSignedAt: string | null;
  vehicleSold: boolean;
  soldAt: string | null;
  photos: string[];
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
      callCenterId: Number(p.cc ?? "1"),
      ref: p.ref ?? "",
      startDateTime: ev.start?.dateTime ?? null,
      firstName: p.clientFirstName ?? "",
      lastName: p.clientLastName ?? "",
      email: p.clientEmail ?? "",
      phone: p.clientPhone ?? "",
      platform: p.platform ?? "",
      listingUrl: p.listingUrl ?? "",
      carBrand: p.carBrand ?? "",
      carModel: p.carModel ?? "",
      carFinish: p.carFinish ?? "",
      location: ev.location ?? "",
      present: p.present === "1",
      signStatus: (p.signStatus as AppointmentItem["signStatus"]) ?? "",
      negotiation: p.negotiation ? Number(p.negotiation) : 0,
      owner: p.owner ?? "",
      commercial: p.commercial ?? "",
      civility: p.clientCivility ?? "",
      createdAt: ev.created ?? null,
      history: (() => { try { return JSON.parse(p.history ?? "[]"); } catch { return []; } })(),
      parkingRequested: p.parkingRequested === "1",
      parkingSent: p.parkingSent === "1",
      cancelled: p.cancelled === "1",
      bcSigned: p.bcSigned === "1",
      bcSignedAt: p.bcSignedAt || null,
      vehicleSold: p.vehicleSold === "1",
      soldAt: p.soldAt || null,
      photos: (() => { try { return JSON.parse(p.photos ?? "[]"); } catch { return []; } })(),
    };
  });
}

/** Met à jour la marque/modèle du véhicule sur un RDV. */
export async function patchVehicle(eventId: string, fields: { carBrand?: string; carModel?: string; carFinish?: string }) {
  const cal = calendarClient();
  const priv: Record<string, string> = {};
  if (fields.carBrand !== undefined) priv.carBrand = fields.carBrand;
  if (fields.carModel !== undefined) priv.carModel = fields.carModel;
  if (fields.carFinish !== undefined) priv.carFinish = fields.carFinish;
  await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: priv } },
  });
}

/** Lit la liste des photos (paths Supabase) stockée sur l'event. */
export async function readPhotos(eventId: string): Promise<string[]> {
  try {
    const ev = await getEvent(eventId);
    const raw = ev.extendedProperties?.private?.photos;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/** Écrit la liste des photos sur l'event.
 *  ⚠️ extendedProperties limite chaque valeur à 1024 chars → on cap à ~6 URLs Blob. */
export async function writePhotos(eventId: string, paths: string[]) {
  let kept = paths.slice(-12);
  let json = JSON.stringify(kept);
  while (json.length > 1020 && kept.length > 0) {
    kept = kept.slice(1);
    json = JSON.stringify(kept);
  }
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { photos: json } } },
  });
}

/** Met à jour la note interne (texte libre) d'un RDV. */
export async function patchNote(eventId: string, note: string) {
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { note: note.slice(0, 1000) } } },
  });
}

/** Met à jour les coordonnées du client (téléphone, email) sur un RDV. */
export async function patchContact(eventId: string, fields: { phone?: string; email?: string }) {
  const cal = calendarClient();
  const priv: Record<string, string> = {};
  if (fields.phone !== undefined) priv.clientPhone = fields.phone;
  if (fields.email !== undefined) priv.clientEmail = fields.email;
  await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: priv } },
  });
}

/** Met à jour le commercial qui gère un RDV. */
export async function patchCommercial(eventId: string, commercial: string) {
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { commercial: commercial.trim() } } },
  });
}

/** Couleur Google Calendar selon statut.
 *  9=Blueberry bleu / 10=Basil vert / 6=Tangerine orange / 8=Graphite gris / 11=Tomato rouge / 3=Grape violet */
export function colorIdForStatus(opts: {
  cancelled?: boolean; signStatus?: string;
  bcSigned?: boolean; vehicleSold?: boolean;
}): string {
  if (opts.cancelled) return "11"; // rouge
  if (opts.vehicleSold || opts.bcSigned || opts.signStatus === "signed") return "10"; // vert
  if (opts.signStatus === "thinking") return "6"; // orange
  if (opts.signStatus === "unsigned") return "8"; // gris
  return "9"; // bleu (pris, sans statut)
}

/** Met à jour les champs de suivi (présent / signature / négo / BC / vendu) d'un RDV. */
export async function patchTracking(
  eventId: string,
  fields: { present?: boolean; signStatus?: string; negotiation?: number; bcSigned?: boolean; vehicleSold?: boolean },
) {
  const cal = calendarClient();
  const priv: Record<string, string> = {};
  if (fields.present !== undefined) priv.present = fields.present ? "1" : "0";
  if (fields.signStatus !== undefined) priv.signStatus = fields.signStatus;
  if (fields.negotiation !== undefined) priv.negotiation = String(fields.negotiation);
  if (fields.bcSigned !== undefined) {
    priv.bcSigned = fields.bcSigned ? "1" : "";
    priv.bcSignedAt = fields.bcSigned ? new Date().toISOString() : "";
  }
  if (fields.vehicleSold !== undefined) {
    priv.vehicleSold = fields.vehicleSold ? "1" : "";
    priv.soldAt = fields.vehicleSold ? new Date().toISOString() : "";
  }
  // Calcule couleur à partir de l'état projeté
  let colorId: string | undefined;
  if (fields.signStatus !== undefined || fields.bcSigned !== undefined || fields.vehicleSold !== undefined) {
    const ev = await getEvent(eventId);
    const p = ev.extendedProperties?.private ?? {};
    const next = {
      cancelled: p.cancelled === "1",
      signStatus: fields.signStatus ?? p.signStatus ?? "",
      bcSigned: fields.bcSigned ?? p.bcSigned === "1",
      vehicleSold: fields.vehicleSold ?? p.vehicleSold === "1",
    };
    colorId = colorIdForStatus(next);
  }
  await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: {
      extendedProperties: { private: priv },
      ...(colorId ? { colorId } : {}),
    },
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

/** Marque un RDV comme annulé (sans le supprimer) + ajoute à l'historique. */
export async function markCancelled(eventId: string) {
  const hist = await readHistory(eventId);
  hist.push({ t: "cancelled", at: new Date().toISOString() });
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: {
      summary: undefined,
      colorId: "11", // rouge (calendar color "Tomate")
      extendedProperties: { private: { cancelled: "1", history: JSON.stringify(hist.slice(-40)) } },
    },
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
export async function markReminderSent(eventId: string, kind: "24h" | "2h" | "15min") {
  const key = kind === "24h" ? "reminder24Sent" : kind === "2h" ? "reminder2Sent" : "reminder15Sent";
  const histType = kind === "24h" ? "reminder_24h" : kind === "2h" ? "reminder_2h" : "reminder_15min";
  const hist = await readHistory(eventId);
  hist.push({ t: histType, at: new Date().toISOString() });
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { [key]: "1", history: JSON.stringify(hist.slice(-40)) } } },
  });
}

// ─────────── Agenda EN DÉPLACEMENT (calendrier Google séparé, bleu ciel) ───────────
// Partage le calendrier de bonami.minier@gmail.com avec le compte de service, puis
// renseigne GOOGLE_MOBILE_CALENDAR_ID. Si absent -> sync ignorée (best-effort).
const MOBILE_CALENDAR_ID = process.env.GOOGLE_MOBILE_CALENDAR_ID;
const MOBILE_COLOR = "7"; // Peacock = bleu ciel
const MOBILE_ATTENDEE = process.env.MOBILE_ATTENDEE_EMAIL ?? "bonamy.mimi@gmail.com"; // invité par défaut des déplacements

export type MobileEventInput = {
  firstName: string; lastName?: string; email?: string; phone?: string;
  vehicle?: string; immatriculation?: string; commercial?: string;
  address?: string; startDateTime: string; durationMin: number; notes?: string; ref?: string;
};

function mobileEventBody(a: MobileEventInput): calendar_v3.Schema$Event {
  const end = new Date(new Date(a.startDateTime).getTime() + a.durationMin * 60000).toISOString();
  const name = `${a.firstName} ${a.lastName ?? ""}`.trim();
  const description = [
    `Client : ${name}`,
    `E-mail : ${a.email ?? ""}`,
    `Téléphone : ${a.phone ?? ""}`,
    a.vehicle ? `Véhicule : ${a.vehicle}` : "",
    a.immatriculation ? `Immatriculation : ${a.immatriculation}` : "",
    `Plateforme : Déplacement`,
    a.commercial ? `Commercial : ${a.commercial}` : "",
    `Lieu : ${a.address ?? ""}`,
    a.notes ? `Notes : ${a.notes}` : "",
  ].filter(Boolean).join("\n") + (a.ref ? `\n\nRéférence : ${a.ref}` : "");
  return {
    summary: `🚗 Déplacement — ${name}${a.vehicle ? ` — ${a.vehicle}` : ""} — ${BUSINESS}`,
    location: a.address || undefined,
    description,
    colorId: MOBILE_COLOR,
    attendees: MOBILE_ATTENDEE ? [{ email: MOBILE_ATTENDEE }] : undefined,
    start: { dateTime: a.startDateTime, timeZone: "Europe/Paris" },
    end: { dateTime: end, timeZone: "Europe/Paris" },
  };
}

export type MobileEventIds = { ownId: string; mobileId: string };

/** Crée le RDV déplacement sur DEUX agendas : le tien (CALENDAR_ID, tagué `mobile`
 *  pour ne PAS bloquer tes créneaux physiques) + celui de Bonamy (MOBILE_CALENDAR_ID). */
/** Insert avec invité ; si le compte refuse les invités (service account sans DWD), réessaie sans. */
async function insertWithAttendeeFallback(calendarId: string, body: calendar_v3.Schema$Event): Promise<string> {
  const cal = calendarClient();
  try {
    const res = await cal.events.insert({ calendarId, requestBody: body, sendUpdates: "none" });
    return res.data.id ?? "";
  } catch (e) {
    if (body.attendees?.length) {
      try {
        const { attendees, ...noAtt } = body; void attendees;
        const res = await cal.events.insert({ calendarId, requestBody: noAtt });
        return res.data.id ?? "";
      } catch (e2) { console.error("insert (no attendee) failed", e2); return ""; }
    }
    console.error("insert failed", e);
    return "";
  }
}

export async function createMobileEvent(a: MobileEventInput): Promise<MobileEventIds> {
  const body = mobileEventBody(a);
  // Ton agenda — tagué mobile pour l'exclure de la dispo physique.
  const ownId = await insertWithAttendeeFallback(CALENDAR_ID, { ...body, extendedProperties: { private: { mobile: "1" } } });
  // Agenda Bonamy (si configuré).
  const mobileId = MOBILE_CALENDAR_ID ? await insertWithAttendeeFallback(MOBILE_CALENDAR_ID, body) : "";
  return { ownId, mobileId };
}

export async function updateMobileEvent(ids: MobileEventIds, a: MobileEventInput): Promise<void> {
  const cal = calendarClient();
  if (ids.ownId) {
    try { await cal.events.patch({ calendarId: CALENDAR_ID, eventId: ids.ownId, requestBody: { ...mobileEventBody(a), extendedProperties: { private: { mobile: "1" } } }, sendUpdates: "none" }); }
    catch (e) { console.error("updateMobileEvent (own) failed", e); }
  }
  if (MOBILE_CALENDAR_ID && ids.mobileId) {
    try { await cal.events.patch({ calendarId: MOBILE_CALENDAR_ID, eventId: ids.mobileId, requestBody: mobileEventBody(a), sendUpdates: "none" }); }
    catch (e) { console.error("updateMobileEvent (bonamy) failed", e); }
  }
}

export async function deleteMobileEvent(ids: MobileEventIds): Promise<void> {
  const cal = calendarClient();
  if (ids.ownId) { try { await cal.events.delete({ calendarId: CALENDAR_ID, eventId: ids.ownId, sendUpdates: "none" }); } catch (e) { console.error("deleteMobileEvent (own) failed", e); } }
  if (MOBILE_CALENDAR_ID && ids.mobileId) { try { await cal.events.delete({ calendarId: MOBILE_CALENDAR_ID, eventId: ids.mobileId, sendUpdates: "none" }); } catch (e) { console.error("deleteMobileEvent (bonamy) failed", e); } }
}

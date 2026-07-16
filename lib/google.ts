import { google, type calendar_v3 } from "googleapis";
import type { Appointment } from "./parse";
import { commercialInviteEmail } from "./commerciaux";
import { genRef } from "./ref";
import { commercialEmailByName, commercialPhoneByName } from "./users";
import { SLOT_MIN } from "./slots";

const COMM_BUFFER_MS = Number(process.env.MOBILE_BUFFER_MIN ?? 20) * 60000; // marge trajet autour des déplacements
const ctok = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

export type CommercialConflict = { ref: string; deplacement: boolean; start: string | null };

/** Conflit pour un commercial : ne peut pas être à 2 RDV à la fois (physique + déplacement),
 *  + marge trajet autour des déplacements. Renvoie le RDV en conflit ou null. */
export async function commercialConflict(
  commercial: string, startISO: string, isDeplacement: boolean, ignoreEventId?: string,
): Promise<CommercialConflict | null> {
  const tset = ctok(commercial ?? "");
  if (!tset) return null;
  const start = new Date(startISO).getTime();
  const dur = SLOT_MIN * 60000;
  const myStart = isDeplacement ? start - COMM_BUFFER_MS : start;
  const myEnd = (isDeplacement ? start + dur + COMM_BUFFER_MS : start + dur);
  const items = await listEvents(new Date(start - 6 * 3600e3), new Date(start + 6 * 3600e3));
  for (const ev of items) {
    if (ignoreEventId && ev.id === ignoreEventId) continue;
    const pr = ev.extendedProperties?.private ?? {};
    if (ctok(pr.commercial ?? "") !== tset) continue;
    const es = ev.start?.dateTime ? new Date(ev.start.dateTime).getTime() : null;
    const ee = ev.end?.dateTime ? new Date(ev.end.dateTime).getTime() : null;
    if (!es || !ee) continue;
    const isDep = pr.deplacement === "1";
    const bs = isDep ? es - COMM_BUFFER_MS : es;
    const be = isDep ? ee + COMM_BUFFER_MS : ee;
    if (bs < myEnd && be > myStart) return { ref: pr.ref ?? "", deplacement: isDep, start: ev.start?.dateTime ?? null };
  }
  return null;
}

// Demi-journée locale Paris : matin < 13h, après-midi >= 13h (la pause 13-14 n'a pas de créneau).
const parisDayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const parisHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(d));
export const halfDay = (d: Date): "am" | "pm" => (parisHour(d) < 13 ? "am" : "pm");

/** Règle demi-journée : une demi-journée (matin/aprem) est dédiée à UNE seule modalité
 *  par commercial. S'il a déjà un RDV de l'AUTRE type (physique vs déplacement) sur la
 *  même demi-journée, on bloque. Renvoie true si bloqué. */
export async function halfDayModalityBlocked(
  commercial: string, startISO: string, isDeplacement: boolean, ignoreEventId?: string,
): Promise<boolean> {
  const tset = ctok(commercial ?? "");
  if (!tset) return false;
  const start = new Date(startISO);
  const dayKey = parisDayKey(start);
  const half = halfDay(start);
  const items = await listEvents(new Date(start.getTime() - 12 * 3600e3), new Date(start.getTime() + 12 * 3600e3));
  for (const ev of items) {
    if (ignoreEventId && ev.id === ignoreEventId) continue;
    const pr = ev.extendedProperties?.private ?? {};
    if (pr.cancelled === "1") continue;
    if (ctok(pr.commercial ?? "") !== tset) continue;
    const es = ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
    if (!es) continue;
    if (parisDayKey(es) !== dayKey || halfDay(es) !== half) continue;
    if ((pr.deplacement === "1") !== isDeplacement) return true; // modalité opposée, même demi-journée
  }
  return false;
}

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
    return mirrored(google.calendar({ version: "v3", auth }));
  }

  // Voie B : OAuth utilisateur via refresh token.
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  auth.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  });
  return mirrored(google.calendar({ version: "v3", auth }));
}

/** P1 — DOUBLE ÉCRITURE : toute mutation du calendrier maître est reflétée dans Postgres
 *  (table appointments), en fire-and-forget. Un seul point d'accroche pour tout le code. */
function mirrored(cal: calendar_v3.Calendar): calendar_v3.Calendar {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const ev = cal.events as any;
  for (const m of ["patch", "insert", "update"]) {
    const orig = ev[m].bind(cal.events);
    ev[m] = async (params: any) => {
      const res = await orig(params);
      if (res?.data?.id) {
        import("./appointments-db").then((db) => db.upsertAppointmentRow(res.data)).catch((e) => console.error("mirror upsert", e));
      }
      return res;
    };
  }
  const origDel = ev.delete.bind(cal.events);
  ev.delete = async (params: any) => {
    const res = await origDel(params);
    if (params?.eventId) {
      import("./appointments-db").then((db) => db.deleteAppointmentRow(params.eventId)).catch((e) => console.error("mirror delete", e));
    }
    return res;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return cal;
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
  const commercialEmail = await commercialEmailByName(a.commercial); // compte commercial affecté (lien robuste)
  const commercialPhone = await commercialPhoneByName(a.commercial);  // tél commercial (depuis la base, pas de hardcode)
  const isDeplacement = a.type === "deplacement";
  const typeLabel = isDeplacement ? "Déplacement" : "Agence";
  const requestBody: calendar_v3.Schema$Event = {
      summary: `${isDeplacement ? "🚗 Déplacement" : "RDV"} ${a.firstName} ${a.lastName}${vehicle ? ` — ${vehicle}` : ""} — ${BUSINESS}`,
      colorId: isDeplacement ? "7" : "9", // Peacock (déplacement) / Blueberry (agence)
      description: [
        `Mode : ${typeLabel}`,
        `Client : ${a.firstName} ${a.lastName}`,
        `E-mail : ${a.email}`,
        `Téléphone : ${a.phone}`,
        vehicle ? `Véhicule : ${vehicle}` : "",
        a.immatriculation ? `Immatriculation : ${a.immatriculation}` : "",
        `Plateforme : ${a.platform}`,
        `Annonce : ${a.listingUrl}`,
        a.commercial ? `Commercial : ${a.commercial}` : "",
        a.teleprospector ? `Téléprospecteur : ${a.teleprospector}` : "",
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
          commercialEmail,
          commercialPhone,
          teleprospector: a.teleprospector ?? "",
          teleprospectorEmail: a.teleprospectorEmail ?? "",
          type: a.type ?? "agence",
          deplacement: isDeplacement ? "1" : "",
          immatriculation: a.immatriculation ?? "",
          vehiclePhotoUrl: a.vehiclePhotoUrl ?? "",
          photos: JSON.stringify(((a as { photos?: string[] }).photos ?? []).slice(0, 6)),
          address: isDeplacement ? a.location : "",
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
  deplacement: boolean;
  address: string;
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
  // Tri-état de présence : "present"="1", "absent"="0" (marqué absent), "unknown"=non décidé.
  // Logique métier : présent -> on attend un statut de signature ; absent -> rien à faire.
  presence: "present" | "absent" | "unknown";
  signStatus: "" | "signed" | "listed" | "thinking" | "unsigned";
  signStatusAt: string | null; // date du dernier changement de statut de signature
  note: string; // note interne (ex: raison d'une non-signature)
  negotiation: number; // montant de la négociation en euros (0 si non saisi)
  owner: string; // email du collaborateur ayant créé le RDV
  commercial: string; // nom du commercial qui gère le RDV
  commercialEmail: string; // e-mail du compte commercial affecté (lien robuste)
  teleprospector: string; // nom du téléprospecteur qui a généré le RDV
  teleprospectorEmail: string;
  type: "agence" | "deplacement";
  immatriculation: string;
  vehiclePhotoUrl: string;
  civility: string;
  createdAt: string | null;
  history: { t: string; at: string; info?: string }[];
  parkingRequested: boolean;
  parkingSent: boolean;
  cancelled: boolean;
  confirmed: boolean; // RDV confirmé par le call center -> débloque le SMS commercial 10 min avant
  bcSigned: boolean;
  bcSignedAt: string | null;
  vehicleSold: boolean;
  soldAt: string | null;
  photos: string[];
  // ── Facturation (module Bilan) ──
  // Frais fixes (50 €) : facturables dès le mandat signé.
  ffStatus: "" | "invoiced" | "paid"; // "" = à facturer
  ffNo: string;
  ffDate: string | null;
  ffPaidDate: string | null;
  ffComment: string;
  // Commission (10 % de la négo) : facturable seulement si bon de commande signé.
  commStatus: "" | "invoiced" | "paid"; // "" = à facturer (si BC signé)
  commNo: string;
  commDate: string | null;
  commPaidDate: string | null;
  commComment: string;
  // ── Mandat retiré ──
  // Un mandat signé peut être retiré (client ne peut plus être sous mandat).
  // On garde la trace : signStatus reste "signed", mais mandatRemoved coupe la facturation.
  mandatRemoved: boolean;
  mandatRemovedAt: string | null;
  mandatRemovedReason: string;
};

/** Liste les RDV (events) entre deux dates, format simplifié pour le dashboard. */
export async function listAppointments(
  timeMin: Date,
  timeMax: Date,
): Promise<AppointmentItem[]> {
  // P1 étape 2 : lectures depuis Postgres (miroir tenu par double écriture + réconciliation).
  // READ_APPTS_FROM_DB=1 pour activer ; retirer la variable = retour instantané à Google.
  let items: calendar_v3.Schema$Event[];
  if (process.env.READ_APPTS_FROM_DB === "1") {
    const db = await import("./appointments-db");
    items = await db.listEventShapesFromDb(timeMin, timeMax);
  } else {
    items = await listEvents(timeMin, timeMax);
  }
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
      deplacement: p.deplacement === "1",
      address: p.address ?? ev.location ?? "",
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
      presence: p.present === "1" ? "present" : p.present === "0" ? "absent" : "unknown",
      signStatus: (p.signStatus as AppointmentItem["signStatus"]) ?? "",
      signStatusAt: p.signStatusAt || null,
      note: p.note ?? "",
      negotiation: p.negotiation ? Number(p.negotiation) : 0,
      owner: p.owner ?? "",
      commercial: p.commercial ?? "",
      commercialEmail: p.commercialEmail ?? "",
      teleprospector: p.teleprospector ?? "",
      teleprospectorEmail: p.teleprospectorEmail ?? "",
      // déplacement explicite, sinon agence (les anciens "physique/visio/telephone" -> agence).
      type: p.deplacement === "1" ? "deplacement" : "agence",
      immatriculation: p.immatriculation ?? "",
      vehiclePhotoUrl: p.vehiclePhotoUrl ?? "",
      civility: p.clientCivility ?? "",
      createdAt: ev.created ?? null,
      history: (() => { try { return JSON.parse(p.history ?? "[]"); } catch { return []; } })(),
      parkingRequested: p.parkingRequested === "1",
      parkingSent: p.parkingSent === "1",
      cancelled: p.cancelled === "1",
      confirmed: p.confirmed === "1",
      bcSigned: p.bcSigned === "1",
      bcSignedAt: p.bcSignedAt || null,
      vehicleSold: p.vehicleSold === "1",
      soldAt: p.soldAt || null,
      photos: (() => { try { return JSON.parse(p.photos ?? "[]"); } catch { return []; } })(),
      ffStatus: (p.ffStatus as AppointmentItem["ffStatus"]) ?? "",
      ffNo: p.ffNo ?? "",
      ffDate: p.ffDate || null,
      ffPaidDate: p.ffPaidDate || null,
      ffComment: p.ffComment ?? "",
      commStatus: (p.commStatus as AppointmentItem["commStatus"]) ?? "",
      commNo: p.commNo ?? "",
      commDate: p.commDate || null,
      commPaidDate: p.commPaidDate || null,
      commComment: p.commComment ?? "",
      mandatRemoved: p.mandatRemoved === "1",
      mandatRemovedAt: p.mandatRemovedAt || null,
      mandatRemovedReason: p.mandatRemovedReason ?? "",
    };
  });
}

/** Met à jour la marque/modèle du véhicule sur un RDV. */
export async function patchVehicle(eventId: string, fields: { carBrand?: string; carModel?: string; carFinish?: string; immatriculation?: string }) {
  const cal = calendarClient();
  const priv: Record<string, string> = {};
  if (fields.carBrand !== undefined) priv.carBrand = fields.carBrand;
  if (fields.carModel !== undefined) priv.carModel = fields.carModel;
  if (fields.carFinish !== undefined) priv.carFinish = fields.carFinish;
  if (fields.immatriculation !== undefined) priv.immatriculation = fields.immatriculation;
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
/** Modifie le nom/prénom du client + met à jour le titre de l'événement. */
export async function patchClientName(eventId: string, fields: { firstName?: string; lastName?: string; civility?: string }) {
  const ev = await getEvent(eventId);
  const p = ev.extendedProperties?.private ?? {};
  const firstName = fields.firstName?.trim() ?? p.clientFirstName ?? "";
  const lastName = fields.lastName?.trim() ?? p.clientLastName ?? "";
  const civility = fields.civility?.trim() ?? p.clientCivility ?? "";
  const vehicle = [p.carBrand, p.carModel, p.carFinish].filter(Boolean).join(" ");
  const isDep = p.deplacement === "1";
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: {
      summary: `${isDep ? "🚗 Déplacement" : "RDV"} ${firstName} ${lastName}${vehicle ? ` — ${vehicle}` : ""} — ${BUSINESS}`,
      extendedProperties: { private: { clientFirstName: firstName, clientLastName: lastName, clientCivility: civility } },
    },
  });
}

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

/** Met à jour le commercial qui gère un RDV (+ re-résout l'e-mail du compte commercial). */
export async function patchCommercial(eventId: string, commercial: string) {
  const commercialEmail = await commercialEmailByName(commercial);
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { commercial: commercial.trim(), commercialEmail } } },
  });
}

/** Met à jour les détails du RDV (lien annonce, mode déplacement, adresse). */
export async function patchApptDetails(eventId: string, fields: { listingUrl?: string; deplacement?: boolean; address?: string }) {
  const cal = calendarClient();
  const priv: Record<string, string> = {};
  if (fields.listingUrl !== undefined) priv.listingUrl = fields.listingUrl.trim();
  if (fields.deplacement !== undefined) priv.deplacement = fields.deplacement ? "1" : "";
  if (fields.address !== undefined) priv.address = fields.address.trim();
  await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: priv } },
  });
}

/** Couleur Google Calendar selon statut.
 *  9=Blueberry bleu / 10=Basil vert / 6=Tangerine orange / 8=Graphite gris / 11=Tomato rouge / 3=Grape violet */
export function colorIdForStatus(opts: {
  cancelled?: boolean; signStatus?: string;
  bcSigned?: boolean; vehicleSold?: boolean; absent?: boolean;
}): string {
  if (opts.cancelled) return "11"; // rouge
  if (opts.absent) return "11";    // rouge : client pas présent (no-show)
  if (opts.vehicleSold || opts.bcSigned || opts.signStatus === "signed") return "10"; // vert
  if (opts.signStatus === "listed") return "7"; // paon/cyan (annonce en ligne, mandat en cours)
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
  if (fields.signStatus !== undefined) {
    priv.signStatus = fields.signStatus;
    priv.signStatusAt = new Date().toISOString(); // date de la décision de signature
  }
  if (fields.negotiation !== undefined) priv.negotiation = String(fields.negotiation);
  if (fields.bcSigned !== undefined) {
    priv.bcSigned = fields.bcSigned ? "1" : "";
    priv.bcSignedAt = fields.bcSigned ? new Date().toISOString() : "";
  }
  if (fields.vehicleSold !== undefined) {
    priv.vehicleSold = fields.vehicleSold ? "1" : "";
    priv.soldAt = fields.vehicleSold ? new Date().toISOString() : "";
  }
  // Calcule couleur à partir de l'état projeté (présence incluse : absent = rouge)
  let colorId: string | undefined;
  if (fields.signStatus !== undefined || fields.bcSigned !== undefined || fields.vehicleSold !== undefined || fields.present !== undefined) {
    const ev = await getEvent(eventId);
    const p = ev.extendedProperties?.private ?? {};
    const next = {
      cancelled: p.cancelled === "1",
      signStatus: fields.signStatus ?? p.signStatus ?? "",
      bcSigned: fields.bcSigned ?? p.bcSigned === "1",
      vehicleSold: fields.vehicleSold ?? p.vehicleSold === "1",
      absent: fields.present !== undefined ? fields.present === false : p.present === "0",
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

/** Met à jour les champs de facturation (module Bilan) d'un RDV.
 *  ff* = frais fixes 50 € ; comm* = commission 10 %. */
export type InvoicingFields = {
  ffStatus?: "" | "invoiced" | "paid";
  ffNo?: string; ffDate?: string | null; ffPaidDate?: string | null; ffComment?: string;
  commStatus?: "" | "invoiced" | "paid";
  commNo?: string; commDate?: string | null; commPaidDate?: string | null; commComment?: string;
};
export async function patchInvoicing(eventId: string, f: InvoicingFields) {
  const priv: Record<string, string> = {};
  const set = (k: string, v: string | null | undefined) => { if (v !== undefined) priv[k] = v ?? ""; };
  set("ffStatus", f.ffStatus);
  set("ffNo", f.ffNo);
  set("ffDate", f.ffDate);
  set("ffPaidDate", f.ffPaidDate);
  if (f.ffComment !== undefined) priv.ffComment = (f.ffComment ?? "").slice(0, 500);
  set("commStatus", f.commStatus);
  set("commNo", f.commNo);
  set("commDate", f.commDate);
  set("commPaidDate", f.commPaidDate);
  if (f.commComment !== undefined) priv.commComment = (f.commComment ?? "").slice(0, 500);
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: priv } },
  });
}

/** Retire (ou rétablit) un mandat signé. On NE touche PAS à signStatus : on garde la
 *  trace qu'il a été signé. mandatRemoved coupe la facturation des frais fixes (sauf
 *  s'ils sont déjà facturés/payés — géré côté Bilan). Une entrée d'historique conserve
 *  la traçabilité (date + raison). */
export async function setMandateRemoved(eventId: string, removed: boolean, reason?: string) {
  const hist = await readHistory(eventId);
  hist.push({
    t: removed ? "mandat_removed" : "mandat_restored",
    at: new Date().toISOString(),
    ...(removed && reason ? { info: reason } : {}),
  });
  const priv: Record<string, string> = {
    mandatRemoved: removed ? "1" : "",
    mandatRemovedAt: removed ? new Date().toISOString() : "",
    mandatRemovedReason: removed ? (reason ?? "").slice(0, 300) : "",
    history: JSON.stringify(hist.slice(-40)),
  };
  await calendarClient().events.patch({
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

/** Confirme (ou dé-confirme) un RDV. Tant que non confirmé, le SMS commercial 10 min avant
 *  n'est PAS envoyé. Ajoute une entrée d'historique. */
export async function markConfirmed(eventId: string, confirmed: boolean) {
  const hist = await readHistory(eventId);
  hist.push({ t: confirmed ? "confirmed" : "unconfirmed", at: new Date().toISOString() });
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { confirmed: confirmed ? "1" : "", history: JSON.stringify(hist.slice(-40)) } } },
  });
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

/** Marque qu'un rappel MAIL (24h ou 2h) a été envoyé + historique. */
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

/** Marque qu'un rappel SMS (24h ou 2h) a été envoyé. Flag séparé du mail :
 *  si le mail part mais que le SMS échoue, le SMS sera retenté au prochain cron. */
export async function markReminderSmsSent(eventId: string, kind: "24h" | "2h") {
  const key = kind === "24h" ? "reminder24SmsSent" : "reminder2SmsSent";
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { [key]: "1" } } },
  });
}

/** Marque que le SMS d'alerte au COMMERCIAL (10 min avant) a été envoyé (1 seul). */
export async function markCommercialNotified(eventId: string) {
  await calendarClient().events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { extendedProperties: { private: { commercialSms10Sent: "1" } } },
  });
}


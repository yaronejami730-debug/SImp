import type { Appointment } from "./parse";

/**
 * Intégration cal.com (API v2). Remplace le stockage Google Agenda :
 * - createBooking  -> POST /bookings   (création du rendez-vous)
 * - listBookings   -> GET  /bookings   (cron de relance)
 *
 * Les infos client (plateforme, annonce, adresse) sont stockées dans
 * `metadata` de la réservation, comme l'étaient les extendedProperties Google.
 */

const API_BASE = process.env.CALCOM_API_BASE ?? "https://api.cal.com/v2";
const API_KEY = process.env.CALCOM_API_KEY;
const EVENT_TYPE_ID = process.env.CALCOM_EVENT_TYPE_ID;
const BOOKING_BASE = process.env.CALCOM_BOOKING_BASE ?? "https://app.cal.com/booking";
const API_VERSION = process.env.CALCOM_API_VERSION ?? "2024-08-13";

export type CalBookingMetadata = {
  firstName?: string;
  lastName?: string;
  platform?: string;
  listingUrl?: string;
  address?: string;
};

export type CalBooking = {
  id: number;
  uid: string;
  start: string; // ISO
  end: string; // ISO
  status: string;
  attendees?: { name?: string; email?: string; timeZone?: string }[];
  metadata?: CalBookingMetadata & Record<string, string>;
  location?: string;
};

function headers(): Record<string, string> {
  if (!API_KEY) throw new Error("CALCOM_API_KEY manquant.");
  return {
    Authorization: `Bearer ${API_KEY}`,
    "cal-api-version": API_VERSION,
    "Content-Type": "application/json",
  };
}

/** Lien public vers la réservation cal.com. */
export function bookingLink(uid: string): string {
  return `${BOOKING_BASE}/${uid}`;
}

/** Crée la réservation dans cal.com. Renvoie l'objet booking. */
export async function createBooking(a: Appointment): Promise<CalBooking> {
  if (!EVENT_TYPE_ID) throw new Error("CALCOM_EVENT_TYPE_ID manquant.");

  const body = {
    start: new Date(a.startDateTime).toISOString(),
    eventTypeId: Number(EVENT_TYPE_ID),
    attendee: {
      name: `${a.firstName} ${a.lastName}`.trim(),
      email: a.email,
      timeZone: "Europe/Paris",
      language: "fr",
    },
    // Adresse + infos annonce conservées dans metadata (valeurs = chaînes).
    metadata: {
      firstName: a.firstName,
      lastName: a.lastName,
      platform: a.platform,
      listingUrl: a.listingUrl,
      address: a.location,
    } satisfies CalBookingMetadata,
  };

  const res = await fetch(`${API_BASE}/bookings`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.status === "error") {
    const msg = json?.error?.message ?? `Échec création réservation cal.com (HTTP ${res.status}).`;
    throw new Error(msg);
  }
  return json.data as CalBooking;
}

/** Liste les réservations à venir entre deux dates (cron de relance). */
export async function listBookings(afterStart: Date, beforeEnd: Date): Promise<CalBooking[]> {
  const url = new URL(`${API_BASE}/bookings`);
  url.searchParams.set("afterStart", afterStart.toISOString());
  url.searchParams.set("beforeEnd", beforeEnd.toISOString());
  url.searchParams.set("status", "upcoming");
  url.searchParams.set("sortStart", "asc");

  const res = await fetch(url, { headers: headers() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.status === "error") {
    const msg = json?.error?.message ?? `Échec liste réservations cal.com (HTTP ${res.status}).`;
    throw new Error(msg);
  }
  return (json.data ?? []) as CalBooking[];
}

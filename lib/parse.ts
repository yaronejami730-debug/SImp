import { z } from "zod";

export const appointmentSchema = z.object({
  firstName: z.string().describe("Prénom du client"),
  lastName: z.string().describe("Nom de famille du client"),
  email: z.string().describe("Adresse e-mail du client"),
  platform: z
    .string()
    .describe(
      "Nom de la plateforme de l'annonce : LeBonCoin, LaCentrale, SeLoger, ou autre",
    ),
  listingUrl: z.string().describe("Lien (URL) de l'annonce"),
  location: z.string().describe("Adresse ou lieu du rendez-vous"),
  startDateTime: z
    .string()
    .describe(
      "Date et heure de début au format ISO 8601 avec décalage Europe/Paris, ex : 2026-05-30T14:30:00+02:00",
    ),
});

export type Appointment = z.infer<typeof appointmentSchema>;

/** Champs bruts envoyés par le formulaire (sans IA). */
export type AppointmentInput = {
  firstName: string;
  lastName: string;
  email: string;
  listingUrl: string;
  location: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
};

/** Déduit le nom de la plateforme à partir du domaine du lien. */
export function platformFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("leboncoin")) return "LeBonCoin";
    if (host.includes("lacentrale")) return "LaCentrale";
    if (host.includes("seloger")) return "SeLoger";
    return host;
  } catch {
    return "Autre";
  }
}

/**
 * Convertit une heure « murale » d'un fuseau (ex : 14:30 à Paris) en instant UTC,
 * en tenant compte de l'heure d'été/hiver. Renvoie un Date.
 */
function zonedWallClockToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const asZone = new Date(utcGuess.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(utcGuess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = asZone.getTime() - asUtc.getTime();
  return new Date(utcGuess.getTime() - offset);
}

/**
 * Construit un rendez-vous structuré à partir des champs du formulaire.
 * Aucune IA : la date/heure sont lues telles quelles (fuseau Europe/Paris).
 */
export function buildAppointment(input: AppointmentInput): Appointment {
  const [y, mo, da] = input.date.split("-").map(Number);
  const [h, mi] = input.time.split(":").map(Number);

  if (!y || !mo || !da || Number.isNaN(h) || Number.isNaN(mi)) {
    throw new Error("Date ou heure invalide.");
  }

  const start = zonedWallClockToUtc(y, mo, da, h, mi, "Europe/Paris");

  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim(),
    platform: platformFromUrl(input.listingUrl),
    listingUrl: input.listingUrl.trim(),
    location: input.location.trim(),
    startDateTime: start.toISOString(),
  };
}

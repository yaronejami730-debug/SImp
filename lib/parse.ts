import { z } from "zod";

export const appointmentSchema = z.object({
  civility: z.string().describe("Civilité : Monsieur ou Madame"),
  firstName: z.string().describe("Prénom du client"),
  lastName: z.string().describe("Nom de famille du client"),
  email: z.string().describe("Adresse e-mail du client"),
  phone: z.string().describe("Numéro de téléphone du client"),
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

/** Lieu de rendez-vous fixe (toujours le même). */
export const DEFAULT_LOCATION =
  process.env.DEFAULT_LOCATION ?? "3 rue Bolidor, 75017 Paris";

/** Champs bruts envoyés par le formulaire (sans IA). */
export type AppointmentInput = {
  civility: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  listingUrl: string;
  location?: string; // optionnel : si absent, lieu fixe par défaut
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

/** Convertit une date "YYYY-MM-DD" + heure "HH:MM" (Europe/Paris) en ISO UTC. */
export function toParisISO(date: string, time: string): string {
  const [y, mo, da] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  if (!y || !mo || !da || Number.isNaN(h) || Number.isNaN(mi)) {
    throw new Error("Date ou heure invalide.");
  }
  return zonedWallClockToUtc(y, mo, da, h, mi, "Europe/Paris").toISOString();
}

/**
 * Construit un rendez-vous structuré à partir des champs du formulaire.
 * Aucune IA : la date/heure sont lues telles quelles (fuseau Europe/Paris).
 */
export function buildAppointment(input: AppointmentInput): Appointment {
  return {
    civility: input.civility?.trim() || "",
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    platform: platformFromUrl(input.listingUrl),
    listingUrl: input.listingUrl.trim(),
    location: input.location?.trim() || DEFAULT_LOCATION,
    startDateTime: toParisISO(input.date, input.time),
  };
}

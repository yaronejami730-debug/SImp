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
  isLead: z.boolean().describe("Vrai si ce client est un lead (pas une annonce LeBonCoin/LaCentrale) : mini-questionnaire véhicule à la place du lien d'annonce").default(false),
  leadYear: z.string().describe("Année du véhicule, déclarée par le lead").default(""),
  leadKm: z.string().describe("Kilométrage du véhicule, déclaré par le lead").default(""),
  leadTransmission: z.string().describe("Boîte manuelle ou automatique, déclarée par le lead").default(""),
  leadEntretiens: z.string().describe("Entretiens à jour ('oui'/'non'), déclaré par le lead").default(""),
  leadEntretiensRestants: z.string().describe("Nombre d'entretiens restant à faire si non à jour ('1'/'2'/'3+')").default(""),
  leadHabitacle: z.string().describe("Habitacle intérieur/extérieur propre ('oui'/'non'), déclaré par le lead").default(""),
  leadVices: z.string().describe("Vices cachés suspectés ('oui'/'non'), déclaré par le lead").default(""),
  carBrand: z.string().describe("Marque du véhicule (ex: Renault)").default(""),
  carModel: z.string().describe("Modèle du véhicule (ex: Clio)").default(""),
  carFinish: z.string().describe("Finition / version (ex: GT Line, Intens, dCi 110)").default(""),
  location: z.string().describe("Adresse ou lieu du rendez-vous"),
  type: z.enum(["agence", "deplacement"]).describe("Type de RDV : en agence ou en déplacement").default("agence"),
  immatriculation: z.string().describe("Plaque d'immatriculation du véhicule").default(""),
  vehiclePhotoUrl: z.string().describe("URL de la photo du véhicule").default(""),
  photos: z.array(z.string()).describe("URLs des photos du véhicule").default([]),
  teleprospector: z.string().describe("Nom du téléprospecteur ayant généré le RDV").default(""),
  teleprospectorEmail: z.string().describe("E-mail du téléprospecteur").default(""),
  commercial: z.string().describe("Nom du commercial qui gère le RDV").default(""),
  operatedBy: z.string().describe("Nom du commercial qui opère RÉELLEMENT le RDV, si différent (délégation temporaire)").default(""),
  startDateTime: z
    .string()
    .describe(
      "Date et heure de début au format ISO 8601 avec décalage Europe/Paris, ex : 2026-05-30T14:30:00+02:00",
    ),
});

export type Appointment = z.infer<typeof appointmentSchema>;

/** Mobile français uniquement : 06/07 (ou +33 6 / +33 7). Fixes 01/03/04/05... refusés. */
export function isFrenchMobile(phone?: string): boolean {
  const d = (phone ?? "").replace(/\D/g, "");
  return /^0[67]\d{8}$/.test(d) || /^33[67]\d{8}$/.test(d) || /^0033[67]\d{8}$/.test(d);
}

/** Normalise un numéro français quel que soit le format saisi/importé (+33 6.., 0033 6.., espaces,
 *  points...) vers 0XXXXXXXXX. Renvoie la valeur d'origine (trim) si elle ne ressemble pas à un
 *  numéro français reconnaissable, plutôt que de la casser. */
export function normalizeFrenchPhone(phone?: string): string {
  const raw = (phone ?? "").trim();
  const d = raw.replace(/\D/g, "");
  if (/^33\d{9}$/.test(d)) return "0" + d.slice(2);
  if (/^0033\d{9}$/.test(d)) return "0" + d.slice(4);
  if (/^0\d{9}$/.test(d)) return d;
  return raw;
}

/** Lieu de rendez-vous fixe (toujours le même). */
export const DEFAULT_LOCATION =
  process.env.DEFAULT_LOCATION ?? "3 rue Bélidor, 75017 Paris";

/** Champs bruts envoyés par le formulaire (sans IA). */
export type AppointmentInput = {
  civility: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  listingUrl?: string;   // optionnel : le commercial peut ne pas avoir l'annonce
  source?: string;       // plateforme cochée à la main (LeBonCoin / LaCentrale / Autre)
  isLead?: boolean;      // client issu d'un lead (pas d'une annonce) : mini-questionnaire véhicule
  leadYear?: string;
  leadKm?: string;
  leadTransmission?: string; // "manuelle" | "automatique"
  leadEntretiens?: string;   // "oui" | "non"
  leadEntretiensRestants?: string; // "1" | "2" | "3+", si leadEntretiens === "non"
  leadHabitacle?: string;    // "oui" | "non"
  leadVices?: string;        // "oui" | "non"
  carBrand?: string;
  carModel?: string;
  carFinish?: string;
  location?: string; // optionnel : si absent, lieu fixe par défaut
  type?: "agence" | "deplacement"; // type de RDV (défaut agence)
  address?: string; // adresse du client (RDV en déplacement)
  immatriculation?: string;
  vehiclePhotoUrl?: string;
  photos?: string[]; // plusieurs photos du véhicule
  teleprospector?: string; // nom du téléprospecteur (qui a généré le RDV)
  teleprospectorEmail?: string;
  commercial?: string; // nom du commercial (ex: Raphaël Dahan)
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
};

/**
 * Extrait la première URL https/http d'une chaîne (collage type "Voici l'annonce : https://www.leboncoin.fr/...").
 * Renvoie l'URL pure, sinon la chaîne d'origine (trim).
 */
export function extractUrl(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return raw.trim();
  // Retire la ponctuation finale courante (). , ; : !) collée par certains partages.
  return m[0].replace(/[.,;:!)\]]+$/, "");
}

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
    phone: normalizeFrenchPhone(input.phone),
    platform: input.isLead ? "Lead" : (input.source?.trim() || (input.listingUrl ? platformFromUrl(input.listingUrl) : "Autre")),
    listingUrl: input.isLead ? "" : (input.listingUrl?.trim() || ""),
    isLead: !!input.isLead,
    leadYear: input.leadYear?.trim() || "",
    leadKm: input.leadKm?.trim() || "",
    leadTransmission: input.leadTransmission?.trim() || "",
    leadEntretiens: input.leadEntretiens?.trim() || "",
    leadEntretiensRestants: input.leadEntretiensRestants?.trim() || "",
    leadHabitacle: input.leadHabitacle?.trim() || "",
    leadVices: input.leadVices?.trim() || "",
    carBrand: input.carBrand?.trim() || "",
    carModel: input.carModel?.trim() || "",
    carFinish: input.carFinish?.trim() || "",
    // RDV en déplacement -> lieu = adresse du client ; en agence -> lieu fixe par défaut.
    location: input.type === "deplacement"
      ? (input.address?.trim() || input.location?.trim() || "")
      : (input.location?.trim() || DEFAULT_LOCATION),
    type: input.type ?? "agence",
    immatriculation: input.immatriculation?.trim() || "",
    vehiclePhotoUrl: input.vehiclePhotoUrl?.trim() || (input.photos?.[0] ?? ""),
    photos: (input.photos ?? []).filter(Boolean).slice(0, 6),
    teleprospector: input.teleprospector?.trim() || "",
    teleprospectorEmail: input.teleprospectorEmail?.trim() || "",
    commercial: input.commercial?.trim() || "",
    operatedBy: "",
    startDateTime: toParisISO(input.date, input.time),
  };
}

/** Liste des commerciaux (vendeurs) sélectionnables à la prise de RDV et en fiche client. */
export const COMMERCIAUX = [
  "Raphaël Dahan",
  "Raphaël Atlan",
  "Raphaël Benoliel",
  "Michel",
] as const;

export const DEFAULT_COMMERCIAL = "Raphaël Dahan";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Numéro direct de chaque commercial (clé normalisée -> numéro). */
const PHONE_BY_NORM: { match: string; phone: string }[] = [
  { match: "bonamy", phone: "06 64 89 11 51" },  // Jérémy Bonamy
  { match: "dahan", phone: "06 18 74 73 82" },   // Raphaël Dahan
];

export const COMMERCIAL_PHONE: Record<string, string> = {
  "Raphaël Dahan": "06 18 74 73 82",
  "Jeremy Bonamy": "06 64 89 11 51",
};

function phoneLookup(name?: string): string {
  if (!name) return "";
  const n = norm(name);
  return PHONE_BY_NORM.find((p) => n.includes(p.match))?.phone ?? "";
}

/** Numéro du conseiller (fallback = Raphaël Dahan si inconnu). */
export function commercialPhone(name?: string): string {
  return phoneLookup(name) || "06 18 74 73 82";
}

/** Numéro du conseiller s'il est connu, sinon "" (pas de fallback — utile en déplacement). */
export function commercialPhoneStrict(name?: string): string {
  return phoneLookup(name);
}

/** E-mail à inviter automatiquement sur l'event Google selon le commercial (ex: Bonamy -> bonamy.mimi). */
export function commercialInviteEmail(name?: string): string {
  if (!name) return "";
  const n = norm(name);
  if (n.includes("bonamy")) return process.env.MOBILE_ATTENDEE_EMAIL ?? "bonamy.mimi@gmail.com";
  return "";
}

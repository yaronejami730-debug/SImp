/** Liste des commerciaux (vendeurs) sélectionnables à la prise de RDV et en fiche client. */
export const COMMERCIAUX = [
  "Raphaël Dahan",
  "Raphaël Atlan",
  "Raphaël Benoliel",
  "Michel",
] as const;

export const DEFAULT_COMMERCIAL = "Raphaël Dahan";

/** Numéro direct de chaque commercial (SMS 15 min avant le RDV). */
export const COMMERCIAL_PHONE: Record<string, string> = {
  "Raphaël Dahan": "06 18 74 73 82",
};

/** Numéro de l'interlocuteur (fallback = Raphaël Dahan si inconnu). */
export function commercialPhone(name?: string): string {
  return (name && COMMERCIAL_PHONE[name]) || "06 18 74 73 82";
}

/** Numéro du commercial s'il est connu, sinon "" (pas de fallback — utile en déplacement). */
export function commercialPhoneStrict(name?: string): string {
  return (name && COMMERCIAL_PHONE[name]) || "";
}

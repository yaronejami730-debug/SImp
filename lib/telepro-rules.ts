// Restrictions par téléprospecteur : commerciaux autorisés + modalité.
// (Config simple par e-mail ; à migrer en base si ça se multiplie.)
export type TeleproRule = {
  commercials: string[]; // noms des commerciaux qu'il/elle peut assigner (vide = tous)
  agenceOnly?: boolean;  // true = uniquement RDV en agence (pas de déplacement)
};

const RULES: Record<string, TeleproRule> = {
  "signaphone250@gmail.com": { commercials: ["Raphaël Dahan", "Jérémy Bonamy"], agenceOnly: true }, // Hanane
};

export function teleproRule(email?: string): TeleproRule | null {
  if (!email) return null;
  return RULES[email.trim().toLowerCase()] ?? null;
}

// Normalisation nom (accents/casse/ordre) pour comparer un commercial à la liste autorisée.
const tok = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

/** Un commercial est-il autorisé pour ce téléprospecteur ? (liste vide = tous autorisés) */
export function commercialAllowed(rule: TeleproRule | null, commercial: string): boolean {
  if (!rule || rule.commercials.length === 0) return true;
  const t = tok(commercial);
  return rule.commercials.some((c) => tok(c) === t);
}

// Schémas de commission (base fixe par RDV signé + % de la négociation).
export type CommissionScheme = { key: string; label: string; base: number; pct: number };

export const COMMISSION_SCHEMES: CommissionScheme[] = [
  { key: "50", label: "50 € / RDV signé", base: 50, pct: 0 },
  { key: "100", label: "100 € / RDV signé", base: 100, pct: 0 },
  { key: "50+10", label: "50 € + 10 % de la négo", base: 50, pct: 10 },
  { key: "50+20", label: "50 € + 20 % de la négo", base: 50, pct: 20 },
  { key: "100+10", label: "100 € + 10 % de la négo", base: 100, pct: 10 },
  { key: "100+20", label: "100 € + 20 % de la négo", base: 100, pct: 20 },
  { key: "0+25", label: "25 % de la négociation (sans fixe)", base: 0, pct: 25 },
];

export const DEFAULT_SCHEME = COMMISSION_SCHEMES[2]; // 50 € + 10 %

export function schemeByKey(key?: string): CommissionScheme {
  return COMMISSION_SCHEMES.find((s) => s.key === key) ?? DEFAULT_SCHEME;
}

/** Commission d'un RDV signé : base + pct% de la négociation. */
export function commissionOf(base: number, pct: number, negotiation: number): number {
  return base + (pct / 100) * (negotiation || 0);
}

// ─────────── Rôles : apporteur (créateur) vs réalisateur (commercial) ───────────
// Réalisateur : sa commission habituelle MAJORÉE de +25 %.
// Apporteur   : 50 % de la commission de base du RDV.
export const COMMERCIAL_MAJORATION = 0.25; // +25 % pour le réalisateur
export const APPORTEUR_RATE = 0.5;         // 50 % pour l'apporteur

/** Commission du réalisateur (commercial affecté) : sa commission × (1 + 25 %). */
export function realisateurCommission(base: number, pct: number, negotiation: number): number {
  return commissionOf(base, pct, negotiation) * (1 + COMMERCIAL_MAJORATION);
}

/** Commission de l'apporteur (créateur) : 50 % de la commission de base. */
export function apporteurCommission(base: number, pct: number, negotiation: number): number {
  return commissionOf(base, pct, negotiation) * APPORTEUR_RATE;
}

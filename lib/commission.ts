// Schémas de commission (base fixe par RDV signé + % de la négociation).
export type CommissionScheme = { key: string; label: string; base: number; pct: number };

export const COMMISSION_SCHEMES: CommissionScheme[] = [
  { key: "30", label: "30 € / RDV signé", base: 30, pct: 0 },
  { key: "50", label: "50 € / RDV signé", base: 50, pct: 0 },
  { key: "60", label: "60 € HT / RDV signé", base: 60, pct: 0 },
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
// Chaque personne est payée selon SON PROPRE barème (commission_base/pct de son compte).
// Ex : Yaron créateur = 50 € + 10 % ; Bonamy commercial = 0 € + 25 %.
// Les deux touchent sur le même RDV signé (rôles indépendants).

/** Commission du réalisateur (commercial affecté), selon SON barème. */
export function realisateurCommission(base: number, pct: number, negotiation: number): number {
  return commissionOf(base, pct, negotiation);
}

/** Commission de l'apporteur (créateur), selon SON barème. */
export function apporteurCommission(base: number, pct: number, negotiation: number): number {
  return commissionOf(base, pct, negotiation);
}

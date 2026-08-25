// Critères d'éligibilité posés au client pendant l'appel.
// Fichier sans dépendance serveur : le formulaire (navigateur) et l'API (Node) partagent la même liste.

export const DDE_CRITERES = [
  { key: "crit_titre_sejour", question: "Avez-vous un titre de séjour valide ?", attendu: true },
  { key: "crit_sans_diplome", question: "Avez-vous un diplôme ?", attendu: false },
  { key: "crit_carte_vitale", question: "Avez-vous une carte Vitale ?", attendu: true },
  { key: "crit_sans_dossier_prefecture", question: "Avez-vous un dossier en cours à la préfecture ?", attendu: false },
  { key: "crit_moins_60_ans", question: "Avez-vous moins de 60 ans ?", attendu: true },
] as const;

export type DdeCritereKey = (typeof DDE_CRITERES)[number]["key"];
export type DdeCriteres = Partial<Record<DdeCritereKey, boolean>>;

/** Éligible = chaque réponse égale la réponse attendue. */
export function estEligible(reponses: DdeCriteres): boolean {
  return DDE_CRITERES.every((c) => reponses[c.key] === c.attendu);
}

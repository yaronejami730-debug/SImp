// Prospects DDE : types et libellés partagés par le navigateur et l'API.
// Aucune dépendance serveur ici — les requêtes vivent dans lib/dde-prospects-db.ts.

/** Statuts d'appel d'un prospect, dans l'ordre où la téléprospectrice les rencontre.
 *  `travail` = statut posé pendant les appels (visible sur les boutons de la fiche) ;
 *  les autres sont des issues définitives. */
export const DDE_PROSPECT_STATUTS = [
  { key: "nouveau", label: "Nouveau", court: "Nouveau", travail: false },
  { key: "nrp1", label: "NRP 1 — ne répond pas", court: "NRP 1", travail: true },
  { key: "nrp2", label: "NRP 2 — ne répond pas", court: "NRP 2", travail: true },
  { key: "nrp3", label: "NRP 3 — ne répond pas", court: "NRP 3", travail: true },
  { key: "a_rappeler", label: "À rappeler", court: "À rappeler", travail: true },
  { key: "injoignable", label: "Injoignable", court: "Injoignable", travail: true },
  { key: "faux_numero", label: "Faux numéro", court: "Faux numéro", travail: true },
  { key: "pas_interesse", label: "Pas intéressé", court: "Pas intéressé", travail: true },
  { key: "refus", label: "Refus", court: "Refus", travail: true },
  { key: "pas_eligible", label: "Pas éligible", court: "Pas éligible", travail: true },
  { key: "rdv_pris", label: "Rendez-vous pris", court: "RDV pris", travail: false },
] as const;

export type DdeProspectStatut = (typeof DDE_PROSPECT_STATUTS)[number]["key"];
export const DDE_PROSPECT_STATUT_KEYS = DDE_PROSPECT_STATUTS.map((s) => s.key) as readonly string[];

export function libelleStatutProspect(key: string): string {
  return DDE_PROSPECT_STATUTS.find((s) => s.key === key)?.court ?? key;
}

/** Statuts encore à travailler : ce sont eux que la file d'appel propose. */
export const DDE_PROSPECT_A_APPELER: readonly string[] = ["nouveau", "nrp1", "nrp2", "nrp3", "a_rappeler"];

/** Une ligne du questionnaire repris du CRM d'origine. */
export type ProfilLigne = { label: string; valeur: string };
/** Une entrée du journal du CRM d'origine. */
export type HistoriqueLigne = { date: string; action: string };

export type DdeProspect = {
  id: number;
  crm_id: string | null;
  nom: string; prenom: string; telephone: string; telephone_2: string; email: string;
  adresse: string; code_postal: string; ville: string; departement: string;
  statut: string; telepro_email: string; telepro_name: string; notes: string;
  appels: number; dernier_appel_at: string | null; rdv_id: number | null;
  crm_statut: string; crm_campagne: string; crm_telepro: string; crm_commercial: string;
  crm_resultat_rdv: string; crm_commentaire: string; crm_source: string;
  crm_cree_le: string | null; crm_maj_le: string | null;
  dernier_rdv_date: string | null; dernier_rdv_heure: string; dernier_rdv_presence: string;
  nb_rdv: number;
  profil: ProfilLigne[];
  historique: HistoriqueLigne[];
  created_at: string;
};

/** Résultat du rendez-vous tel que le notait le CRM d'origine. */
const RESULTATS_RDV: Record<string, string> = {
  positif: "Positif",
  r2: "Deuxième rendez-vous",
  en_reflexion: "En réflexion",
  pas_argent: "Pas de financement",
  pas_eligible: "Pas éligible",
};

export function libelleResultatRdv(v: string): string {
  return RESULTATS_RDV[v] ?? v;
}

/** Ce que le client a fait de son dernier rendez-vous, en clair. */
export function libellePresence(v: string): string {
  if (v === "present") return "Venu au rendez-vous";
  if (v === "absent") return "Absent au rendez-vous";
  return "";
}

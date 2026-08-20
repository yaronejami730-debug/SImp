// Cadence d'une téléprospectrice : où elle en est de sa journée, et ce qu'on lui en dit.
//
// Référence : une téléprospectrice qui travaille bien soumet entre 3 et 6 dossiers **par heure**,
// autour de 4 en rythme de croisière. On mesure un débit horaire, pas un total journalier :
// les rendez-vous saisis sont rapportés au temps réellement travaillé depuis l'ouverture
// (pause déjeuner déduite). On compte tous les dossiers soumis, éligibles ou non : ce qu'on regarde
// ici, c'est le rythme de travail. Refus, non-réponses, HRP et aléas réseau sont déjà absorbés
// par la largeur de la fourchette (3 à 6).

import { plageDuJour } from "./dde-horaires";

export const OBJECTIF_MIN = 3;    // plancher d'une bonne heure
export const OBJECTIF_HEURE = 4;  // rythme de croisière
export const OBJECTIF_HAUT = 6;   // très bonne heure

/** Pause déjeuner déduite du temps de travail. */
const PAUSE = { debut: 13 * 60, fin: 14 * 60 };

const chevauchement = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

/** Minutes réellement travaillées entre l'ouverture et une borne, pause déduite. */
function minutesTravaillees(iso: string, jusquA: number): number {
  const plage = plageDuJour(iso);
  if (!plage) return 0;
  const fin = Math.min(jusquA, plage.fin);
  const brut = Math.max(0, fin - plage.debut);
  return Math.max(0, brut - chevauchement(plage.debut, fin, PAUSE.debut, PAUSE.fin));
}

/** Heures travaillées sur une journée complète (6h30 du lundi au jeudi, 4h30 le vendredi). */
export function heuresDuJour(iso: string): number {
  const plage = plageDuJour(iso);
  return plage ? minutesTravaillees(iso, plage.fin) / 60 : 0;
}

export type EtatCadence = "fermee" | "avant" | "demarrage" | "excellente" | "bonne" | "moyenne" | "faible";

export type Cadence = {
  etat: EtatCadence;
  titre: string;
  phrase: string;
  valides: number;      // dossiers soumis aujourd'hui
  parHeure: number;     // débit constaté, rendez-vous par heure travaillée
  attendu: number;      // ce qu'on attend à cette heure-ci (4/h × heures écoulées)
  projection: number;   // ce que donne ce débit jusqu'à la fermeture
  heuresFaites: number; // heures travaillées depuis l'ouverture
  avancement: number;   // part de la journée écoulée, 0 -> 1
};

const arrondi1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Évalue la cadence du jour.
 * @param iso        date du jour, "YYYY-MM-DD"
 * @param maintenant heure locale
 * @param valides    dossiers soumis aujourd'hui, éligibles ou non
 */
export function evalueCadence(iso: string, maintenant: Date, valides: number): Cadence {
  const plage = plageDuJour(iso);
  const minute = maintenant.getHours() * 60 + maintenant.getMinutes();
  const vide = { valides, parHeure: 0, attendu: 0, projection: 0, heuresFaites: 0, avancement: 0 };

  if (!plage) {
    return {
      ...vide, etat: "fermee", titre: "Journée fermée",
      phrase: valides > 0 ? `${valides} rendez-vous pris malgré tout. Repose-toi.` : "Rien à décrocher aujourd'hui, on reprend le prochain jour ouvré.",
    };
  }

  if (minute < plage.debut) {
    return {
      ...vide, etat: "avant", titre: "Journée pas commencée",
      phrase: `Ouverture à ${Math.floor(plage.debut / 60)}h${String(plage.debut % 60).padStart(2, "0")}. Objectif : ${OBJECTIF_MIN} à ${OBJECTIF_HAUT} rendez-vous par heure.`,
    };
  }

  const heuresFaites = minutesTravaillees(iso, minute) / 60;
  const heuresTotal = heuresDuJour(iso);
  const avancement = heuresTotal === 0 ? 0 : heuresFaites / heuresTotal;
  const parHeure = heuresFaites === 0 ? 0 : valides / heuresFaites;
  const attendu = OBJECTIF_HEURE * heuresFaites;
  const projection = parHeure * heuresTotal;
  const base = { valides, parHeure, attendu, projection, heuresFaites, avancement };

  // Trop tôt pour juger : sur 20 minutes, un rendez-vous de plus ou de moins fait tout basculer.
  if (heuresFaites < 0.5) {
    return {
      ...base, etat: "demarrage", titre: "La journée démarre",
      phrase: valides > 0 ? `Déjà ${valides} rendez-vous au compteur, bon départ.` : "Premiers appels en cours, la cadence se mesure après une demi-heure.",
    };
  }

  const debit = arrondi1(parHeure);
  const proj = Math.round(projection);
  const manque = Math.max(1, Math.ceil(attendu - valides));

  if (parHeure >= OBJECTIF_HAUT) {
    return {
      ...base, etat: "excellente", titre: "Excellente cadence",
      phrase: `${debit} rendez-vous par heure, tu es au-dessus du haut de la fourchette. À ce rythme, la journée finit vers ${proj} rendez-vous.`,
    };
  }
  if (parHeure >= OBJECTIF_MIN) {
    return {
      ...base, etat: "bonne", titre: "Bonne cadence",
      phrase: `${debit} rendez-vous par heure, tu es dans la fourchette des ${OBJECTIF_MIN} à ${OBJECTIF_HAUT}. Environ ${proj} d'ici la fermeture si tu tiens ce rythme.`,
    };
  }
  if (parHeure >= OBJECTIF_MIN * 0.66) {
    return {
      ...base, etat: "moyenne", titre: "Cadence à relancer",
      phrase: `${debit} rendez-vous par heure, un peu sous les ${OBJECTIF_MIN} attendus. ${manque === 1 ? "Un rendez-vous" : `${manque} rendez-vous`} de plus et tu reviens dans la fourchette.`,
    };
  }
  return {
    ...base, etat: "faible", titre: "Cadence en dessous",
    phrase: `${debit} rendez-vous par heure pour un objectif de ${OBJECTIF_MIN} à ${OBJECTIF_HAUT}. Les non-réponses et les HRP font partie du métier : enchaîne les appels, il reste ${Math.max(0, Math.round((1 - avancement) * 100))} % de la journée.`,
  };
}

/** Débit moyen par heure sur les journées passées, arrondi au dixième. */
export function moyenneParHeure(historique: { jour: string; total: number }[]): number | null {
  const jours = historique.filter((h) => heuresDuJour(h.jour) > 0);
  if (!jours.length) return null;
  const dossiers = jours.reduce((t, h) => t + h.total, 0);
  const heures = jours.reduce((t, h) => t + heuresDuJour(h.jour), 0);
  return Math.round((dossiers / heures) * 10) / 10;
}

/**
 * Temps réellement passé à saisir, en heures : de la première à la dernière saisie du jour
 * (jusqu'à maintenant si la journée est en cours). Plancher d'une heure, pour qu'un seul
 * dossier ne fasse pas un débit délirant. Sans aucune saisie, on retombe sur le temps ouvert.
 */
export function heuresActives(
  iso: string,
  jour: { total: number; premiere: number; derniere: number } | undefined,
  maintenant?: Date,
): number {
  const enCours = maintenant !== undefined;
  const fin = enCours ? maintenant.getHours() * 60 + maintenant.getMinutes() : undefined;
  if (!jour || jour.total === 0) {
    if (!enCours) return heuresDuJour(iso);
    const plage = plageDuJour(iso);
    return plage ? Math.max(0, Math.min(fin!, plage.fin) - plage.debut) / 60 : 0;
  }
  const derniere = enCours ? Math.max(jour.derniere, fin!) : jour.derniere;
  return Math.max(1, (derniere - jour.premiere) / 60);
}

/** Couleur simple d'un débit horaire : vert dans la fourchette, orange juste en dessous, rouge sinon. */
export function niveauDebit(debit: number, heuresFaites: number): "neutre" | "bon" | "moyen" | "faible" {
  if (heuresFaites < 0.5) return "neutre";           // trop tôt pour juger
  if (debit >= OBJECTIF_MIN) return "bon";
  if (debit >= OBJECTIF_MIN * 0.66) return "moyen";
  return "faible";
}

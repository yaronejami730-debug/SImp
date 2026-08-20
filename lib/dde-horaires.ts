// Horaires d'ouverture DDE, partagés par le formulaire (navigateur) et l'API (serveur).
// Lundi -> jeudi : 10h30 à 18h00. Vendredi : 10h30 à 16h00. Fermé le week-end.

const DEBUT = 10 * 60 + 30;
const FIN_SEMAINE = 18 * 60;   // lundi -> jeudi
const FIN_VENDREDI = 16 * 60;

/** Minute de fin pour un jour de la semaine (0 = dimanche), ou null si fermé. */
function finDuJour(jour: number): number | null {
  if (jour >= 1 && jour <= 4) return FIN_SEMAINE;
  if (jour === 5) return FIN_VENDREDI;
  return null;
}

/** Plage d'ouverture d'une date, en minutes depuis minuit. Null si fermé. */
export function plageDuJour(iso: string): { debut: number; fin: number } | null {
  const fin = finDuJour(jourDeLaSemaine(iso));
  return fin === null ? null : { debut: DEBUT, fin };
}

/** Jour de la semaine d'une date "YYYY-MM-DD", sans surprise de fuseau. */
export function jourDeLaSemaine(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
}

export function estJourOuvre(iso: string): boolean {
  return finDuJour(jourDeLaSemaine(iso)) !== null;
}

/** Créneaux de 30 min ouverts ce jour-là, format "HH:MM". Vide si fermé. */
export function creneauxDde(iso: string): string[] {
  const fin = finDuJour(jourDeLaSemaine(iso));
  if (fin === null) return [];
  const out: string[] = [];
  for (let t = DEBUT; t <= fin; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

export function estCreneauValide(iso: string, heure: string): boolean {
  return creneauxDde(iso).includes(heure.replace("h", ":"));
}

/** Rappel affiché sous le sélecteur d'heure. */
export const HORAIRES_TEXTE = "Du lundi au jeudi : 10h30 → 18h00. Vendredi : 10h30 → 16h00.";

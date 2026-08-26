// Départ d'appel depuis Ringover : on ouvre le composeur avec le numéro déjà saisi.
// Fichier sans dépendance serveur (utilisé depuis le navigateur).

/** Modèle d'URL du composeur. `{numero}` reçoit le numéro au format international.
 *  Réglable sans toucher au code : NEXT_PUBLIC_RINGOVER_CALL_URL dans l'environnement. */
const MODELE = process.env.NEXT_PUBLIC_RINGOVER_CALL_URL || "https://app.ringover.com/call/{numero}";

/** Un mobile français « 06 12 34 56 78 » devient « +33612345678 », le format attendu par Ringover. */
export function numeroInternational(tel: string): string {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.startsWith("33")) return `+${d}`;
  if (d.startsWith("0")) return `+33${d.slice(1)}`;
  return d ? `+${d}` : "";
}

export function lienRingover(tel: string): string {
  return MODELE.replace("{numero}", encodeURIComponent(numeroInternational(tel)));
}

/**
 * Ouvre Ringover sur le numéro, dans un onglet réutilisé d'un appel à l'autre.
 * Le numéro part aussi dans le presse-papiers : si le composeur ne se pré-remplit pas
 * (extension Click2Call absente, session Ringover fermée), il reste à coller.
 */
export async function appelerAvecRingover(tel: string): Promise<void> {
  try { await navigator.clipboard?.writeText(numeroInternational(tel)); } catch { /* presse-papiers refusé : sans conséquence */ }
  window.open(lienRingover(tel), "ringover", "noopener");
}

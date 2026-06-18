// Générateur de référence de rendez-vous (lisible, sans caractères ambigus).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // pas de I O 0 1 L

/** Référence RDV unique-ish, ex: "RDV-7Q4KMP". */
export function genRef(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `RDV-${s}`;
}

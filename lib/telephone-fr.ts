// Numéros de mobile français : quoi que saisisse la personne (+33, 0033, points, espaces),
// on stocke et on affiche toujours « 06 12 34 56 78 ».

/** 10 chiffres commençant par 06 ou 07, ou null si ce n'est pas un mobile français. */
export function mobileFR(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("0033")) d = d.slice(4);
  else if (d.startsWith("33") && d.length > 10) d = d.slice(2);
  if (d.length === 9 && /^[67]/.test(d)) d = "0" + d;   // 612345678 -> 0612345678
  return /^0[67]\d{8}$/.test(d) ? d : null;
}

/** Découpe par paires : « 06 12 34 56 78 ». Rend la saisie telle quelle si elle n'est pas exploitable. */
export function formatMobileFR(raw: string): string | null {
  const d = mobileFR(raw);
  return d ? d.replace(/(\d{2})(?=\d)/g, "$1 ").trim() : null;
}

/** Mise en forme au fil de la frappe : on garde ce qui est tapé, on espace tous les deux chiffres. */
export function formatMobileEnCours(raw: string): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("0033")) d = d.slice(4);
  else if (d.startsWith("33") && d.length > 10) d = d.slice(2);
  if (d.length && !d.startsWith("0") && /^[67]/.test(d)) d = "0" + d;
  d = d.slice(0, 10);
  return d.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

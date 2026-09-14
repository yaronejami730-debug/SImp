// Contexte d'agence dérivé du slug d'URL (posé en cookies par middleware.ts) — voir
// /simplicicar-paris-17e/... : même compte, juste le préfixe qui détermine l'agence affichée.

export type BrandTheme = { name: string; primary: string; dark: string; logo: string; headerDark?: boolean };

function cookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Slug courant (ex: "simplicicar-paris-17e"), ou null hors contexte d'agence. */
export function getAgenceSlug(): string | null {
  return cookie("agence_slug");
}

/** Thème (logo/couleurs) de l'agence du slug courant — prioritaire sur le thème du compte
 *  connecté quand on navigue sous un préfixe d'agence. */
export function getAgenceTheme(): BrandTheme | null {
  const raw = cookie("agence_theme");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Préfixe un chemin interne avec le slug courant, si on navigue sous un préfixe d'agence. */
export function agenceHref(href: string): string {
  const slug = getAgenceSlug();
  return slug ? `/${slug}${href}` : href;
}

/** Bascule vers une AUTRE agence en restant sur la même page (ex: /agenda) : retire le préfixe
 *  de slug courant du chemin actuel, puis pose le nouveau — pour le sélecteur d'agence (admin). */
export function switchAgenceHref(newSlug: string): string {
  if (typeof window === "undefined") return `/${newSlug}`;
  const current = getAgenceSlug();
  let path = window.location.pathname;
  if (current && path.startsWith(`/${current}`)) path = path.slice(`/${current}`.length);
  return `/${newSlug}${path || "/"}${window.location.search}`;
}

const AGENCE_PREF_KEY = "agence_slug_pref";

/** Préférence d'agence mémorisée (super-admin uniquement — les autres comptes n'ont qu'une
 *  seule agence, la leur). Lue au démarrage pour rediriger vers la dernière agence choisie
 *  plutôt que toujours celle par défaut du compte. */
export function getAgencePref(): string | null {
  try { return localStorage.getItem(AGENCE_PREF_KEY); } catch { return null; }
}
export function setAgencePref(slug: string) {
  try { localStorage.setItem(AGENCE_PREF_KEY, slug); } catch {}
}

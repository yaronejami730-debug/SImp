// Design system du CRM Simplicicar — inspiré de la maquette CRM ENR.
// Une seule source de vérité : aucune couleur en dur dans les pages.

export const T = {
  bg: "#faf8f5",          // fond de page
  surface: "#ffffff",     // cartes, champs
  surface2: "#f7f5f1",    // zones secondaires, en-têtes de table
  surface3: "#f2efe9",    // survol, boutons discrets
  ink: "#1a1a1a",         // texte principal
  ink2: "#6f6a62",        // texte secondaire
  ink3: "#a8a39a",        // texte inactif, placeholder
  line: "#e4e0d9",        // bordure standard
  lineStrong: "#b8b3ac",  // bordure appuyée
  success: "#4c7551", successSoft: "#e8eee6",
  warning: "#a8722a", warningSoft: "#f6efe2",
  danger: "#a94436", dangerSoft: "#f7e8e4",
  info: "#4a6b82", infoSoft: "#e8eef2",
  // Identité Simplicicar : rose en accent, noir pour le texte et les aplats forts.
  brand: "var(--brand-primary)",       // rose de la franchise (white-label)
  brandDark: "var(--brand-dark)",      // bleu nuit / noir de la marque
  brandSoft: "color-mix(in srgb, var(--brand-primary) 12%, #fff)",
  brandLine: "color-mix(in srgb, var(--brand-primary) 35%, #fff)",
} as const;

export const R = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const S = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

"use client";

/** Jeu d'icônes minimal, dessiné à la main : aucune dépendance externe. */
const CHEMINS: Record<string, React.ReactNode> = {
  plus: <><path d="M12 5v14M5 12h14" /></>,
  calendrier: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  personnes: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
  cible: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  cloche: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  graphique: <><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>,
  barres: <><path d="M3 21h18" /><rect x="5" y="11" width="4" height="7" /><rect x="11" y="6" width="4" height="12" /><rect x="17" y="14" width="4" height="4" /></>,
  euro: <><path d="M18 6a7 7 0 1 0 0 12" /><path d="M4 10h9M4 14h9" /></>,
  enveloppe: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 7l10 6 10-6" /></>,
  etoile: <><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z" /></>,
  reglages: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.7 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  loupe: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" /></>,
  voiture: <><path d="M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16" /><rect x="3" y="16" width="18" height="4" rx="1.5" /><circle cx="7.5" cy="20" r="1.5" /><circle cx="16.5" cy="20" r="1.5" /><path d="M3 16h18" /></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  croix: <><path d="M18 6L6 18M6 6l12 12" /></>,
};

export default function Icone({ nom, taille = 18 }: { nom: string; taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {CHEMINS[nom] ?? CHEMINS.cible}
    </svg>
  );
}

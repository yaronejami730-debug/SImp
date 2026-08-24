// Plan de navigation du CRM : groupes lisibles plutôt qu'une rangée d'onglets.
// Les droits reprennent exactement ceux de l'ancienne barre.

export type ClientUserLite = {
  role: "admin" | "responsable" | "collab";
  isCommercial?: boolean;
  isTeleprospector?: boolean;
};

export type Entree = {
  key: string;
  label: string;
  href: string;
  icone: string;      // clé d'icône (voir Icone.tsx)
  visible: (u: ClientUserLite | null) => boolean;
};

export type Groupe = { titre: string; entrees: Entree[] };

const estAdmin = (u: ClientUserLite | null) => u?.role === "admin";
/** Peut créer des RDV : admin ou téléprospecteur. */
const peutCreer = (u: ClientUserLite | null) => estAdmin(u) || !!u?.isTeleprospector;
/** Commercial pur : ne voit que son agenda, ses paiements et ses paramètres. */
const commercialPur = (u: ClientUserLite | null) => u?.role !== "admin" && !!u?.isCommercial && !u?.isTeleprospector;
/** Espace commercial (paiements, paramètres). */
const espaceCommercial = (u: ClientUserLite | null) => estAdmin(u) || !!u?.isCommercial;

const restreint = (f: (u: ClientUserLite | null) => boolean) => (u: ClientUserLite | null) =>
  commercialPur(u) ? false : f(u);

export const GROUPES: Groupe[] = [
  {
    titre: "Activité",
    entrees: [
      { key: "rdv", label: "Prise de RDV", href: "/", icone: "plus", visible: restreint(peutCreer) },
      { key: "agenda", label: "Agenda", href: "/agenda", icone: "calendrier", visible: () => true },
      { key: "recherche-rdv", label: "Recherche", href: "/recherche-rdv", icone: "loupe", visible: () => true },
      { key: "crm", label: "Clients", href: "/crm", icone: "personnes", visible: restreint(() => true) },
      { key: "prospection", label: "Prospection", href: "/prospection", icone: "cible", visible: restreint(peutCreer) },
      { key: "rappels", label: "Rappels", href: "/rappels", icone: "cloche", visible: restreint(peutCreer) },
    ],
  },
  {
    titre: "Pilotage",
    entrees: [
      { key: "bilan", label: "Bilan", href: "/bilan", icone: "graphique", visible: restreint((u) => estAdmin(u) || !!u?.isTeleprospector) },
      { key: "statistiques", label: "Statistiques", href: "/statistiques", icone: "barres", visible: restreint(() => true) },
      { key: "paiements", label: "Mes paiements", href: "/paiements", icone: "euro", visible: (u) => estAdmin(u) || !!u?.isCommercial || !!u?.isTeleprospector },
    ],
  },
  {
    titre: "Administration",
    entrees: [
      { key: "comptes", label: "Comptes", href: "/comptes", icone: "personnes", visible: restreint((u) => estAdmin(u) || u?.role === "responsable") },
      { key: "baremes", label: "Barèmes", href: "/baremes", icone: "euro", visible: restreint((u) => estAdmin(u) || u?.role === "responsable") },
      { key: "templates", label: "Modèles d'e-mails", href: "/templates", icone: "enveloppe", visible: restreint(estAdmin) },
      { key: "avis-admin", label: "Avis clients", href: "/avis-admin", icone: "etoile", visible: restreint(estAdmin) },
      { key: "parametres", label: "Paramètres", href: "/parametres", icone: "reglages", visible: espaceCommercial },
    ],
  },
];

/** Groupes filtrés selon le compte connecté (les groupes vides disparaissent). */
export function groupesVisibles(u: ClientUserLite | null): Groupe[] {
  return GROUPES
    .map((g) => ({ ...g, entrees: g.entrees.filter((e) => e.visible(u)) }))
    .filter((g) => g.entrees.length > 0);
}

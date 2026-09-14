import { listCallCenters } from "./callcenters";

function cookieValue(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Si la requête vient d'un préfixe de slug d'agence (ex: /simplicicar-paris-17e/agenda — voir
 *  middleware.ts), renvoie l'ensemble des call center ids de CETTE agence (elle-même + tous ses
 *  descendants) — à utiliser pour restreindre la visibilité, même pour un super-admin qui
 *  navigue "sous" ce slug : "je suis sur le CRM de telle agence, je ne dois voir que ça."
 *  Renvoie null hors contexte de slug (comportement normal, inchangé, aucune régression). */
export async function agenceScopeCcIds(req: Request): Promise<number[] | null> {
  const raw = cookieValue(req, "agence_cc_id");
  const rootId = raw ? Number(raw) : null;
  if (!rootId || Number.isNaN(rootId)) return null;
  const ccs = await listCallCenters();
  const ids = new Set<number>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const c of ccs) {
      if (c.parent_id != null && ids.has(c.parent_id) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }
  return [...ids];
}

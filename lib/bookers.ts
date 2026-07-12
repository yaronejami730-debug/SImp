import { getPool } from "./db";
import { listUsers } from "./users";
import { listCallCenters, commercialsForCallCenterInherited } from "./callcenters";

/** "Qui prend mes rendez-vous" : les téléprospecteurs autorisés à réserver pour un commercial,
 *  avec possibilité pour le commercial d'en DÉSACTIVER (blocklist ; par défaut tout le monde est actif). */

export type Booker = { email: string; name: string; callCenter: string | null; blocked: boolean };

export async function listBlocked(commercialEmail: string): Promise<Set<string>> {
  const { rows } = await getPool().query<{ booker_email: string }>(
    `select booker_email from commercial_blocked_bookers where lower(commercial_email) = lower($1)`,
    [commercialEmail],
  );
  return new Set(rows.map((r) => r.booker_email.toLowerCase()));
}

export async function setBlocked(commercialEmail: string, bookerEmail: string, blocked: boolean) {
  if (blocked) {
    await getPool().query(
      `insert into commercial_blocked_bookers (commercial_email, booker_email) values (lower($1), lower($2)) on conflict do nothing`,
      [commercialEmail, bookerEmail],
    );
  } else {
    await getPool().query(
      `delete from commercial_blocked_bookers where lower(commercial_email) = lower($1) and lower(booker_email) = lower($2)`,
      [commercialEmail, bookerEmail],
    );
  }
}

/** Le booker (télépro connecté) est-il bloqué par ce commercial ? */
export async function isBlocked(commercialEmail: string, bookerEmail: string): Promise<boolean> {
  const { rows } = await getPool().query(
    `select 1 from commercial_blocked_bookers where lower(commercial_email) = lower($1) and lower(booker_email) = lower($2)`,
    [commercialEmail, bookerEmail],
  );
  return rows.length > 0;
}

/** Liste des télépros pouvant réserver pour ce commercial (call centers liés + entité racine),
 *  chacun avec son call center d'origine (ou "indépendant") et son état actif/désactivé. */
export async function listBookersFor(commercialEmail: string): Promise<Booker[]> {
  const [users, ccs, blocked] = await Promise.all([listUsers(), listCallCenters(), listBlocked(commercialEmail)]);
  const me = commercialEmail.toLowerCase();
  // Call centers dont la liste de commerciaux (héritée) inclut ce commercial.
  const allowedCc = new Set<number>([1]); // cc1 = entité racine, aucune restriction
  for (const c of ccs) {
    if (c.id === 1) continue;
    const coms = await commercialsForCallCenterInherited(c.id);
    if (coms.some((x) => x.email.toLowerCase() === me)) allowedCc.add(c.id);
  }
  const ccName = new Map(ccs.map((c) => [c.id, c.name]));
  return users
    .filter((u) => u.is_teleprospector && u.active !== false && u.email.toLowerCase() !== me && allowedCc.has(Number(u.call_center_id)))
    .map((u) => ({
      email: u.email.toLowerCase(),
      name: u.name,
      callCenter: Number(u.call_center_id) === 1 ? null : (ccName.get(Number(u.call_center_id)) ?? null),
      blocked: blocked.has(u.email.toLowerCase()),
    }));
}

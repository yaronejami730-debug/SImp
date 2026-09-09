import { getPool } from "./db";
import { hashPassword } from "./auth";

export type User = {
  id: number; email: string; name: string; role: "admin" | "responsable" | "collab";
  call_center_id: number; commission_base: number; commission_pct: number;
  is_commercial: boolean; is_teleprospector: boolean; phone: string; active: boolean; created_at: string;
  username?: string; agence_name?: string; call_center_name?: string; last_seen_at?: string | null; deleted_at?: string | null;
  // Cumulables, comme is_commercial/is_teleprospector : un même compte peut être téléprospecteur
  // ET commercial ET gestionnaire ET associé à la fois.
  is_gestionnaire?: boolean; is_associe?: boolean;
};

/** Ping de présence : appelé toutes les ~45s tant que le CRM est ouvert (voir AppShell). */
export async function touchLastSeen(email: string): Promise<void> {
  await getPool().query(`update users set last_seen_at = now() where lower(email) = lower($1)`, [email.trim()]);
}

const USER_COLS = `id, email, name, role, call_center_id, commission_base, commission_pct, is_commercial, is_teleprospector, phone, active, username, deleted_at, is_gestionnaire, is_associe`;

/** pg renvoie les bigint (id, call_center_id) en string : on normalise en number, sinon toute
 *  comparaison stricte (===, clé de Map) contre un id venu d'ailleurs (déjà normalisé, lui)
 *  échoue silencieusement. Voir le bug "commercial listé sans agence" dans /api/deals. */
function castIds<T extends { id: number; call_center_id: number }>(row: T): T {
  return { ...row, id: Number(row.id), call_center_id: row.call_center_id == null ? row.call_center_id : Number(row.call_center_id) };
}

export async function getUserByEmail(email: string) {
  const { rows } = await getPool().query(
    `select ${USER_COLS}, password_hash from users where lower(email) = lower($1)`,
    [email.trim()],
  );
  const r = rows[0] as (User & { password_hash: string }) | undefined;
  return r ? castIds(r) : undefined;
}

/** Login par PSEUDO (prioritaire) ou e-mail (compat comptes existants, ex call center Hanan). */
export async function getUserByLogin(identifier: string) {
  const { rows } = await getPool().query(
    `select ${USER_COLS}, password_hash from users
      where (username <> '' and lower(username) = lower($1)) or lower(email) = lower($1)
      order by (lower(username) = lower($1)) desc limit 1`,
    [identifier.trim()],
  );
  const r = rows[0] as (User & { password_hash: string }) | undefined;
  return r ? castIds(r) : undefined;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const { rows } = await getPool().query(`select ${USER_COLS} from users where id = $1`, [id]);
  const r = rows[0] as User | undefined;
  return r ? castIds(r) : undefined;
}

/** Liste les users (tous, ou d'un call center si fourni — cloisonnement legacy). */
export async function listUsers(callCenterId?: number): Promise<User[]> {
  // agence_name = racine de la hiérarchie du call center (parent, sinon lui-même).
  const cols = `u.id, u.email, u.name, u.role, u.call_center_id, u.commission_base, u.commission_pct, u.is_commercial, u.is_teleprospector, u.phone, u.active, u.created_at, u.username, u.last_seen_at, u.deleted_at, u.is_gestionnaire, u.is_associe, cc.name as call_center_name, coalesce(p.name, cc.name) as agence_name`;
  const from = `from users u left join call_centers cc on cc.id = u.call_center_id left join call_centers p on p.id = cc.parent_id`;
  if (callCenterId != null) {
    const { rows } = await getPool().query(`select ${cols} ${from} where u.call_center_id = $1 order by u.role, u.name`, [callCenterId]);
    return (rows as User[]).map(castIds);
  }
  const { rows } = await getPool().query(`select ${cols} ${from} order by u.role, u.name`);
  return (rows as User[]).map(castIds);
}

export type DirectoryPerson = { email: string; name: string; phone: string };

/** Comptes commerciaux actifs (sélectionnables comme exécutant d'un RDV). */
export async function listCommercials(): Promise<DirectoryPerson[]> {
  const { rows } = await getPool().query<DirectoryPerson>(
    `select email, name, phone from users where is_commercial = true and active = true order by name`,
  );
  return rows;
}

/** Comptes téléprospecteurs actifs (qui génèrent les RDV). */
export async function listTeleprospectors(): Promise<DirectoryPerson[]> {
  const { rows } = await getPool().query<DirectoryPerson>(
    `select email, name, phone from users where is_teleprospector = true and active = true order by name`,
  );
  return rows;
}

/** Résout l'e-mail du compte commercial à partir de son nom (insensible casse/accents/ordre).
 *  1) compte marqué commercial dont le nom correspond (actif, ou désactivé si `includeInactive` —
 *     nécessaire pour facturer un dossier historique dont le commercial a depuis été supprimé) ;
 *  2) sinon, entité dont `default_commercial` correspond -> son admin (= le commercial de l'entité). */
export async function commercialEmailByName(name?: string, includeInactive = false): Promise<string> {
  if (!name?.trim()) return "";
  const tokset = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
  const target = tokset(name);
  const list = includeInactive
    ? (await getPool().query<DirectoryPerson>(`select email, name, phone from users where is_commercial = true order by name`)).rows
    : await listCommercials();
  const byName = list.find((c) => tokset(c.name) === target);
  if (byName) return byName.email;
  // Fallback entité : le commercial "X" correspond à l'entité dont default_commercial = "X".
  const ccs = await getPool().query<{ id: number; default_commercial: string }>(
    `select id, default_commercial from call_centers where default_commercial <> ''`,
  );
  const match = ccs.rows.find((c) => tokset(c.default_commercial) === target);
  if (!match) return "";
  const admin = await getPool().query<{ email: string }>(
    `select email from users where call_center_id = $1 and role = 'admin' order by id limit 1`,
    [match.id],
  );
  return admin.rows[0]?.email ?? "";
}

export type CreateUserInput = {
  email?: string; password: string; name: string; role?: "admin" | "responsable" | "collab";
  callCenterId?: number; commissionBase?: number; commissionPct?: number;
  isCommercial?: boolean; isTeleprospector?: boolean; phone?: string; username?: string;
  isGestionnaire?: boolean; isAssocie?: boolean;
};

export async function createUser(input: CreateUserInput): Promise<User> {
  // Login = PSEUDO. L'e-mail devient optionnel (info de contact) ; on génère un placeholder unique si absent.
  const username = (input.username ?? "").trim().toLowerCase() || (input.name ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  if (!username) throw new Error("Pseudo requis.");
  const email = (input.email ?? "").trim().toLowerCase() || `${username}@no-mail.local`;
  const { rows } = await getPool().query(
    `insert into users (email, password_hash, name, role, call_center_id, commission_base, commission_pct, is_commercial, is_teleprospector, phone, active, username, is_gestionnaire, is_associe)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13)
     returning ${USER_COLS}, created_at`,
    [
      email, hashPassword(input.password), input.name.trim(), input.role ?? "collab",
      input.callCenterId ?? 1, input.commissionBase ?? 60, input.commissionPct ?? 0,
      input.isCommercial ?? false, input.isTeleprospector ?? false, (input.phone ?? "").trim(), username,
      input.isGestionnaire ?? false, input.isAssocie ?? false,
    ],
  );
  return castIds(rows[0] as User);
}

/** Met à jour les flags/infos d'un compte (rôles cumulables, actif, tél, commission). */
export async function updateUserFlags(id: number, patch: { isCommercial?: boolean; isTeleprospector?: boolean; isGestionnaire?: boolean; isAssocie?: boolean; active?: boolean; phone?: string; commissionBase?: number; commissionPct?: number }): Promise<void> {
  const map: Record<string, unknown> = {
    is_commercial: patch.isCommercial, is_teleprospector: patch.isTeleprospector,
    is_gestionnaire: patch.isGestionnaire, is_associe: patch.isAssocie, active: patch.active,
    phone: patch.phone, commission_base: patch.commissionBase, commission_pct: patch.commissionPct,
  };
  const sets: string[] = []; const params: unknown[] = [];
  for (const [col, val] of Object.entries(map)) if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
  if (!sets.length) return;
  params.push(id);
  await getPool().query(`update users set ${sets.join(", ")} where id = $${params.length}`, params);
}

/** Définit un nouveau mot de passe (admin : dépannage d'un compte, prise en main). */
export async function setUserPassword(id: number, password: string): Promise<void> {
  await getPool().query(`update users set password_hash = $1 where id = $2`, [hashPassword(password), id]);
}

/** Compat : active/désactive le statut commercial. */
export async function setUserCommercial(id: number, _callCenterId: number, isCommercial: boolean): Promise<void> {
  await updateUserFlags(id, { isCommercial });
}

/** Téléphone du commercial (depuis son compte) — plus aucun numéro codé en dur. */
export async function commercialPhoneByName(name?: string): Promise<string> {
  if (!name?.trim()) return "";
  const tokset = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
  const target = tokset(name);
  const list = await listCommercials();
  return list.find((c) => tokset(c.name) === target)?.phone ?? "";
}

/** Suppression d'un compte (pas un admin) : désactivation, jamais un hard delete — l'historique
 *  de facturation (RDV signés, accords, factures) doit rester résoluble indéfiniment. */
export async function deleteUser(id: number, _callCenterId: number): Promise<void> {
  await getPool().query(`update users set active = false, deleted_at = now() where id = $1 and role <> 'admin'`, [id]);
}

/** Schémas de commission par e-mail (tous les comptes). */
export async function getCommissionSchemes(): Promise<Map<string, { base: number; pct: number }>> {
  const { rows } = await getPool().query<{ email: string; commission_base: number; commission_pct: number }>(
    `select email, commission_base, commission_pct from users`,
  );
  const m = new Map<string, { base: number; pct: number }>();
  for (const r of rows) m.set(r.email.toLowerCase(), { base: Number(r.commission_base), pct: Number(r.commission_pct) });
  return m;
}

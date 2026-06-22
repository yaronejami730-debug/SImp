import { getPool } from "./db";
import { hashPassword } from "./auth";

export type User = {
  id: number; email: string; name: string; role: "admin" | "collab";
  call_center_id: number; commission_base: number; commission_pct: number; is_commercial: boolean; created_at: string;
};

export async function getUserByEmail(email: string) {
  const { rows } = await getPool().query(
    `select id, email, name, role, call_center_id, commission_base, commission_pct, is_commercial, password_hash
     from users where lower(email) = lower($1)`,
    [email.trim()],
  );
  return rows[0] as (User & { password_hash: string }) | undefined;
}

/** Liste les users d'UN call center (cloisonnement). */
export async function listUsers(callCenterId: number): Promise<User[]> {
  const { rows } = await getPool().query(
    `select id, email, name, role, call_center_id, commission_base, commission_pct, is_commercial, created_at
     from users where call_center_id = $1 order by role, name`,
    [callCenterId],
  );
  return rows as User[];
}

export type Commercial = { email: string; name: string; call_center_id: number };

/** Comptes commerciaux (sélectionnables comme exécutant d'un RDV).
 *  Cross-entité : on liste tous les commerciaux (l'assignation déplacement peut être externe). */
export async function listCommercials(): Promise<Commercial[]> {
  const { rows } = await getPool().query<Commercial>(
    `select email, name, call_center_id from users where is_commercial = true order by name`,
  );
  return rows;
}

/** Résout l'e-mail du compte commercial à partir de son nom (insensible casse/accents/ordre).
 *  1) compte marqué commercial dont le nom correspond ;
 *  2) sinon, entité dont `default_commercial` correspond -> son admin (= le commercial de l'entité). */
export async function commercialEmailByName(name?: string): Promise<string> {
  if (!name?.trim()) return "";
  const tokset = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
  const target = tokset(name);
  const list = await listCommercials();
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

export async function createUser(
  email: string, password: string, name: string, role: "admin" | "collab",
  callCenterId: number, commissionBase = 50, commissionPct = 10, isCommercial = false,
): Promise<User> {
  const { rows } = await getPool().query(
    `insert into users (email, password_hash, name, role, call_center_id, commission_base, commission_pct, is_commercial)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id, email, name, role, call_center_id, commission_base, commission_pct, is_commercial, created_at`,
    [email.trim().toLowerCase(), hashPassword(password), name.trim(), role, callCenterId, commissionBase, commissionPct, isCommercial],
  );
  return rows[0] as User;
}

/** Active/désactive le statut commercial d'un compte (dans le call center courant). */
export async function setUserCommercial(id: number, callCenterId: number, isCommercial: boolean): Promise<void> {
  await getPool().query(`update users set is_commercial = $3 where id = $1 and call_center_id = $2`, [id, callCenterId, isCommercial]);
}

/** Suppression limitée au call center (ne supprime pas un admin). */
export async function deleteUser(id: number, callCenterId: number): Promise<void> {
  await getPool().query(`delete from users where id = $1 and call_center_id = $2 and role <> 'admin'`, [id, callCenterId]);
}

/** Schémas de commission par e-mail (pour calculer la commission par owner du RDV). */
export async function getCommissionSchemes(callCenterId: number): Promise<Map<string, { base: number; pct: number }>> {
  const { rows } = await getPool().query<{ email: string; commission_base: number; commission_pct: number }>(
    `select email, commission_base, commission_pct from users where call_center_id = $1`,
    [callCenterId],
  );
  const m = new Map<string, { base: number; pct: number }>();
  for (const r of rows) m.set(r.email.toLowerCase(), { base: Number(r.commission_base), pct: Number(r.commission_pct) });
  return m;
}

import { getPool } from "./db";
import { hashPassword } from "./auth";

export type User = {
  id: number; email: string; name: string; role: "admin" | "collab";
  call_center_id: number; commission_base: number; commission_pct: number; created_at: string;
};

export async function getUserByEmail(email: string) {
  const { rows } = await getPool().query(
    `select id, email, name, role, call_center_id, commission_base, commission_pct, password_hash
     from users where lower(email) = lower($1)`,
    [email.trim()],
  );
  return rows[0] as (User & { password_hash: string }) | undefined;
}

/** Liste les users d'UN call center (cloisonnement). */
export async function listUsers(callCenterId: number): Promise<User[]> {
  const { rows } = await getPool().query(
    `select id, email, name, role, call_center_id, commission_base, commission_pct, created_at
     from users where call_center_id = $1 order by role, name`,
    [callCenterId],
  );
  return rows as User[];
}

export async function createUser(
  email: string, password: string, name: string, role: "admin" | "collab",
  callCenterId: number, commissionBase = 50, commissionPct = 10,
): Promise<User> {
  const { rows } = await getPool().query(
    `insert into users (email, password_hash, name, role, call_center_id, commission_base, commission_pct)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id, email, name, role, call_center_id, commission_base, commission_pct, created_at`,
    [email.trim().toLowerCase(), hashPassword(password), name.trim(), role, callCenterId, commissionBase, commissionPct],
  );
  return rows[0] as User;
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

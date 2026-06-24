import { getPool } from "./db";
import { hashPassword } from "./auth";

export type User = {
  id: number; email: string; name: string; role: "admin" | "collab";
  call_center_id: number; commission_base: number; commission_pct: number;
  is_commercial: boolean; is_teleprospector: boolean; phone: string; active: boolean; created_at: string;
};

const USER_COLS = `id, email, name, role, call_center_id, commission_base, commission_pct, is_commercial, is_teleprospector, phone, active`;

export async function getUserByEmail(email: string) {
  const { rows } = await getPool().query(
    `select ${USER_COLS}, password_hash from users where lower(email) = lower($1)`,
    [email.trim()],
  );
  return rows[0] as (User & { password_hash: string }) | undefined;
}

/** Liste les users (tous, ou d'un call center si fourni — cloisonnement legacy). */
export async function listUsers(callCenterId?: number): Promise<User[]> {
  if (callCenterId != null) {
    const { rows } = await getPool().query(`select ${USER_COLS}, created_at from users where call_center_id = $1 order by role, name`, [callCenterId]);
    return rows as User[];
  }
  const { rows } = await getPool().query(`select ${USER_COLS}, created_at from users order by role, name`);
  return rows as User[];
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

export type CreateUserInput = {
  email: string; password: string; name: string; role?: "admin" | "collab";
  callCenterId?: number; commissionBase?: number; commissionPct?: number;
  isCommercial?: boolean; isTeleprospector?: boolean; phone?: string;
};

export async function createUser(input: CreateUserInput): Promise<User> {
  const { rows } = await getPool().query(
    `insert into users (email, password_hash, name, role, call_center_id, commission_base, commission_pct, is_commercial, is_teleprospector, phone, active)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
     returning ${USER_COLS}, created_at`,
    [
      input.email.trim().toLowerCase(), hashPassword(input.password), input.name.trim(), input.role ?? "collab",
      input.callCenterId ?? 1, input.commissionBase ?? 50, input.commissionPct ?? 10,
      input.isCommercial ?? false, input.isTeleprospector ?? false, (input.phone ?? "").trim(),
    ],
  );
  return rows[0] as User;
}

/** Met à jour les flags/infos d'un compte (rôle commercial/téléprospecteur, actif, tél, commission). */
export async function updateUserFlags(id: number, patch: { isCommercial?: boolean; isTeleprospector?: boolean; active?: boolean; phone?: string; commissionBase?: number; commissionPct?: number }): Promise<void> {
  const map: Record<string, unknown> = {
    is_commercial: patch.isCommercial, is_teleprospector: patch.isTeleprospector, active: patch.active,
    phone: patch.phone, commission_base: patch.commissionBase, commission_pct: patch.commissionPct,
  };
  const sets: string[] = []; const params: unknown[] = [];
  for (const [col, val] of Object.entries(map)) if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
  if (!sets.length) return;
  params.push(id);
  await getPool().query(`update users set ${sets.join(", ")} where id = $${params.length}`, params);
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

/** Suppression d'un compte (pas un admin). */
export async function deleteUser(id: number, _callCenterId: number): Promise<void> {
  await getPool().query(`delete from users where id = $1 and role <> 'admin'`, [id]);
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

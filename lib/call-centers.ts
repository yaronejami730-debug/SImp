import { getPool } from "./db";

export type CallCenter = { id: number; name: string; default_commercial: string; created_at: string };

export async function listCallCenters(): Promise<CallCenter[]> {
  const { rows } = await getPool().query<CallCenter>(`select id, name, default_commercial, created_at from call_centers order by id`);
  return rows;
}

export async function getCallCenter(id: number): Promise<CallCenter | null> {
  const { rows } = await getPool().query<CallCenter>(`select id, name, default_commercial, created_at from call_centers where id = $1`, [id]);
  return rows[0] ?? null;
}

/** Entité dont le commercial par défaut correspond au nom donné (cross-entité). */
export async function entityIdByCommercial(commercial?: string): Promise<number | null> {
  const c = commercial?.trim();
  if (!c) return null;
  const { rows } = await getPool().query<{ id: number }>(
    `select id from call_centers where lower(default_commercial) = lower($1) order by id limit 1`,
    [c],
  );
  return rows[0]?.id ?? null;
}

/** Schéma de commission de l'entité (via son admin) — pour la part "commercial". */
export async function entityCommissionScheme(callCenterId: number): Promise<{ base: number; pct: number }> {
  const { rows } = await getPool().query<{ commission_base: number; commission_pct: number }>(
    `select commission_base, commission_pct from users where call_center_id = $1 and role = 'admin' order by id limit 1`,
    [callCenterId],
  );
  if (rows[0]) return { base: Number(rows[0].commission_base), pct: Number(rows[0].commission_pct) };
  return { base: 50, pct: 10 };
}

export async function createCallCenter(name: string, defaultCommercial: string): Promise<CallCenter> {
  const { rows } = await getPool().query<CallCenter>(
    `insert into call_centers (name, default_commercial) values ($1, $2) returning id, name, default_commercial, created_at`,
    [name.trim(), defaultCommercial.trim()],
  );
  return rows[0];
}

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

export async function createCallCenter(name: string, defaultCommercial: string): Promise<CallCenter> {
  const { rows } = await getPool().query<CallCenter>(
    `insert into call_centers (name, default_commercial) values ($1, $2) returning id, name, default_commercial, created_at`,
    [name.trim(), defaultCommercial.trim()],
  );
  return rows[0];
}

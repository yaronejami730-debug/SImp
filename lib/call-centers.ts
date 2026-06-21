import { getPool } from "./db";

export type CallCenter = { id: number; name: string; default_commercial: string; parent_id: number | null; created_at: string };

export async function listCallCenters(): Promise<CallCenter[]> {
  const { rows } = await getPool().query<CallCenter>(`select id, name, default_commercial, parent_id, created_at from call_centers order by id`);
  return rows;
}

export async function getCallCenter(id: number): Promise<CallCenter | null> {
  const { rows } = await getPool().query<CallCenter>(`select id, name, default_commercial, parent_id, created_at from call_centers where id = $1`, [id]);
  return rows[0] ?? null;
}

/** IDs de l'entité + toutes ses descendantes (hiérarchie). Sert à la remontée RDV/stats. */
export async function descendantEntityIds(rootId: number): Promise<number[]> {
  const all = await listCallCenters();
  const childrenOf = new Map<number, number[]>();
  for (const cc of all) {
    if (cc.parent_id != null) {
      const list = childrenOf.get(cc.parent_id) ?? [];
      list.push(cc.id);
      childrenOf.set(cc.parent_id, list);
    }
  }
  const out: number[] = [];
  const stack = [rootId];
  const seen = new Set<number>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const c of childrenOf.get(id) ?? []) stack.push(c);
  }
  return out;
}

// Normalise un nom en jeu de mots trié (insensible à l'ordre / accents / casse).
// "Jeremy Bonamy" et "Bonamy jeremy" -> "bonamy jeremy".
const tokset = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

/** Entité dont le commercial par défaut correspond au nom donné (cross-entité). */
export async function entityIdByCommercial(commercial?: string): Promise<number | null> {
  const c = tokset(commercial ?? "");
  if (!c) return null;
  const ccs = await listCallCenters();
  const m = ccs.find((cc) => tokset(cc.default_commercial) === c);
  return m?.id ?? null;
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

export async function createCallCenter(name: string, defaultCommercial: string, parentId: number | null = null): Promise<CallCenter> {
  const { rows } = await getPool().query<CallCenter>(
    `insert into call_centers (name, default_commercial, parent_id) values ($1, $2, $3) returning id, name, default_commercial, parent_id, created_at`,
    [name.trim(), defaultCommercial.trim(), parentId],
  );
  return rows[0];
}

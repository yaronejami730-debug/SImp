import { getPool } from "./db";
import { createUser } from "./users";

export type CallCenter = { id: number; name: string; agence_only: boolean; responsable_email: string; parent_id: number | null };
export type CallCenterDetail = CallCenter & { parent_name: string | null; commercials_count: number; telepros_count: number };

export async function listCallCenters(): Promise<CallCenterDetail[]> {
  const { rows } = await getPool().query<CallCenterDetail>(
    `select c.id, c.name, c.agence_only, c.responsable_email, c.parent_id,
            p.name as parent_name,
            (select count(*) from call_center_commercials x where x.call_center_id = c.id) as commercials_count,
            (select count(*) from users u where u.call_center_id = c.id and u.is_teleprospector = true and u.active = true) as telepros_count
       from call_centers c
       left join call_centers p on p.id = c.parent_id
      order by c.id`,
  );
  return rows.map((r) => ({
    ...r,
    agence_only: !!r.agence_only,
    commercials_count: Number(r.commercials_count),
    telepros_count: Number(r.telepros_count),
  }));
}

export async function getCallCenter(id: number): Promise<CallCenter | undefined> {
  const { rows } = await getPool().query<CallCenter>(
    `select id, name, agence_only, responsable_email, parent_id from call_centers where id = $1`,
    [id],
  );
  return rows[0] ? { ...rows[0], agence_only: !!rows[0].agence_only } : undefined;
}

/** Crée un call center + son responsable (role='responsable', rattaché au nouveau CC, parent = 1 racine). */
export async function createCallCenter(input: {
  name: string; agenceOnly?: boolean;
  responsable: { name: string; email: string; password: string; phone?: string };
}): Promise<CallCenter> {
  const pool = getPool();
  const cc = await pool.query<CallCenter>(
    `insert into call_centers (name, default_commercial, parent_id, agence_only, responsable_email)
     values ($1, '', 1, $2, $3)
     returning id, name, agence_only, responsable_email, parent_id`,
    [input.name.trim(), !!input.agenceOnly, input.responsable.email.trim().toLowerCase()],
  );
  const ccId = cc.rows[0].id;
  // Le responsable peut créer des RDV (téléprospecteur) et gère son équipe (role responsable).
  await createUser({
    email: input.responsable.email, password: input.responsable.password, name: input.responsable.name,
    role: "responsable", callCenterId: ccId, isTeleprospector: true, isCommercial: false, phone: input.responsable.phone,
  });
  return { ...cc.rows[0], agence_only: !!cc.rows[0].agence_only };
}

/** Crée une agence = call center racine (parent_id null, sans responsable). */
export async function createAgence(name: string): Promise<CallCenter> {
  const { rows } = await getPool().query<CallCenter>(
    `insert into call_centers (name, default_commercial, parent_id, agence_only, responsable_email)
     values ($1, '', null, false, '') returning id, name, agence_only, responsable_email, parent_id`,
    [name.trim()],
  );
  return { ...rows[0], agence_only: !!rows[0].agence_only };
}

/** Rattache un call center à une agence (parent). */
export async function setCallCenterParent(ccId: number, parentId: number) {
  await getPool().query(`update call_centers set parent_id = $2 where id = $1`, [ccId, parentId]);
}

/** Supprime un call center / une agence. Bloqué si des call centers ou des comptes en dépendent. */
export async function deleteCallCenter(id: number) {
  if (id === 1) throw new Error("Agence principale protégée.");
  const pool = getPool();
  const kids = await pool.query<{ c: string }>(`select count(*)::int as c from call_centers where parent_id = $1`, [id]);
  if (Number(kids.rows[0].c) > 0) throw new Error("Cette agence a des call centers rattachés. Détache-les d'abord.");
  const usr = await pool.query<{ c: string }>(`select count(*)::int as c from users where call_center_id = $1`, [id]);
  if (Number(usr.rows[0].c) > 0) throw new Error("Des comptes dépendent de cette agence. Déplace/supprime-les d'abord.");
  await pool.query(`delete from call_center_commercials where call_center_id = $1`, [id]);
  await pool.query(`delete from call_centers where id = $1`, [id]);
}

export async function assignCommercial(ccId: number, email: string) {
  await getPool().query(
    `insert into call_center_commercials (call_center_id, commercial_email) values ($1, $2) on conflict do nothing`,
    [ccId, email.trim().toLowerCase()],
  );
}
export async function unassignCommercial(ccId: number, email: string) {
  await getPool().query(
    `delete from call_center_commercials where call_center_id = $1 and lower(commercial_email) = lower($2)`,
    [ccId, email.trim()],
  );
}
/** Toutes les affectations commercial↔call center. */
export async function listAssignments(): Promise<{ call_center_id: number; commercial_email: string }[]> {
  const { rows } = await getPool().query<{ call_center_id: number; commercial_email: string }>(
    `select call_center_id, commercial_email from call_center_commercials`,
  );
  return rows.map((r) => ({ call_center_id: Number(r.call_center_id), commercial_email: r.commercial_email.toLowerCase() }));
}
/** Restriction d'un call center pour le formulaire RDV.
 *  CC 1 (racine Yaron) = aucune restriction (null). Autre CC = commerciaux assignés + agence_only. */
export async function callCenterRule(ccId: number): Promise<{ commercials: string[]; agenceOnly: boolean } | null> {
  if (ccId === 1) return null;
  const cc = await getCallCenter(ccId);
  if (!cc) return null;
  const coms = await commercialsForCallCenter(ccId);
  return { commercials: coms.map((c) => c.name), agenceOnly: cc.agence_only };
}

/** Commerciaux (compte actif) mis à disposition d'un call center. */
export async function commercialsForCallCenter(ccId: number): Promise<{ email: string; name: string; phone: string }[]> {
  const { rows } = await getPool().query<{ email: string; name: string; phone: string }>(
    `select u.email, u.name, u.phone
       from call_center_commercials c
       join users u on lower(u.email) = lower(c.commercial_email)
      where c.call_center_id = $1 and u.active = true and u.is_commercial = true
      order by u.name`,
    [ccId],
  );
  return rows;
}

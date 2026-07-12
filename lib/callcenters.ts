import { getPool } from "./db";
import { createUser } from "./users";

export type CallCenter = { id: number; name: string; agence_only: boolean; responsable_email: string; gestionnaire_email?: string; parent_id: number | null; brand_primary?: string; brand_dark?: string; logo_url?: string };
export type BrandTheme = { name: string; primary: string; dark: string; logo: string; headerDark: boolean };

/** Thème de marque pour un utilisateur : on remonte la hiérarchie jusqu'à la RACINE
 *  (= la franchise : Simplicicar, Transakauto…). Chaque franchisé hérite du thème de sa franchise. */
export async function themeForCallCenter(ccId: number): Promise<BrandTheme | null> {
  const { rows } = await getPool().query<{ id: string; name: string; parent_id: string | null; brand_primary: string; brand_dark: string; logo_url: string; header_dark: boolean }>(
    `with recursive up as (
       select id, name, parent_id, brand_primary, brand_dark, logo_url, header_dark from call_centers where id = $1
       union all
       select c.id, c.name, c.parent_id, c.brand_primary, c.brand_dark, c.logo_url, c.header_dark
         from call_centers c join up on c.id = up.parent_id
     )
     select * from up where parent_id is null limit 1`,
    [ccId],
  );
  const root = rows[0];
  if (!root) return null;
  return {
    name: root.name,
    primary: root.brand_primary || "#DB407A",
    dark: root.brand_dark || "#1a273a",
    logo: root.logo_url || "",
    headerDark: !!root.header_dark,
  };
}
export type CallCenterDetail = CallCenter & { parent_name: string | null; commercials_count: number; telepros_count: number };

export async function listCallCenters(): Promise<CallCenterDetail[]> {
  const { rows } = await getPool().query<CallCenterDetail>(
    `select c.id, c.name, c.agence_only, c.responsable_email, c.gestionnaire_email, c.parent_id,
            c.brand_primary, c.brand_dark, c.logo_url, c.header_dark,
            p.name as parent_name,
            (select count(*) from call_center_commercials x where x.call_center_id = c.id) as commercials_count,
            (select count(*) from users u where u.call_center_id = c.id and u.is_teleprospector = true and u.active = true) as telepros_count
       from call_centers c
       left join call_centers p on p.id = c.parent_id
      order by c.id`,
  );
  // pg renvoie les bigint en string -> on normalise en number pour le front.
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    parent_id: r.parent_id == null ? null : Number(r.parent_id),
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
  return rows[0] ? { ...rows[0], id: Number(rows[0].id), parent_id: rows[0].parent_id == null ? null : Number(rows[0].parent_id), agence_only: !!rows[0].agence_only } : undefined;
}

/** Crée un call center + son responsable (role='responsable', rattaché au nouveau CC, parent = 1 racine). */
export async function createCallCenter(input: {
  name: string; agenceOnly?: boolean;
  responsable: { name: string; email?: string; username?: string; password: string; phone?: string };
}): Promise<CallCenter> {
  const pool = getPool();
  const cc = await pool.query<CallCenter>(
    `insert into call_centers (name, default_commercial, parent_id, agence_only, responsable_email)
     values ($1, '', 1, $2, $3)
     returning id, name, agence_only, responsable_email, parent_id`,
    [input.name.trim(), !!input.agenceOnly, (input.responsable.email ?? "").trim().toLowerCase() || `${(input.responsable.username ?? "").trim().toLowerCase()}@no-mail.local`],
  );
  const ccId = Number(cc.rows[0].id);
  // Le responsable peut créer des RDV (téléprospecteur) et gère son équipe (role responsable).
  await createUser({
    email: input.responsable.email, username: input.responsable.username, password: input.responsable.password, name: input.responsable.name,
    role: "responsable", callCenterId: ccId, isTeleprospector: true, isCommercial: false, phone: input.responsable.phone,
  });
  return { ...cc.rows[0], id: ccId, agence_only: !!cc.rows[0].agence_only };
}

/** Crée une agence = call center racine (parent_id null, sans responsable). */
export async function createAgence(name: string): Promise<CallCenter> {
  const { rows } = await getPool().query<CallCenter>(
    `insert into call_centers (name, default_commercial, parent_id, agence_only, responsable_email)
     values ($1, '', null, false, '') returning id, name, agence_only, responsable_email, parent_id`,
    [name.trim()],
  );
  return { ...rows[0], id: Number(rows[0].id), agence_only: !!rows[0].agence_only };
}

/** Rattache un call center à une agence (parent). */
export async function setCallCenterParent(ccId: number, parentId: number) {
  await getPool().query(`update call_centers set parent_id = $2 where id = $1`, [ccId, parentId]);
}

/** Définit le gestionnaire du call (celui qui touche la marge sur les signés du call center). */
export async function setGestionnaire(ccId: number, email: string) {
  await getPool().query(`update call_centers set gestionnaire_email = $2 where id = $1`, [ccId, email.trim().toLowerCase()]);
}

/** Renomme une agence / un call center. */
export async function renameCallCenter(ccId: number, name: string) {
  await getPool().query(`update call_centers set name = $2 where id = $1`, [ccId, name.trim()]);
}

/** Définit le thème de marque d'une franchise/agence racine. */
export async function setBrandTheme(ccId: number, theme: { primary?: string; dark?: string; logo?: string; headerDark?: boolean }) {
  await getPool().query(
    `update call_centers set brand_primary = coalesce($2, brand_primary), brand_dark = coalesce($3, brand_dark), logo_url = coalesce($4, logo_url), header_dark = coalesce($5, header_dark) where id = $1`,
    [ccId, theme.primary ?? null, theme.dark ?? null, theme.logo ?? null, theme.headerDark ?? null],
  );
}

/** Supprime un call center / une agence : coupe l'ACCÈS (comptes désactivés, plus de login)
 *  mais ne touche à AUCUNE donnée métier (RDV, bilan, facturation restent intacts). */
export async function deleteCallCenter(id: number) {
  if (id === 1) throw new Error("Agence principale protégée.");
  const pool = getPool();
  const kids = await pool.query<{ c: string }>(`select count(*)::int as c from call_centers where parent_id = $1`, [id]);
  if (Number(kids.rows[0].c) > 0) throw new Error("Cette agence a des call centers rattachés. Détache-les ou supprime-les d'abord.");
  // Comptes du call center : désactivés (accès coupé), conservés pour l'historique/facturation.
  await pool.query(`update users set active = false where call_center_id = $1 and role <> 'admin'`, [id]);
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
 *  CC 1 (racine historique) = aucune restriction (null).
 *  Sinon : commerciaux liés à CE niveau, sinon hérités du parent (agence/franchise) en remontant. */
export async function callCenterRule(ccId: number): Promise<{ commercials: string[]; agenceOnly: boolean } | null> {
  if (ccId === 1) return null;
  const cc = await getCallCenter(ccId);
  if (!cc) return null;
  const coms = await commercialsForCallCenterInherited(ccId);
  return { commercials: coms.map((c) => c.name), agenceOnly: cc.agence_only };
}

/** Commerciaux liés à un call center, avec héritage : premier niveau ayant des liens gagne
 *  (le plus spécifique), sinon on remonte vers l'agence/franchise parente. */
export async function commercialsForCallCenterInherited(ccId: number): Promise<{ email: string; name: string; phone: string }[]> {
  let cur = await getCallCenter(ccId);
  for (let depth = 0; cur && depth < 6; depth++) {
    const coms = await commercialsForCallCenter(cur.id);
    if (coms.length > 0) return coms;
    if (cur.parent_id == null || cur.parent_id === 1) return [];
    cur = await getCallCenter(cur.parent_id);
  }
  return [];
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

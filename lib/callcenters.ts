import { getPool } from "./db";
import { createUser } from "./users";

export type CallCenter = { id: number; name: string; slug?: string | null; agence_only: boolean; responsable_email: string; responsable_email_2?: string | null; parent_id: number | null; brand_primary?: string; brand_dark?: string; logo_url?: string; active?: boolean; deleted_at?: string | null };

/** Résout un slug d'URL (ex: "simplicicar-paris-17e") vers son call center — utilisé par
 *  middleware.ts pour déterminer sur quelle agence on navigue, sans changer de compte. */
export async function getCallCenterBySlug(slug: string): Promise<{ id: number; name: string } | null> {
  const { rows } = await getPool().query<{ id: string; name: string }>(
    `select id, name from call_centers where slug = $1 and active`, [slug],
  );
  return rows[0] ? { id: Number(rows[0].id), name: rows[0].name } : null;
}
/** Slug d'URL du call center d'un compte (voir /api/me) — sert à rediriger automatiquement
 *  vers /<slug>/... à la connexion, sans que l'utilisateur ait à taper l'URL lui-même. */
export async function slugForCallCenter(ccId: number): Promise<string | null> {
  const { rows } = await getPool().query<{ slug: string | null }>(
    `select slug from call_centers where id = $1`, [ccId],
  );
  return rows[0]?.slug ?? null;
}

/** Nom + slug d'un call center — pour le mail "votre compte est prêt" (lib/account-email.ts). */
export async function nameAndSlugForCallCenter(ccId: number): Promise<{ name: string; slug: string | null } | null> {
  const { rows } = await getPool().query<{ name: string; slug: string | null }>(
    `select name, slug from call_centers where id = $1`, [ccId],
  );
  return rows[0] ?? null;
}

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
export type CallCenterDetail = CallCenter & { parent_name: string | null; commercials_count: number; telepros_count: number; pay_base_eur: number; pay_pct_nego: number };

export async function listCallCenters(): Promise<CallCenterDetail[]> {
  const { rows } = await getPool().query<CallCenterDetail>(
    `select c.id, c.name, c.slug, c.agence_only, c.responsable_email, c.responsable_email_2, c.parent_id,
            c.brand_primary, c.brand_dark, c.logo_url, c.header_dark, c.active, c.deleted_at,
            p.name as parent_name,
            (select count(*) from call_center_commercials x where x.call_center_id = c.id) as commercials_count,
            (select count(*) from users u where u.call_center_id = c.id and u.is_teleprospector = true and u.active = true) as telepros_count,
            coalesce((select a.base_eur from remuneration_accords a where a.call_center_id = c.id and a.payee_kind = 'call_center' and a.active limit 1), 0) as pay_base_eur,
            coalesce((select a.pct_nego from remuneration_accords a where a.call_center_id = c.id and a.payee_kind = 'call_center' and a.active limit 1), 0) as pay_pct_nego
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
    active: r.active !== false,
    commercials_count: Number(r.commercials_count),
    telepros_count: Number(r.telepros_count),
    pay_base_eur: Number(r.pay_base_eur ?? 0),
    pay_pct_nego: Number(r.pay_pct_nego ?? 0),
  }));
}

/** Chaîne d'ancêtres (parent, grand-parent, …) de chaque call center — pure, calculée depuis
 *  `parent_id`, sans accès DB. Sert à faire "matcher" un accord scopé à une AGENCE (racine ou
 *  intermédiaire) contre les RDV de ses call centers descendants (voir remuneration.ts). */
export function ancestryMap(ccs: CallCenterDetail[]): Map<number, number[]> {
  const parentOf = new Map<number, number | null>(ccs.map((c) => [c.id, c.parent_id]));
  const cache = new Map<number, number[]>();
  const chain = (id: number, seen: Set<number> = new Set()): number[] => {
    if (cache.has(id)) return cache.get(id)!;
    if (seen.has(id)) return []; // boucle défensive
    seen.add(id);
    const parent = parentOf.get(id);
    const result = parent == null ? [] : [parent, ...chain(parent, seen)];
    cache.set(id, result);
    return result;
  };
  const out = new Map<number, number[]>();
  for (const c of ccs) out.set(c.id, chain(c.id));
  return out;
}

export async function getCallCenter(id: number): Promise<CallCenter | undefined> {
  const { rows } = await getPool().query<CallCenter>(
    `select id, name, agence_only, responsable_email, parent_id from call_centers where id = $1`,
    [id],
  );
  return rows[0] ? { ...rows[0], id: Number(rows[0].id), parent_id: rows[0].parent_id == null ? null : Number(rows[0].parent_id), agence_only: !!rows[0].agence_only } : undefined;
}

function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Slug unique pour un nouveau call center/agence — suffixe -2, -3... en cas de collision.
 *  Chaque agence a un lien de connexion permanent (agenda-rdv.vercel.app/<slug>) dès sa
 *  création, pas seulement celles migrées au lancement de cette fonctionnalité. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "agence";
  const { rows } = await getPool().query<{ slug: string }>(`select slug from call_centers where slug like $1`, [`${base}%`]);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Crée un call center + son responsable (role='responsable'), rattaché à l'agence donnée (racine Simplicicar par défaut). */
export async function createCallCenter(input: {
  name: string; agenceOnly?: boolean; parentId?: number;
  responsable: { name: string; email?: string; username?: string; password: string; phone?: string };
}): Promise<CallCenter & { responsableUserId: number }> {
  const pool = getPool();
  const slug = await uniqueSlug(input.name);
  const cc = await pool.query<CallCenter>(
    `insert into call_centers (name, default_commercial, parent_id, agence_only, responsable_email, slug)
     values ($1, '', $4, $2, $3, $5)
     returning id, name, agence_only, responsable_email, parent_id, slug`,
    [input.name.trim(), !!input.agenceOnly, (input.responsable.email ?? "").trim().toLowerCase() || `${(input.responsable.username ?? "").trim().toLowerCase()}@no-mail.local`, input.parentId ?? 1, slug],
  );
  const ccId = Number(cc.rows[0].id);
  // Le responsable peut créer des RDV (téléprospecteur) et gère son équipe (role responsable).
  const responsable = await createUser({
    email: input.responsable.email, username: input.responsable.username, password: input.responsable.password, name: input.responsable.name,
    role: "responsable", callCenterId: ccId, isTeleprospector: true, isCommercial: false, phone: input.responsable.phone,
  });
  return { ...cc.rows[0], id: ccId, agence_only: !!cc.rows[0].agence_only, responsableUserId: responsable.id };
}

/** Crée une agence = call center racine (parent_id null, sans responsable). */
export async function createAgence(name: string): Promise<CallCenter> {
  const slug = await uniqueSlug(name);
  const { rows } = await getPool().query<CallCenter>(
    `insert into call_centers (name, default_commercial, parent_id, agence_only, responsable_email, slug)
     values ($1, '', null, false, '', $2) returning id, name, agence_only, responsable_email, parent_id, slug`,
    [name.trim(), slug],
  );
  return { ...rows[0], id: Number(rows[0].id), agence_only: !!rows[0].agence_only };
}

/** Rattache un call center à une agence (parent). */
export async function setCallCenterParent(ccId: number, parentId: number) {
  await getPool().query(`update call_centers set parent_id = $2 where id = $1`, [ccId, parentId]);
}

/** Deuxième responsable (50/50 avec le premier, affichage uniquement) — vide pour retirer. */
export async function setResponsable2(ccId: number, email: string) {
  await getPool().query(`update call_centers set responsable_email_2 = $2 where id = $1`, [ccId, email.trim().toLowerCase() || null]);
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

/** Supprime un call center / une agence : coupe l'ACCÈS (comptes désactivés, plus de login,
 *  call center retiré des listes actives) mais ne touche à AUCUNE donnée métier — la ligne
 *  call_centers elle-même est désactivée (active=false), jamais effacée, pour que l'historique
 *  de facturation (accords, factures, paiements) reste résoluble indéfiniment. */
export async function deleteCallCenter(id: number) {
  if (id === 1) throw new Error("Agence principale protégée.");
  const pool = getPool();
  const kids = await pool.query<{ c: string }>(`select count(*)::int as c from call_centers where parent_id = $1 and active`, [id]);
  if (Number(kids.rows[0].c) > 0) throw new Error("Cette agence a des call centers rattachés. Détache-les ou supprime-les d'abord.");
  // Comptes du call center : désactivés (accès coupé), conservés pour l'historique/facturation.
  await pool.query(`update users set active = false, deleted_at = now() where call_center_id = $1 and role <> 'admin'`, [id]);
  await pool.query(`delete from call_center_commercials where call_center_id = $1`, [id]);
  await pool.query(`update call_centers set active = false, deleted_at = now() where id = $1`, [id]);
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
/** Assigne un commercial précis à un téléprospecteur précis (restriction plus fine que le call center entier).
 *  `priority` : 1 = prioritaire, 2, 3... — utilisé par l'attribution automatique des RDV. */
export async function assignTeleproCommercial(teleproEmail: string, commercialEmail: string, priority = 0) {
  await getPool().query(
    `insert into telepro_commercials (telepro_email, commercial_email, priority) values (lower($1), lower($2), $3)
     on conflict (telepro_email, commercial_email) do update set priority = excluded.priority`,
    [teleproEmail.trim(), commercialEmail.trim(), priority],
  );
}
export async function unassignTeleproCommercial(teleproEmail: string, commercialEmail: string) {
  await getPool().query(
    `delete from telepro_commercials where lower(telepro_email) = lower($1) and lower(commercial_email) = lower($2)`,
    [teleproEmail.trim(), commercialEmail.trim()],
  );
}
/** Toutes les affectations commercial↔téléprospecteur. */
export async function listTeleproAssignments(): Promise<{ telepro_email: string; commercial_email: string; priority: number }[]> {
  const { rows } = await getPool().query<{ telepro_email: string; commercial_email: string; priority: number }>(
    `select telepro_email, commercial_email, priority from telepro_commercials
     order by telepro_email, (case when priority = 0 then 999999 else priority end)`,
  );
  return rows.map((r) => ({ telepro_email: r.telepro_email.toLowerCase(), commercial_email: r.commercial_email.toLowerCase(), priority: Number(r.priority) }));
}
/** Commerciaux assignés à CE téléprospecteur précis, dans l'ordre de priorité (vide = pas de
 *  restriction spécifique, on retombe sur la règle du call center). */
export async function commercialsForTelepro(teleproEmail: string): Promise<string[]> {
  const { rows } = await getPool().query<{ commercial_email: string }>(
    // priorité 0 = non précisée -> classée en dernier (pas prioritaire).
    `select commercial_email from telepro_commercials where lower(telepro_email) = lower($1)
     order by (case when priority = 0 then 999999 else priority end), commercial_email`,
    [teleproEmail],
  );
  return rows.map((r) => r.commercial_email.toLowerCase());
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

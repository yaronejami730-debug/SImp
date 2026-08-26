// Prospects DDE : accès base. Mêmes règles de visibilité que les rendez-vous —
// l'admin voit tout le fichier, une téléprospectrice ne voit que ses prospects.

import { getPool } from "./db";
import type { DdeSession } from "./dde";
import { DDE_PROSPECT_STATUT_KEYS, type DdeProspect } from "./dde-prospects";

const P_COLS = `
  id::int, crm_id, nom, prenom, telephone, telephone_2, email, adresse, code_postal, ville, departement,
  statut, telepro_email, telepro_name, notes, appels, dernier_appel_at, rdv_id::int,
  crm_statut, crm_campagne, crm_telepro, crm_commercial, crm_resultat_rdv, crm_commentaire, crm_source,
  crm_cree_le, crm_maj_le,
  to_char(dernier_rdv_date,'YYYY-MM-DD') as dernier_rdv_date, dernier_rdv_heure, dernier_rdv_presence,
  nb_rdv, profil, historique, created_at`;

/** Ordre d'appel : les prospects jamais traités d'abord, puis les plus anciens. */
const ORDRE = `order by (statut = 'rdv_pris'), appels, dernier_appel_at nulls first, id`;

export async function listDdeProspects(s: DdeSession): Promise<DdeProspect[]> {
  if (s.role === "admin") {
    const { rows } = await getPool().query(`select ${P_COLS} from dde_prospects ${ORDRE}`);
    return rows as DdeProspect[];
  }
  const { rows } = await getPool().query(
    `select ${P_COLS} from dde_prospects where lower(telepro_email) = lower($1) ${ORDRE}`,
    [s.email],
  );
  return rows as DdeProspect[];
}

export async function getDdeProspect(id: number): Promise<DdeProspect | null> {
  const { rows } = await getPool().query(`select ${P_COLS} from dde_prospects where id = $1`, [id]);
  return (rows[0] as DdeProspect | undefined) ?? null;
}

export type DdeProspectPatch = {
  statut?: string;
  notes?: string;
  /** Un appel vient d'être passé : on incrémente le compteur et on horodate. */
  appel?: boolean;
  nom?: string; prenom?: string; telephone?: string; email?: string;
  teleproEmail?: string;   // réassignation, admin uniquement
};

export async function updateDdeProspect(s: DdeSession, id: number, patch: DdeProspectPatch): Promise<void> {
  if (patch.statut !== undefined && !DDE_PROSPECT_STATUT_KEYS.includes(patch.statut)) {
    throw new Error("Statut de prospect inconnu.");
  }

  const map: Record<string, unknown> = {
    statut: patch.statut,
    notes: patch.notes,
    nom: patch.nom?.trim(), prenom: patch.prenom?.trim(),
    telephone: patch.telephone?.trim(), email: patch.email?.trim().toLowerCase(),
  };

  // Réassignation : réservée à l'admin, et la cible doit être un compte DDE existant.
  if (patch.teleproEmail !== undefined) {
    if (s.role !== "admin") throw new Error("Accès refusé.");
    const { rows } = await getPool().query(`select email, name from dde_users where lower(email) = lower($1)`, [patch.teleproEmail]);
    if (!rows[0]) throw new Error("Téléprospectrice introuvable.");
    map.telepro_email = rows[0].email;
    map.telepro_name = rows[0].name;
  }

  const sets: string[] = []; const params: unknown[] = [];
  for (const [col, val] of Object.entries(map)) if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
  if (patch.appel) sets.push(`appels = appels + 1`, `dernier_appel_at = now()`);
  if (!sets.length) return;
  sets.push(`updated_at = now()`);

  params.push(id);
  const where = s.role === "admin"
    ? `id = $${params.length}`
    : `id = $${params.length} and lower(telepro_email) = lower($${params.length + 1})`;
  if (s.role !== "admin") params.push(s.email);

  await getPool().query(`update dde_prospects set ${sets.join(", ")} where ${where}`, params);
}

/** Le prospect a accepté : on le relie au rendez-vous créé et il sort de la file d'appel. */
export async function lieProspectAuRdv(prospectId: number, rdvId: number): Promise<void> {
  await getPool().query(
    `update dde_prospects set statut = 'rdv_pris', rdv_id = $2, updated_at = now() where id = $1`,
    [prospectId, rdvId],
  );
}

export async function createDdeProspect(s: DdeSession, input: {
  nom: string; prenom?: string; telephone: string; email?: string;
  code_postal?: string; ville?: string; notes?: string; teleproEmail?: string;
}): Promise<DdeProspect> {
  let telepro = { email: s.email, name: s.name };
  const cible = input.teleproEmail?.trim().toLowerCase();
  if (s.role === "admin" && cible && cible !== s.email.toLowerCase()) {
    const { rows } = await getPool().query(`select email, name from dde_users where lower(email) = $1`, [cible]);
    if (!rows[0]) throw new Error("Téléprospectrice introuvable.");
    telepro = { email: rows[0].email as string, name: rows[0].name as string };
  }
  const { rows } = await getPool().query(
    `insert into dde_prospects (nom, prenom, telephone, email, code_postal, ville, notes, telepro_email, telepro_name)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${P_COLS}`,
    [input.nom.trim(), (input.prenom ?? "").trim(), input.telephone.trim(), (input.email ?? "").trim().toLowerCase(),
     (input.code_postal ?? "").trim(), (input.ville ?? "").trim(), (input.notes ?? "").trim(), telepro.email, telepro.name],
  );
  return rows[0] as DdeProspect;
}

export async function deleteDdeProspect(id: number): Promise<void> {
  await getPool().query(`delete from dde_prospects where id = $1`, [id]);
}

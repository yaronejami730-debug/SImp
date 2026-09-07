import { getPool } from "./db";

export type Lead = {
  id: number;
  phone: string;
  listing_url: string;
  note: string | null;
  status: string;
  lead_ref: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  campaign: string | null;
  raw_data: Record<string, string> | null;
};

/** Génère le prochain identifiant SP-YYYY-NNN. */
async function nextRef(): Promise<string> {
  const { rows } = await getPool().query<{ n: string }>("select nextval('lead_ref_seq') as n");
  const year = new Date().getFullYear();
  return `SP-${year}-${String(rows[0].n).padStart(3, "0")}`;
}

export type NewLeadExtra = { firstName?: string; lastName?: string; email?: string; campaign?: string; rawData?: Record<string, string> };

/** Ajoute un lead de prospection (téléphone requis ; lien d'annonce optionnel — colonne NOT NULL en base, on stocke "" si absent). */
export async function addLead(phone: string, listingUrl: string | undefined, note: string | undefined, callCenterId: number, extra?: NewLeadExtra): Promise<Lead> {
  const ref = await nextRef();
  const { rows } = await getPool().query<Lead>(
    `insert into leads (phone, listing_url, note, lead_ref, call_center_id, first_name, last_name, email, campaign, raw_data)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
    [
      phone.trim(), listingUrl?.trim() || "", note?.trim() || null, ref, callCenterId,
      extra?.firstName?.trim() || null, extra?.lastName?.trim() || null, extra?.email?.trim() || null,
      extra?.campaign?.trim() || null, extra?.rawData ? JSON.stringify(extra.rawData) : null,
    ],
  );
  return rows[0];
}

/** Recherche les leads d'une entité par téléphone (partiel), nom, e-mail ou référence. Sinon les plus récents. */
export async function searchLeads(callCenterId: number, query?: string): Promise<Lead[]> {
  const q = (query ?? "").trim();
  const digits = q.replace(/\D/g, "");
  if (q.length >= 2) {
    const { rows } = await getPool().query<Lead>(
      `select * from leads
       where call_center_id = $2 and (
         ($3 <> '' and regexp_replace(phone, '\\D', '', 'g') like '%' || $3 || '%')
         or first_name ilike '%' || $1 || '%'
         or last_name ilike '%' || $1 || '%'
         or email ilike '%' || $1 || '%'
         or lead_ref ilike '%' || $1 || '%'
       )
       order by created_at desc limit 100`,
      [q, callCenterId, digits],
    );
    return rows;
  }
  const { rows } = await getPool().query<Lead>(
    `select * from leads where call_center_id = $1 order by created_at desc limit 100`,
    [callCenterId],
  );
  return rows;
}

/** Récupère un lead par sa référence (SP-2026-001). */
export async function getLeadByRef(ref: string): Promise<Lead | null> {
  const { rows } = await getPool().query<Lead>(
    `select * from leads where lead_ref = $1`,
    [ref],
  );
  return rows[0] ?? null;
}

/** Supprime un lead. */
export async function deleteLead(id: number): Promise<void> {
  await getPool().query(`delete from leads where id = $1`, [id]);
}

export const LEAD_STATUSES = ["nouveau", "absent", "ne_repond_pas", "faux_numero", "nrp1", "nrp2", "nrp3", "rdv_pris"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Change le statut d'un lead (NRP1/2/3, RDV pris...), scopé à l'entité appelante. */
export async function updateLeadStatus(id: number, status: LeadStatus, callCenterId: number): Promise<Lead | null> {
  const { rows } = await getPool().query<Lead>(
    `update leads set status = $1 where id = $2 and call_center_id = $3 returning *`,
    [status, id, callCenterId],
  );
  return rows[0] ?? null;
}

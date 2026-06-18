import { getPool } from "./db";

export type Lead = {
  id: number;
  phone: string;
  listing_url: string;
  note: string | null;
  status: string;
  lead_ref: string;
  created_at: string;
};

/** Génère le prochain identifiant SP-YYYY-NNN. */
async function nextRef(): Promise<string> {
  const { rows } = await getPool().query<{ n: string }>("select nextval('lead_ref_seq') as n");
  const year = new Date().getFullYear();
  return `SP-${year}-${String(rows[0].n).padStart(3, "0")}`;
}

/** Ajoute un lead de prospection (lien + téléphone, sans RDV). */
export async function addLead(phone: string, listingUrl: string, note: string | undefined, callCenterId: number): Promise<Lead> {
  const ref = await nextRef();
  const { rows } = await getPool().query<Lead>(
    `insert into leads (phone, listing_url, note, lead_ref, call_center_id) values ($1, $2, $3, $4, $5) returning *`,
    [phone.trim(), listingUrl.trim(), note?.trim() || null, ref, callCenterId],
  );
  return rows[0];
}

/** Recherche les leads d'une entité par téléphone (partiel). Sinon les plus récents. */
export async function searchLeads(callCenterId: number, phoneQuery?: string): Promise<Lead[]> {
  const digits = (phoneQuery ?? "").replace(/\D/g, "");
  if (digits.length >= 2) {
    const { rows } = await getPool().query<Lead>(
      `select * from leads
       where call_center_id = $2 and regexp_replace(phone, '\\D', '', 'g') like '%' || $1 || '%'
       order by created_at desc limit 100`,
      [digits, callCenterId],
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

import { getPool } from "./db";

export type Lead = {
  id: number;
  phone: string;
  listing_url: string;
  note: string | null;
  status: string;
  created_at: string;
};

/** Ajoute un lead de prospection (lien + téléphone, sans RDV). */
export async function addLead(phone: string, listingUrl: string, note?: string): Promise<Lead> {
  const { rows } = await getPool().query<Lead>(
    `insert into leads (phone, listing_url, note) values ($1, $2, $3) returning *`,
    [phone.trim(), listingUrl.trim(), note?.trim() || null],
  );
  return rows[0];
}

/** Recherche par téléphone (chiffres, même partiel). Sinon les plus récents. */
export async function searchLeads(phoneQuery?: string): Promise<Lead[]> {
  const digits = (phoneQuery ?? "").replace(/\D/g, "");
  if (digits.length >= 2) {
    const { rows } = await getPool().query<Lead>(
      `select * from leads
       where regexp_replace(phone, '\\D', '', 'g') like '%' || $1 || '%'
       order by created_at desc limit 100`,
      [digits],
    );
    return rows;
  }
  const { rows } = await getPool().query<Lead>(
    `select * from leads order by created_at desc limit 100`,
  );
  return rows;
}

/** Supprime un lead. */
export async function deleteLead(id: number): Promise<void> {
  await getPool().query(`delete from leads where id = $1`, [id]);
}

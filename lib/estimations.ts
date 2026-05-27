import { getPool } from "./db";

export type Estimation = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  brand: string;
  model: string;
  km: number | null;
  source: string;
  created_at: string;
};

/** Ajoute une demande d'estimation depuis une landing publique. */
export async function addEstimation(opts: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  brand?: string;
  model?: string;
  km?: number | null;
  source?: string;
}): Promise<Estimation> {
  const { rows } = await getPool().query<Estimation>(
    `insert into estimations (first_name, last_name, email, phone, brand, model, km, source)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      opts.firstName.trim(),
      opts.lastName.trim(),
      opts.email.trim().toLowerCase(),
      opts.phone.trim(),
      (opts.brand ?? "").trim(),
      (opts.model ?? "").trim(),
      opts.km ?? null,
      opts.source ?? "paris-17",
    ],
  );
  return rows[0];
}

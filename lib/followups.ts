import { getPool } from "./db";

export type FollowupType = "cancel" | "thinking" | "unsigned" | "signed";

/** Délais en jours par type de relance. */
export const FOLLOWUP_DELAYS: Record<FollowupType, number[]> = {
  cancel: [7, 14, 30],     // J+7, J+21, J+51
  thinking: [3, 10],       // J+3, J+13
  unsigned: [14, 30, 75],  // J+14, J+44, J+119
  signed: [3],             // J+3 → mail notation
};

export type FollowupRow = {
  id: number;
  email: string;
  civility: string;
  first_name: string;
  last_name: string;
  listing_url: string;
  owner: string;
  stage: number;
  next_send_at: string;
  type: FollowupType;
};

/** Programme la 1re relance d'un type donné. Annule les précédentes du même email pour ce type. */
export async function scheduleFollowup(opts: {
  email: string;
  civility?: string;
  firstName?: string;
  lastName?: string;
  listingUrl?: string;
  owner?: string;
  type: FollowupType;
}) {
  const pool = getPool();
  await pool.query(
    `update cancellation_followups set done = true
     where lower(email) = lower($1) and type = $2 and done = false`,
    [opts.email, opts.type],
  );
  const delays = FOLLOWUP_DELAYS[opts.type];
  if (!delays?.length) return;
  const next = new Date(Date.now() + delays[0] * 24 * 3600 * 1000);
  await pool.query(
    `insert into cancellation_followups (email, civility, first_name, last_name, listing_url, owner, stage, next_send_at, type)
     values ($1,$2,$3,$4,$5,$6,0,$7,$8)`,
    [
      opts.email,
      opts.civility ?? "",
      opts.firstName ?? "",
      opts.lastName ?? "",
      opts.listingUrl ?? "",
      opts.owner ?? "",
      next.toISOString(),
      opts.type,
    ],
  );
}

/** Stoppe TOUTES les relances d'un client (tous types). À appeler à la prise de RDV. */
export async function cancelFollowup(email: string) {
  await getPool().query(
    `update cancellation_followups set done = true where lower(email) = lower($1) and done = false`,
    [email],
  );
}

/** Renvoie les relances dues, tous types confondus. */
export async function dueFollowups(): Promise<FollowupRow[]> {
  const { rows } = await getPool().query<FollowupRow>(
    `select * from cancellation_followups where done = false and next_send_at <= now() order by next_send_at asc limit 50`,
  );
  return rows;
}

/** Avance une relance au stage suivant (ou termine après le dernier stage). */
export async function advanceFollowup(id: number, currentStage: number, type: FollowupType) {
  const delays = FOLLOWUP_DELAYS[type];
  const newStage = currentStage + 1;
  if (newStage >= delays.length) {
    await getPool().query(`update cancellation_followups set stage = $2, done = true where id = $1`, [id, newStage]);
    return;
  }
  const next = new Date(Date.now() + delays[newStage] * 24 * 3600 * 1000);
  await getPool().query(
    `update cancellation_followups set stage = $2, next_send_at = $3 where id = $1`,
    [id, newStage, next.toISOString()],
  );
}

import { getPool } from "./db";

/** Délais entre les relances après annulation, en jours. stage 1 = +7j, stage 2 = +14j (= 21j total), stage 3 = +30j (= 51j total). */
export const FOLLOWUP_DELAYS_DAYS = [7, 14, 30];

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
};

/** Programme la 1re relance (J+7) après une annulation. Annule toute relance précédente du même email. */
export async function scheduleFollowup(opts: {
  email: string;
  civility?: string;
  firstName?: string;
  lastName?: string;
  listingUrl?: string;
  owner?: string;
}) {
  const pool = getPool();
  // Marque comme done toute relance encore active pour ce client (évite empilement).
  await pool.query(`update cancellation_followups set done = true where lower(email) = lower($1) and done = false`, [opts.email]);
  const next = new Date(Date.now() + FOLLOWUP_DELAYS_DAYS[0] * 24 * 3600 * 1000);
  await pool.query(
    `insert into cancellation_followups (email, civility, first_name, last_name, listing_url, owner, stage, next_send_at)
     values ($1,$2,$3,$4,$5,$6,0,$7)`,
    [opts.email, opts.civility ?? "", opts.firstName ?? "", opts.lastName ?? "", opts.listingUrl ?? "", opts.owner ?? "", next.toISOString()],
  );
}

/** Stoppe les relances d'un client (à appeler quand il prend un nouveau RDV). */
export async function cancelFollowup(email: string) {
  await getPool().query(`update cancellation_followups set done = true where lower(email) = lower($1) and done = false`, [email]);
}

/** Renvoie les relances dues. */
export async function dueFollowups(): Promise<FollowupRow[]> {
  const { rows } = await getPool().query<FollowupRow>(
    `select * from cancellation_followups where done = false and next_send_at <= now() order by next_send_at asc limit 50`,
  );
  return rows;
}

/** Avance une relance au stage suivant (ou la termine après le stage 3). */
export async function advanceFollowup(id: number, currentStage: number) {
  const newStage = currentStage + 1;
  if (newStage >= FOLLOWUP_DELAYS_DAYS.length) {
    // dernière relance envoyée -> done
    await getPool().query(`update cancellation_followups set stage = $2, done = true where id = $1`, [id, newStage]);
    return;
  }
  const next = new Date(Date.now() + FOLLOWUP_DELAYS_DAYS[newStage] * 24 * 3600 * 1000);
  await getPool().query(`update cancellation_followups set stage = $2, next_send_at = $3 where id = $1`, [id, newStage, next.toISOString()]);
}

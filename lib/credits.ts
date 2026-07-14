import { getPool } from "./db";

/** PORTEFEUILLE DE CRÉDITS SMS / EMAIL.
 *  Deux soldes séparés (un SMS ≠ un email), packs mixtes possibles.
 *  Grand livre immuable (credit_transactions) : solde = somme des deltas.
 *  Le mode COPIER-COLLER reste gratuit et complet ; seuls les envois automatiques consomment. */

export type Balance = { sms: number; email: number };
export type CreditTx = { id: number; kind: string; sms_delta: number; email_delta: number; label: string; created_at: string };
export type Pack = { id: number; name: string; sms_qty: number; email_qty: number; price_cents: number; stripe_price_id: string };

export async function getBalance(email: string): Promise<Balance> {
  const { rows } = await getPool().query<{ sms: string; email: string }>(
    `select coalesce(sum(sms_delta),0) as sms, coalesce(sum(email_delta),0) as email
       from credit_transactions where lower(user_email) = lower($1)`,
    [email],
  );
  return { sms: Number(rows[0]?.sms ?? 0), email: Number(rows[0]?.email ?? 0) };
}

export async function listTransactions(email: string, limit = 50): Promise<CreditTx[]> {
  const { rows } = await getPool().query<CreditTx>(
    `select id, kind, sms_delta, email_delta, label, created_at
       from credit_transactions where lower(user_email) = lower($1)
      order by created_at desc limit $2`,
    [email, limit],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), sms_delta: Number(r.sms_delta), email_delta: Number(r.email_delta) }));
}

export async function listPacks(): Promise<Pack[]> {
  const { rows } = await getPool().query<Pack>(
    `select id, name, sms_qty, email_qty, price_cents, stripe_price_id from credit_packs where active order by sort`,
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), sms_qty: Number(r.sms_qty), email_qty: Number(r.email_qty), price_cents: Number(r.price_cents) }));
}

/** Crédite (achat Stripe / attribution admin). Idempotent par ref pour les achats. */
export async function credit(email: string, kind: "purchase" | "grant" | "refund", sms: number, emailQty: number, ref = "", label = "") {
  await getPool().query(
    `insert into credit_transactions (user_email, kind, sms_delta, email_delta, ref, label)
     values (lower($1),$2,$3,$4,$5,$6) on conflict do nothing`,
    [email, kind, sms, emailQty, ref, label],
  );
}

/** Consomme 1 crédit (SMS ou email). Refuse si solde insuffisant. */
export async function consume(email: string, channel: "sms" | "email", ref = "", label = ""): Promise<boolean> {
  const bal = await getBalance(email);
  if ((channel === "sms" ? bal.sms : bal.email) < 1) return false;
  await getPool().query(
    `insert into credit_transactions (user_email, kind, sms_delta, email_delta, ref, label)
     values (lower($1),'consume',$2,$3,$4,$5)`,
    [email, channel === "sms" ? -1 : 0, channel === "email" ? -1 : 0, ref, label],
  );
  return true;
}

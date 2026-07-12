import { getPool } from "./db";
import type { AppointmentItem } from "./google";

/** MOTEUR DE RÉMUNÉRATION — 100 % piloté par la table remuneration_accords, rien en dur.
 *  Un accord = { portée (call center OU commercial), bénéficiaire, type, base €/signé, % négo }.
 *  Types : 'call_center' (le call touche X €/signé), 'gestionnaire' (l'apporteur du call),
 *          'telepro' (télépro indépendant payé par un commercial), 'apporteur' (% du négocié).
 *  Pour un RDV SIGNÉ, le moteur émet des lignes { bénéficiaire, montant } selon les accords actifs. */

export type Accord = {
  id: number; call_center_id: number | null; commercial_email: string;
  payee_email: string; payee_kind: "call_center" | "gestionnaire" | "telepro" | "apporteur";
  base_eur: number; pct_nego: number; sold_eur: number; sold_pct: number; // sortie : € fixes et/ou % du négocié, versés quand le véhicule est VENDU
  trigger_kind: "signed" | "honored"; // entrée payée au mandat SIGNÉ ou dès que le RDV est HONORÉ (client venu)
  payer_email: string; // qui paie (ex : le commercial) — vide = payé par la structure
  label: string; active: boolean;
};
export type RemuLine = { payee: string; payer: string; kind: Accord["payee_kind"]; amount: number; accordId: number; apptId: string };

export async function listAccords(): Promise<Accord[]> {
  const { rows } = await getPool().query<Accord>(
    `select id, call_center_id, commercial_email, payee_email, payee_kind, base_eur, pct_nego, sold_eur, sold_pct, trigger_kind, payer_email, label, active
       from remuneration_accords where active order by id`,
  );
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    call_center_id: r.call_center_id == null ? null : Number(r.call_center_id),
    base_eur: Number(r.base_eur), pct_nego: Number(r.pct_nego), sold_eur: Number(r.sold_eur ?? 0), sold_pct: Number(r.sold_pct ?? 0),
    trigger_kind: (r.trigger_kind === "honored" ? "honored" : "signed"),
    payer_email: (r.payer_email || "").toLowerCase(),
    payee_email: (r.payee_email || "").toLowerCase(),
    commercial_email: (r.commercial_email || "").toLowerCase(),
  }));
}

const tok = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

/** Lignes de rémunération générées par UN RDV, selon les accords.
 *  L'éligibilité dépend du déclencheur de CHAQUE accord :
 *  - 'signed'  : mandat signé (et non retiré)
 *  - 'honored' : client venu au RDV (présent), même sans signature.
 *  La sortie (véhicule vendu) s'ajoute en € et/ou % du négocié. */
export function linesFor(a: AppointmentItem, accords: Accord[]): RemuLine[] {
  const out: RemuLine[] = [];
  if (a.cancelled) return out;
  const isSigned = a.signStatus === "signed" && !a.mandatRemoved;
  const isHonored = a.presence === "present" || a.present || isSigned;
  const nego = a.negotiation || 0;
  const cc = a.callCenterId ?? 1;
  const commEmail = (a.commercialEmail || "").toLowerCase();
  const commName = tok(a.commercial || "");
  for (const r of accords) {
    // Portée call center : le RDV appartient à ce call center.
    if (r.call_center_id != null) {
      if (cc !== r.call_center_id) continue;
    } else if (r.commercial_email) {
      // Portée commercial : le RDV est géré par ce commercial.
      const matchEmail = commEmail && commEmail === r.commercial_email;
      const matchName = !commEmail && commName && commName === tok(r.commercial_email.split("@")[0]);
      if (!matchEmail && !matchName) continue;
      // Télépro indépendant : ne paye que si c'est LUI qui a créé le RDV.
      if (r.payee_kind === "telepro" && (a.owner || "").toLowerCase() !== r.payee_email) continue;
    } else {
      continue; // accord sans portée : ignoré
    }
    // Entrée selon le déclencheur de l'accord + sortie (véhicule vendu) en € et/ou %.
    const entryOk = r.trigger_kind === "honored" ? isHonored : isSigned;
    if (!entryOk) continue;
    const amount = r.base_eur + (r.pct_nego / 100) * nego + (a.vehicleSold ? r.sold_eur + (r.sold_pct / 100) * nego : 0);
    if (amount > 0) out.push({ payee: r.payee_email, payer: r.payer_email, kind: r.payee_kind, amount, accordId: r.id, apptId: a.id });
  }
  return out;
}

/** Upsert des 2 accords standards d'un call center (call + gestionnaire). Montants libres. */
export async function upsertCcAccords(ccId: number, callEur: number, gestEur: number, respEmail: string, gestEmail: string) {
  const pool = getPool();
  const up = async (kind: string, payee: string, eur: number) => {
    if (!payee) return;
    const { rowCount } = await pool.query(
      `update remuneration_accords set base_eur=$3, payee_email=$4 where call_center_id=$1 and payee_kind=$2 and active`,
      [ccId, kind, eur, payee.toLowerCase()],
    );
    if (!rowCount) await pool.query(
      `insert into remuneration_accords (call_center_id, payee_email, payee_kind, base_eur, label) values ($1,$2,$3,$4,$5)`,
      [ccId, payee.toLowerCase(), kind, eur, `${kind} cc${ccId}`],
    );
  };
  await up("call_center", respEmail, callEur);
  await up("gestionnaire", gestEmail, gestEur);
}

/** Accords actifs d'un call center (pour l'UI Comptes). */
export async function accordsForCc(ccId: number): Promise<Accord[]> {
  return (await listAccords()).filter((a) => a.call_center_id === ccId);
}

/** Ce qu'un PAYEUR (ex : le commercial) doit sur un lot de RDV signés, ligne par ligne. */
export function linesPaidBy(payerEmail: string, appts: AppointmentItem[], accords: Accord[]): (RemuLine & { appt: AppointmentItem })[] {
  const me = payerEmail.toLowerCase();
  const out: (RemuLine & { appt: AppointmentItem })[] = [];
  for (const a of appts) for (const l of linesFor(a, accords)) if (l.payer === me) out.push({ ...l, appt: a });
  return out;
}

/** Somme des lignes d'un bénéficiaire sur un lot de RDV signés. */
export function totalFor(payeeEmail: string, appts: AppointmentItem[], accords: Accord[]): { total: number; count: number; byKind: Record<string, number> } {
  const me = payeeEmail.toLowerCase();
  let total = 0; const ids = new Set<string>(); const byKind: Record<string, number> = {};
  for (const a of appts) {
    for (const l of linesFor(a, accords)) {
      if (l.payee !== me) continue;
      total += l.amount; ids.add(l.apptId);
      byKind[l.kind] = (byKind[l.kind] ?? 0) + l.amount;
    }
  }
  return { total: Math.round(total), count: ids.size, byKind };
}

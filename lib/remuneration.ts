import { getPool } from "./db";
import type { AppointmentItem } from "./google";

/** MOTEUR DE RÉMUNÉRATION — 100 % piloté par la table remuneration_accords, rien en dur.
 *  Un accord = { portée (call center OU commercial), bénéficiaire, type, base €/signé, % négo }.
 *  Types : 'call_center' (le call touche X €/signé), 'gestionnaire' (l'apporteur du call),
 *          'telepro' (télépro indépendant payé par un commercial), 'apporteur' (% du négocié).
 *  Pour un RDV SIGNÉ, le moteur émet des lignes { bénéficiaire, montant } selon les accords actifs. */

export type TierMode = "none" | "threshold" | "progressive";
/** Un palier de volume : à partir de `minCount` RDV pris ce jour-là (seuil, mode threshold)
 *  ou à partir du `minCount`-ième RDV de la journée (rang, mode progressive), ce tarif remplace
 *  base_eur/pct_nego de l'accord. */
export type Tier = { minCount: number; amountEur: number; pctNego: number };

export type Accord = {
  id: number; call_center_id: number | null; commercial_email: string;
  payee_email: string; payee_kind: "call_center" | "gestionnaire" | "telepro" | "apporteur";
  base_eur: number; pct_nego: number; sold_eur: number; sold_pct: number; // sortie : € fixes et/ou % du négocié, versés quand le véhicule est VENDU
  trigger_kind: "signed" | "honored"; // entrée payée au mandat SIGNÉ ou dès que le RDV est HONORÉ (client venu)
  payer_email: string; // qui paie (ex : le commercial) — vide = payé par la structure
  label: string; active: boolean;
  tier_mode: TierMode; tiers: Tier[]; // paliers de volume journalier (voir TierMode), triés par minCount croissant
};
export type RemuLine = { payee: string; payer: string; kind: Accord["payee_kind"]; amount: number; accordId: number; apptId: string };
/** count/rank du RDV dans la journée du bénéficiaire, DANS LE PÉRIMÈTRE de l'accord — voir buildTierContext. */
type TierIndex = Map<number, Map<string, { count: number; rank: number }>>; // accordId -> apptId -> {count, rank}

export async function listAccords(): Promise<Accord[]> {
  const { rows } = await getPool().query<Accord & { tiers: { minCount: number; amountEur: string; pctNego: string }[] }>(
    `select a.id, a.call_center_id, a.commercial_email, a.payee_email, a.payee_kind, a.base_eur, a.pct_nego,
            a.sold_eur, a.sold_pct, a.trigger_kind, a.payer_email, a.label, a.active, a.tier_mode,
            coalesce(
              (select json_agg(json_build_object('minCount', t.min_count, 'amountEur', t.amount_eur, 'pctNego', t.pct_nego) order by t.min_count)
                 from remuneration_tiers t where t.accord_id = a.id),
              '[]'
            ) as tiers
       from remuneration_accords a where a.active order by a.id`,
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
    tier_mode: (r.tier_mode === "threshold" || r.tier_mode === "progressive") ? r.tier_mode : "none",
    tiers: (r.tiers ?? []).map((t) => ({ minCount: Number(t.minCount), amountEur: Number(t.amountEur), pctNego: Number(t.pctNego) })),
  }));
}

/** Remplace les paliers d'un accord (ordre libre, triés en base). */
export async function setTiers(accordId: number, mode: TierMode, tiers: Tier[]) {
  const pool = getPool();
  await pool.query(`update remuneration_accords set tier_mode = $2 where id = $1`, [accordId, mode]);
  await pool.query(`delete from remuneration_tiers where accord_id = $1`, [accordId]);
  for (const t of tiers) {
    if (t.minCount < 1) continue;
    await pool.query(
      `insert into remuneration_tiers (accord_id, min_count, amount_eur, pct_nego) values ($1,$2,$3,$4)`,
      [accordId, Math.round(t.minCount), t.amountEur, t.pctNego || 0],
    );
  }
}

const tok = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

/** Un RDV est-il dans le périmètre de cet accord (call center, et éventuellement commercial/télépro précis) ?
 *  Indépendant du déclencheur (signé/honoré) : sert aussi à compter le VOLUME journalier (RDV pris, pas juste payés). */
function scopeMatch(a: AppointmentItem, r: Accord): boolean {
  const cc = a.callCenterId ?? 1;
  const commEmail = (a.commercialEmail || "").toLowerCase();
  const commName = tok(a.commercial || "");
  if (r.call_center_id != null) {
    if (cc !== r.call_center_id) return false;
    if (r.commercial_email) {
      const okC = (commEmail && commEmail === r.commercial_email) ||
        (!commEmail && commName && commName === tok(r.commercial_email.split("@")[0]));
      if (!okC) return false;
    }
    return true;
  } else if (r.commercial_email) {
    const matchEmail = commEmail && commEmail === r.commercial_email;
    const matchName = !commEmail && commName && commName === tok(r.commercial_email.split("@")[0]);
    if (!matchEmail && !matchName) return false;
    if (r.payee_kind === "telepro" && (a.owner || "").toLowerCase() !== r.payee_email) return false;
    return true;
  }
  return false; // accord sans portée : ignoré
}

const parisDay = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(iso)) : "";

/** Pour chaque accord à paliers : regroupe les RDV du périmètre par (bénéficiaire, jour) et calcule,
 *  pour chaque RDV, son rang dans la journée et le total de RDV pris ce jour-là (tous statuts, hors annulés) —
 *  c'est le VOLUME ("RDV pris"), pas le nombre payé, qui détermine le palier. */
export function buildTierContext(appts: AppointmentItem[], accords: Accord[]): TierIndex {
  const result: TierIndex = new Map();
  for (const r of accords) {
    if (r.tier_mode === "none" || !r.tiers.length) continue;
    const groups = new Map<string, AppointmentItem[]>();
    for (const a of appts) {
      if (a.cancelled || !a.startDateTime) continue;
      if (!scopeMatch(a, r)) continue;
      const key = `${(a.owner || "").toLowerCase()}|${parisDay(a.startDateTime)}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(a);
    }
    const perAppt = new Map<string, { count: number; rank: number }>();
    for (const arr of groups.values()) {
      arr.sort((x, y) => new Date(x.startDateTime!).getTime() - new Date(y.startDateTime!).getTime());
      arr.forEach((a, i) => perAppt.set(a.id, { count: arr.length, rank: i + 1 }));
    }
    result.set(r.id, perAppt);
  }
  return result;
}

/** Tarif effectif d'un accord pour ce RDV : le palier applicable (le plus haut seuil/rang atteint), sinon le tarif de base. */
function effectiveRate(r: Accord, ctx?: { count: number; rank: number }): { base: number; pct: number } {
  if (r.tier_mode === "none" || !r.tiers.length) return { base: r.base_eur, pct: r.pct_nego };
  const n = r.tier_mode === "threshold" ? (ctx?.count ?? 1) : (ctx?.rank ?? 1);
  let best: Tier | null = null;
  for (const t of r.tiers) if (t.minCount <= n && (!best || t.minCount > best.minCount)) best = t;
  return best ? { base: best.amountEur, pct: best.pctNego } : { base: r.base_eur, pct: r.pct_nego };
}

/** Lignes de rémunération générées par UN RDV, selon les accords.
 *  L'éligibilité dépend du déclencheur de CHAQUE accord :
 *  - 'signed'  : mandat signé (et non retiré)
 *  - 'honored' : client venu au RDV (présent), même sans signature.
 *  `tierIndex` (voir buildTierContext) donne le rang/volume du jour pour les accords à paliers —
 *  sans lui, un accord à paliers applique le tarif du 1er palier (RDV isolé, hors contexte de lot). */
export function linesFor(a: AppointmentItem, accords: Accord[], tierIndex?: TierIndex): RemuLine[] {
  const out: RemuLine[] = [];
  if (a.cancelled) return out;
  const isSigned = a.signStatus === "signed" && !a.mandatRemoved;
  const isHonored = a.presence === "present" || a.present || isSigned;
  const nego = a.negotiation || 0;
  for (const r of accords) {
    if (!scopeMatch(a, r)) continue;
    // Entrée selon le déclencheur de l'accord + sortie (véhicule vendu) en € et/ou %.
    const entryOk = r.trigger_kind === "honored" ? isHonored : isSigned;
    if (!entryOk) continue;
    const { base, pct } = effectiveRate(r, tierIndex?.get(r.id)?.get(a.id));
    const amount = base + (pct / 100) * nego + (a.vehicleSold ? r.sold_eur + (r.sold_pct / 100) * nego : 0);
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
  const tierIndex = buildTierContext(appts, accords);
  const out: (RemuLine & { appt: AppointmentItem })[] = [];
  for (const a of appts) for (const l of linesFor(a, accords, tierIndex)) if (l.payer === me) out.push({ ...l, appt: a });
  return out;
}

/** Somme des lignes d'un bénéficiaire sur un lot de RDV signés. */
export function totalFor(payeeEmail: string, appts: AppointmentItem[], accords: Accord[]): { total: number; count: number; byKind: Record<string, number> } {
  const me = payeeEmail.toLowerCase();
  const tierIndex = buildTierContext(appts, accords);
  let total = 0; const ids = new Set<string>(); const byKind: Record<string, number> = {};
  for (const a of appts) {
    for (const l of linesFor(a, accords, tierIndex)) {
      if (l.payee !== me) continue;
      total += l.amount; ids.add(l.apptId);
      byKind[l.kind] = (byKind[l.kind] ?? 0) + l.amount;
    }
  }
  return { total: Math.round(total), count: ids.size, byKind };
}

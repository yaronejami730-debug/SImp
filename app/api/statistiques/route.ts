import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listAppointments } from "@/lib/google";
import { listReminders } from "@/lib/reminders";
import { searchLeads } from "@/lib/leads";
import { getCommissionSchemes } from "@/lib/users";
import { realisateurCommission, apporteurCommission } from "@/lib/commission";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Bucket = { matin: number; midi: number; aprem: number; soir: number };

function bucketHour(hourParis: number): keyof Bucket {
  if (hourParis < 12) return "matin";
  if (hourParis < 14) return "midi";
  if (hourParis < 18) return "aprem";
  return "soir";
}

function hourParis(iso: string): number {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

// ── Période ──────────────────────────────────────────────
type Granularity = "day" | "week" | "month";
type Period = "7d" | "30d" | "3m" | "12m";
const DAY = 24 * 3600 * 1000;

function periodConfig(period: Period, now: Date): { from: Date; gran: Granularity } {
  switch (period) {
    case "7d": return { from: new Date(now.getTime() - 7 * DAY), gran: "day" };
    case "30d": return { from: new Date(now.getTime() - 30 * DAY), gran: "day" };
    case "3m": return { from: new Date(now.getTime() - 91 * DAY), gran: "week" };
    default: return { from: new Date(now.getFullYear(), now.getMonth() - 11, 1), gran: "month" };
  }
}

const MONTH_LABELS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dayLabel = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }).format(d);

/** Buckets temporels [start,end) couvrant [from, now]. */
function buildBuckets(gran: Granularity, from: Date, now: Date): { key: string; label: string; start: number; end: number }[] {
  const out: { key: string; label: string; start: number; end: number }[] = [];
  if (gran === "month") {
    let y = from.getFullYear(), m = from.getMonth();
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
      const start = new Date(y, m, 1).getTime();
      const end = new Date(y, m + 1, 1).getTime();
      out.push({ key: `${y}-${String(m + 1).padStart(2, "0")}`, label: MONTH_LABELS[m], start, end });
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }
  const unit = (gran === "week" ? 7 : 1) * DAY;
  for (let t = from.getTime(); t < now.getTime(); t += unit) {
    out.push({ key: String(t), label: dayLabel(new Date(t)), start: t, end: t + unit });
  }
  return out;
}

function bucketIndex(buckets: { start: number; end: number }[], t: number): number {
  for (let i = 0; i < buckets.length; i++) if (t >= buckets[i].start && t < buckets[i].end) return i;
  return -1;
}

/** GET -> stats sur la période choisie : conversion, horaires, NRP, évolution. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const url = new URL(req.url);
    const periodParam = (url.searchParams.get("period") ?? "12m") as Period;
    const period: Period = ["7d", "30d", "3m", "12m"].includes(periodParam) ? periodParam : "12m";

    const now = new Date();
    const { from, gran } = periodConfig(period, now);
    const fromMs = from.getTime(), nowMs = now.getTime();
    const inRange = (iso?: string | null) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= fromMs && t <= nowMs;
    };

    // Fetch large window, on filtre ensuite par période.
    const yearAgo = new Date(nowMs - 365 * DAY);
    const yearAhead = new Date(nowMs + 365 * DAY);
    const [allAppts, allReminders, allLeads] = await Promise.all([
      listAppointments(yearAgo, yearAhead),
      listReminders(s.callCenterId, s.role === "admin" ? undefined : s.email),
      searchLeads(s.callCenterId),
    ]);

    // Visibilité par rôle (sans entités) : super-admin = tout ; sinon ses RDV créés + affectés.
    const tokset = (x: string) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
    const myEmailLc = s.email.toLowerCase();
    const myNameTok = tokset(s.name);
    const mineApptFn = (a: { owner?: string; commercial?: string; commercialEmail?: string }) =>
      a.owner === s.email ||
      (!!a.commercialEmail && a.commercialEmail.toLowerCase() === myEmailLc) ||
      (!a.commercialEmail && !!myNameTok && tokset(a.commercial ?? "") === myNameTok);
    const ownerAppts = s.role === "admin" ? allAppts : allAppts.filter(mineApptFn);
    const appts = ownerAppts.filter((a) => inRange(a.startDateTime));
    const reminders = allReminders.filter((r) => inRange(r.remind_at));
    const leads = allLeads.filter((l) => inRange(l.created_at));

    // --- Funnel conversion ---
    const total = appts.length;
    const cancelled = appts.filter((a) => a.cancelled).length;
    const active = appts.filter((a) => !a.cancelled);
    const present = active.filter((a) => a.present).length;
    const signed = active.filter((a) => a.signStatus === "signed").length;
    const thinking = active.filter((a) => a.signStatus === "thinking").length;
    const unsigned = active.filter((a) => a.signStatus === "unsigned").length;
    const noShow = active.length - present;

    const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

    // --- Horaires préférés ---
    const apptBuckets: Bucket = { matin: 0, midi: 0, aprem: 0, soir: 0 };
    for (const a of active) if (a.startDateTime) apptBuckets[bucketHour(hourParis(a.startDateTime))]++;
    const remBuckets: Bucket = { matin: 0, midi: 0, aprem: 0, soir: 0 };
    for (const r of reminders) if (r.remind_at) remBuckets[bucketHour(hourParis(r.remind_at))]++;

    // --- Prospection NRP ---
    const leadsTotal = leads.length;
    const leadsConverted = reminders.filter((r) => r.lead_id != null).length;
    const leadsNRP = Math.max(leadsTotal - leadsConverted, 0);

    // --- Répartition des relances NRP (ne répond pas) ---
    const nrpReminders = reminders.filter((r) => (r.nrp_count ?? 0) > 0);
    const nrpDistribution = [1, 2, 3].map((n) => ({
      niveau: n,
      // niveau 3 = "3 et +"
      count: nrpReminders.filter((r) => (n < 3 ? r.nrp_count === n : r.nrp_count >= 3)).length,
    }));
    const nrpTotalContacts = nrpReminders.length;
    const nrpTotalAppels = nrpReminders.reduce((s, r) => s + r.nrp_count, 0);

    // --- Commission : apporteur (créateur) vs réalisateur (commercial affecté) ---
    const schemes = await getCommissionSchemes(); // tous les comptes, clé = e-mail
    const myEmail = myEmailLc;
    const myName = myNameTok;
    const mySc = schemes.get(myEmail) ?? { base: 50, pct: 10 };
    const isAssignee = (a: { commercialEmail?: string; commercial?: string }) =>
      (!!a.commercialEmail && a.commercialEmail.toLowerCase() === myEmail) ||
      (!a.commercialEmail && !!myName && tokset(a.commercial ?? "") === myName);
    const isCreator = (a: { owner?: string }) => (a.owner ?? "") === s.email;

    // Commission PERSO de l'utilisateur sur un RDV signé selon son rôle (réalisateur prioritaire).
    const commission = (a: { negotiation?: number; owner?: string; commercial?: string; commercialEmail?: string }) => {
      const nego = a.negotiation || 0;
      if (isAssignee(a)) return realisateurCommission(mySc.base, mySc.pct, nego);
      if (isCreator(a)) return apporteurCommission(mySc.base, mySc.pct, nego);
      return 0;
    };
    const signedActive = active.filter((a) => a.signStatus === "signed");
    const commissionRealisateur = signedActive.filter(isAssignee).reduce((sum, a) => sum + realisateurCommission(mySc.base, mySc.pct, a.negotiation || 0), 0);
    const commissionApporteur = signedActive.filter((a) => isCreator(a) && !isAssignee(a)).reduce((sum, a) => sum + apporteurCommission(mySc.base, mySc.pct, a.negotiation || 0), 0);
    const commissionTotal = commissionRealisateur + commissionApporteur;

    // --- Évolution (granularité adaptée à la période) ---
    const buckets = buildBuckets(gran, from, now);
    const evo = buckets.map((b) => ({ key: b.key, label: b.label, rdv: 0, signed: 0, commission: 0 }));
    for (const a of active) {
      if (!a.startDateTime) continue;
      const i = bucketIndex(buckets, new Date(a.startDateTime).getTime());
      if (i < 0) continue;
      evo[i].rdv++;
      if (a.signStatus === "signed") { evo[i].signed++; evo[i].commission += commission(a); }
    }
    const evolution = evo.map((e) => ({ ...e, commission: Math.round(e.commission) }));

    return NextResponse.json({
      ok: true,
      period,
      gran,
      funnel: {
        total, cancelled, present, noShow, signed, thinking, unsigned,
        ratePresence: rate(present, active.length),
        rateSignature: rate(signed, present),
        rateGlobal: rate(signed, total),
        rateAnnulation: rate(cancelled, total),
      },
      evolution,
      heuresRdv: apptBuckets,
      heuresRappels: remBuckets,
      prospection: { total: leadsTotal, convertis: leadsConverted, nrp: leadsNRP, rateConversion: rate(leadsConverted, leadsTotal) },
      nrp: { distribution: nrpDistribution, totalContacts: nrpTotalContacts, totalAppels: nrpTotalAppels },
      commissionTotal,
      commissionApporteur,
      commissionRealisateur,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

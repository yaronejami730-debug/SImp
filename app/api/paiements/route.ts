import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { listAppointments } from "@/lib/google";
import { listAccords, linesPaidBy } from "@/lib/remuneration";
import { listCallCenters, commercialsForCallCenterInherited } from "@/lib/callcenters";
import { listBookersFor } from "@/lib/bookers";
import { listUsers } from "@/lib/users";
import { toParisISO } from "@/lib/parse";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Espace commercial "Mes paiements" : le commercial FIXE ses accords (ce qu'il paie au
 *  gestionnaire d'un call center ou à un télépro indépendant, à l'entrée mandat signé
 *  et/ou à la sortie véhicule vendu) et comptabilise chaque mois ce qu'il doit. */

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const url = new URL(req.url);
    const now = new Date();
    const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
    const fromStr = isDate(url.searchParams.get("from")) ? url.searchParams.get("from")! : ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const toStr = isDate(url.searchParams.get("to")) ? url.searchParams.get("to")! : ymd(now);
    const fromMs = new Date(toParisISO(fromStr, "00:00")).getTime();
    const toMs = new Date(toParisISO(toStr, "23:59")).getTime();

    const me = s.email.toLowerCase();
    const accords = (await listAccords()).filter((a) => a.payer_email === me);

    // Bénéficiaires possibles : gestionnaires des call centers liés à moi + télépros indépendants autorisés.
    const [ccs, users, bookers] = await Promise.all([listCallCenters(), listUsers(), listBookersFor(s.email).catch(() => [])]);
    const nameOf = (email: string) => users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.name ?? email;
    const gestionnaires: { ccId: number; ccName: string; email: string; name: string }[] = [];
    for (const c of ccs) {
      if (c.id === 1 || !c.gestionnaire_email) continue;
      const coms = await commercialsForCallCenterInherited(c.id);
      if (coms.some((x) => x.email.toLowerCase() === me)) {
        gestionnaires.push({ ccId: c.id, ccName: c.name, email: c.gestionnaire_email.toLowerCase(), name: nameOf(c.gestionnaire_email) });
      }
    }
    const independants = bookers.filter((b) => !b.callCenter).map((b) => ({ email: b.email, name: b.name }));

    // Comptabilisation : lignes dues sur la plage (RDV signés non annulés, mandat non retiré).
    const appts = (await listAppointments(new Date(fromMs - 86400e3), new Date(toMs + 86400e3)))
      .filter((a) => a.startDateTime && !a.cancelled) // le moteur applique le déclencheur de chaque accord (signé / honoré)
      .filter((a) => { const t = new Date(a.startDateTime!).getTime(); return t >= fromMs && t <= toMs; });
    const lines = linesPaidBy(me, appts, accords).map((l) => ({
      apptId: l.apptId, amount: Math.round(l.amount), kind: l.kind, payee: l.payee, payeeName: nameOf(l.payee),
      date: l.appt.startDateTime, client: `${l.appt.firstName} ${l.appt.lastName}`.trim(),
      vehicle: [l.appt.carBrand, l.appt.carModel].filter(Boolean).join(" "),
      telepro: l.appt.teleprospector || "", sold: !!l.appt.vehicleSold, signed: l.appt.signStatus === "signed",
    }));

    return NextResponse.json({ ok: true, from: fromStr, to: toStr, accords, gestionnaires, independants, lines });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST : gestion des accords du commercial (il fixe le prix négocié).
 *  { action:"add", kind:"gestionnaire"|"telepro", payeeEmail, ccId?, baseEur, soldEur }
 *  { action:"update", id, baseEur, soldEur } | { action:"remove", id } */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const me = s.email.toLowerCase();
    const b = (await req.json()) as { action?: string; kind?: "gestionnaire" | "telepro"; payeeEmail?: string; ccId?: number; baseEur?: number; soldEur?: number; soldPct?: number; trigger?: "signed" | "honored"; id?: number };
    const pool = getPool();
    if (b.action === "add" && b.payeeEmail && (b.kind === "gestionnaire" || b.kind === "telepro")) {
      await pool.query(
        `insert into remuneration_accords (call_center_id, commercial_email, payee_email, payee_kind, base_eur, sold_eur, sold_pct, trigger_kind, payer_email, label)
         values ($1,$2,lower($3),$4,$5,$6,$7,$8,$9,$10)`,
        [
          b.kind === "gestionnaire" ? (b.ccId ?? null) : null,
          b.kind === "telepro" ? me : "",
          b.payeeEmail, b.kind, Number(b.baseEur ?? 0), Number(b.soldEur ?? 0), Number(b.soldPct ?? 0),
          b.trigger === "honored" ? "honored" : "signed", me,
          `Accord ${b.kind} fixé par ${s.name}`,
        ],
      );
    } else if (b.action === "update" && b.id) {
      await pool.query(`update remuneration_accords set base_eur=$2, sold_eur=$3, sold_pct=$4, trigger_kind=$5 where id=$1 and lower(payer_email)=$6`, [b.id, Number(b.baseEur ?? 0), Number(b.soldEur ?? 0), Number(b.soldPct ?? 0), b.trigger === "honored" ? "honored" : "signed", me]);
    } else if (b.action === "remove" && b.id) {
      await pool.query(`update remuneration_accords set active=false where id=$1 and lower(payer_email)=$2`, [b.id, me]);
    } else {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

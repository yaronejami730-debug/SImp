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

    // Call centers dont JE suis le GESTIONNAIRE : je négocie les accords commercial <-> call.
    const allAccords = await listAccords();
    const managed = [] as { ccId: number; ccName: string; responsable: string; commercials: { email: string; name: string }[]; deals: { commercial: string; commercialName: string; callEur: number; gestEur: number; trigger: string; soldEur: number; soldPct: number; ids: number[] }[] }[];
    for (const c of ccs) {
      if (c.id === 1 || (c.gestionnaire_email ?? "").toLowerCase() !== me) continue;
      const coms = await commercialsForCallCenterInherited(c.id);
      // Regroupe les accords négociés (payer = un commercial, portée cc + commercial)
      const dealMap = new Map<string, { commercial: string; commercialName: string; callEur: number; gestEur: number; trigger: string; soldEur: number; soldPct: number; ids: number[] }>();
      for (const a of allAccords) {
        if (a.call_center_id !== c.id || !a.payer_email || !a.commercial_email) continue;
        const d = dealMap.get(a.commercial_email) ?? { commercial: a.commercial_email, commercialName: nameOf(a.commercial_email), callEur: 0, gestEur: 0, trigger: a.trigger_kind, soldEur: 0, soldPct: 0, ids: [] };
        if (a.payee_kind === "call_center") d.callEur = a.base_eur;
        if (a.payee_kind === "gestionnaire") { d.gestEur = a.base_eur; d.soldEur = a.sold_eur; d.soldPct = a.sold_pct; d.trigger = a.trigger_kind; }
        d.ids.push(a.id);
        dealMap.set(a.commercial_email, d);
      }
      managed.push({ ccId: c.id, ccName: c.name, responsable: c.responsable_email ?? "", commercials: coms.map((x) => ({ email: x.email.toLowerCase(), name: x.name })), deals: [...dealMap.values()] });
    }

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

    return NextResponse.json({ ok: true, from: fromStr, to: toStr, accords, gestionnaires, independants, lines, managed });
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
    // GESTIONNAIRE : crée l'accord commercial <-> call center qu'il a négocié.
    // { action:"brokerDeal", ccId, commercialEmail, trigger, callEur (part call center), gestEur (ma part), soldEur, soldPct }
    if (b.action === "brokerDeal") {
      const bb = b as unknown as { ccId?: number; commercialEmail?: string; trigger?: string; callEur?: number; gestEur?: number; soldEur?: number; soldPct?: number };
      if (!bb.ccId || !bb.commercialEmail?.trim()) return NextResponse.json({ error: "Call center et commercial requis." }, { status: 400 });
      const { listCallCenters: lcc } = await import("@/lib/callcenters");
      const cc = (await lcc()).find((c) => c.id === Number(bb.ccId));
      if (!cc || (cc.gestionnaire_email ?? "").toLowerCase() !== me) {
        return NextResponse.json({ error: "Tu n'es pas le gestionnaire de ce call center." }, { status: 403 });
      }
      const payer = bb.commercialEmail.trim().toLowerCase();
      const trig = bb.trigger === "honored" ? "honored" : "signed";
      // Remplace l'accord existant de ce couple (renégociation = désactivation + recréation).
      await pool.query(`update remuneration_accords set active=false where call_center_id=$1 and lower(commercial_email)=$2 and payer_email<>''`, [cc.id, payer]);
      if (Number(bb.callEur ?? 0) > 0 && cc.responsable_email) {
        await pool.query(
          `insert into remuneration_accords (call_center_id, commercial_email, payee_email, payee_kind, base_eur, trigger_kind, payer_email, label)
           values ($1,$2,$3,'call_center',$4,$5,$6,$7)`,
          [cc.id, payer, cc.responsable_email.toLowerCase(), Number(bb.callEur), trig, payer, `Accord négocié par ${s.name} (gestionnaire ${cc.name})`],
        );
      }
      await pool.query(
        `insert into remuneration_accords (call_center_id, commercial_email, payee_email, payee_kind, base_eur, sold_eur, sold_pct, trigger_kind, payer_email, label)
         values ($1,$2,$3,'gestionnaire',$4,$5,$6,$7,$8,$9)`,
        [cc.id, payer, me, Number(bb.gestEur ?? 0), Number(bb.soldEur ?? 0), Number(bb.soldPct ?? 0), trig, payer, `Accord négocié par ${s.name} (gestionnaire ${cc.name})`],
      );
      return NextResponse.json({ ok: true });
    }
    if (b.action === "removeDeal") {
      const bb = b as unknown as { ids?: number[] };
      if (!bb.ids?.length) return NextResponse.json({ error: "ids requis." }, { status: 400 });
      // Sécurité : ne désactive que les accords dont je suis le bénéficiaire gestionnaire OU gestionnaire du cc.
      await pool.query(
        `update remuneration_accords set active=false where id = any($1)
           and (lower(payee_email) = $2 or call_center_id in (select id from call_centers where lower(gestionnaire_email) = $2))`,
        [bb.ids, me],
      );
      return NextResponse.json({ ok: true });
    }
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

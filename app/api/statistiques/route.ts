import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listAppointments } from "@/lib/google";
import { listAccords, linesFor, totalFor } from "@/lib/remuneration";
import { toParisISO } from "@/lib/parse";
import { getPool } from "@/lib/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAY = 24 * 3600 * 1000;
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const tokset = (x: string) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *  Visibilité par rôle:
 *  - Commercial (isCommercial=true): ses RDV + commission total (pas distribution)
 *  - Responsable CC: RDV du CC + par commercial: total_owed (pas distribution)
 *  - Gestionnaire (email = call_centers.gestionnaire_email): idem + call_center_portion + beneficiary_portion
 *  - Admin: tout partout */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const url = new URL(req.url);
    const now = new Date();
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const fromStr = isDate(fromParam) ? fromParam : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getFullYear(), now.getMonth(), 1));
    const toStr = isDate(toParam) ? toParam : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const fromMs = new Date(toParisISO(fromStr, "00:00")).getTime();
    const toMs = new Date(toParisISO(toStr, "23:59")).getTime();
    const inRange = (iso?: string | null) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= fromMs && t <= toMs;
    };

    const allAppts = await listAppointments(new Date(fromMs - 7 * DAY), new Date(toMs + 7 * DAY));

    // Déterminer rôle viewer
    const myEmailLc = s.email.toLowerCase();
    const myNameTok = tokset(s.name);
    let viewerRole: "commercial" | "responsable" | "gestionnaire" | "admin" = "admin";

    if (s.role === "admin") {
      viewerRole = "admin";
    } else if (s.role === "responsable") {
      // Vérifier si gestionnaire
      const ccResult = await getPool().query("SELECT gestionnaire_email FROM call_centers WHERE id = $1", [s.callCenterId]);
      if (ccResult.rows[0]?.gestionnaire_email?.toLowerCase() === myEmailLc) {
        viewerRole = "gestionnaire";
      } else {
        viewerRole = "responsable";
      }
    } else if (s.isCommercial) {
      viewerRole = "commercial";
    }

    // Filtre RDV selon rôle
    const isMine = (a: { owner?: string; commercial?: string; commercialEmail?: string }) =>
      a.owner === s.email ||
      (!!a.commercialEmail && a.commercialEmail.toLowerCase() === myEmailLc) ||
      (!a.commercialEmail && !!myNameTok && tokset(a.commercial ?? "") === myNameTok);

    const visible = viewerRole === "admin" ? allAppts
      : viewerRole === "commercial" ? allAppts.filter(isMine)
      : allAppts.filter((a) => a.callCenterId === s.callCenterId); // responsable/gestionnaire: tous du CC

    const appts = visible.filter((a) => inRange(a.startDateTime));
    const active = appts.filter((a) => !a.cancelled);
    const isSigned = (a: { signStatus?: string; mandatRemoved?: boolean }) => a.signStatus === "signed" && !a.mandatRemoved;

    // Charger commercial_compensation
    const compRes = await getPool().query(
      `SELECT commercial_email, commercial_name, commission_base, commission_pct, call_center_share_pct
       FROM commercial_compensation WHERE call_center_id = $1`,
      [s.callCenterId]
    );
    const compByEmail = new Map<string, any>(compRes.rows.map(r => [r.commercial_email.toLowerCase(), r]));

    // === CAS: COMMERCIAL ===
    if (viewerRole === "commercial") {
      const total = active.length;
      const signed = active.filter(isSigned).length;
      const rateSignature = total > 0 ? Math.round((signed / total) * 100) : 0;

      const signedAppts = active.filter(isSigned);
      const comp = compByEmail.get(myEmailLc);
      const commissionFixe = comp ? Math.round(comp.commission_base * signed) : 0;
      const negoTotal = signedAppts.reduce((sum, a) => sum + (a.negotiation || 0), 0);
      const commissionVariable = comp ? Math.round((comp.commission_pct / 100) * negoTotal) : 0;
      const commission = commissionFixe + commissionVariable; // JAMAIS de répartition visible au commercial

      const signedList = signedAppts.map((a) => ({
        firstName: a.firstName ?? "",
        lastName: a.lastName ?? "",
        car: [a.carBrand, a.carModel].filter(Boolean).join(" "),
        commercial: a.commercial ?? "",
        date: a.startDateTime ?? null,
      }));

      return NextResponse.json({
        ok: true,
        from: fromStr,
        to: toStr,
        total,
        signed,
        rateSignature,
        commission, // total seulement
        commissionFixe,
        commissionVariable,
        negoTotal,
        scheme: comp ? { base: comp.commission_base, pct: comp.commission_pct } : { base: 0, pct: 0 },
        signedList,
      });
    }

    // === CAS: RESPONSABLE / GESTIONNAIRE ===
    const accent = (s: string) => (s.match(/[À-ÿ]/g) || []).length;
    const byCommMap = new Map<string, any>();
    for (const a of active) {
      const name = (a.commercial ?? "").trim();
      const email = a.commercialEmail?.toLowerCase();
      if (!name) continue;
      const k = tokset(name);
      const cur = byCommMap.get(k) ?? { name, email, signed: 0, total: 0 };
      cur.total++;
      if (isSigned(a)) cur.signed++;
      if (accent(name) > accent(cur.name)) cur.name = name;
      byCommMap.set(k, cur);
    }
    const byCommercial = [...byCommMap.values()].sort((a, b) => b.signed - a.signed || b.total - a.total);

    // Calculer commission par commercial
    for (const comm of byCommercial) {
      const comp = compByEmail.get(comm.email?.toLowerCase());
      const commissionFixe = comp ? Math.round(comp.commission_base * comm.signed) : 0;
      const signedAppts = active.filter(isSigned).filter((a) => a.commercialEmail?.toLowerCase() === comm.email?.toLowerCase());
      const negoTotal = signedAppts.reduce((sum, a) => sum + (a.negotiation || 0), 0);
      const commissionVariable = comp ? Math.round((comp.commission_pct / 100) * negoTotal) : 0;
      comm.totalOwed = commissionFixe + commissionVariable;

      if (viewerRole === "gestionnaire") {
        comm.callCenterPortion = Math.round((comp?.call_center_share_pct ?? 0) / 100 * comm.totalOwed);
        comm.beneficiaryPortion = comm.totalOwed - comm.callCenterPortion;
      }
    }

    const total = active.length;
    const signed = active.filter(isSigned).length;
    const rateSignature = total > 0 ? Math.round((signed / total) * 100) : 0;
    const signedList = active.filter(isSigned).map((a) => ({
      firstName: a.firstName ?? "",
      lastName: a.lastName ?? "",
      car: [a.carBrand, a.carModel].filter(Boolean).join(" "),
      commercial: a.commercial ?? "",
      date: a.startDateTime ?? null,
    }));

    return NextResponse.json({
      ok: true,
      from: fromStr,
      to: toStr,
      total,
      signed,
      rateSignature,
      byCommercial,
      signedList,
      viewerRole, // pour debug
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

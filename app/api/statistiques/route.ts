import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listAppointments } from "@/lib/google";
import { getCommissionSchemes } from "@/lib/users";
import { listCallCenters } from "@/lib/callcenters";
import { toParisISO } from "@/lib/parse";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAY = 24 * 3600 * 1000;
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const tokset = (x: string) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *  Stats de l'utilisateur connecté sur la plage : taux de signature + SA commission
 *  (selon le barème de son compte), sur ses RDV attribués (commercial) ou générés (TP). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const url = new URL(req.url);
    const now = new Date();
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    // Défaut : mois en cours -> aujourd'hui.
    const fromStr = isDate(fromParam) ? fromParam : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getFullYear(), now.getMonth(), 1));
    const toStr = isDate(toParam) ? toParam : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const fromMs = new Date(toParisISO(fromStr, "00:00")).getTime();
    const toMs = new Date(toParisISO(toStr, "23:59")).getTime();
    const inRange = (iso?: string | null) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= fromMs && t <= toMs;
    };

    // Fenêtre large puis filtre plage.
    const allAppts = await listAppointments(new Date(fromMs - 7 * DAY), new Date(toMs + 7 * DAY));

    // Visibilité par rôle :
    //  - admin       : TOUT (sa rémunération = ses RDV cc1 + marge sur les call centers)
    //  - responsable : tous les RDV de SON call center (payé sur chaque signé de son équipe)
    //  - télépro     : ses RDV (créés ou affectés)
    const myEmailLc = s.email.toLowerCase();
    const myNameTok = tokset(s.name);
    const isMine = (a: { owner?: string; commercial?: string; commercialEmail?: string }) =>
      a.owner === s.email ||
      (!!a.commercialEmail && a.commercialEmail.toLowerCase() === myEmailLc) ||
      (!a.commercialEmail && !!myNameTok && tokset(a.commercial ?? "") === myNameTok);
    const visible = s.role === "admin" ? allAppts
      : s.role === "responsable" ? allAppts.filter((a) => a.callCenterId === s.callCenterId)
      : allAppts.filter(isMine);

    const appts = visible.filter((a) => inRange(a.startDateTime));
    const active = appts.filter((a) => !a.cancelled);
    const total = active.length;
    // "Signé" = mandat signé ET non retiré (cohérent avec le bilan : un mandat retiré ne compte plus).
    const isSigned = (a: { signStatus?: string; mandatRemoved?: boolean }) => a.signStatus === "signed" && !a.mandatRemoved;
    const signed = active.filter(isSigned).length;
    const rateSignature = total > 0 ? Math.round((signed / total) * 100) : 0;

    // ── Rémunération découpée ──
    // Télépro / responsable : SON barème × signés visibles.
    // Admin : son barème sur les RDV de sa propre entité (cc1) + MARGE sur les call centers
    //         (frais fixes 50 € - le barème du responsable du call center, ex 50-30 = 20 €/signé).
    const FRAIS_FIXE = 50;
    const schemes = await getCommissionSchemes();
    const mySc = schemes.get(myEmailLc) ?? { base: 0, pct: 0 };
    const signedAppts = active.filter(isSigned);
    // Barème du responsable de chaque call center (coût du call center par signé).
    const ccs = await listCallCenters();
    const respSchemeByCc = new Map<number, { base: number; pct: number }>();
    for (const c of ccs) {
      if (c.responsable_email) respSchemeByCc.set(c.id, schemes.get(c.responsable_email.toLowerCase()) ?? { base: 0, pct: 0 });
    }

    let ownSigned: typeof signedAppts = signedAppts;
    let margeCC = 0, margeCCCount = 0;
    if (s.role === "admin") {
      ownSigned = signedAppts.filter((a) => (a.callCenterId ?? 1) === 1);
      for (const a of signedAppts) {
        const cc = a.callCenterId ?? 1;
        if (cc === 1) continue;
        const rs = respSchemeByCc.get(cc) ?? { base: 0, pct: 0 };
        const cost = rs.base + (rs.pct / 100) * (a.negotiation || 0);
        margeCC += Math.max(FRAIS_FIXE - cost, 0);
        margeCCCount++;
      }
      margeCC = Math.round(margeCC);
    }
    const negoTotal = ownSigned.reduce((sum, a) => sum + (a.negotiation || 0), 0);
    const commissionFixe = Math.round(mySc.base * ownSigned.length);
    const commissionVariable = Math.round((mySc.pct / 100) * negoTotal);
    const commission = commissionFixe + commissionVariable + margeCC;

    // --- Signés par commercial (avec qui j'ai signé) ---
    const accent = (s: string) => (s.match(/[À-ÿ]/g) || []).length;
    const byCommMap = new Map<string, { name: string; signed: number; total: number }>();
    for (const a of active) {
      const name = (a.commercial ?? "").trim();
      if (!name) continue;
      const k = tokset(name);
      const cur = byCommMap.get(k) ?? { name, signed: 0, total: 0 };
      cur.total++;
      if (isSigned(a)) cur.signed++;
      if (accent(name) > accent(cur.name)) cur.name = name; // garder la variante la mieux orthographiée
      byCommMap.set(k, cur);
    }
    const byCommercial = [...byCommMap.values()].sort((a, b) => b.signed - a.signed || b.total - a.total);

    // --- Clients signés (qui j'ai signé) : prénom nom + véhicule + commercial ---
    const signedList = signedAppts
      .slice()
      .sort((a, b) => (a.startDateTime && b.startDateTime ? (a.startDateTime < b.startDateTime ? 1 : -1) : 0))
      .map((a) => ({
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
      commission,
      commissionFixe,
      commissionVariable,
      margeCC,
      margeCCCount,
      negoTotal,
      scheme: { base: mySc.base, pct: mySc.pct },
      byCommercial,
      signedList,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

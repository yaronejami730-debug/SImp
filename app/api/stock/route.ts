import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listAppointments, type AppointmentItem } from "@/lib/google";
import { getPool } from "@/lib/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAY = 24 * 3600 * 1000;
const tokset = (x: string) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

export type StockItem = {
  id: string;
  client: string;
  car: string;
  immatriculation: string;
  commercial: string;
  callCenterId: number;
  callCenter: string;
  teleprospector: string;
  mandatAt: string | null;   // date du mandat (signStatusAt, sinon date du RDV)
  days: number;              // jours en stock
  negotiation: number;
  listingUrl: string;
  photo: string;
};

type Group = { key: string; label: string; enStock: number; vendues: number; retires: number; enCours: number };

/** GET -> stock des véhicules sous mandat.
 *  En stock = mandat signé, non retiré, véhicule pas encore vendu.
 *  Répartition par call center et par commercial.
 *  Visibilité : admin = tout ; responsable = son call center ; commercial = ses véhicules. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const now = Date.now();
    // Un mandat peut dater de longtemps : on remonte 24 mois.
    const all = await listAppointments(new Date(now - 730 * DAY), new Date(now + 30 * DAY));

    const myEmailLc = s.email.toLowerCase();
    const myNameTok = tokset(s.name);
    const isMine = (a: AppointmentItem) =>
      (!!a.commercialEmail && a.commercialEmail.toLowerCase() === myEmailLc) ||
      (!a.commercialEmail && !!myNameTok && tokset(a.commercial) === myNameTok);

    const visible = s.role === "admin" ? all
      : s.role === "responsable" ? all.filter((a) => a.callCenterId === s.callCenterId)
      : s.isCommercial ? all.filter(isMine)
      : all.filter((a) => a.callCenterId === s.callCenterId);

    const ccRows = await getPool().query<{ id: number; name: string }>(`select id, name from call_centers order by id`);
    const ccName = new Map<number, string>(ccRows.rows.map((r) => [Number(r.id), r.name]));

    // Classement métier d'un RDV.
    const mandatSigned = (a: AppointmentItem) => !a.cancelled && a.signStatus === "signed";
    const enStock = (a: AppointmentItem) => mandatSigned(a) && !a.mandatRemoved && !a.vehicleSold;
    const vendue = (a: AppointmentItem) => mandatSigned(a) && !a.mandatRemoved && a.vehicleSold;
    const retire = (a: AppointmentItem) => mandatSigned(a) && a.mandatRemoved;
    const enCours = (a: AppointmentItem) => !a.cancelled && a.signStatus === "listed";

    const toItem = (a: AppointmentItem): StockItem => {
      const mandatAt = a.signStatusAt || a.startDateTime;
      return {
        id: a.id,
        client: `${a.firstName} ${a.lastName}`.trim(),
        car: [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" "),
        immatriculation: a.immatriculation,
        commercial: a.commercial,
        callCenterId: a.callCenterId,
        callCenter: ccName.get(a.callCenterId) ?? `Call center ${a.callCenterId}`,
        teleprospector: a.teleprospector,
        mandatAt,
        days: mandatAt ? Math.max(0, Math.floor((now - new Date(mandatAt).getTime()) / DAY)) : 0,
        negotiation: a.negotiation,
        listingUrl: a.listingUrl,
        photo: a.vehiclePhotoUrl || a.photos[0] || "",
      };
    };

    const stock = visible.filter(enStock).map(toItem).sort((x, y) => y.days - x.days);

    // Regroupements (call centers + commerciaux) sur l'ensemble visible.
    const groupBy = (keyOf: (a: AppointmentItem) => { key: string; label: string }): Group[] => {
      const m = new Map<string, Group>();
      for (const a of visible) {
        if (!mandatSigned(a) && !enCours(a)) continue;
        const { key, label } = keyOf(a);
        const g = m.get(key) ?? { key, label, enStock: 0, vendues: 0, retires: 0, enCours: 0 };
        if (enStock(a)) g.enStock++;
        else if (vendue(a)) g.vendues++;
        else if (retire(a)) g.retires++;
        else if (enCours(a)) g.enCours++;
        m.set(key, g);
      }
      return [...m.values()].sort((x, y) => y.enStock - x.enStock || x.label.localeCompare(y.label, "fr"));
    };

    const byCallCenter = groupBy((a) => ({ key: String(a.callCenterId), label: ccName.get(a.callCenterId) ?? `Call center ${a.callCenterId}` }));
    const byCommercial = groupBy((a) => ({ key: tokset(a.commercial) || "?", label: a.commercial || "Sans commercial" }));

    return NextResponse.json({
      ok: true,
      enStock: stock.length,
      vendues: visible.filter(vendue).length,
      retires: visible.filter(retire).length,
      enCours: visible.filter(enCours).length,
      stock,
      byCallCenter,
      byCommercial,
      viewerRole: s.role === "admin" ? "admin" : s.role === "responsable" ? "responsable" : s.isCommercial ? "commercial" : "collab",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

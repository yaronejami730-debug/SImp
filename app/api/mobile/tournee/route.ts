import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listMobileAppts, ensureCoords } from "@/lib/mobile";
import { toParisISO } from "@/lib/parse";
import { AGENCY_COORDS, distanceKm, drivingLegsGoogle, type LatLng } from "@/lib/geocode";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD -> ordre de passage optimisé des RDV déplacement du jour. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  // Point de départ : position actuelle (si fournie) sinon l'agence.
  const slat = Number(sp.get("lat")), slng = Number(sp.get("lng"));
  const start: LatLng = Number.isFinite(slat) && Number.isFinite(slng) && (slat || slng) ? { lat: slat, lng: slng } : AGENCY_COORDS;

  try {
    const dayStart = new Date(toParisISO(date, "00:00"));
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const tokset = (x: string) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
    const myName = tokset(s.name);
    const myEmail = s.email.toLowerCase();
    const appts = (await listMobileAppts(s.callCenterId, { from: dayStart.toISOString(), to: dayEnd.toISOString() }))
      .filter((a) => a.status !== "cancelled")
      // Visible par le créateur (téléprospecteur) ET par l'affecté (commercial). Admin : tout.
      .filter((a) => s.role === "admin" || a.teleprospecteur === s.email || (a.commercial_email && a.commercial_email.toLowerCase() === myEmail) || (myName && tokset(a.commercial) === myName))
      // L'HEURE du RDV est prioritaire : ordre chronologique strict, jamais réordonné pour gagner des km.
      .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());

    await ensureCoords(appts);

    const points: (LatLng | null)[] = appts.map((a) => (a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null));
    // Ordre = chronologique (index naturel). L'heure prime ; le trajet est informatif.
    const order = appts.map((_, i) => i);

    // Trajets routiers réels (trafic) si clé Google Maps : départ -> stops géocodés, dans l'ordre.
    const geoSeq: LatLng[] = [start, ...order.map((idx) => points[idx]).filter((p): p is LatLng => !!p)];
    const realLegs = await drivingLegsGoogle(geoSeq); // null si pas de clé -> fallback haversine
    const trafficUsed = !!realLegs;

    let prev: LatLng = start;
    let totalKm = 0;
    let totalMin = 0;
    let geoLegIdx = 0; // index dans realLegs (uniquement les stops géocodés)
    const stops = order.map((idx, i) => {
      const a = appts[idx];
      const p = points[idx];
      let legKm: number | null = null;
      let legMin: number | null = null;
      if (p) {
        if (realLegs && realLegs[geoLegIdx]) {
          legKm = realLegs[geoLegIdx].km;
          legMin = realLegs[geoLegIdx].min;
        } else {
          legKm = Math.round(distanceKm(prev, p) * 10) / 10;
        }
        geoLegIdx++;
        totalKm += legKm ?? 0;
        if (legMin != null) totalMin += legMin;
        prev = p;
      }
      return {
        rank: i + 1,
        id: a.id,
        client: `${a.first_name} ${a.last_name}`.trim(),
        address: a.address,
        time: a.start_datetime,
        vehicle: [a.car_brand, a.car_model].filter(Boolean).join(" "),
        phone: a.phone,
        legKm,
        legMin,
        geocoded: !!p,
      };
    });

    return NextResponse.json({ ok: true, date, start, count: stops.length, totalKm: Math.round(totalKm * 10) / 10, totalMin, trafficUsed, stops });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

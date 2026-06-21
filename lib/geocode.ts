// Géocodage gratuit via Nominatim (OpenStreetMap). Pas de clé. Limite ~1 req/s.
export type LatLng = { lat: number; lng: number };

const AGENCY_ADDRESS = process.env.DEFAULT_LOCATION ?? "3 rue Bélidor 75017 Paris";
export const AGENCY_COORDS: LatLng = { lat: 48.8847, lng: 2.2887 }; // 3 rue Bélidor 75017

/** Géocode une adresse -> {lat,lng} ou null. */
export async function geocode(address: string): Promise<LatLng | null> {
  const q = address?.trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Simplicicar-RDV/1.0 (contact@simplicicar.store)", "Accept-Language": "fr" } });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!json[0]) return null;
    return { lat: Number(json[0].lat), lng: Number(json[0].lon) };
  } catch {
    return null;
  }
}

export type AddressSuggestion = { label: string; lat: number; lng: number };

/** Suggestions d'adresses (autocomplétion) via Nominatim, biaisées France. */
export async function suggestAddresses(q: string): Promise<AddressSuggestion[]> {
  const query = q?.trim();
  if (!query || query.length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=6&countrycodes=fr&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Simplicicar-RDV/1.0 (contact@simplicicar.store)", "Accept-Language": "fr" } });
    if (!res.ok) return [];
    const json = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    return json.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
  } catch {
    return [];
  }
}

const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;
/** Distance haversine (km) entre deux points. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Ordre de passage nearest-neighbor depuis un point de départ. Renvoie les index ordonnés. */
export function nearestNeighborOrder(start: LatLng, points: (LatLng | null)[]): number[] {
  const n = points.length;
  const visited = new Array(n).fill(false);
  const order: number[] = [];
  let cur = start;
  for (let step = 0; step < n; step++) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i] || !points[i]) continue;
      const d = distanceKm(cur, points[i]!);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best === -1) break;
    visited[best] = true; order.push(best); cur = points[best]!;
  }
  // Ajoute à la fin les points non géocodés (ordre d'origine).
  for (let i = 0; i < n; i++) if (!visited[i]) order.push(i);
  return order;
}

export type DrivingLeg = { km: number; min: number };

/** Trajets routiers réels (distance + durée AVEC trafic) le long d'un ordre donné.
 *  Utilise Google Directions (departure_time=now, traffic_model=best_guess) SANS réordonner.
 *  Renvoie null si pas de clé GOOGLE_MAPS_API_KEY ou en cas d'erreur -> fallback haversine. */
export async function drivingLegsGoogle(ordered: LatLng[]): Promise<DrivingLeg[] | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || ordered.length < 2) return null;
  try {
    const origin = ordered[0];
    const dest = ordered[ordered.length - 1];
    const mid = ordered.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join("|");
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}`
      + (mid ? `&waypoints=${encodeURIComponent(mid)}` : "")
      + `&departure_time=now&traffic_model=best_guess&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const legs = json?.routes?.[0]?.legs;
    if (!Array.isArray(legs) || !legs.length) return null;
    return legs.map((l: { distance?: { value: number }; duration?: { value: number }; duration_in_traffic?: { value: number } }) => ({
      km: Math.round(((l.distance?.value ?? 0) / 1000) * 10) / 10,
      min: Math.round(((l.duration_in_traffic?.value ?? l.duration?.value ?? 0) / 60)),
    }));
  } catch {
    return null;
  }
}

export { AGENCY_ADDRESS };

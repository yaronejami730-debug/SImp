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

export { AGENCY_ADDRESS };

// Recherche d'un véhicule à partir de sa plaque.
//
// Il n'existe pas d'accès libre au SIV : la donnée passe par un fournisseur. Plutôt que de
// coder un prestataire en dur, on lit une URL modèle dans l'environnement et on mappe la
// réponse par alias de champs — changer de fournisseur ne demande aucune modification de code.
//
//   PLAQUE_API_URL   ex. https://xxx.p.rapidapi.com/?immatriculation={plaque}
//   PLAQUE_API_KEY   clé du fournisseur ({cle} dans l'URL si le service la veut en paramètre)
//   PLAQUE_API_HOST  facultatif : force l'en-tête X-RapidAPI-Host
//
// Les hôtes RapidAPI (*.p.rapidapi.com) sont reconnus : la clé part alors dans X-RapidAPI-Key.

/** Quota restant chez le fournisseur, lu dans les en-têtes RapidAPI. */
export type Quota = { limite: number | null; restant: number | null };

export type Vehicule = {
  plaque: string;
  marque: string;
  modele: string;
  finition: string;
  couleur: string;
  energie: string;
  miseEnCirculation: string;
  puissance: string;
  vin: string;
  kilometrage: string;
  carrosserie: string;
  boiteVitesses: string;
  cylindree: string;
  genre: string;
  brut: Record<string, unknown>;
};

/** Plaque normalisée : majuscules, sans séparateurs (AB123CD). */
export function normalisePlaque(v: string): string {
  return (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Plaque affichée : AB-123-CD (format SIV) ou telle quelle si ancien format. */
export function formatePlaque(v: string): string {
  const p = normalisePlaque(v);
  const siv = /^([A-Z]{2})(\d{3})([A-Z]{2})$/.exec(p);
  return siv ? `${siv[1]}-${siv[2]}-${siv[3]}` : p;
}

/** Première valeur non vide parmi plusieurs noms de champs possibles. */
function champ(source: Record<string, unknown>, alias: string[]): string {
  for (const a of alias) {
    for (const [cle, valeur] of Object.entries(source)) {
      if (cle.toLowerCase().replace(/[^a-z0-9]/g, "") !== a) continue;
      if (valeur === null || valeur === undefined || valeur === "") continue;
      const texte = String(valeur).trim();
      if (!texte || texte.toUpperCase() === "INCONNU") continue;
      return texte;
    }
  }
  return "";
}

/** Aplatit la réponse : les fournisseurs nichent souvent sous data / vehicule / result. */
function aplatit(o: unknown, sortie: Record<string, unknown> = {}, profondeur = 0): Record<string, unknown> {
  if (!o || typeof o !== "object" || profondeur > 4) return sortie;
  for (const [cle, valeur] of Object.entries(o as Record<string, unknown>)) {
    if (valeur && typeof valeur === "object" && !Array.isArray(valeur)) aplatit(valeur, sortie, profondeur + 1);
    else if (sortie[cle] === undefined) sortie[cle] = valeur;
  }
  return sortie;
}

let dernierQuota: Quota = { limite: null, restant: null };
const nombreEntete = (v: string | null) => (v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Quota constaté lors du dernier appel réellement passé au fournisseur. */
export function quotaFournisseur(): Quota {
  return dernierQuota;
}

export function fournisseurConfigure(): boolean {
  return !!process.env.PLAQUE_API_URL;
}

export async function chercheVehicule(plaqueSaisie: string): Promise<Vehicule> {
  const plaque = normalisePlaque(plaqueSaisie);
  if (plaque.length < 6) throw new Error("Plaque invalide.");

  const modele = process.env.PLAQUE_API_URL;
  if (!modele) throw new Error("Aucun fournisseur de données véhicule configuré (PLAQUE_API_URL).");

  const cle = process.env.PLAQUE_API_KEY ?? "";
  const url = modele.replace("{plaque}", encodeURIComponent(plaque)).replace("{cle}", encodeURIComponent(cle));

  const hote = new URL(url).host;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cle && hote.endsWith(".p.rapidapi.com")) {
    headers["X-RapidAPI-Key"] = cle;
    headers["X-RapidAPI-Host"] = process.env.PLAQUE_API_HOST || hote;
  } else if (cle) {
    headers.Authorization = `Bearer ${cle}`;
  }

  const r = await fetch(url, { headers, cache: "no-store" });
  dernierQuota = {
    limite: nombreEntete(r.headers.get("x-ratelimit-requests-limit")),
    restant: nombreEntete(r.headers.get("x-ratelimit-requests-remaining")),
  };
  if (!r.ok) {
    const detail = (await r.text().catch(() => "")).slice(0, 180);
    if (r.status === 401 || r.status === 403) throw new Error(`Accès refusé par le fournisseur (HTTP ${r.status}) — clé ou abonnement à vérifier. ${detail}`);
    throw new Error(`Fournisseur indisponible (HTTP ${r.status}). ${detail}`);
  }

  const plat = aplatit(await r.json());

  const v: Vehicule = {
    plaque: formatePlaque(plaque),
    marque: champ(plat, ["awnmarque", "marque", "make", "brand", "marquevehicule"]),
    modele: champ(plat, ["awnmodele", "modele", "model", "gamme", "awnmodeleetude", "modelevehicule"]),
    finition: champ(plat, ["awnfinition", "finition", "awnversion", "version", "trim", "serie", "phase"]),
    couleur: champ(plat, ["awncouleur", "couleur", "color", "couleurvehicule"]),
    energie: champ(plat, ["awnenergie", "energie", "carburant", "fuel", "fueltype"]),
    miseEnCirculation: champ(plat, ["awndatemiseencirculation", "datemisecirculation", "datemiseencirculation", "date1miseencirculation", "firstregistrationdate", "annee", "year"]),
    puissance: champ(plat, ["awnpuissancechevaux", "puissancechevaux", "awnpuissancefiscale", "puissancefiscale", "puissance", "cv", "power"]),
    vin: champ(plat, ["awnvin", "vin", "numeroserie", "chassis", "numerochassis"]),
    kilometrage: champ(plat, ["kilometrage", "km", "mileage"]),
    carrosserie: champ(plat, ["awnstylecarrosserie", "awncarrosserie", "carrosserie", "bodytype"]),
    boiteVitesses: champ(plat, ["awntypeboitevites", "boitevitesses", "gearbox", "transmission"]),
    cylindree: champ(plat, ["awnnbrcylindreenergie", "cylindree", "displacement"]),
    genre: champ(plat, ["awngenrelabel", "awngenre", "genre"]),
    brut: plat,
  };

  if (!v.marque && !v.modele) throw new Error("Aucun véhicule trouvé pour cette plaque.");
  return v;
}

// ---------- Cache ----------
// Les caractéristiques d'un véhicule ne changent pas : une plaque déjà interrogée est
// resservie depuis la base, sans consommer de requête chez le fournisseur.

import { getPool } from "./db";

export async function lisCache(plaqueSaisie: string): Promise<Vehicule | null> {
  const plaque = normalisePlaque(plaqueSaisie);
  try {
    const { rows } = await getPool().query(`select vehicule from plaque_cache where plaque = $1`, [plaque]);
    return rows[0] ? (rows[0].vehicule as Vehicule) : null;
  } catch {
    return null; // table absente ou base indisponible : on retombe sur l'appel direct
  }
}

export async function ecrisCache(v: Vehicule): Promise<void> {
  try {
    await getPool().query(
      `insert into plaque_cache (plaque, vehicule) values ($1, $2)
       on conflict (plaque) do update set vehicule = excluded.vehicule, created_at = now()`,
      [normalisePlaque(v.plaque), JSON.stringify(v)],
    );
  } catch { /* le cache est un confort, jamais un bloquant */ }
}

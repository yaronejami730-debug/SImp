import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { chercheVehicule, fournisseurConfigure, lisCache, ecrisCache, quotaFournisseur } from "@/lib/plaque";

export const dynamic = "force-dynamic";

/**
 * GET ?plaque=AB123CD -> caractéristiques du véhicule. Connecté requis.
 * Le cache est servi en priorité : le quota du fournisseur n'est consommé que pour une
 * plaque jamais interrogée (ou avec ?force=1 pour rafraîchir volontairement).
 */
export async function GET(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const plaque = params.get("plaque") ?? "";
  const force = params.get("force") === "1";
  if (!plaque.trim()) return NextResponse.json({ error: "Plaque manquante." }, { status: 400 });

  if (!force) {
    const cache = await lisCache(plaque);
    if (cache) return NextResponse.json({ ok: true, vehicule: cache, source: "cache" });
  }

  if (!fournisseurConfigure()) {
    return NextResponse.json({ error: "Recherche par plaque non configurée (PLAQUE_API_URL)." }, { status: 503 });
  }

  try {
    const vehicule = await chercheVehicule(plaque);
    await ecrisCache(vehicule);
    return NextResponse.json({ ok: true, vehicule, source: "fournisseur", quota: quotaFournisseur() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur.", quota: quotaFournisseur() }, { status: 502 });
  }
}

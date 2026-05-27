import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { scrapePvSearch } from "@/lib/scrape-paruvendu";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST { url, max? } -> scrape une URL de résultats paru-vendu (particuliers seulement). */
export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  let body: { url?: string; max?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url || !/paruvendu\.fr/i.test(url)) {
    return NextResponse.json(
      { error: "URL paru-vendu requise (https://www.paruvendu.fr/...)." },
      { status: 400 },
    );
  }

  try {
    const out = await scrapePvSearch(url, Math.min(body.max ?? 25, 50));
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur scraping." },
      { status: 500 },
    );
  }
}

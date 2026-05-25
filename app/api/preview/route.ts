import { NextResponse } from "next/server";
import { platformFromUrl } from "@/lib/parse";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function meta(html: string, key: string): string | null {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, "i");
  const m = html.match(re1) ?? html.match(re2);
  return m ? decode(m[1]) : null;
}

/** Aperçu via microlink (rendu headless, contourne DataDome de LeBonCoin). */
async function viaMicrolink(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    const j = await r.json();
    if (j.status !== "success") return null;
    const d = j.data ?? {};
    const image = d.image?.url ?? d.logo?.url ?? null;
    return { title: d.title ?? null, image, description: d.description ?? null };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Aperçu par fetch direct + balises Open Graph (fallback). */
async function viaDirect(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "text/html",
      },
      redirect: "follow",
    });
    const html = (await res.text()).slice(0, 600_000);
    const title = meta(html, "og:title") ?? (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null);
    return { title: title ? decode(title) : null, image: meta(html, "og:image"), description: meta(html, "og:description") };
  } catch {
    return null;
  }
}

/** GET ?url= -> aperçu (titre véhicule, image, plateforme). */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ ok: false, error: "URL invalide." }, { status: 400 });
  }

  const platform = platformFromUrl(url);
  const isGood = (t?: string | null) => !!t && !/^leboncoin\.fr$/i.test(t);

  // microlink en priorité (gère LeBonCoin), sinon fetch direct.
  const m = await viaMicrolink(url);
  if (m && isGood(m.title)) return NextResponse.json({ ok: true, platform, ...m });

  const d = await viaDirect(url);
  const best = isGood(d?.title) ? d : (m ?? d);
  return NextResponse.json({
    ok: true,
    platform,
    title: best?.title ?? null,
    image: best?.image ?? null,
    description: best?.description ?? null,
  });
}

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
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`,
    "i",
  );
  const m = html.match(re1) ?? html.match(re2);
  return m ? decode(m[1]) : null;
}

/** GET ?url= -> aperçu Open Graph du lien (titre, image, plateforme). */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ ok: false, error: "URL invalide." }, { status: 400 });
  }

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

    const title =
      meta(html, "og:title") ??
      (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null);
    const image = meta(html, "og:image");
    const description = meta(html, "og:description");

    return NextResponse.json({
      ok: true,
      platform: platformFromUrl(url),
      title: title ? decode(title) : null,
      image,
      description,
    });
  } catch {
    return NextResponse.json({ ok: false, platform: platformFromUrl(url) });
  }
}

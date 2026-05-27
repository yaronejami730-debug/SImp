const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPv(url: string, referer?: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "fr-FR,fr;q=0.9",
      ...(referer ? { referer } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return new TextDecoder("windows-1252").decode(buf);
}

function extractListingUrls(searchHtml: string): string[] {
  const re =
    /https:\/\/www\.paruvendu\.fr\/a\/voiture-occasion\/[a-z0-9-]+\/[a-z0-9-]+\/[A-Za-z0-9]+/g;
  return [...new Set(searchHtml.match(re) ?? [])];
}

export type PvResult = {
  url: string;
  title: string;
  brand: string;
  model: string;
  price: number | null;
  km: number | null;
  year: number | null;
  sellerName: string;
  sellerPhone: string;
  city: string;
  postalCode: string;
  isPro: boolean;
};

type JsonLd = {
  "@type"?: string;
  name?: string;
  brand?: string | { name?: string };
  model?: string | { name?: string };
  dateVehicleFirstRegistered?: string;
  mileageFromOdometer?: { value?: number };
  offers?: {
    price?: number;
    seller?: {
      "@type"?: string;
      name?: string;
      telephone?: string;
      address?: { addressLocality?: string; postalCode?: string };
    };
  };
};

function parseListing(url: string, html: string): PvResult | null {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data: JsonLd;
  try {
    data = JSON.parse(m[1]) as JsonLd;
  } catch {
    return null;
  }
  if (data["@type"] !== "Vehicle") return null;

  const offers = data.offers ?? {};
  const seller = offers.seller ?? {};
  const addr = seller.address ?? {};
  const sellerType = (seller["@type"] ?? "").toLowerCase();
  // AutoDealer / Organization / LocalBusiness => pro. Person / null => particulier.
  const isPro = ["autodealer", "organization", "localbusiness", "store"].includes(sellerType);

  return {
    url,
    title: data.name ?? "",
    brand: typeof data.brand === "string" ? data.brand : data.brand?.name ?? "",
    model: typeof data.model === "string" ? data.model : data.model?.name ?? "",
    price: typeof offers.price === "number" ? offers.price : null,
    km: typeof data.mileageFromOdometer?.value === "number" ? data.mileageFromOdometer.value : null,
    year: data.dateVehicleFirstRegistered
      ? Number(String(data.dateVehicleFirstRegistered).slice(0, 4)) || null
      : null,
    sellerName: seller.name ?? "",
    sellerPhone: seller.telephone ?? "",
    city: addr.addressLocality ?? "",
    postalCode: addr.postalCode ?? "",
    isPro,
  };
}

/** Scrape une URL de résultats paru-vendu et renvoie les annonces de particuliers.
 *  Délai 1.2-1.8s entre chaque listing pour éviter le rate-limit anti-bot. */
export async function scrapePvSearch(
  searchUrl: string,
  max = 25,
): Promise<{
  results: PvResult[];
  errors: string[];
  totalFound: number;
  skippedPros: number;
  blocked: number;
}> {
  const html = await fetchPv(searchUrl);
  const urls = extractListingUrls(html).slice(0, max);
  const results: PvResult[] = [];
  const errors: string[] = [];
  let skippedPros = 0;
  let blocked = 0;

  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (i > 0) await sleep(1200 + Math.random() * 600);
    try {
      const lh = await fetchPv(u, searchUrl);
      // Page < 80KB sans JSON-LD = page mur anti-bot.
      if (lh.length < 80_000 && !lh.includes("application/ld+json")) {
        blocked++;
        continue;
      }
      const p = parseListing(u, lh);
      if (!p) {
        blocked++;
        continue;
      }
      if (p.isPro) {
        skippedPros++;
        continue;
      }
      results.push(p);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return { results, errors, totalFound: urls.length, skippedPros, blocked };
}

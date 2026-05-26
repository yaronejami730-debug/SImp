import { getPool } from "./db";

export const BRANDS = [
  "Volkswagen", "VW", "Mercedes", "Mercedes-Benz", "Toyota", "BYD", "Tesla", "Audi",
  "BMW", "Peugeot", "Renault", "Citroën", "Citroen", "DS", "Ford", "Hyundai", "Kia",
  "Skoda", "Škoda", "Seat", "Cupra", "Polestar", "Nissan", "Mazda", "Honda", "Volvo",
  "Fiat", "Opel", "MINI", "Mini", "Dacia", "Suzuki", "Jeep", "Land Rover", "Range Rover",
  "Porsche", "Lexus", "Alfa Romeo", "Alfa", "Smart", "Mitsubishi", "Subaru", "Jaguar",
];

const BRAND_CANON: Record<string, string> = {
  vw: "Volkswagen",
  "mercedes-benz": "Mercedes",
  citroen: "Citroën",
  "škoda": "Skoda",
  mini: "MINI",
  alfa: "Alfa Romeo",
  "range rover": "Land Rover",
};

export type ScanRow = {
  id: number;
  url: string;
  platform: string;
  title: string | null;
  price_eur: number | null;
  km: number | null;
  year: number | null;
  brand: string | null;
  location: string | null;
  image_url: string | null;
  is_pro: boolean;
  email_subject: string | null;
  email_received_at: string;
  dismissed: boolean;
  created_at: string;
};

export type ParsedListing = {
  url: string;
  platform: string;
  title: string | null;
  price_eur: number | null;
  km: number | null;
  year: number | null;
  brand: string | null;
  location: string | null;
  image_url: string | null;
  is_pro: boolean;
};

function detectBrand(text: string): string | null {
  const lower = text.toLowerCase();
  for (const b of BRANDS) {
    const re = new RegExp(`\\b${b.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) {
      return BRAND_CANON[b.toLowerCase()] ?? b;
    }
  }
  return null;
}

function stripTags(s: string): string {
  // Convert block-closing tags to newlines first so text segments stay separated.
  return s
    .replace(/<(?:br|\/p|\/h\d|\/div|\/td|\/tr|\/span|\/li|\/a)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&euro;/g, "€")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Strip tracking params
    [...u.searchParams.keys()].forEach((k) => {
      if (/^(utm_|at_|xtor|mtm_|_ga|gclid|fbclid|ref|trackingsource)/i.test(k)) u.searchParams.delete(k);
    });
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

function extractNumber(s: string, re: RegExp): number | null {
  const m = s.match(re);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function firstImage(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function extractAnchorText(html: string, rawUrl: string): string | null {
  // Match <a href="rawUrl"...>...</a> and return inner text.
  const escaped = rawUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<a[^>]*href=["']${escaped}["'][^>]*>([\\s\\S]{0,800}?)<\\/a>`, "i");
  const m = html.match(re);
  if (!m) return null;
  const t = stripTags(m[1]).replace(/\n/g, " ").trim();
  if (!t || t.length < 4 || !/[A-Za-zÀ-ÿ]{3,}/.test(t)) return null;
  return t.slice(0, 140);
}

const LISTING_PATTERNS = [
  { platform: "LeBonCoin", re: /https?:\/\/(?:www\.)?leboncoin\.fr\/(?:ad\/voitures\/|voitures\/)(\d+)(?:\.htm)?[^"'\s<>]*/gi },
  { platform: "LaCentrale", re: /https?:\/\/(?:www\.)?lacentrale\.fr\/auto-occasion-annonce-[^"'\s<>]+/gi },
  { platform: "ParuVendu", re: /https?:\/\/(?:www\.)?paruvendu\.fr\/[^"'\s<>]*?(?:auto|voitur)[^"'\s<>]*/gi },
];

export function parseAlertEmail(opts: { from?: string; subject?: string; html?: string; text?: string }): ParsedListing[] {
  const html = opts.html ?? opts.text ?? "";
  if (!html) return [];
  const seen = new Set<string>();
  const out: ParsedListing[] = [];

  for (const { platform, re } of LISTING_PATTERNS) {
    re.lastIndex = 0;
    const matches: Array<{ raw: string; index: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      matches.push({ raw: m[0], index: m.index, end: m.index + m[0].length });
    }

    for (let i = 0; i < matches.length; i++) {
      const { raw, index } = matches[i];
      const url = cleanUrl(raw);
      if (seen.has(url)) continue;
      seen.add(url);

      // LBC/LaCentrale/ParuVendu alert mails put the URL FIRST, then content. Window = (URL.end, next URL.index).
      const blockStart = matches[i].end;
      const blockEnd = i < matches.length - 1 ? matches[i + 1].index : html.length;
      const block = html.slice(blockStart, blockEnd);
      void index;
      const ctx = stripTags(block);

      // Title: prefer anchor inner text; fallback = first reasonable line of ctx.
      let title: string | null = extractAnchorText(block, raw);
      if (!title) {
        const lines = ctx.split("\n").map((s) => s.trim()).filter((s) => s.length > 4 && s.length < 140 && /[A-Za-zÀ-ÿ]{3,}/.test(s) && !/^\s*\d+\s*(€|km)/i.test(s));
        title = lines[0] ?? null;
      }
      // Strip stray attribute closers / quotes that leak when URL sits right before its anchor's text.
      if (title) title = title.replace(/^[">\s]+/, "").replace(/[<\s]+$/, "").trim() || null;

      const image = firstImage(block);
      const price = extractNumber(ctx, /(\d{1,3}(?:[\s.]\d{3})+|\d{4,6})\s*€/);
      const km = extractNumber(ctx, /(\d{1,3}(?:[\s.]\d{3})+|\d{4,6})\s*km/i);
      const year = extractNumber(ctx, /\b(19[89]\d|20[0-3]\d)\b/);
      const brand = detectBrand((title ?? "") + " " + ctx);

      // Pro vs particulier on the block only (no bleed).
      const isPro = /\b(pro|professionnel|garage|concession)\b/i.test(ctx) && !/\bparticulier\b/i.test(ctx);

      const locMatch = ctx.match(/\b(\d{5})\s+([A-ZÉÈÀÂÎÔÛ][A-Za-zÀ-ÿ\-\s]{2,30})\b/) ?? ctx.match(/\b([A-ZÉÈÀÂÎÔÛ][A-Za-zÀ-ÿ\-]{2,30})\s*\(\d{2,3}\)/);
      const location = locMatch ? locMatch[0].trim().replace(/\s+/g, " ") : null;

      out.push({
        url,
        platform,
        title,
        price_eur: price,
        km,
        year,
        brand,
        location,
        image_url: image,
        is_pro: isPro,
      });
    }
  }
  return out;
}

export async function insertListings(items: ParsedListing[], emailSubject: string | null): Promise<number> {
  if (items.length === 0) return 0;
  const pool = getPool();
  let inserted = 0;
  for (const it of items) {
    const r = await pool.query(
      `insert into scan_results (url, platform, title, price_eur, km, year, brand, location, image_url, is_pro, email_subject)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (url) do nothing`,
      [it.url, it.platform, it.title, it.price_eur, it.km, it.year, it.brand, it.location, it.image_url, it.is_pro, emailSubject],
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}

export type ListFilters = {
  brands?: string[];
  maxKm?: number;
  minYear?: number;
  particulierOnly?: boolean;
  includeDismissed?: boolean;
  limit?: number;
};

export async function listScans(f: ListFilters = {}): Promise<ScanRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!f.includeDismissed) where.push(`dismissed = false`);
  if (f.brands && f.brands.length > 0) {
    params.push(f.brands);
    where.push(`brand = ANY($${params.length})`);
  }
  if (typeof f.maxKm === "number") {
    params.push(f.maxKm);
    where.push(`(km is null or km <= $${params.length})`);
  }
  if (typeof f.minYear === "number") {
    params.push(f.minYear);
    where.push(`(year is null or year >= $${params.length})`);
  }
  if (f.particulierOnly) where.push(`is_pro = false`);
  const sql = `select * from scan_results ${where.length ? "where " + where.join(" and ") : ""} order by email_received_at desc limit ${f.limit ?? 200}`;
  const { rows } = await getPool().query<ScanRow>(sql, params);
  return rows;
}

export async function dismissScan(id: number): Promise<void> {
  await getPool().query(`update scan_results set dismissed = true where id = $1`, [id]);
}

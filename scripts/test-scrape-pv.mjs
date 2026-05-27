// Test direct du scraper paru-vendu (URL home → particuliers uniquement).

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPv(url, referer) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html",
      "accept-language": "fr-FR,fr;q=0.9",
      ...(referer ? { referer } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { size: buf.length, html: new TextDecoder("windows-1252").decode(buf) };
}

function extractUrls(html) {
  const re = /https:\/\/www\.paruvendu\.fr\/a\/voiture-occasion\/[a-z0-9-]+\/[a-z0-9-]+\/[A-Za-z0-9]+/g;
  return [...new Set(html.match(re) ?? [])];
}

function parseListing(url, html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch { return null; }
  if (data["@type"] !== "Vehicle") return null;
  const offers = data.offers ?? {};
  const seller = offers.seller ?? {};
  const addr = seller.address ?? {};
  const sellerType = (seller["@type"] ?? "").toLowerCase();
  const isPro = ["autodealer","organization","localbusiness","store"].includes(sellerType);
  return {
    url,
    title: data.name ?? "",
    sellerType: seller["@type"] ?? "",
    sellerName: seller.name ?? "",
    sellerPhone: seller.telephone ?? "",
    city: addr.addressLocality ?? "",
    isPro,
  };
}

const searchUrl = process.argv[2] || "https://www.paruvendu.fr/";
const MAX = Number(process.argv[3] ?? 8);
console.log("Scraping:", searchUrl, "max=", MAX);

const search = await fetchPv(searchUrl);
const urls = extractUrls(search.html).slice(0, MAX);
console.log(`Annonces détectées: ${urls.length}`);

const results = [];
let blocked = 0;
for (let i = 0; i < urls.length; i++) {
  const u = urls[i];
  if (i > 0) await sleep(1200 + Math.random() * 600);
  try {
    const { size, html: lh } = await fetchPv(u, searchUrl);
    if (size < 80_000 && !lh.includes("application/ld+json")) {
      console.log(`[${i+1}/${urls.length}] BLOCKED (${size}b)`);
      blocked++;
      continue;
    }
    const p = parseListing(u, lh);
    if (p) {
      console.log(`[${i+1}/${urls.length}] ${p.isPro ? "PRO" : "PART"} ${p.sellerPhone} ${p.title}`);
      results.push(p);
    } else {
      console.log(`[${i+1}/${urls.length}] NO_VEHICLE_JSONLD`);
    }
  } catch (e) { console.error("err", u, e.message); }
}
console.log(`\nblocked: ${blocked}`);

console.table(results.map(r => ({
  type: r.sellerType,
  isPro: r.isPro,
  name: r.sellerName.slice(0, 30),
  phone: r.sellerPhone,
  city: r.city,
  title: r.title.slice(0, 30),
})));

const particuliers = results.filter(r => !r.isPro);
console.log(`\nParticuliers: ${particuliers.length} / ${results.length}`);

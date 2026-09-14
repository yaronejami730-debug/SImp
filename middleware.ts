import { NextResponse, type NextRequest } from "next/server";

/** Route un slug d'agence en préfixe d'URL vers la page normale, sans changer de compte :
 *  /simplicicar-paris-17e/agenda sert la même page que /agenda, avec le thème et le contexte
 *  de cette agence posés en cookies (agence_slug, agence_cc_id, agence_theme) — lisibles par
 *  AppShell (branding) et par les pages qui voudront s'en servir pour filtrer leurs données.
 *
 *  Le lookup slug -> call center passe par une API interne (pas d'accès direct à Postgres
 *  depuis le runtime edge) et se cache brièvement en mémoire pour éviter un aller-retour à
 *  chaque navigation. */

// 5 min était trop court : le cache est PAR INSTANCE (edge), donc avec beaucoup d'instances
// froides ça revenait à quasi-toujours un aller-retour réseau à chaque navigation. Un slug
// change en pratique jamais tout seul (action admin explicite) -> TTL long, sans risque réel.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const cache = new Map<string, { at: number; data: { callCenterId: number; name: string; theme: unknown } | null }>();

async function resolveSlug(origin: string, slug: string) {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  let data: { callCenterId: number; name: string; theme: unknown } | null = null;
  try {
    const res = await fetch(`${origin}/api/agence-slug/${encodeURIComponent(slug)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.ok) data = { callCenterId: json.callCenterId, name: json.name, theme: json.theme };
    }
  } catch {
    data = null;
  }
  cache.set(slug, { at: Date.now(), data });
  return data;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const seg = pathname.split("/")[1] || "";
  if (!seg) return NextResponse.next();

  const resolved = await resolveSlug(req.nextUrl.origin, seg);
  if (!resolved) return NextResponse.next(); // pas un slug connu -> routage normal

  // pathname.slice(seg.length + 1) inclut déjà le "/" suivant (ou est vide à la racine du slug) —
  // ne PAS en reprépendre un, sinon on obtient "//agenda" (404).
  const afterSeg = pathname.slice(seg.length + 1);
  const url = req.nextUrl.clone();
  url.pathname = afterSeg || "/";

  const response = NextResponse.rewrite(url);
  const opts = { path: "/", sameSite: "lax" as const };
  response.cookies.set("agence_slug", seg, opts);
  response.cookies.set("agence_cc_id", String(resolved.callCenterId), opts);
  response.cookies.set("agence_theme", JSON.stringify(resolved.theme ?? null), opts);
  return response;
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|logo.png|.*\\..*).*)"],
};

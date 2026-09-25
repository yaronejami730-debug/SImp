import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Plateformes configurées (LeBonCoin, LaCentrale, Lead, une agence prospectée...) — sert de
 *  liste gérée pour le champ `platform` des RDV et pour l'affiliation d'un téléprospecteur
 *  (voir /api/accords-telepro). Toute personne connectée peut lire ; seul l'admin gère la liste. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const { rows } = await getPool().query<{ id: number; name: string; active: boolean }>(
      `select id, name, active from platforms order by active desc, name`,
    );
    return NextResponse.json({ ok: true, platforms: rows.map((r) => ({ ...r, id: Number(r.id) })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { action:"create", name } | { action:"toggle", id } -> admin uniquement. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
  try {
    const b = (await req.json()) as { action?: "create" | "toggle"; name?: string; id?: number };
    if (b.action === "toggle") {
      if (!b.id) return NextResponse.json({ error: "id requis." }, { status: 400 });
      await getPool().query(`update platforms set active = not active where id = $1`, [b.id]);
      return NextResponse.json({ ok: true });
    }
    const name = (b.name || "").trim();
    if (!name) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
    await getPool().query(`insert into platforms (name) values ($1) on conflict (name) do update set active = true`, [name]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

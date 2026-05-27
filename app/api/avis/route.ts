import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST { rating, q_accueil?, q_recommande?, commentaire?, firstName?, lastName?, email? } */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }

  const rating = Number(body.rating);
  if (!rating || rating < 1 || rating > 5) return NextResponse.json({ error: "Note entre 1 et 5 requise." }, { status: 400 });

  try {
    await getPool().query(
      `insert into reviews (first_name, last_name, email, rating, q_accueil, q_recommande, commentaire)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        String(body.firstName ?? "").trim(),
        String(body.lastName ?? "").trim(),
        String(body.email ?? "").trim(),
        rating,
        String(body.q_accueil ?? "").trim(),
        String(body.q_recommande ?? "").trim(),
        String(body.commentaire ?? "").trim(),
      ],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

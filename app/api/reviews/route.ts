import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

type Review = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  vehicle: string;
  rating: number;
  q_accueil: string;
  q_recommande: string;
  commentaire: string;
  created_at: string;
};

/** GET → liste des avis (étoiles + commentaires). Admin uniquement. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Réservé à l'admin." }, { status: 403 });

  try {
    const { rows } = await getPool().query<Review>(
      `select id, first_name, last_name, email, coalesce(vehicle,'') as vehicle, rating, q_accueil, q_recommande, commentaire, created_at
       from reviews order by created_at desc limit 500`,
    );
    const count = rows.length;
    const avg = count ? rows.reduce((s, r) => s + r.rating, 0) / count : 0;
    return NextResponse.json({ ok: true, reviews: rows, count, avg });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

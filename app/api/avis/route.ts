import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifyReview } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST { rating, q_accueil?, q_recommande?, commentaire?, t? }
 *  Le token `t` (lien d'avis du mail) identifie le client. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }

  const rating = Number(body.rating);
  if (!rating || rating < 1 || rating > 5) return NextResponse.json({ error: "Note entre 1 et 5 requise." }, { status: 400 });

  // Identité du client via le token signé du lien d'avis (sinon valeurs du body / anonyme).
  const id = body.t ? verifyReview(String(body.t)) : null;
  const firstName = id?.firstName ?? String(body.firstName ?? "");
  const lastName = id?.lastName ?? String(body.lastName ?? "");
  const email = id?.email ?? String(body.email ?? "");
  const vehicle = id?.vehicle ?? String(body.vehicle ?? "");

  try {
    await getPool().query(
      `insert into reviews (first_name, last_name, email, vehicle, rating, q_accueil, q_recommande, commentaire)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        firstName.trim(),
        lastName.trim(),
        email.trim(),
        vehicle.trim(),
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

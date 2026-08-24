import { NextResponse } from "next/server";
import { getAuth, signToken } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST { id } -> jeton de connexion AU NOM d'un autre compte. Admin uniquement.
 *  Sert au support : voir l'application exactement comme la personne la voit. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const { id } = (await req.json()) as { id?: number };
    if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });

    const { rows } = await getPool().query(
      `select email, name, role, call_center_id, is_commercial, is_teleprospector, active from users where id = $1`,
      [id],
    );
    const u = rows[0];
    if (!u) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
    if (u.active === false) return NextResponse.json({ error: "Ce compte est désactivé." }, { status: 400 });

    const session = {
      email: u.email as string,
      name: u.name as string,
      role: u.role as "admin" | "responsable" | "collab",
      callCenterId: Number(u.call_center_id ?? 1),
      isCommercial: !!u.is_commercial,
      isTeleprospector: !!u.is_teleprospector,
    };
    return NextResponse.json({ ok: true, token: signToken(session), user: session });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

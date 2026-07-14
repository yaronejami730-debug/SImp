import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { createUser } from "@/lib/users";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** TÉLÉPROSPECTEURS PERSONNELS du commercial : il les recrute, les gère (activer/
 *  désactiver/supprimer) ; ils ne réservent QUE pour lui (personal_commercial_email). */

/** GET -> mes télépros persos + leur activité (nb RDV, signés). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const { rows } = await getPool().query(
      `select u.id, u.name, u.username, u.active,
              coalesce(a.total, 0)::int as total_rdv,
              coalesce(a.signed, 0)::int as signed_rdv
         from users u
         left join lateral (
           select count(*) as total,
                  count(*) filter (where sign_status = 'signed' and not mandat_removed) as signed
             from appointments ap
            where lower(ap.owner) = lower(u.email) and not ap.cancelled
         ) a on true
        where lower(u.personal_commercial_email) = lower($1)
        order by u.name`,
      [s.email],
    );
    return NextResponse.json({ ok: true, telepros: rows.map((r) => ({ ...r, id: Number(r.id) })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { action:"add", name, username, password } | { action:"toggle", id, active } | { action:"remove", id } */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as { action?: string; name?: string; username?: string; password?: string; id?: number; active?: boolean };
    const pool = getPool();
    if (b.action === "add") {
      if (!b.name?.trim() || !b.username?.trim() || !b.password?.trim()) {
        return NextResponse.json({ error: "Nom, pseudo et mot de passe requis." }, { status: 400 });
      }
      const u = await createUser({
        name: b.name, username: b.username, password: b.password,
        role: "collab", callCenterId: s.callCenterId, isTeleprospector: true, isCommercial: false,
        commissionBase: 0, commissionPct: 0, // rémunéré via l'accord "Mes paiements" du commercial
      });
      await pool.query(`update users set personal_commercial_email = lower($1) where id = $2`, [s.email, u.id]);
      return NextResponse.json({ ok: true, user: { id: u.id, name: u.name, username: u.username } });
    }
    // toggle / remove : uniquement MES télépros persos.
    const own = await pool.query(`select id from users where id = $1 and lower(personal_commercial_email) = lower($2)`, [b.id, s.email]);
    if (!own.rows.length) return NextResponse.json({ error: "Téléprospecteur introuvable." }, { status: 404 });
    if (b.action === "toggle") {
      await pool.query(`update users set active = $2 where id = $1`, [b.id, b.active !== false]);
    } else if (b.action === "remove") {
      await pool.query(`delete from users where id = $1 and role = 'collab'`, [b.id]);
    } else {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur.";
    return NextResponse.json({ error: /duplicate|unique/i.test(msg) ? "Ce pseudo existe déjà." : msg }, { status: 500 });
  }
}

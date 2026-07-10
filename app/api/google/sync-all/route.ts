import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { syncUser } from "@/lib/google-sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST (Bearer CRON_SECRET) -> synchronise TOUS les utilisateurs connectés à Google.
 *  Appelé par Supabase pg_cron (pas de cron Vercel). */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  try {
    const { rows } = await getPool().query<{ user_email: string }>(
      `select user_email from google_connections where sync_state in ('connected','error')`,
    );
    const results: Record<string, string> = {};
    for (const r of rows) {
      try {
        // Le nom sert au matching "commercial par nom" : on le lit depuis users.
        const u = await getPool().query<{ name: string }>(`select name from users where lower(email) = $1`, [r.user_email]);
        const res = await syncUser(r.user_email, u.rows[0]?.name ?? "");
        results[r.user_email] = `+${res.pushed} ~${res.updated} ←${res.pulledBack} -${res.removed}${res.errors.length ? ` !${res.errors.length}` : ""}`;
      } catch (e) {
        results[r.user_email] = `ERR ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    return NextResponse.json({ ok: true, users: rows.length, results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Accords passés avec un téléprospecteur INDÉPENDANT (sans call center) :
 *  un commercial le paie directement pour chaque rendez-vous qu'il lui apporte.
 *  Stocké dans remuneration_accords avec payee_kind = 'telepro' et call_center_id = null. */

/** GET -> accords indépendants actifs, avec les noms lisibles. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const { rows } = await getPool().query(
      `select r.id, r.commercial_email, r.payee_email, r.base_eur, r.pct_nego, r.sold_eur, r.sold_pct, r.trigger_kind, r.label,
              c.name as commercial_name, t.name as telepro_name
         from remuneration_accords r
         left join users c on lower(c.email) = lower(r.commercial_email)
         left join users t on lower(t.email) = lower(r.payee_email)
        where r.payee_kind = 'telepro' and r.call_center_id is null and r.active
        order by r.id desc`,
    );
    return NextResponse.json({ ok: true, accords: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { commercialEmail, teleproEmail, baseEur, pctNego, trigger } -> crée (ou remplace) l'accord. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      commercialEmail?: string; teleproEmail?: string;
      baseEur?: number; pctNego?: number; trigger?: "signed" | "honored"; label?: string;
    };
    if (!b.commercialEmail?.trim() || !b.teleproEmail?.trim()) {
      return NextResponse.json({ error: "Commercial et téléprospecteur requis." }, { status: 400 });
    }
    const base = Number(b.baseEur ?? 0);
    const pct = Number(b.pctNego ?? 0);
    if (base <= 0 && pct <= 0) {
      return NextResponse.json({ error: "Indique au moins un montant fixe ou un pourcentage." }, { status: 400 });
    }
    const payer = b.commercialEmail.trim().toLowerCase();
    const payee = b.teleproEmail.trim().toLowerCase();
    const trig = b.trigger === "honored" ? "honored" : "signed";
    const pool = getPool();

    // Renégocier remplace l'accord précédent de ce couple, sans perdre l'historique.
    await pool.query(
      `update remuneration_accords set active = false
        where payee_kind = 'telepro' and call_center_id is null and active
          and lower(commercial_email) = $1 and lower(payee_email) = $2`,
      [payer, payee],
    );
    const { rows } = await pool.query(
      `insert into remuneration_accords (call_center_id, commercial_email, payee_email, payee_kind, base_eur, pct_nego, trigger_kind, payer_email, label)
       values (null, $1, $2, 'telepro', $3, $4, $5, $1, $6) returning id`,
      [payer, payee, base, pct, trig, (b.label ?? "").trim() || "Accord direct avec un téléprospecteur indépendant"],
    );
    return NextResponse.json({ ok: true, id: rows[0]?.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> désactive l'accord (la trace est conservée). */
export async function DELETE(req: Request) {
  const s = getAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    await getPool().query(`update remuneration_accords set active = false where id = $1 and payee_kind = 'telepro'`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

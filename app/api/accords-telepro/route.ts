import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { setTiers, type Tier, type TierMode } from "@/lib/remuneration";

export const dynamic = "force-dynamic";

/** Affiliation d'un téléprospecteur INDÉPENDANT (sans call center) — le cœur du moteur de
 *  rémunération unique : soit affilié à un COMMERCIAL précis (qui le paie directement, pour
 *  chaque RDV qu'il lui apporte), soit à une PLATEFORME (payé par la structure, pour chaque RDV
 *  signé sous cette plateforme) — mutuellement exclusifs. Un seul accord actif à la fois par
 *  téléprospecteur (voir POST : la renégociation remplace). Sans affiliation, un téléprospecteur
 *  reste sur son barème par défaut (users.commission_base/commission_pct).
 *  Stocké dans remuneration_accords avec payee_kind = 'telepro' et call_center_id = null. */

/** GET ?email= (admin uniquement) -> accords indépendants actifs, avec les noms lisibles.
 *  Admin sans ?email : tous. Téléprospecteur : uniquement les siens (il en est le bénéficiaire). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (s.role !== "admin" && !s.isTeleprospector) return NextResponse.json({ error: "Réservé admin ou téléprospecteur." }, { status: 403 });
  try {
    const filtreEmail = s.role === "admin" ? new URL(req.url).searchParams.get("email") : s.email;
    const { rows } = await getPool().query(
      `select r.id, r.commercial_email, r.platform, r.payee_email, r.base_eur, r.pct_nego, r.sold_eur, r.sold_pct, r.sold_pct_base, r.trigger_kind, r.label,
              r.tier_mode, c.name as commercial_name, t.name as telepro_name,
              coalesce(
                (select json_agg(json_build_object('minCount', ti.min_count, 'amountEur', ti.amount_eur, 'pctNego', ti.pct_nego) order by ti.min_count)
                   from remuneration_tiers ti where ti.accord_id = r.id),
                '[]'
              ) as tiers
         from remuneration_accords r
         left join users c on lower(c.email) = lower(r.commercial_email)
         left join users t on lower(t.email) = lower(r.payee_email)
        where r.payee_kind = 'telepro' and r.call_center_id is null and r.active
          ${filtreEmail ? "and lower(r.payee_email) = lower($1)" : ""}
        order by r.id desc`,
      filtreEmail ? [filtreEmail] : [],
    );
    return NextResponse.json({ ok: true, accords: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { commercialEmail? | platform?, teleproEmail, baseEur, pctNego, trigger } -> crée (ou
 *  remplace) l'affiliation. Exactement UN des deux : commercialEmail (payé par ce commercial) ou
 *  platform (payé par la structure). Admin : pour n'importe quel téléprospecteur. Téléprospecteur :
 *  uniquement pour lui-même (teleproEmail envoyé ignoré, forcé à son propre e-mail). */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (s.role !== "admin" && !s.isTeleprospector) return NextResponse.json({ error: "Réservé admin ou téléprospecteur." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      commercialEmail?: string; platform?: string; teleproEmail?: string;
      baseEur?: number; pctNego?: number; trigger?: "signed" | "honored"; label?: string;
      soldEur?: number; soldPct?: number; soldPctBase?: "negocie" | "plusvalue";
      tierMode?: TierMode; tiers?: Tier[];
    };
    const teleproEmail = s.role === "admin" ? b.teleproEmail : s.email;
    const commercialEmail = (b.commercialEmail || "").trim().toLowerCase();
    const platform = (b.platform || "").trim();
    if (!teleproEmail?.trim()) return NextResponse.json({ error: "Téléprospecteur requis." }, { status: 400 });
    if (!commercialEmail && !platform) return NextResponse.json({ error: "Choisis une plateforme ou un commercial précis." }, { status: 400 });
    if (commercialEmail && platform) return NextResponse.json({ error: "Choisis une SEULE affiliation : plateforme OU commercial, pas les deux." }, { status: 400 });
    const base = Number(b.baseEur ?? 0);
    const pct = Number(b.pctNego ?? 0);
    const soldEur = Number(b.soldEur ?? 0);
    const soldPct = Number(b.soldPct ?? 0);
    const soldPctBase = b.soldPctBase === "plusvalue" ? "plusvalue" : "negocie";
    if (base <= 0 && pct <= 0 && soldEur <= 0 && soldPct <= 0) {
      return NextResponse.json({ error: "Indique au moins un montant fixe ou un pourcentage." }, { status: 400 });
    }
    const payer = commercialEmail; // plateforme = payé par la structure -> payer_email vide
    const payee = teleproEmail.trim().toLowerCase();
    const trig = b.trigger === "honored" ? "honored" : "signed";
    const pool = getPool();

    // Renégocier remplace l'affiliation précédente de ce téléprospecteur (une seule à la fois).
    await pool.query(
      `update remuneration_accords set active = false
        where payee_kind = 'telepro' and call_center_id is null and active and lower(payee_email) = $1`,
      [payee],
    );
    const { rows } = await pool.query(
      `insert into remuneration_accords (call_center_id, commercial_email, platform, payee_email, payee_kind, base_eur, pct_nego, sold_eur, sold_pct, sold_pct_base, trigger_kind, payer_email, label)
       values (null, $1, $2, $3, 'telepro', $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
      [commercialEmail, platform || null, payee, base, pct, soldEur, soldPct, soldPctBase, trig, payer,
        (b.label ?? "").trim() || (platform ? `Affilié à la plateforme ${platform}` : "Accord direct avec un téléprospecteur indépendant")],
    );
    const accordId = rows[0]?.id as number;
    const tierMode: TierMode = b.tierMode === "threshold" || b.tierMode === "progressive" ? b.tierMode : "none";
    if (accordId && tierMode !== "none" && Array.isArray(b.tiers) && b.tiers.length) {
      await setTiers(accordId, tierMode, b.tiers.map((t) => ({ minCount: Number(t.minCount) || 0, amountEur: Number(t.amountEur) || 0, pctNego: Number(t.pctNego) || 0 })));
    }
    return NextResponse.json({ ok: true, id: accordId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> désactive l'accord (la trace est conservée).
 *  Admin : n'importe lequel. Téléprospecteur : uniquement le sien. */
export async function DELETE(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (s.role !== "admin" && !s.isTeleprospector) return NextResponse.json({ error: "Réservé admin ou téléprospecteur." }, { status: 403 });
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    if (s.role === "admin") {
      await getPool().query(`update remuneration_accords set active = false where id = $1 and payee_kind = 'telepro'`, [id]);
    } else {
      await getPool().query(`update remuneration_accords set active = false where id = $1 and payee_kind = 'telepro' and lower(payee_email) = lower($2)`, [id, s.email]);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { sendAgencyProposalEmail, DEFAULT_PROSPECTION_PRICES, DEFAULT_SIGNATAIRE, type ProspectionPrices, type Signataire } from "@/lib/yj-prospection";

export const dynamic = "force-dynamic";

/** Prospection AGENCE (B2B) — réservé au super-admin. Liste de contacts d'agences à démarcher,
 *  envoi de la proposition commerciale au nom de YJ Solutions (jamais Simplicicar). Chaque
 *  contact a un token public (lien "cadrage de vos besoins", voir /agence-mes-besoins/[token]). */

type Prospect = {
  id: number; name: string; email: string; phone: string; token: string;
  created_at: string; last_sent_at: string | null; last_sent_prices: ProspectionPrices | null;
  needs_answers: Record<string, string> | null; needs_raw: string | null; needs_submitted_at: string | null;
};

export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé au super-admin." }, { status: 403 });
  try {
    const { rows } = await getPool().query<Prospect>(
      `select id, name, email, phone, token, created_at, last_sent_at, last_sent_prices,
              needs_answers, needs_raw, needs_submitted_at
         from agency_prospects where active order by created_at desc`,
    );
    return NextResponse.json({ ok: true, prospects: rows, defaultPrices: DEFAULT_PROSPECTION_PRICES });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé au super-admin." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      action?: "create" | "send";
      name?: string; email?: string; phone?: string;
      id?: number; civility?: string; prices?: Partial<ProspectionPrices>; signataire?: Signataire;
    };
    const pool = getPool();

    if (b.action === "send") {
      if (!b.id) return NextResponse.json({ error: "Contact requis." }, { status: 400 });
      const { rows } = await pool.query<{ id: number; name: string; email: string; token: string }>(
        `select id, name, email, token from agency_prospects where id = $1 and active`, [b.id],
      );
      const prospect = rows[0];
      if (!prospect) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
      const prices: ProspectionPrices = {
        citadine: Number(b.prices?.citadine ?? DEFAULT_PROSPECTION_PRICES.citadine),
        suv: Number(b.prices?.suv ?? DEFAULT_PROSPECTION_PRICES.suv),
        premium: Number(b.prices?.premium ?? DEFAULT_PROSPECTION_PRICES.premium),
        lead: Number(b.prices?.lead ?? DEFAULT_PROSPECTION_PRICES.lead),
      };
      const signataire: Signataire = {
        name: (b.signataire?.name || DEFAULT_SIGNATAIRE.name).trim(),
        title: (b.signataire?.title || DEFAULT_SIGNATAIRE.title).trim(),
        phone: (b.signataire?.phone || "").trim(),
      };
      const base = (process.env.APP_URL ?? "https://agenda-rdv.vercel.app").replace(/\/$/, "");
      const result = await sendAgencyProposalEmail({
        to: prospect.email, toName: prospect.name, name: prospect.name,
        civility: (b.civility || "Monsieur").trim(), prices, signataire,
        needsUrl: `${base}/agence-mes-besoins/${prospect.token}`,
      });
      await pool.query(
        `update agency_prospects set last_sent_at = now(), last_sent_prices = $2 where id = $1`,
        [prospect.id, JSON.stringify(prices)],
      );
      return NextResponse.json({ ok: true, messageId: result.messageId });
    }

    // action "create" (ou défaut)
    const name = (b.name || "").trim();
    const email = (b.email || "").trim().toLowerCase();
    const phone = (b.phone || "").trim();
    if (!name || !email) return NextResponse.json({ error: "Nom et e-mail requis." }, { status: 400 });
    await pool.query(
      `insert into agency_prospects (name, email, phone, created_by, token) values ($1,$2,$3,$4,$5)`,
      [name, email, phone, s.email, randomBytes(16).toString("hex")],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé au super-admin." }, { status: 403 });
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    await getPool().query(`update agency_prospects set active = false, deleted_at = now() where id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

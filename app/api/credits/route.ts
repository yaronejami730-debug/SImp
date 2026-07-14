import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getBalance, listTransactions, listPacks, credit } from "@/lib/credits";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET -> soldes + packs + historique + conso 30 j de l'utilisateur courant. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const [balance, transactions, packs] = await Promise.all([getBalance(s.email), listTransactions(s.email), listPacks()]);
  const cutoff = Date.now() - 30 * 86400e3;
  const conso30 = transactions
    .filter((t) => t.kind === "consume" && new Date(t.created_at).getTime() > cutoff)
    .reduce((acc, t) => ({ sms: acc.sms - t.sms_delta, email: acc.email - t.email_delta }), { sms: 0, email: 0 });
  return NextResponse.json({ ok: true, balance, transactions, packs, conso30, stripeReady: !!process.env.STRIPE_SECRET_KEY });
}

/** POST :
 *  { action:"checkout", packId }  -> session Stripe Checkout (URL de paiement)
 *  { action:"grant", email, sms, emailQty } -> attribution manuelle (admin) */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as { action?: string; packId?: number; email?: string; sms?: number; emailQty?: number };

    if (b.action === "grant") {
      if (s.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
      if (!b.email?.trim()) return NextResponse.json({ error: "email requis." }, { status: 400 });
      await credit(b.email, "grant", Number(b.sms ?? 0), Number(b.emailQty ?? 0), "", `Attribué par ${s.name}`);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "checkout" && b.packId) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) return NextResponse.json({ error: "Paiement bientôt disponible (Stripe non configuré). Demande à l'admin de créditer ton compte." }, { status: 400 });
      const pack = (await listPacks()).find((p) => p.id === Number(b.packId));
      if (!pack) return NextResponse.json({ error: "Pack introuvable." }, { status: 404 });
      const base = process.env.GOOGLE_REDIRECT_BASE ?? "https://www.simplicicar.store";
      // Stripe Checkout via API REST (pas de SDK) — metadata pour créditer au webhook.
      const params = new URLSearchParams({
        mode: "payment",
        success_url: `${base}/credits?paid=1`,
        cancel_url: `${base}/credits?cancel=1`,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "eur",
        "line_items[0][price_data][unit_amount]": String(pack.price_cents),
        "line_items[0][price_data][product_data][name]": `${pack.name} — ${pack.sms_qty} SMS + ${pack.email_qty} emails`,
        "metadata[user_email]": s.email,
        "metadata[pack_id]": String(pack.id),
        "metadata[sms_qty]": String(pack.sms_qty),
        "metadata[email_qty]": String(pack.email_qty),
      });
      const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const d = await r.json();
      if (!r.ok) return NextResponse.json({ error: d?.error?.message ?? "Erreur Stripe." }, { status: 500 });
      return NextResponse.json({ ok: true, url: d.url });
    }

    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { credit } from "@/lib/credits";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Webhook Stripe : checkout.session.completed -> crédite le portefeuille.
 *  Signature vérifiée (HMAC-SHA256, schéma Stripe v1), idempotent par payment_intent. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook non configuré." }, { status: 400 });
  const sig = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  // stripe-signature: t=...,v1=...
  const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t; const v1 = parts.v1;
  if (!t || !v1) return NextResponse.json({ error: "Signature manquante." }, { status: 400 });
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected); const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) {
    return NextResponse.json({ error: "Signature expirée." }, { status: 400 });
  }

  try {
    const event = JSON.parse(payload) as { type: string; data: { object: { id: string; payment_intent?: string; metadata?: Record<string, string> } } };
    if (event.type === "checkout.session.completed") {
      const o = event.data.object;
      const m = o.metadata ?? {};
      if (m.user_email) {
        await credit(m.user_email, "purchase", Number(m.sms_qty ?? 0), Number(m.email_qty ?? 0),
          o.payment_intent ?? o.id, `Achat pack #${m.pack_id ?? "?"}`);
      }
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  const Stripe = require("stripe");
  return new Stripe(key);
}

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export const maxDuration = 60;

/** Handle Stripe Setup Intent events */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature") || "";
  let event;

  try {
    const body = await req.text();
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: "Webhook signature failed" }, { status: 400 });
  }

  const pool = getPool();

  try {
    if (event.type === "setup_intent.succeeded") {
      const setupIntent = event.data.object as any;
      const customerId = setupIntent.customer;
      const paymentMethodId = setupIntent.payment_method;

      // Get payment method details
      const stripe = getStripe();
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

      // Update customer with payment method
      await pool.query(
        `UPDATE stripe_customers
         SET stripe_payment_method_id = $1, payment_method_type = $2, payment_method_last4 = $3, updated_at = now()
         WHERE stripe_customer_id = $4`,
        [
          paymentMethodId,
          paymentMethod.type,
          paymentMethod.card?.last4 || null,
          customerId,
        ]
      );

      return NextResponse.json({ ok: true, message: "Payment method saved" });
    }

    if (event.type === "setup_intent.setup_failed") {
      const setupIntent = event.data.object as any;
      console.error("Setup intent failed:", setupIntent.id, setupIntent.last_setup_error);
      return NextResponse.json({ ok: true, message: "Setup failed recorded" });
    }

    return NextResponse.json({ ok: true, message: "Event received" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

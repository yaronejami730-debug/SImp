import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import Stripe from "stripe";

export const maxDuration = 60;

/** POST: create Stripe Checkout Session for card setup (Stripe Hosted) */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || (s.role === "collab" && !s.isCommercial)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    const pool = getPool();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Get or create Stripe customer
    let customerRes = await pool.query(
      "SELECT stripe_customer_id FROM stripe_customers WHERE commercial_email = $1",
      [s.email.toLowerCase()]
    );

    let customerId: string;
    if (customerRes.rows.length > 0) {
      customerId = customerRes.rows[0].stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: s.email.toLowerCase(),
        name: s.name,
        metadata: { callCenterId: s.callCenterId, commercialEmail: s.email.toLowerCase() },
      });
      customerId = customer.id;

      await pool.query(
        `INSERT INTO stripe_customers (call_center_id, commercial_email, stripe_customer_id)
         VALUES ($1, $2, $3)`,
        [s.callCenterId, s.email.toLowerCase(), customerId]
      );
    }

    // Create Stripe Checkout Session for setup (Stripe Hosted page)
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      success_url: `${process.env.APP_URL || "http://localhost:3000"}/paiements?setup=success`,
      cancel_url: `${process.env.APP_URL || "http://localhost:3000"}/paiements`,
      ui_mode: "hosted_page",
    });

    console.log("[Stripe Checkout Setup] Session created:", session.id);
    return NextResponse.json({
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Error";
    console.error("[Stripe Checkout Setup] Error:", errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

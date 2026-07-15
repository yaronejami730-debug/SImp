import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import Stripe from "stripe";

export const maxDuration = 60;

/** GET: check if payment method is registered */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s || (s.role === "collab" && !s.isCommercial)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pool = getPool();
    const res = await pool.query(
      "SELECT stripe_customer_id, stripe_payment_method_id, payment_method_type, payment_method_last4 FROM stripe_customers WHERE commercial_email = $1",
      [s.email.toLowerCase()]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ ok: true, hasPaymentMethod: false });
    }

    const row = res.rows[0];
    return NextResponse.json({
      ok: true,
      hasPaymentMethod: !!row.stripe_payment_method_id,
      paymentMethodType: row.payment_method_type,
      paymentMethodLast4: row.payment_method_last4,
      stripeCustomerId: row.stripe_customer_id,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/** POST: create Setup Intent to register card */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || (s.role === "collab" && !s.isCommercial)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pool = getPool();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

    // Check if customer already exists
    let customerRes = await pool.query(
      "SELECT stripe_customer_id FROM stripe_customers WHERE commercial_email = $1",
      [s.email.toLowerCase()]
    );

    let customerId: string;
    if (customerRes.rows.length > 0) {
      customerId = customerRes.rows[0].stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: s.email.toLowerCase(),
        name: s.name,
        metadata: { callCenterId: s.callCenterId, commercialEmail: s.email.toLowerCase() },
      });
      customerId = customer.id;

      // Store in DB
      await pool.query(
        `INSERT INTO stripe_customers (call_center_id, commercial_email, stripe_customer_id)
         VALUES ($1, $2, $3)`,
        [s.callCenterId, s.email.toLowerCase(), customerId]
      );
    }

    // Create Setup Intent
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session", // Allow future payments without user interaction
    });

    return NextResponse.json({
      ok: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/** DELETE: remove payment method */
export async function DELETE(req: Request) {
  const s = getAuth(req);
  if (!s || (s.role === "collab" && !s.isCommercial)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pool = getPool();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

    const res = await pool.query(
      "SELECT stripe_payment_method_id FROM stripe_customers WHERE commercial_email = $1",
      [s.email.toLowerCase()]
    );

    if (res.rows.length === 0 || !res.rows[0].stripe_payment_method_id) {
      return NextResponse.json({ error: "No payment method found" }, { status: 404 });
    }

    const paymentMethodId = res.rows[0].stripe_payment_method_id;

    // Detach from customer in Stripe
    await stripe.paymentMethods.detach(paymentMethodId);

    // Clear from DB
    await pool.query(
      "UPDATE stripe_customers SET stripe_payment_method_id = NULL, payment_method_type = NULL, payment_method_last4 = NULL, updated_at = now() WHERE commercial_email = $1",
      [s.email.toLowerCase()]
    );

    return NextResponse.json({ ok: true, message: "Payment method deleted" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

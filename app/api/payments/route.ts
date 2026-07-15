import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import Stripe from "stripe";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export const maxDuration = 60;

/** POST: create Stripe Payment Intent for selected invoices */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || (s.role === "collab" && !s.isCommercial)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { invoiceIds } = body;

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json({ error: "No invoices selected" }, { status: 400 });
    }

    const pool = getPool();

    // Get invoices
    const invoicesRes = await pool.query(
      `SELECT * FROM invoices WHERE id = ANY($1) AND status = 'pending'`,
      [invoiceIds]
    );

    if (invoicesRes.rows.length === 0) {
      return NextResponse.json({ error: "No valid invoices found" }, { status: 400 });
    }

    const invoices = invoicesRes.rows;

    // Verify ownership (commercial can only pay own invoices)
    if (s.role === "collab" && s.isCommercial) {
      if (!invoices.every(i => i.commercial_email.toLowerCase() === s.email.toLowerCase())) {
        return NextResponse.json({ error: "Access denied to invoices" }, { status: 403 });
      }
    }

    // Calculate total
    const total = invoices.reduce((sum, i) => sum + Number(i.amount), 0);

    // Get payment method if registered
    const stripeRes = await pool.query(
      "SELECT stripe_customer_id, stripe_payment_method_id FROM stripe_customers WHERE commercial_email = $1",
      [invoices[0].commercial_email.toLowerCase()]
    );

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
    const stripeCustomerId = stripeRes.rows[0]?.stripe_customer_id;
    const paymentMethodId = stripeRes.rows[0]?.stripe_payment_method_id;

    // Create Stripe Payment Intent
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100), // Stripe uses cents
      currency: "eur",
      customer: stripeCustomerId,
      payment_method: paymentMethodId || undefined,
      off_session: !!paymentMethodId, // Indicate it's off-session if using saved card
      confirm: !!paymentMethodId, // Auto-confirm if card is on file
      metadata: {
        invoiceIds: invoiceIds.join(","),
        commercialEmail: invoices[0].commercial_email,
        callCenterId: invoices[0].call_center_id,
      },
    });

    // Create payment record (pending)
    const paymentRes = await pool.query(
      `INSERT INTO payments (call_center_id, commercial_email, amount, stripe_payment_intent_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [invoices[0].call_center_id, invoices[0].commercial_email, total, intent.id]
    );

    const payment = paymentRes.rows[0];

    // Link invoices to payment
    const linkValues = invoices.map(i => `(${i.id}, ${payment.id})`).join(",");
    await pool.query(`INSERT INTO invoice_payments (invoice_id, payment_id) VALUES ${linkValues}`);

    return NextResponse.json({
      ok: true,
      clientSecret: intent.client_secret,
      intentId: intent.id,
      amount: total,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/** Stripe webhook handler */
export async function PUT(req: Request) {
  const sig = req.headers.get("stripe-signature") || "";
  let event;

  try {
    const body = await req.text();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: "Webhook signature failed" }, { status: 400 });
  }

  const pool = getPool();

  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as any;
      const intentId = intent.id;

      // Mark payment as succeeded
      await pool.query(
        `UPDATE payments SET status = 'succeeded', updated_at = now()
         WHERE stripe_payment_intent_id = $1`,
        [intentId]
      );

      // Get associated invoices
      const invoicesRes = await pool.query(
        `SELECT i.id FROM invoices i
         JOIN invoice_payments ip ON i.id = ip.invoice_id
         WHERE ip.payment_id = (SELECT id FROM payments WHERE stripe_payment_intent_id = $1)`,
        [intentId]
      );

      // Mark invoices as paid
      if (invoicesRes.rows.length > 0) {
        const invoiceIds = invoicesRes.rows.map(r => r.id);
        await pool.query(
          `UPDATE invoices SET status = 'paid', updated_at = now() WHERE id = ANY($1)`,
          [invoiceIds]
        );
      }

      return NextResponse.json({ ok: true, message: "Payment confirmed" });
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as any;

      // Mark payment as failed
      await pool.query(
        `UPDATE payments SET status = 'failed', updated_at = now()
         WHERE stripe_payment_intent_id = $1`,
        [intent.id]
      );

      return NextResponse.json({ ok: true, message: "Payment failed recorded" });
    }

    return NextResponse.json({ ok: true, message: "Event received" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

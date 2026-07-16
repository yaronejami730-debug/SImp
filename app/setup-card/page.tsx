"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

export const dynamic = "force-dynamic";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || "");
const PINK = "var(--brand-primary)";
const RED = "#dc2626";
const LINE = "#e8ebef";

function SetupForm({ clientSecret }: { clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || "Erreur");
      setLoading(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmSetup({
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/paiements?setup=success`,
      },
    });

    if (confirmError) {
      setError(confirmError.message || "Erreur");
      setLoading(false);
    }
    // If no error, Stripe will redirect
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 500, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Enregistrer votre carte</h1>
      <div style={{ padding: 16, border: `1px solid ${LINE}`, borderRadius: 8 }}>
        <PaymentElement options={{ layout: "tabs", wallets: { applePay: "auto", googlePay: "auto" } }} />
      </div>
      {error && <div style={{ fontSize: 13, color: RED }}>{error}</div>}
      <button
        type="submit"
        disabled={!stripe || loading}
        style={{
          padding: "12px 20px",
          borderRadius: 8,
          border: "none",
          background: PINK,
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          opacity: !stripe || loading ? 0.6 : 1,
        }}
      >
        {loading ? "Traitement..." : "Confirmer"}
      </button>
    </form>
  );
}

export default function SetupCardPage() {
  const searchParams = useSearchParams();
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const secret = searchParams.get("secret");
    if (secret) {
      setClientSecret(secret);
    }
    setLoading(false);
  }, [searchParams]);

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}>Chargement…</div>;
  if (!clientSecret) return <div style={{ textAlign: "center", padding: 40, color: RED }}>Setup Intent manquant</div>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <div style={{ padding: 40 }}>
        <SetupForm clientSecret={clientSecret} />
      </div>
    </Elements>
  );
}

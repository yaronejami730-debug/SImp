"use client";

import { useEffect, useState } from "react";
import { loadStripe, Stripe as StripeType } from "@stripe/stripe-js";
import { Elements, useStripe, useElements } from "@stripe/react-stripe-js";
import { authHeaders } from "@/lib/client";

let stripePromise: ReturnType<typeof loadStripe> | null = null;

function getStripePromise() {
  if (!stripePromise && process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY);
  }
  return stripePromise;
}

const PINK = "var(--brand-primary)";
const MUTED = "#64748b";
const GREEN = "#16a34a";
const RED = "#dc2626";
const LINE = "#e8ebef";

interface SetupStatus {
  hasPaymentMethod: boolean;
  paymentMethodType?: string;
  paymentMethodLast4?: string;
}

interface CardSetupFormProps {
  clientSecret: string;
  onSuccess: () => void;
}

function SetupRedirectButton({ clientSecret, onLoading }: { clientSecret: string; onLoading: (b: boolean) => void }) {
  const stripe = useStripe();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRedirect() {
    if (!stripe || !clientSecret) return;

    setLoading(true);
    onLoading(true);

    try {
      // Redirect to Stripe Hosted Setup
      const result = await stripe.confirmSetup({
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/paiements?setup=success`,
        },
        redirect: "always", // Force redirect to Stripe
      });

      if (result.error) {
        setError(result.error.message || "Erreur lors de la redirection");
        setLoading(false);
        onLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setLoading(false);
      onLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: MUTED, background: "#f0f4f8", padding: 12, borderRadius: 8 }}>
        ℹ️ Vous allez être redirigé vers Stripe pour enregistrer votre carte de manière sécurisée.
      </div>
      {error && <div style={{ fontSize: 13, color: RED }}>{error}</div>}
      <button
        onClick={handleRedirect}
        disabled={!stripe || loading || !clientSecret}
        style={{
          padding: "14px 20px",
          borderRadius: 8,
          border: "none",
          background: PINK,
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          opacity: !stripe || loading || !clientSecret ? 0.6 : 1,
        }}
      >
        {loading ? "Redirection vers Stripe..." : "Aller sur Stripe pour enregistrer"}
      </button>
    </div>
  );
}

export function StripeCardSetup() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);

  async function loadStatus() {
    try {
      const res = await fetch("/api/stripe-setup", { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) {
        setStatus(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function startSetup() {
    setCreating(true);
    try {
      const res = await fetch("/api/stripe-setup", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      console.log("Setup Intent response:", data);
      if (data.ok && data.clientSecret) {
        setClientSecret(data.clientSecret);
        setShowForm(true);
      } else {
        console.error("Setup error:", data.error);
        alert(data.error || "Erreur lors de la création du Setup Intent");
      }
    } catch (e) {
      console.error("Setup fetch error:", e);
      alert(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreating(false);
    }
  }

  async function deletePaymentMethod() {
    if (!confirm("Êtes-vous sûr? Votre carte sera supprimée.")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/stripe-setup", {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.ok) {
        setShowForm(false);
        loadStatus();
      } else {
        alert(data.error || "Erreur");
      }
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

  // Handle return from Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("setup") === "success") {
      loadStatus();
      setShowForm(false);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  if (loading) return null;

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#232323", fontFamily: "'Cabin',sans-serif" }}>
        Moyen de paiement
      </h2>

      {status?.hasPaymentMethod ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 12, background: "#efe", borderRadius: 8, fontSize: 13, color: GREEN, fontWeight: 600 }}>
            ✓ {status.paymentMethodType} enregistrée (•••• {status.paymentMethodLast4})
          </div>
          <button
            onClick={() => deletePaymentMethod()}
            disabled={deleting}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: `1.5px solid ${RED}`,
              background: "#fff",
              color: RED,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              opacity: deleting ? 0.6 : 1,
            }}
          >
            {deleting ? "Suppression..." : "Supprimer ma carte bancaire"}
          </button>
        </div>
      ) : showForm && clientSecret ? (
        <Elements stripe={getStripePromise()!}>
          <SetupRedirectButton clientSecret={clientSecret} onLoading={setCreating} />
        </Elements>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
            Enregistrez votre carte une fois pour payer plus rapidement. Aucun prélèvement automatique.
          </p>
          <button
            onClick={startSetup}
            disabled={creating}
            style={{
              padding: "14px 20px",
              borderRadius: 8,
              border: "none",
              background: PINK,
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              opacity: creating ? 0.6 : 1,
            }}
          >
            {creating ? "Initialisation..." : "Enregistrer ma carte bancaire"}
          </button>
        </div>
      )}
    </div>
  );
}

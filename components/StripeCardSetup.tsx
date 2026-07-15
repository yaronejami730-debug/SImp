"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { authHeaders } from "@/lib/client";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || "");
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

function CardSetupForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setError("");
    setLoading(true);

    try {
      // Create Setup Intent on server
      const res = await fetch("/api/stripe-setup", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!data.ok || !data.clientSecret) {
        setError(data.error || "Erreur lors de la création du Setup Intent");
        setLoading(false);
        return;
      }

      // Confirm setup with card element
      const result = await stripe.confirmCardSetup(data.clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
        },
      });

      if (result.error) {
        setError(result.error.message || "Erreur lors de l'enregistrement");
      } else {
        onSuccess();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <div style={{ padding: 16, border: `1.5px solid ${LINE}`, borderRadius: 8, background: "#fff" }}>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "14px",
                color: "#232323",
                "::placeholder": { color: MUTED },
              },
            },
          }}
        />
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
        {loading ? "Enregistrement..." : "Enregistrer la carte"}
      </button>
    </form>
  );
}

export function StripeCardSetup() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

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

  if (loading) return null;

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#232323", fontFamily: "'Cabin',sans-serif" }}>
        Moyen de paiement
      </h2>

      {status?.hasPaymentMethod ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 12, background: "#efe", borderRadius: 8, fontSize: 13, color: GREEN, fontWeight: 600 }}>
            ✓ Carte {status.paymentMethodType} enregistrée (•••• {status.paymentMethodLast4})
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
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
            Enregistrez une fois votre carte pour payer plus rapidement à l'avenir. Aucun prélèvement ne sera effectué.
          </p>

          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: "none",
                background: PINK,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Enregistrer ma carte bancaire
            </button>
          ) : (
            <Elements stripe={stripePromise}>
              <CardSetupForm
                onSuccess={() => {
                  setShowForm(false);
                  loadStatus();
                }}
              />
            </Elements>
          )}
        </div>
      )}
    </div>
  );
}

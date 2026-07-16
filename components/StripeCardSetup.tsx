"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/client";

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

export function StripeCardSetup() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
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

  async function startStripeCheckout() {
    setCreating(true);
    try {
      const res = await fetch("/api/stripe-checkout-setup", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      console.log("[Stripe Checkout] Response:", data);
      if (data.ok && data.checkoutUrl) {
        // Redirect to Stripe Checkout (Stripe Hosted page)
        window.location.href = data.checkoutUrl;
      } else {
        alert(data.error || "Erreur lors de la création de la session");
      }
    } catch (e) {
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
        loadStatus();
      } else {
        alert(data.error || "Erreur");
      }
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    loadStatus();
    // Check if returning from Stripe with setup=success
    const params = new URLSearchParams(window.location.search);
    if (params.get("setup") === "success") {
      // Clear the search param
      window.history.replaceState({}, "", window.location.pathname);
      // Reload status to show updated card info
      setTimeout(() => loadStatus(), 500);
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
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
            Enregistrez votre carte auprès de Stripe de manière sécurisée et chiffrée. Aucun prélèvement automatique.
          </p>
          <button
            onClick={startStripeCheckout}
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
            {creating ? "Redirection vers Stripe..." : "Enregistrer ma carte bancaire"}
          </button>
        </div>
      )}
    </div>
  );
}

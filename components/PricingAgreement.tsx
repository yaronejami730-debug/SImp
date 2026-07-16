"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/client";

const PINK = "var(--brand-primary)";
const GREEN = "#16a34a";
const RED = "#dc2626";
const ORANGE = "#f59e0b";
const GRAY = "#64748b";
const LINE = "#e8ebef";

interface Agreement {
  id: number;
  call_center_name: string;
  base_amount: number;
  gestionnaire_amount: number;
  call_center_amount: number;
  status: "pending_confirmation" | "active" | "rejected";
  confirmed_at: string | null;
}

export function PricingAgreement() {
  const [pending, setPending] = useState<Agreement[]>([]);
  const [active, setActive] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);

  useEffect(() => {
    loadAgreements();
  }, []);

  async function loadAgreements() {
    try {
      const res = await fetch("/api/pricing-agreements", { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) {
        const pending = data.agreements.filter((a: Agreement) => a.status === "pending_confirmation");
        const active = data.agreements.find((a: Agreement) => a.status === "active");
        setPending(pending);
        setActive(active || null);
      }
    } catch (e) {
      console.error("Failed to load agreements:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(agreementId: number, action: "confirm" | "reject") {
    setProcessing(agreementId);
    try {
      const res = await fetch("/api/pricing-agreements", {
        method: "PUT",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ agreementId, action }),
      });

      const data = await res.json();
      if (data.ok) {
        loadAgreements();
      } else {
        alert(data.error || "Erreur");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur");
    } finally {
      setProcessing(null);
    }
  }

  if (loading) return null;

  return (
    <>
      {/* Pending Agreements */}
      {pending.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#232323", fontFamily: "'Cabin',sans-serif" }}>
            Accords en attente
          </h2>
          <div style={{ display: "grid", gap: 12 }}>
            {pending.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  border: `1.5px solid ${ORANGE}`,
                  background: "#fffbf0",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div>
                  <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "#232323" }}>
                    {a.call_center_name}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 20, fontSize: 13, marginTop: 8 }}>
                    <div>
                      <span style={{ color: GRAY, fontSize: 12 }}>Base (vous)</span>
                      <br />
                      <strong style={{ color: "#232323" }}>{a.base_amount.toFixed(2)}€</strong>
                    </div>
                    <div>
                      <span style={{ color: GRAY, fontSize: 12 }}>Gestionnaire</span>
                      <br />
                      <strong style={{ color: "#232323" }}>{a.gestionnaire_amount.toFixed(2)}€</strong>
                    </div>
                    <div>
                      <span style={{ color: GRAY, fontSize: 12 }}>Call Center</span>
                      <br />
                      <strong style={{ color: "#232323" }}>{a.call_center_amount.toFixed(2)}€</strong>
                    </div>
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: GRAY }}>
                    Vous percevrez {a.base_amount.toFixed(2)}€ par rendez-vous signé
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                  <button
                    onClick={() => handleAction(a.id, "confirm")}
                    disabled={processing === a.id}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 6,
                      border: "none",
                      background: GREEN,
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      opacity: processing === a.id ? 0.6 : 1,
                    }}
                  >
                    {processing === a.id ? "..." : "Confirmer"}
                  </button>
                  <button
                    onClick={() => handleAction(a.id, "reject")}
                    disabled={processing === a.id}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 6,
                      border: `1.5px solid ${RED}`,
                      background: "#fff",
                      color: RED,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      opacity: processing === a.id ? 0.6 : 1,
                    }}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Agreement */}
      {active && (
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#232323", fontFamily: "'Cabin',sans-serif" }}>
            Accord actif
          </h2>
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              border: `1.5px solid ${GREEN}`,
              background: "#f0fdf4",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "#232323" }}>
                {active.call_center_name}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 20, fontSize: 13, marginTop: 8 }}>
                <div>
                  <span style={{ color: GRAY, fontSize: 12 }}>Base (vous)</span>
                  <br />
                  <strong style={{ color: GREEN }}>{active.base_amount.toFixed(2)}€</strong>
                </div>
                <div>
                  <span style={{ color: GRAY, fontSize: 12 }}>Gestionnaire</span>
                  <br />
                  <strong>{active.gestionnaire_amount.toFixed(2)}€</strong>
                </div>
                <div>
                  <span style={{ color: GRAY, fontSize: 12 }}>Call Center</span>
                  <br />
                  <strong>{active.call_center_amount.toFixed(2)}€</strong>
                </div>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: GREEN, fontWeight: 600 }}>
                ✓ Accord confirmé
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

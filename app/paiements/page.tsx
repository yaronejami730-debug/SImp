"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const MUTED = "#64748b";
const LINE = "#e8ebef";
const GREEN = "#16a34a";
const RED = "#dc2626";
const ORANGE = "#f59e0b";
const SURFACE = "#f8fafc";

type Invoice = {
  id: number;
  appointment_id: string;
  client_name: string;
  vehicle: string;
  amount: number;
  status: "pending" | "paid" | "cancelled" | "disputed";
  appointment_date: string;
  signed_date: string;
  created_at: string;
  updated_at: string;
};

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("fr-FR") : "-";

function PaiementsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<"pending" | "paid">("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices`, { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) {
        setInvoices(d.invoices);
      } else {
        setErr(d.error ?? "Erreur");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = invoices.filter(i => i.status === tab);
  const pending = invoices.filter(i => i.status === "pending");
  const paid = invoices.filter(i => i.status === "paid");
  const totalPending = pending.reduce((sum, i) => sum + i.amount, 0);
  const totalPaid = paid.reduce((sum, i) => sum + i.amount, 0);
  const selectedAmount = Array.from(selected).reduce((sum, id) => sum + (invoices.find(i => i.id === id)?.amount || 0), 0);

  async function checkout(invoiceIds: number[]) {
    if (invoiceIds.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ invoiceIds }),
      });
      const d = await res.json();
      if (d.ok && d.clientSecret) {
        alert(`Paiement initié!\n\nMontant: ${eur(d.amount)}\n\nRedirection vers Stripe en cours...`);
        setSelected(new Set());
        load();
      } else {
        alert(d.error ?? "Erreur");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: MUTED }}>Chargement…</div>;

  return (
    <Shell active="paiements">
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 24 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: NAVY, fontFamily: "'Cabin',sans-serif" }}>Mes paiements</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: MUTED }}>Gestion de vos factures et paiements</p>
        </header>

        {err && <div style={{ padding: 16, background: "#fee", border: `1px solid #fcc`, borderRadius: 8, color: RED, fontSize: 14 }}>{err}</div>}

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, color: MUTED, fontWeight: 600, marginBottom: 8 }}>Solde actuel</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: RED, marginBottom: 4 }}>{eur(totalPending)}</div>
            <div style={{ fontSize: 12, color: MUTED }}>À régler</div>
          </div>

          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, color: MUTED, fontWeight: 600, marginBottom: 8 }}>Déjà payé</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: GREEN, marginBottom: 4 }}>{eur(totalPaid)}</div>
            <div style={{ fontSize: 12, color: MUTED }}>Historique</div>
          </div>

          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, color: MUTED, fontWeight: 600, marginBottom: 8 }}>Statistiques</div>
            <div style={{ fontSize: 14, color: NAVY, marginBottom: 4 }}><strong>{pending.length}</strong> impayés</div>
            <div style={{ fontSize: 14, color: NAVY }}><strong>{paid.length}</strong> réglés</div>
          </div>
        </div>

        {/* Action Buttons */}
        {tab === "pending" && pending.length > 0 && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {selected.size > 0 && (
              <button
                onClick={() => checkout(Array.from(selected))}
                disabled={busy}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: ORANGE,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Régler {selectedAmount > 0 ? eur(selectedAmount) : ""}
              </button>
            )}
            <button
              onClick={() => checkout(pending.map(i => i.id))}
              disabled={busy}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: "none",
                background: PINK,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Régler le solde ({eur(totalPending)})
            </button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, borderBottom: `1px solid ${LINE}` }}>
          <button
            onClick={() => setTab("pending")}
            style={{
              padding: "12px 16px",
              border: "none",
              background: "transparent",
              borderBottom: tab === "pending" ? `3px solid ${PINK}` : "none",
              color: tab === "pending" ? PINK : MUTED,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            À payer ({pending.length})
          </button>
          <button
            onClick={() => setTab("paid")}
            style={{
              padding: "12px 16px",
              border: "none",
              background: "transparent",
              borderBottom: tab === "paid" ? `3px solid ${PINK}` : "none",
              color: tab === "paid" ? PINK : MUTED,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Réglés ({paid.length})
          </button>
        </div>

        {/* Table */}
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: MUTED }}>
              {tab === "pending" ? "Aucune facture en attente." : "Aucun paiement réglé."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${LINE}`, background: SURFACE }}>
                    {tab === "pending" && (
                      <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: NAVY }}>
                        <input
                          type="checkbox"
                          checked={selected.size > 0 && selected.size === pending.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelected(new Set(pending.map(i => i.id)));
                            } else {
                              setSelected(new Set());
                            }
                          }}
                        />
                      </th>
                    )}
                    <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: NAVY }}>Date</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: NAVY }}>Client</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: NAVY }}>Véhicule</th>
                    <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: NAVY }}>Montant</th>
                    <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: NAVY }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: `1px solid ${LINE}`, background: selected.has(inv.id) ? "#f0f8ff" : "transparent" }}>
                      {tab === "pending" && (
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={selected.has(inv.id)}
                            onChange={(e) => {
                              const newSel = new Set(selected);
                              if (e.target.checked) {
                                newSel.add(inv.id);
                              } else {
                                newSel.delete(inv.id);
                              }
                              setSelected(newSel);
                            }}
                          />
                        </td>
                      )}
                      <td style={{ padding: "12px 16px", color: NAVY }}>{fmtDate(inv.appointment_date)}</td>
                      <td style={{ padding: "12px 16px", color: NAVY, fontWeight: 600 }}>{inv.client_name}</td>
                      <td style={{ padding: "12px 16px", color: MUTED }}>{inv.vehicle || "-"}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", color: NAVY, fontWeight: 600 }}>{eur(inv.amount)}</td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: inv.status === "pending" ? "#fee" : "#efe",
                            color: inv.status === "pending" ? RED : GREEN,
                          }}
                        >
                          {inv.status === "pending" ? "À payer" : "Payé"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

export default function Page() {
  return <PaiementsPage />;
}

"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const PINK = "var(--brand-primary)";
const GRAY = "#64748b";
const GREEN = "#16a34a";
const RED = "#dc2626";
const LINE = "#e8ebef";

interface CallCenter { id: number; name: string; }
interface Commercial { id: number; name: string; email: string; }
interface Agreement {
  id: number;
  call_center_name: string;
  commercial_name: string;
  commercial_email: string;
  base_amount: number;
  gestionnaire_amount: number;
  call_center_amount: number;
  status: "pending_confirmation" | "active" | "rejected";
  confirmed_at: string | null;
  created_at: string;
}

export default function BaremesPage() {
  const [callCenters, setCallCenters] = useState<CallCenter[]>([]);
  const [selectedCC, setSelectedCC] = useState<string>("");
  const [commercials, setCommercials] = useState<Commercial[]>([]);
  const [selectedCommercial, setSelectedCommercial] = useState<string>("");
  const [baseAmount, setBaseAmount] = useState("");
  const [gestionnaireAmount, setGestionnaireAmount] = useState("");
  const [callCenterAmount, setCallCenterAmount] = useState("");
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadCallCenters();
    loadAgreements();
  }, []);

  useEffect(() => {
    if (selectedCC) loadCommercials();
  }, [selectedCC]);

  async function loadCallCenters() {
    try {
      const res = await fetch("/api/callcenters", { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) setCallCenters(data.callcenters || []);
    } catch (e) {
      console.error("Failed to load call centers:", e);
    }
  }

  async function loadCommercials() {
    try {
      const res = await fetch(`/api/users?callCenterId=${selectedCC}&role=commercial`, { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) setCommercials(data.users || []);
    } catch (e) {
      console.error("Failed to load commercials:", e);
    }
  }

  async function loadAgreements() {
    try {
      const res = await fetch(`/api/pricing-agreements`, { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) setAgreements(data.agreements || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!selectedCC || !selectedCommercial || !baseAmount || gestionnaireAmount === "" || callCenterAmount === "") {
      alert("Tous les champs obligatoires");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/pricing-agreements", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          callCenterId: parseInt(selectedCC),
          commercialId: parseInt(selectedCommercial),
          baseAmount: parseFloat(baseAmount),
          gestionnaireAmount: parseFloat(gestionnaireAmount),
          callCenterAmount: parseFloat(callCenterAmount),
        }),
      });

      const data = await res.json();
      if (data.ok) {
        alert("Accord créé avec succès");
        setBaseAmount("");
        setGestionnaireAmount("");
        setCallCenterAmount("");
        setSelectedCommercial("");
        loadAgreements();
      } else {
        alert(data.error || "Erreur lors de la création");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <Shell active="baremes"><div style={{ padding: 40, textAlign: "center" }}>Chargement...</div></Shell>;

  return (
    <Shell active="baremes" wide>
      <div style={{ maxWidth: 900 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, marginBottom: 24, border: `1px solid ${LINE}` }}>
          <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>Créer un accord</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Call Center</label>
            <select
              value={selectedCC}
              onChange={(e) => {
                setSelectedCC(e.target.value);
                setSelectedCommercial("");
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 6,
                border: `1px solid ${LINE}`,
                fontSize: 14,
              }}
            >
              <option value="">Sélectionner un call center</option>
              {callCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.name}
                </option>
              ))}
            </select>
          </div>

          {selectedCC && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Commercial</label>
              <select
                value={selectedCommercial}
                onChange={(e) => setSelectedCommercial(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: `1px solid ${LINE}`,
                  fontSize: 14,
                }}
              >
                <option value="">Sélectionner un commercial</option>
                {commercials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Base (Commercial)</label>
              <input type="number" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} placeholder="60" step="0.01" style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Gestionnaire</label>
              <input type="number" value={gestionnaireAmount} onChange={(e) => setGestionnaireAmount(e.target.value)} placeholder="30" step="0.01" style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Call Center</label>
              <input type="number" value={callCenterAmount} onChange={(e) => setCallCenterAmount(e.target.value)} placeholder="30" step="0.01" style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 14, boxSizing: "border-box" }} />
            </div>
          </div>

          <button onClick={handleCreate} disabled={creating || !selectedCommercial} style={{ padding: "12px 20px", borderRadius: 6, border: "none", background: PINK, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: creating ? 0.6 : 1 }}>
            {creating ? "Création..." : "Créer l'accord"}
          </button>
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: `1px solid ${LINE}` }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>Accords ({agreements.length})</h2>

          {agreements.length === 0 ? (
            <p style={{ color: GRAY, fontSize: 14 }}>Aucun accord créé</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e8ebef" }}>
                    <th style={{ textAlign: "left", padding: "12px 0", fontWeight: 600 }}>Call Center</th>
                    <th style={{ textAlign: "left", padding: "12px 0", fontWeight: 600 }}>Commercial</th>
                    <th style={{ textAlign: "center", padding: "12px 0", fontWeight: 600 }}>Base</th>
                    <th style={{ textAlign: "center", padding: "12px 0", fontWeight: 600 }}>Gest.</th>
                    <th style={{ textAlign: "center", padding: "12px 0", fontWeight: 600 }}>CC</th>
                    <th style={{ textAlign: "center", padding: "12px 0", fontWeight: 600 }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {agreements.map((a) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #e8ebef" }}>
                      <td style={{ padding: "12px 0" }}>{a.call_center_name}</td>
                      <td style={{ padding: "12px 0" }}>{a.commercial_name}</td>
                      <td style={{ textAlign: "center", padding: "12px 0", fontWeight: 600 }}>{a.base_amount.toFixed(2)}€</td>
                      <td style={{ textAlign: "center", padding: "12px 0", color: GRAY }}>{a.gestionnaire_amount.toFixed(2)}€</td>
                      <td style={{ textAlign: "center", padding: "12px 0", color: GRAY }}>{a.call_center_amount.toFixed(2)}€</td>
                      <td style={{ textAlign: "center", padding: "12px 0" }}>
                        <span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: a.status === "active" ? "#dffcf0" : a.status === "pending_confirmation" ? "#fef3c7" : "#fee2e2", color: a.status === "active" ? GREEN : a.status === "pending_confirmation" ? "#92400e" : RED }}>
                          {a.status === "pending_confirmation" ? "En attente" : a.status === "active" ? "Actif" : "Rejeté"}
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

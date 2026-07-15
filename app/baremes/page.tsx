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

type Comp = {
  id: number;
  commercial_email: string;
  commercial_name: string;
  commission_base: number;
  commission_pct: number;
  call_center_share_pct: number;
  total_signed_rdv: number;
  total_owed: number;
  total_paid: number;
};

const inp: React.CSSProperties = { padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${LINE}`, fontSize: 14, fontFamily: "inherit" };
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function BaremesPage() {
  const [comps, setComps] = useState<Comp[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [base, setBase] = useState(50);
  const [pct, setPct] = useState(10);
  const [share, setShare] = useState(50);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/commercial-compensation", { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) {
        setComps(d.compensations);
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

  async function saveComp() {
    if (!name.trim() || !email.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/commercial-compensation", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ commercialName: name, commercialEmail: email, commissionBase: base, commissionPct: pct, callCenterSharePct: share }),
      });
      const d = await res.json();
      if (d.ok) {
        setName("");
        setEmail("");
        setBase(50);
        setPct(10);
        setShare(50);
        setEdit(null);
        load();
      } else {
        alert(d.error ?? "Erreur");
      }
    } finally {
      setBusy(false);
    }
  }

  async function delComp(id: number) {
    if (!confirm("Supprimer ce barème ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/commercial-compensation?id=${id}`, { method: "DELETE", headers: authHeaders() });
      const d = await res.json();
      if (d.ok) {
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
    <Shell active="baremes">
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gap: 24 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: NAVY, fontFamily: "'Cabin',sans-serif" }}>Barèmes commerciaux</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: MUTED }}>Configuration de la rémunération : base € + % négociation + répartition</p>
        </header>

        {err && <div style={{ padding: 16, background: "#fee", border: `1px solid #fcc`, borderRadius: 8, color: RED, fontSize: 14 }}>{err}</div>}

        {/* Form ajout/edit */}
        <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: NAVY, fontFamily: "'Cabin',sans-serif" }}>
            {edit ? "Modifier" : "Ajouter"} un barème
          </h2>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>Nom commercial</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inp, width: "100%" }} placeholder="ex: Raphaël Dahan" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>Email (unique)</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inp, width: "100%" }} placeholder="ex: raphael@example.com" disabled={!!edit} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>Base € / signé</label>
                <input type="number" value={base} onChange={(e) => setBase(Number(e.target.value))} style={{ ...inp, width: "100%" }} min="0" max="500" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>% négociation</label>
                <input type="number" value={pct} onChange={(e) => setPct(Number(e.target.value))} style={{ ...inp, width: "100%" }} min="0" max="100" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>% Call Center</label>
                <input type="number" value={share} onChange={(e) => setShare(Number(e.target.value))} style={{ ...inp, width: "100%" }} min="0" max="100" />
                <p style={{ fontSize: 11, color: MUTED, margin: "6px 0 0" }}>Reste → Gestionnaire</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={saveComp}
                disabled={busy || !name.trim() || !email.trim()}
                style={{
                  padding: "12px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: PINK,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: busy || !name.trim() ? 0.6 : 1,
                }}
              >
                {edit ? "Enregistrer" : "Ajouter"}
              </button>
              {edit && (
                <button onClick={() => setEdit(null)} style={{ padding: "12px 24px", borderRadius: 8, border: `1.5px solid ${LINE}`, background: "#fff", color: NAVY, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Annuler
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Liste */}
        <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: NAVY, fontFamily: "'Cabin',sans-serif" }}>Commerciaux ({comps.length})</h2>
          {comps.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 14 }}>Aucun barème configuré.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {comps.map((c) => (
                <div key={c.id} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: 16, display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: NAVY }}>{c.commercial_name}</h3>
                    <p style={{ margin: 0, fontSize: 13, color: MUTED }}>{c.commercial_email}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,auto)", gap: 20, marginTop: 12, fontSize: 13 }}>
                      <div>
                        <span style={{ color: MUTED, fontSize: 12 }}>Base</span>
                        <br />
                        <strong style={{ color: NAVY }}>{c.commission_base} €</strong>
                      </div>
                      <div>
                        <span style={{ color: MUTED, fontSize: 12 }}>% Négo</span>
                        <br />
                        <strong style={{ color: NAVY }}>{c.commission_pct}%</strong>
                      </div>
                      <div>
                        <span style={{ color: MUTED, fontSize: 12 }}>Répartition</span>
                        <br />
                        <strong style={{ color: NAVY }}>CC {c.call_center_share_pct}% | G {100 - c.call_center_share_pct}%</strong>
                      </div>
                      <div>
                        <span style={{ color: MUTED, fontSize: 12 }}>Signés</span>
                        <br />
                        <strong style={{ color: GREEN }}>{c.total_signed_rdv}</strong>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button
                      onClick={() => {
                        setName(c.commercial_name);
                        setEmail(c.commercial_email);
                        setBase(c.commission_base);
                        setPct(c.commission_pct);
                        setShare(c.call_center_share_pct);
                        setEdit(c.id);
                      }}
                      style={{ padding: "8px 16px", borderRadius: 6, border: `1.5px solid ${PINK}`, background: "#fff", color: PINK, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => delComp(c.id)}
                      style={{ padding: "8px 16px", borderRadius: 6, border: `1.5px solid ${RED}`, background: "#fff", color: RED, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}

export default BaremesPage;

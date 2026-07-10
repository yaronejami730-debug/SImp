"use client";

import { useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";
import { BRAND_LIST, CAR_CATALOG } from "@/lib/car-catalog";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const TEAL = "#24B9D7";

const FUELS = ["Essence", "Diesel", "Hybride", "Hybride rechargeable", "Électrique", "GPL"];
const GEARBOX = ["Manuelle", "Automatique"];
const CT_OPTIONS = ["OK sans défaut", "OK avec contre-visite levée", "Défavorable", "Pas encore passé"];
const CONDITIONS = ["Comme neuf", "Très bon", "Bon", "Correct", "À réparer"];

type Report = {
  score: number; potential: string; demand: string;
  knownIssues: string[]; pros: string[]; cons: string[];
  sellTime: string;
  priceRange: { low: number; mid: number; high: number; comment: string };
  advice: string; risk: number; margin: number; resaleEase: number;
  conclusion: string;
};

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Recherche() {
  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [fuel, setFuel] = useState("");
  const [finish, setFinish] = useState("");
  const [year, setYear] = useState("");
  const [km, setKm] = useState("");
  const [gearbox, setGearbox] = useState("");
  const [owners, setOwners] = useState("1");
  const [history, setHistory] = useState("");
  const [ct, setCt] = useState("");
  const [color, setColor] = useState("");
  const [condition, setCondition] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState("");

  async function uploadCG(file: File) {
    setOcrBusy(true); setOcrMsg(""); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/recherche/carte-grise", { method: "POST", headers: authHeaders(), body: fd });
      const d = await r.json();
      if (!d.ok) { setErr(d.error ?? "OCR échoué"); return; }
      const x = d.data as { brand?: string; commercialModel?: string; fuel?: string; year?: number };
      const filled: string[] = [];
      if (x.brand) { setBrand(x.brand); filled.push("marque"); }
      if (x.commercialModel) { setModel(x.commercialModel); filled.push("modèle"); }
      if (x.fuel) {
        const f = String(x.fuel).toLowerCase();
        const map = f.includes("diesel") || f === "go" ? "Diesel"
          : f.includes("essence") || f === "es" ? "Essence"
          : f.includes("élec") || f === "el" ? "Électrique"
          : f.includes("hybride rech") || f === "eh" ? "Hybride rechargeable"
          : f.includes("hybride") || f === "eh" ? "Hybride"
          : f.includes("gpl") ? "GPL" : "";
        if (map) { setFuel(map); filled.push("motorisation"); }
      }
      if (x.year) { setYear(String(x.year)); filled.push("année"); }
      setOcrMsg(`✅ Carte grise lue. Pré-rempli : ${filled.join(", ") || "(rien détecté)"}. Saute aux étapes restantes.`);
      // Pré-remplir = sauter aux étapes manquantes (finition + infos véhicule)
      setStep(x.brand && x.commercialModel && x.fuel ? 3 : x.brand ? 1 : 0);
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setOcrBusy(false); }
  }

  function reset() {
    setStep(0); setBrand(""); setModel(""); setFuel(""); setFinish("");
    setYear(""); setKm(""); setGearbox(""); setOwners("1"); setHistory("");
    setCt(""); setColor(""); setCondition(""); setReport(null); setErr("");
  }

  async function analyze() {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/recherche", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          brand, model, fuel, finish,
          year: Number(year), km: Number(km),
          gearbox, owners: Number(owners),
          history, ct, color, condition,
        }),
      });
      const d = await r.json();
      if (d.ok) { setReport(d.report); setStep(5); }
      else setErr(d.error ?? "Erreur");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 14 };
  const stepTitle: React.CSSProperties = { fontFamily: "'Cabin',sans-serif", fontSize: 22, color: NAVY, textTransform: "uppercase", margin: "0 0 6px" };
  const stepSub: React.CSSProperties = { color: "#6b7280", margin: "0 0 16px", fontSize: 14 };
  const btn = (active: boolean): React.CSSProperties => ({
    padding: "12px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
    border: `1.5px solid ${active ? PINK : "#e5e7eb"}`,
    background: active ? PINK : "#fff", color: active ? "#fff" : NAVY,
    textAlign: "center",
  });
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 };

  const progress = (
    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? PINK : "#e5e7eb" }} />
      ))}
    </div>
  );

  const backBtn = step > 0 && step < 5 && (
    <button onClick={() => setStep(step - 1)} style={{ padding: "8px 14px", borderRadius: 7, background: "#fff", border: "1.5px solid #e5e7eb", color: "#6b7280", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 12 }}>
      ← Retour
    </button>
  );

  return (
    <>
      <div style={card}>
        <h1 style={{ margin: "0 0 4px", fontFamily: "'Cabin',sans-serif", fontSize: 22, color: NAVY, textTransform: "uppercase" }}>🤖 SimpliciBot</h1>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>Expert occasion : potentiel commercial, défauts connus, cote, délai de vente.</p>
      </div>

      {!report && progress}

      {step === 0 && (
        <>
          <div style={card}>
            <h2 style={{ ...stepTitle, fontSize: 16, color: PINK }}>⚡ Raccourci : carte grise</h2>
            <p style={stepSub}>Upload la carte grise (photo ou PDF) → on extrait marque, modèle, motorisation, année automatiquement.</p>
            <label style={{ display: "inline-block", padding: "12px 18px", borderRadius: 8, background: PINK, color: "#fff", fontSize: 14, fontWeight: 600, cursor: ocrBusy ? "not-allowed" : "pointer", opacity: ocrBusy ? 0.6 : 1 }}>
              {ocrBusy ? "🤖 Lecture en cours…" : "📷 Scanner la carte grise"}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={ocrBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCG(f); e.currentTarget.value = ""; }} style={{ display: "none" }} />
            </label>
            {ocrMsg && <p style={{ marginTop: 10, fontSize: 13, color: "#16a34a", fontWeight: 600 }}>{ocrMsg}</p>}
            {err && <p style={{ marginTop: 10, fontSize: 13, color: "#dc2626" }}>❌ {err}</p>}
          </div>
          <div style={card}>
            <h2 style={stepTitle}>1. Marque</h2>
            <p style={stepSub}>Ou choisis manuellement la marque.</p>
            <div style={grid}>
              {BRAND_LIST.map((b) => (
                <button key={b} onClick={() => { setBrand(b); setModel(""); setStep(1); }} style={btn(brand === b)}>{b}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {step === 1 && (
        <div style={card}>
          <h2 style={stepTitle}>2. Modèle</h2>
          <p style={stepSub}>{brand} — choisis le modèle.</p>
          <div style={grid}>
            {(CAR_CATALOG[brand] || []).map((m) => (
              <button key={m} onClick={() => { setModel(m); setStep(2); }} style={btn(model === m)}>{m}</button>
            ))}
          </div>
          <input value={model && !(CAR_CATALOG[brand] || []).includes(model) ? model : ""} onChange={(e) => setModel(e.target.value)} placeholder="Ou saisir librement…" style={{ width: "100%", padding: 11, marginTop: 12, fontSize: 14, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }} />
          {model && !(CAR_CATALOG[brand] || []).includes(model) && (
            <button onClick={() => setStep(2)} style={{ marginTop: 10, padding: "10px 16px", borderRadius: 8, background: PINK, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Continuer →</button>
          )}
          {backBtn}
        </div>
      )}

      {step === 2 && (
        <div style={card}>
          <h2 style={stepTitle}>3. Motorisation</h2>
          <p style={stepSub}>{brand} {model}</p>
          <div style={grid}>
            {FUELS.map((f) => (
              <button key={f} onClick={() => { setFuel(f); setStep(3); }} style={btn(fuel === f)}>{f}</button>
            ))}
          </div>
          {backBtn}
        </div>
      )}

      {step === 3 && (
        <div style={card}>
          <h2 style={stepTitle}>4. Finition</h2>
          <p style={stepSub}>Version / finition (S Line, GT Line, AMG, etc.)</p>
          <input value={finish} onChange={(e) => setFinish(e.target.value)} placeholder="Ex: GT Line, Business, AMG…" style={{ width: "100%", padding: 12, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => { setFinish(""); setStep(4); }} style={{ padding: "10px 14px", borderRadius: 8, background: "#fff", border: "1.5px solid #e5e7eb", color: "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Passer</button>
            <button onClick={() => setStep(4)} style={{ flex: 1, padding: "10px 16px", borderRadius: 8, background: PINK, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Continuer →</button>
          </div>
          {backBtn}
        </div>
      )}

      {step === 4 && (
        <div style={card}>
          <h2 style={stepTitle}>5. Infos véhicule</h2>
          <p style={stepSub}>Récap : {brand} {model} {finish} ({fuel})</p>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Année</label><input value={year} onChange={(e) => setYear(e.target.value)} type="number" placeholder="2020" style={{ width: "100%", padding: 10, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }} /></div>
              <div><label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Kilométrage</label><input value={km} onChange={(e) => setKm(e.target.value)} type="number" placeholder="80000" style={{ width: "100%", padding: 10, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }} /></div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Boîte de vitesse</label>
              <div style={{ display: "flex", gap: 6 }}>
                {GEARBOX.map((g) => <button key={g} onClick={() => setGearbox(g)} style={{ ...btn(gearbox === g), flex: 1 }}>{g}</button>)}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Propriétaires</label><input value={owners} onChange={(e) => setOwners(e.target.value)} type="number" min="1" style={{ width: "100%", padding: 10, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }} /></div>
              <div><label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Couleur</label><input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Noir" style={{ width: "100%", padding: 10, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }} /></div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Contrôle technique</label>
              <select value={ct} onChange={(e) => setCt(e.target.value)} style={{ width: "100%", padding: 10, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }}>
                <option value="">—</option>
                {CT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>État général</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} style={{ width: "100%", padding: 10, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }}>
                <option value="">—</option>
                {CONDITIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Historique entretien (libre)</label>
              <textarea value={history} onChange={(e) => setHistory(e.target.value)} rows={3} placeholder="Carnet à jour, courroie distribution faite à 60000 km…" style={{ width: "100%", padding: 10, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
            </div>
          </div>
          {err && <p style={{ color: "#dc2626", marginTop: 12 }}>❌ {err}</p>}
          <button onClick={analyze} disabled={loading || !year || !km} style={{ marginTop: 16, width: "100%", padding: "14px 20px", borderRadius: 8, background: loading || !year || !km ? "#cbd5e1" : PINK, color: "#fff", border: "none", fontSize: 16, fontWeight: 700, cursor: loading || !year || !km ? "not-allowed" : "pointer" }}>
            {loading ? "🤖 Analyse en cours…" : "🤖 Lancer l'analyse"}
          </button>
          {backBtn}
        </div>
      )}

      {step === 5 && report && (
        <>
          <div style={{ ...card, background: report.score >= 75 ? "#f0fdf4" : report.score >= 50 ? "#fefce8" : "#fef2f2", borderColor: report.score >= 75 ? "#bbf7d0" : report.score >= 50 ? "#fde68a" : "#fecaca", textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 }}>Score global</div>
            <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 60, fontWeight: 700, color: report.score >= 75 ? "#16a34a" : report.score >= 50 ? "#ca8a04" : "#dc2626", lineHeight: 1 }}>{report.score}<span style={{ fontSize: 24, color: "#9aa6b8" }}>/100</span></div>
            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700 }}>{report.advice}</div>
          </div>

          <div style={card}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><div style={{ fontSize: 11, color: "#9aa6b8", textTransform: "uppercase" }}>Potentiel de vente</div><div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{report.potential}</div></div>
              <div><div style={{ fontSize: 11, color: "#9aa6b8", textTransform: "uppercase" }}>Demande actuelle</div><div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{report.demand}</div></div>
              <div><div style={{ fontSize: 11, color: "#9aa6b8", textTransform: "uppercase" }}>Délai de vente estimé</div><div style={{ fontSize: 15, fontWeight: 600, color: TEAL }}>{report.sellTime}</div></div>
              <div><div style={{ fontSize: 11, color: "#9aa6b8", textTransform: "uppercase" }}>Fourchette prix</div><div style={{ fontSize: 15, fontWeight: 600, color: NAVY }}>{eur(report.priceRange.low)} – {eur(report.priceRange.high)}</div><div style={{ fontSize: 11, color: "#6b7280" }}>Médian : {eur(report.priceRange.mid)}</div></div>
            </div>
            {report.priceRange.comment && <p style={{ marginTop: 12, fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>{report.priceRange.comment}</p>}
          </div>

          <div style={card}>
            <h3 style={{ ...stepTitle, fontSize: 14, color: PINK }}>⚠️ Problèmes connus</h3>
            <ul style={{ margin: 0, paddingLeft: 20, color: NAVY, fontSize: 14, lineHeight: 1.7 }}>{report.knownIssues.map((i, k) => <li key={k}>{i}</li>)}</ul>
          </div>

          <div style={card}>
            <h3 style={{ ...stepTitle, fontSize: 14, color: "#16a34a" }}>✅ Points forts</h3>
            <ul style={{ margin: 0, paddingLeft: 20, color: NAVY, fontSize: 14, lineHeight: 1.7 }}>{report.pros.map((i, k) => <li key={k}>{i}</li>)}</ul>
          </div>

          <div style={card}>
            <h3 style={{ ...stepTitle, fontSize: 14, color: "#dc2626" }}>❌ Points faibles</h3>
            <ul style={{ margin: 0, paddingLeft: 20, color: NAVY, fontSize: 14, lineHeight: 1.7 }}>{report.cons.map((i, k) => <li key={k}>{i}</li>)}</ul>
          </div>

          <div style={card}>
            <h3 style={{ ...stepTitle, fontSize: 14, color: PINK }}>Opportunité commerciale</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 8 }}>
              {[{ l: "Risque", v: report.risk, c: "#dc2626" }, { l: "Marge", v: report.margin, c: "#16a34a" }, { l: "Revente", v: report.resaleEase, c: TEAL }].map((s) => (
                <div key={s.l} style={{ textAlign: "center", padding: 10, borderRadius: 8, background: "#f8f9fa" }}>
                  <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>{s.l}</div>
                  <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 28, fontWeight: 700, color: s.c }}>{s.v}<span style={{ fontSize: 14, color: "#9aa6b8" }}>/10</span></div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 14, fontSize: 14, color: NAVY, lineHeight: 1.6 }}>{report.conclusion}</p>
          </div>

          <button onClick={reset} style={{ width: "100%", padding: "14px 20px", borderRadius: 8, background: NAVY, color: "#fff", border: "none", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            🔄 Nouvelle analyse
          </button>
        </>
      )}
    </>
  );
}

export default function Page() {
  return <Shell active="recherche"><Recherche /></Shell>;
}

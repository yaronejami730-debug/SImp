"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const GREEN = "#16a34a";

type Accord = { id: number; call_center_id: number | null; payee_email: string; payee_kind: string; base_eur: number; sold_eur: number; sold_pct: number; trigger_kind: "signed" | "honored" };
type Line = { apptId: string; amount: number; kind: string; payeeName: string; date: string | null; client: string; vehicle: string; telepro: string; sold: boolean; signed: boolean };
type Gest = { ccId: number; ccName: string; email: string; name: string };
type Indep = { email: string; name: string };

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA").format(d);
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 14 };
const h2: React.CSSProperties = { margin: "0 0 4px", fontFamily: "'Cabin',sans-serif", fontSize: 15, fontWeight: 700, color: NAVY };
const hint: React.CSSProperties = { margin: "0 0 12px", fontSize: 12, color: "#94a3b8" };
const nIn: React.CSSProperties = { width: 80, padding: "7px 9px", borderRadius: 7, border: "1.5px solid #e5e7eb", fontSize: 13 };

function Paiements() {
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
  const [to, setTo] = useState(ymd(now));
  const [accords, setAccords] = useState<Accord[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [gests, setGests] = useState<Gest[]>([]);
  const [indeps, setIndeps] = useState<Indep[]>([]);
  const [loading, setLoading] = useState(true);
  // Ajout d'accord
  const [selKey, setSelKey] = useState("");
  const [baseEur, setBaseEur] = useState(50);
  const [soldEur, setSoldEur] = useState(0);
  const [soldPct, setSoldPct] = useState(0);
  const [trigger, setTrigger] = useState<"signed" | "honored">("signed");

  async function load() {
    const r = await fetch(`/api/paiements?from=${from}&to=${to}`, { headers: authHeaders() });
    const d = await r.json();
    if (d.ok) { setAccords(d.accords); setLines(d.lines); setGests(d.gestionnaires); setIndeps(d.independants); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/paiements", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  function addAccord() {
    if (!selKey) return;
    const [kind, ...rest] = selKey.split("|");
    if (kind === "g") { const g = gests.find((x) => `${x.ccId}` === rest[0]); if (g) post({ action: "add", kind: "gestionnaire", payeeEmail: g.email, ccId: g.ccId, baseEur, soldEur, soldPct, trigger }); }
    else { post({ action: "add", kind: "telepro", payeeEmail: rest[0], baseEur, soldEur, soldPct, trigger }); }
    setSelKey("");
  }
  const payeeLabel = (a: Accord) => {
    const g = gests.find((x) => x.email === a.payee_email && x.ccId === a.call_center_id);
    if (g) return `${g.name} — gestionnaire ${g.ccName}`;
    const i = indeps.find((x) => x.email === a.payee_email);
    return i ? `${i.name} — télépro indépendant` : a.payee_email;
  };

  // Comptabilisation groupée par mois (desc)
  const byMonth = new Map<string, Line[]>();
  for (const l of lines) {
    const k = l.date ? l.date.slice(0, 7) : "?";
    byMonth.set(k, [...(byMonth.get(k) ?? []), l]);
  }
  const months = [...byMonth.keys()].sort().reverse();
  const monthLabel = (k: string) => { const [y, m] = k.split("-"); return `${["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"][Number(m) - 1]} ${y}`; };
  const grandTotal = lines.reduce((s, l) => s + l.amount, 0);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Chargement…</div>;

  return (
    <>
      <header style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Mes paiements</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Tes accords de rémunération et ce que tu dois, mois par mois.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>Du</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: "7px 9px", borderRadius: 7, border: "1.5px solid #e5e7eb", fontSize: 13 }} />
          <span style={{ fontSize: 13, color: "#64748b" }}>au</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: "7px 9px", borderRadius: 7, border: "1.5px solid #e5e7eb", fontSize: 13 }} />
        </div>
      </header>

      {/* Mes accords */}
      <div style={card}>
        <h2 style={h2}>💶 Mes accords de rémunération</h2>
        <p style={hint}>Le prix que TU as négocié. L&apos;accord s&apos;applique EN CONTINU à tous les rendez-vous, tant que tu ne le renégocies pas. Entrée : au mandat signé OU dès que le client honore le RDV. Sortie : € fixes et/ou % du montant négocié quand le véhicule est vendu.</p>
        {accords.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 10 }}>Aucun accord — ajoute ton premier ci-dessous.</div>}
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {accords.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: NAVY }}>{payeeLabel(a)}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "#64748b", flexWrap: "wrap" }}>
                <select defaultValue={a.trigger_kind} id={`pt-${a.id}`} style={{ padding: "7px 8px", borderRadius: 7, border: "1.5px solid #e5e7eb", fontSize: 12.5, background: "#fff" }}>
                  <option value="signed">Entrée au mandat SIGNÉ</option>
                  <option value="honored">Entrée dès RDV HONORÉ</option>
                </select>
                <input type="number" defaultValue={a.base_eur} id={`pb-${a.id}`} style={nIn} /> €
                · Sortie (vendu) <input type="number" defaultValue={a.sold_eur} id={`ps-${a.id}`} style={nIn} /> € + <input type="number" defaultValue={a.sold_pct} id={`pp-${a.id}`} style={{ ...nIn, width: 60 }} /> %
                <button onClick={() => post({ action: "update", id: a.id, baseEur: Number((document.getElementById(`pb-${a.id}`) as HTMLInputElement).value), soldEur: Number((document.getElementById(`ps-${a.id}`) as HTMLInputElement).value), soldPct: Number((document.getElementById(`pp-${a.id}`) as HTMLInputElement).value), trigger: (document.getElementById(`pt-${a.id}`) as HTMLSelectElement).value })} style={{ padding: "6px 10px", borderRadius: 7, border: "none", background: NAVY, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>OK</button>
                <button onClick={() => confirm("Supprimer cet accord ?") && post({ action: "remove", id: a.id })} style={{ padding: "6px 8px", borderRadius: 7, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>✕</button>
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px dashed #e5e7eb", paddingTop: 12 }}>
          <select value={selKey} onChange={(e) => setSelKey(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 13, background: "#fff", maxWidth: 280 }}>
            <option value="">— choisir un bénéficiaire —</option>
            {gests.length > 0 && <optgroup label="Gestionnaires de call center">{gests.map((g) => <option key={`g${g.ccId}`} value={`g|${g.ccId}`}>{g.name} ({g.ccName})</option>)}</optgroup>}
            {indeps.length > 0 && <optgroup label="Téléprospecteurs indépendants">{indeps.map((i) => <option key={i.email} value={`t|${i.email}`}>{i.name}</option>)}</optgroup>}
          </select>
          <select value={trigger} onChange={(e) => setTrigger(e.target.value as "signed" | "honored")} style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 13, background: "#fff" }}>
            <option value="signed">Entrée au mandat SIGNÉ</option>
            <option value="honored">Entrée dès RDV HONORÉ</option>
          </select>
          <span style={{ fontSize: 12.5, color: "#64748b" }}>Entrée</span><input type="number" value={baseEur} onChange={(e) => setBaseEur(Number(e.target.value))} style={nIn} /><span style={{ fontSize: 12.5, color: "#64748b" }}>€ · Sortie (vendu)</span>
          <input type="number" value={soldEur} onChange={(e) => setSoldEur(Number(e.target.value))} style={nIn} /><span style={{ fontSize: 12.5, color: "#64748b" }}>€ +</span>
          <input type="number" value={soldPct} onChange={(e) => setSoldPct(Number(e.target.value))} style={{ ...nIn, width: 60 }} /><span style={{ fontSize: 12.5, color: "#64748b" }}>% du négocié</span>
          <button disabled={!selKey} onClick={addAccord} style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: PINK, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Ajouter l&apos;accord</button>
        </div>
      </div>

      {/* Comptabilisation */}
      <div style={card}>
        <h2 style={h2}>📊 Comptabilisation</h2>
        <p style={hint}>Comptabilisation en continu selon tes accords (regroupée par mois pour la lecture). Sortie incluse quand le véhicule est vendu.</p>
        {months.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8" }}>Aucun RDV comptabilisé sur la période.</div>}
        {months.map((mk) => {
          const ls = byMonth.get(mk)!;
          const tot = ls.reduce((s, l) => s + l.amount, 0);
          return (
            <div key={mk} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontFamily: "'Cabin',sans-serif", fontSize: 14, fontWeight: 700, color: NAVY }}>{monthLabel(mk)}</span>
                <span style={{ fontFamily: "'Cabin',sans-serif", fontSize: 16, fontWeight: 700, color: GREEN }}>{eur(tot)}</span>
              </div>
              <div style={{ display: "grid", gap: 5 }}>
                {ls.map((l, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                    <span style={{ fontSize: 13, color: NAVY }}>
                      <strong>{l.client || "Client"}</strong>{l.vehicle ? ` · ${l.vehicle}` : ""}
                      <span style={{ color: "#94a3b8", fontSize: 12 }}> — {l.date ? new Date(l.date).toLocaleDateString("fr-FR") : ""} · {l.telepro || l.payeeName}{l.signed ? " · ✍️ signé" : " · 🙋 honoré"}{l.sold ? " · 🏁 vendu" : ""}</span>
                    </span>
                    <strong style={{ fontSize: 13.5, color: NAVY }}>{eur(l.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {months.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #e5e7eb", paddingTop: 10, fontFamily: "'Cabin',sans-serif", fontWeight: 700 }}>
            <span style={{ color: NAVY }}>TOTAL période</span>
            <span style={{ color: GREEN, fontSize: 18 }}>{eur(grandTotal)}</span>
          </div>
        )}
      </div>
    </>
  );
}

export default function Page() {
  return <Shell active="paiements"><Paiements /></Shell>;
}

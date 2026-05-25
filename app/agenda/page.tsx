"use client";

import { useEffect, useMemo, useState } from "react";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const LOGO =
  "https://www.simplicicar.com/img/cms/Logo/Simplicicar-concession-automobile-France.jpg";

const BASE_COMMISSION = 50; // € par véhicule signé
const NEGO_RATE = 0.1; // 10% de la négociation

type Sign = "" | "signed" | "thinking" | "unsigned";
type Appt = {
  id: string;
  startDateTime: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  platform: string;
  listingUrl: string;
  location: string;
  present: boolean;
  signStatus: Sign;
  negotiation: number;
};

const parisDate = (d: Date) =>
  new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const onlyDigits = (s: string) => s.replace(/\D/g, "");
const commission = (a: Appt) => (a.signStatus === "signed" ? BASE_COMMISSION + NEGO_RATE * (a.negotiation || 0) : 0);
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function Agenda() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("dash_pin");
    if (saved) { setPin(saved); load(saved); }
  }, []);

  async function load(p: string) {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/appointments", { headers: { "x-pin": p } });
      const d = await res.json();
      if (d.ok) { setAppts(d.appointments); setAuthed(true); localStorage.setItem("dash_pin", p); }
      else { setErr(d.error ?? "Erreur."); if (res.status === 401) localStorage.removeItem("dash_pin"); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur."); }
    finally { setLoading(false); }
  }

  function setLocal(id: string, patch: Partial<Appt>) {
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  async function save(id: string, patch: { present?: boolean; signStatus?: Sign; negotiation?: number }) {
    await fetch("/api/status", {
      method: "POST",
      headers: { "content-type": "application/json", "x-pin": pin },
      body: JSON.stringify({ eid: id, ...patch }),
    }).catch(() => {});
  }

  async function cancel(a: Appt) {
    if (!confirm(`Annuler le RDV de ${a.firstName} ${a.lastName} ? Un mail d'annulation sera envoyé.`)) return;
    const res = await fetch("/api/cancel", {
      method: "POST", headers: { "content-type": "application/json", "x-pin": pin }, body: JSON.stringify({ eid: a.id }),
    });
    const d = await res.json();
    if (d.ok) setAppts((prev) => prev.filter((x) => x.id !== a.id));
    else alert("Erreur : " + (d.error ?? ""));
  }

  const { groups, total, month } = useMemo(() => {
    const now = new Date();
    const today = parisDate(now);
    const yest = parisDate(new Date(now.getTime() - 86400000));
    const tmrw = parisDate(new Date(now.getTime() + 86400000));
    const q = onlyDigits(search);
    const filtered = appts
      .filter((a) => a.startDateTime)
      .filter((a) => (q ? onlyDigits(a.phone).includes(q) : true))
      .sort((a, b) => (a.startDateTime! < b.startDateTime! ? -1 : 1));
    const g: Record<string, Appt[]> = { auj: [], dem: [], avenir: [], hier: [], passes: [] };
    for (const a of filtered) {
      const d = parisDate(new Date(a.startDateTime!));
      if (d === today) g.auj.push(a);
      else if (d === tmrw) g.dem.push(a);
      else if (d === yest) g.hier.push(a);
      else if (a.startDateTime! > now.toISOString()) g.avenir.push(a);
      else g.passes.push(a);
    }
    g.passes.reverse();
    const total = appts.reduce((s, a) => s + commission(a), 0);

    // Stats du mois courant (Europe/Paris).
    const monthKey = today.slice(0, 7); // YYYY-MM
    const m = { rdv: 0, signed: 0, present: 0, thinking: 0, comm: 0 };
    for (const a of appts) {
      if (!a.startDateTime) continue;
      if (parisDate(new Date(a.startDateTime)).slice(0, 7) !== monthKey) continue;
      m.rdv++;
      if (a.present) m.present++;
      if (a.signStatus === "signed") { m.signed++; m.comm += commission(a); }
      if (a.signStatus === "thinking") m.thinking++;
    }
    return { groups: g, total, month: m };
  }, [appts, search]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const wrap: React.CSSProperties = {
    minHeight: "100vh", background: "#eceef1",
    fontFamily: "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", color: "#232323", padding: "24px 16px",
  };

  if (!authed) {
    return (
      <main style={wrap}>
        <div style={{ maxWidth: 380, margin: "60px auto", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 15px rgba(26,39,58,0.12)" }}>
          <div style={{ background: NAVY, textAlign: "center", padding: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Simplicicar" width={240} style={{ width: 240, maxWidth: "80%", height: "auto" }} />
          </div>
          <div style={{ height: 4, background: PINK }} />
          <div style={{ padding: 28 }}>
            <h1 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 20, color: NAVY, margin: "0 0 16px", textTransform: "uppercase" }}>Accès agenda</h1>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(pin)} placeholder="Code d'accès"
              style={{ width: "100%", padding: 12, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }} />
            {err && <p style={{ color: "#dc2626", fontSize: 14 }}>❌ {err}</p>}
            <button onClick={() => load(pin)} disabled={loading || !pin} style={{ marginTop: 16, width: "100%", padding: 13, borderRadius: 8, border: "none", background: PINK, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              {loading ? "…" : "Entrer"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  const signBtn = (a: Appt, val: Sign, label: string, color: string) => (
    <button
      onClick={() => { const v = a.signStatus === val ? "" : val; setLocal(a.id, { signStatus: v }); save(a.id, { signStatus: v }); }}
      style={{
        flex: 1, padding: "7px 4px", fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: "pointer",
        border: a.signStatus === val ? `1.5px solid ${color}` : "1.5px solid #e5e7eb",
        background: a.signStatus === val ? color : "#fff", color: a.signStatus === val ? "#fff" : "#6b7280",
      }}
    >{label}</button>
  );

  const card = (a: Appt) => (
    <div key={a.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY }}>{a.firstName} {a.lastName}</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{a.phone} · {a.email}</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{a.platform}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.startDateTime ? fmt(a.startDateTime) : "—"}</div>
          {a.signStatus === "signed" && <div style={{ color: "#16a34a", fontWeight: 700, fontSize: 14, marginTop: 2 }}>{eur(commission(a))}</div>}
        </div>
      </div>

      {/* Présence */}
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={a.present} onChange={(e) => { setLocal(a.id, { present: e.target.checked }); save(a.id, { present: e.target.checked }); }} />
        Client présent
      </label>

      {/* Signature */}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {signBtn(a, "signed", "✅ Signé", "#16a34a")}
        {signBtn(a, "thinking", "🤔 Réfléchit", "#ca8a04")}
        {signBtn(a, "unsigned", "❌ Pas signé", "#dc2626")}
      </div>

      {/* Négociation + commission (si signé) */}
      {a.signStatus === "signed" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Négo €</span>
          <input
            type="number" value={a.negotiation || ""}
            onChange={(e) => setLocal(a.id, { negotiation: Number(e.target.value) })}
            onBlur={(e) => save(a.id, { negotiation: Number(e.target.value) })}
            placeholder="0"
            style={{ width: 110, padding: "8px 10px", fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb" }}
          />
          <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
            = {eur(commission(a))} <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(50€ + 10%)</span>
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <a href={`/reschedule?eid=${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", padding: "9px 12px", borderRadius: 8, background: NAVY, color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>Reprogrammer</a>
        <button onClick={() => cancel(a)} style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );

  const section = (title: string, list: Appt[]) =>
    list.length === 0 ? null : (
      <div key={title} style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 14, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>
          {title} <span style={{ color: "#9aa6b8" }}>({list.length})</span>
        </h2>
        <div style={{ display: "grid", gap: 10 }}>{list.map(card)}</div>
      </div>
    );

  return (
    <main style={wrap}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ background: NAVY, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Simplicicar" width={170} style={{ width: 170, maxWidth: "50%", height: "auto" }} />
          <a href="/" style={{ color: "#fff", fontSize: 13, textDecoration: "none", background: PINK, padding: "8px 12px", borderRadius: 8, fontWeight: 600 }}>+ Nouveau RDV</a>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Ce mois-ci</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, textAlign: "center" }}>
            {[
              { n: month.rdv, l: "RDV", c: NAVY },
              { n: month.present, l: "Présents", c: NAVY },
              { n: month.signed, l: "Signés", c: "#16a34a" },
              { n: month.thinking, l: "Réfléchit", c: "#ca8a04" },
            ].map((s) => (
              <div key={s.l}>
                <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: s.c }}>{s.n}</div>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #f0f1f3", marginTop: 14, paddingTop: 12 }}>
            <span style={{ color: "#6b7280", fontSize: 13 }}>Commission du mois</span>
            <span style={{ fontFamily: "'Cabin',sans-serif", fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{eur(month.comm)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ color: "#9aa6b8", fontSize: 12 }}>Total tous mois</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>{eur(total)}</span>
          </div>
        </div>

        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Rechercher par téléphone du client"
          style={{ width: "100%", padding: 12, fontSize: 15, borderRadius: 10, border: "1.5px solid #e5e7eb", boxSizing: "border-box", marginBottom: 20 }} />

        {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}

        {section("Aujourd'hui", groups.auj)}
        {section("Demain", groups.dem)}
        {section("À venir", groups.avenir)}
        {section("Hier", groups.hier)}
        {section("Passés", groups.passes)}

        {appts.length === 0 && !loading && <p style={{ color: "#6b7280", textAlign: "center" }}>Aucun rendez-vous.</p>}
      </div>
    </main>
  );
}

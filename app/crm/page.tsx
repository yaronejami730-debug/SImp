"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders, getUser } from "@/lib/client";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";

type Sign = "" | "signed" | "thinking" | "unsigned";
type Appt = {
  id: string; startDateTime: string | null; firstName: string; lastName: string;
  email: string; phone: string; platform: string; listingUrl: string;
  carBrand: string; carModel: string; carFinish: string;
  immatriculation: string; vehiclePhotoUrl: string;
  commercial: string; teleprospector: string; type: string; address: string;
  present: boolean; signStatus: Sign; negotiation: number; owner: string;
  civility: string; cancelled: boolean; bcSigned: boolean; vehicleSold: boolean;
  photos: string[];
};

type Client = {
  key: string; // tél normalisé ou email
  firstName: string; lastName: string;
  phone: string; email: string;
  vehicles: string[];
  appts: Appt[];
  lastAppt: Appt;
  signedCount: number;
  photos: string[]; // toutes photos cumulées des RDVs
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const vehicleLabel = (a: Appt) => [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ");
const BASE_COMMISSION = 50;
const NEGO_RATE = 0.1;
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const commission = (a: Appt) => (a.signStatus === "signed" ? BASE_COMMISSION + NEGO_RATE * (a.negotiation || 0) : 0);
const monthKey = (iso: string | null) => iso ? iso.slice(0, 7) : "";
const monthLabel = (key: string) => {
  if (!key) return "";
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("fr-FR", { month: "long", year: "numeric" });
};

function CRM() {
  const me = getUser();
  const isAdmin = me?.role === "admin";
  const [appts, setAppts] = useState<Appt[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "signed" | "thinking" | "unsigned" | "sold" | "bc">("all");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [statFilter, setStatFilter] = useState<"" | "rdv" | "signed" | "bc" | "sold">("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/appointments", { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) setAppts(d.appointments);
      else setErr(d.error ?? "Erreur");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  const clients: Client[] = useMemo(() => {
    const map = new Map<string, Client>();
    for (const a of appts) {
      const key = onlyDigits(a.phone) || a.email.toLowerCase() || a.id;
      const existing = map.get(key);
      if (existing) {
        existing.appts.push(a);
        const v = vehicleLabel(a);
        if (v && !existing.vehicles.includes(v)) existing.vehicles.push(v);
        if (a.signStatus === "signed") existing.signedCount++;
        if ((existing.lastAppt.startDateTime ?? "") < (a.startDateTime ?? "")) existing.lastAppt = a;
        for (const ph of a.photos || []) if (!existing.photos.includes(ph)) existing.photos.push(ph);
      } else {
        map.set(key, {
          key,
          firstName: a.firstName, lastName: a.lastName,
          phone: a.phone, email: a.email,
          vehicles: vehicleLabel(a) ? [vehicleLabel(a)] : [],
          appts: [a],
          lastAppt: a,
          signedCount: a.signStatus === "signed" ? 1 : 0,
          photos: [...(a.photos || [])],
        });
      }
    }
    let list = [...map.values()];
    const q = search.trim().toLowerCase();
    if (q) {
      const qd = onlyDigits(q);
      const qa = q.replace(/[^a-z0-9]/g, ""); // normalise immat (AB-123-CD -> ab123cd)
      list = list.filter((c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (qd && onlyDigits(c.phone).includes(qd)) ||
        c.vehicles.some((v) => v.toLowerCase().includes(q)) ||
        (qa && c.appts.some((a) => a.immatriculation && a.immatriculation.toLowerCase().replace(/[^a-z0-9]/g, "").includes(qa)))
      );
    }
    if (filter === "sold") list = list.filter((c) => c.appts.some((a) => a.vehicleSold));
    else if (filter === "bc") list = list.filter((c) => c.appts.some((a) => a.bcSigned));
    else if (filter !== "all") list = list.filter((c) => c.appts.some((a) => a.signStatus === filter));
    // Filtre mois + statistique
    if (monthFilter) {
      list = list.filter((c) => c.appts.some((a) => {
        if (monthKey(a.startDateTime) !== monthFilter) return false;
        if (statFilter === "rdv") return true;
        if (statFilter === "signed") return a.signStatus === "signed";
        if (statFilter === "bc") return a.bcSigned;
        if (statFilter === "sold") return a.vehicleSold;
        return true;
      }));
    }
    list.sort((a, b) => (a.lastAppt.startDateTime ?? "") < (b.lastAppt.startDateTime ?? "") ? 1 : -1);
    return list;
  }, [appts, search, filter, monthFilter, statFilter]);

  // === STATS PAR MOIS ===
  type MStat = { key: string; rdv: number; signed: number; bc: number; sold: number; comm: number };
  const monthStats: MStat[] = useMemo(() => {
    const m = new Map<string, MStat>();
    for (const a of appts) {
      if (!a.startDateTime || a.cancelled) continue;
      const k = monthKey(a.startDateTime);
      if (!k) continue;
      const s = m.get(k) ?? { key: k, rdv: 0, signed: 0, bc: 0, sold: 0, comm: 0 };
      s.rdv++;
      if (a.signStatus === "signed") { s.signed++; s.comm += commission(a); }
      if (a.bcSigned) s.bc++;
      if (a.vehicleSold) s.sold++;
      m.set(k, s);
    }
    return [...m.values()].sort((a, b) => a.key < b.key ? 1 : -1);
  }, [appts]);
  const totalGain = useMemo(() => appts.reduce((s, a) => s + commission(a), 0), [appts]);

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const timing = (iso: string | null): { label: string; color: string } => {
    if (!iso) return { label: "—", color: "#9aa6b8" };
    const todayStr = new Date().toISOString().slice(0, 10);
    const d = iso.slice(0, 10);
    if (d > todayStr) return { label: "À venir", color: "#2563eb" };
    if (d === todayStr) return { label: "Bientôt", color: "#f59e0b" };
    return { label: "Passé", color: "#9aa6b8" };
  };

  const statusBadge = (a: Appt) => {
    const t = timing(a.startDateTime);
    const sign = a.signStatus === "signed" ? { c: "#16a34a", l: "✅ Signé" }
      : a.signStatus === "thinking" ? { c: "#ca8a04", l: "🤔 Réfléchit" }
      : a.signStatus === "unsigned" ? { c: "#dc2626", l: "❌ Pas signé" }
      : null;
    const pill = (c: string, l: string) => <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, background: c, color: "#fff", fontSize: 10, fontWeight: 700, marginLeft: 3 }}>{l}</span>;
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 3 }}>
        {pill(t.color, t.label)}
        {a.present && pill("#16a34a", "✓ Présent")}
        {a.cancelled && pill("#dc2626", "ANNULÉ")}
        {sign && pill(sign.c, sign.l)}
      </div>
    );
  };

  const filterBtn = (key: typeof filter, label: string) => (
    <button onClick={() => setFilter(key)} style={{
      padding: "7px 12px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
      background: filter === key ? PINK : "#fff", color: filter === key ? "#fff" : NAVY,
      border: `1.5px solid ${filter === key ? PINK : "#e5e7eb"}`,
    }}>{label}</button>
  );

  return (
    <>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 22, color: NAVY, textTransform: "uppercase" }}>CRM — Clients</h1>
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>{clients.length} client{clients.length > 1 ? "s" : ""} · clic pour ouvrir la fiche</p>
          </div>
          <a href="/bilan" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: NAVY, color: "#fff", textDecoration: "none", padding: "10px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>
            📊 Bilan de facturation
          </a>
        </div>
        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <span style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>💰 Gain total (toutes commissions signées)</span>
          <span style={{ fontFamily: "'Cabin',sans-serif", fontSize: 22, fontWeight: 700, color: "#16a34a" }}>{eur(totalGain)}</span>
        </div>
      </div>

      {/* Stats par mois */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 12, color: PINK, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, fontWeight: 700 }}>📊 Par mois (clic compteur = filtre)</div>
        {monthStats.length === 0 && <p style={{ fontSize: 13, color: "#9aa6b8", margin: 0, fontStyle: "italic" }}>Pas encore de RDV.</p>}
        {monthStats.map((m) => {
          const active = monthFilter === m.key;
          const setStat = (s: typeof statFilter) => { setMonthFilter(m.key); setStatFilter(s); };
          const isSel = (s: typeof statFilter) => active && statFilter === s;
          const counter = (n: number, lbl: string, key: typeof statFilter, color: string) => (
            <button onClick={() => isSel(key) ? (setMonthFilter(""), setStatFilter("")) : setStat(key)} style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: isSel(key) ? color : "#fff", color: isSel(key) ? "#fff" : color,
              border: `1.5px solid ${color}`,
            }}>{lbl} : {n}</button>
          );
          return (
            <div key={m.key} style={{ padding: "10px 0", borderTop: m.key !== monthStats[0].key ? "1px solid #f0f1f3" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 700, color: NAVY, fontSize: 14, textTransform: "capitalize" }}>{monthLabel(m.key)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>{eur(m.comm)}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {counter(m.rdv, "RDV", "rdv", NAVY)}
                {counter(m.signed, "✅ Signés", "signed", "#16a34a")}
                {counter(m.bc, "📝 BC", "bc", "#2563eb")}
                {counter(m.sold, "🏁 Vendus", "sold", "#16a34a")}
              </div>
            </div>
          );
        })}
        {(monthFilter || statFilter) && (
          <button onClick={() => { setMonthFilter(""); setStatFilter(""); }} style={{ marginTop: 10, padding: "6px 12px", borderRadius: 7, background: PINK, color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            ✕ Effacer filtre mois
          </button>
        )}
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Rechercher (nom, prénom, téléphone, e-mail, marque, modèle, immatriculation)" style={{ width: "100%", padding: 12, fontSize: 15, borderRadius: 10, border: "1.5px solid #e5e7eb", boxSizing: "border-box", marginBottom: 10 }} />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {filterBtn("all", "Tous")}
        {filterBtn("sold", "🏁 Véhicules vendus")}
        {filterBtn("bc", "📝 BC signés")}
        {filterBtn("signed", "✅ Signé")}
        {filterBtn("thinking", "🤔 Réfléchit")}
        {filterBtn("unsigned", "❌ Pas signé")}
      </div>

      {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}
      {loading && <p style={{ color: "#6b7280" }}>Chargement…</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {clients.map((c) => (
          <a key={c.key} href={`/client/${encodeURIComponent(c.lastAppt.id)}`} style={{ display: "block", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, textDecoration: "none", color: "inherit" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 12, flex: 1, minWidth: 0 }}>
                {c.photos.length > 0 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photos[0]} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid #e5e7eb" }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>{c.firstName} {c.lastName}</div>
                  {c.vehicles.length > 0 && <div style={{ fontSize: 13, color: NAVY, fontWeight: 600, marginTop: 2 }}>🚗 {c.vehicles.join(" · ")}</div>}
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{c.phone || "—"} · {c.email || "—"}</div>
                  {c.photos.length > 1 && <div style={{ fontSize: 11, color: "#9aa6b8", marginTop: 2 }}>📷 {c.photos.length} photos</div>}
                  {isAdmin && c.lastAppt.owner && <div style={{ fontSize: 11, color: "#9aa6b8" }}>par {c.lastAppt.owner}</div>}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {statusBadge(c.lastAppt)}
                {c.lastAppt.vehicleSold && <div style={{ display: "inline-block", marginLeft: 4, padding: "2px 7px", borderRadius: 5, background: "#16a34a", color: "#fff", fontSize: 10, fontWeight: 700 }}>🏁 VENDU</div>}
                {c.lastAppt.bcSigned && !c.lastAppt.vehicleSold && <div style={{ display: "inline-block", marginLeft: 4, padding: "2px 7px", borderRadius: 5, background: "#2563eb", color: "#fff", fontSize: 10, fontWeight: 700 }}>📝 BC</div>}
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{fmt(c.lastAppt.startDateTime)}</div>
                <div style={{ fontSize: 11, color: "#9aa6b8" }}>{c.appts.length} RDV{c.appts.length > 1 ? "s" : ""}{c.signedCount > 0 ? ` · ${c.signedCount} signé${c.signedCount > 1 ? "s" : ""}` : ""}</div>
              </div>
            </div>
          </a>
        ))}
        {!loading && clients.length === 0 && <p style={{ color: "#6b7280", textAlign: "center" }}>Aucun client.</p>}
      </div>
    </>
  );
}

export default function Page() {
  return <Shell active="crm"><CRM /></Shell>;
}

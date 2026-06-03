"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders, getUser } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";

type Sign = "" | "signed" | "thinking" | "unsigned";
type Appt = {
  id: string; startDateTime: string | null; firstName: string; lastName: string;
  email: string; phone: string; platform: string; listingUrl: string;
  carBrand: string; carModel: string; carFinish: string;
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

function CRM() {
  const me = getUser();
  const isAdmin = me?.role === "admin";
  const [appts, setAppts] = useState<Appt[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "signed" | "thinking" | "unsigned" | "sold" | "bc">("all");

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
      list = list.filter((c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (qd && onlyDigits(c.phone).includes(qd)) ||
        c.vehicles.some((v) => v.toLowerCase().includes(q))
      );
    }
    if (filter === "sold") list = list.filter((c) => c.appts.some((a) => a.vehicleSold));
    else if (filter === "bc") list = list.filter((c) => c.appts.some((a) => a.bcSigned));
    else if (filter !== "all") list = list.filter((c) => c.appts.some((a) => a.signStatus === filter));
    list.sort((a, b) => (a.lastAppt.startDateTime ?? "") < (b.lastAppt.startDateTime ?? "") ? 1 : -1);
    return list;
  }, [appts, search, filter]);

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const statusBadge = (s: Sign) => {
    const cfg = s === "signed" ? { c: "#16a34a", l: "✅ Signé" }
      : s === "thinking" ? { c: "#ca8a04", l: "🤔 Réfléchit" }
      : s === "unsigned" ? { c: "#dc2626", l: "❌ Pas signé" }
      : { c: "#9aa6b8", l: "À venir" };
    return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, background: cfg.c, color: "#fff", fontSize: 11, fontWeight: 700 }}>{cfg.l}</span>;
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
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 22, color: NAVY, textTransform: "uppercase" }}>CRM — Clients</h1>
        <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>{clients.length} client{clients.length > 1 ? "s" : ""} · clic pour ouvrir la fiche</p>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Rechercher (nom, téléphone, e-mail, véhicule)" style={{ width: "100%", padding: 12, fontSize: 15, borderRadius: 10, border: "1.5px solid #e5e7eb", boxSizing: "border-box", marginBottom: 10 }} />

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
                {statusBadge(c.lastAppt.signStatus)}
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

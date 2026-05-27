"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders, getUser } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";

const BASE_COMMISSION = 50;
const NEGO_RATE = 0.1;

type Sign = "" | "signed" | "thinking" | "unsigned";
type Appt = {
  id: string; startDateTime: string | null; firstName: string; lastName: string;
  email: string; phone: string; platform: string; listingUrl: string; location: string;
  present: boolean; signStatus: Sign; negotiation: number; owner: string;
  civility: string; createdAt: string | null; history: { t: string; at: string; info?: string }[];
};

const histLabel = (t: string) =>
  ({ created: "Rendez-vous créé + mail de confirmation", rescheduled: "Reprogrammé", reminder_24h: "Rappel 24h envoyé", reminder_2h: "Rappel 2h envoyé" } as Record<string, string>)[t] ?? t;

const parisDate = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const onlyDigits = (s: string) => s.replace(/\D/g, "");
const commission = (a: Appt) => (a.signStatus === "signed" ? BASE_COMMISSION + NEGO_RATE * (a.negotiation || 0) : 0);
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Agenda() {
  const me = getUser();
  const isAdmin = me?.role === "admin";
  const [appts, setAppts] = useState<Appt[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  function setLocal(id: string, patch: Partial<Appt>) {
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  async function save(id: string, patch: { present?: boolean; signStatus?: Sign; negotiation?: number }) {
    await fetch("/api/status", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ eid: id, ...patch }) }).catch(() => {});
  }
  async function cancel(a: Appt) {
    if (!confirm(`Annuler le RDV de ${a.firstName} ${a.lastName} ? Un mail d'annulation sera envoyé.`)) return;
    const res = await fetch("/api/cancel", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ eid: a.id }) });
    const d = await res.json();
    if (d.ok) setAppts((prev) => prev.filter((x) => x.id !== a.id));
    else alert("Erreur : " + (d.error ?? ""));
  }

  const { groups, total, month, byOwner } = useMemo(() => {
    const now = new Date();
    const today = parisDate(now);
    const yest = parisDate(new Date(now.getTime() - 86400000));
    const tmrw = parisDate(new Date(now.getTime() + 86400000));
    const q = onlyDigits(search);
    const filtered = appts.filter((a) => a.startDateTime).filter((a) => (q ? onlyDigits(a.phone).includes(q) : true)).sort((a, b) => (a.startDateTime! < b.startDateTime! ? -1 : 1));
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
    const monthKey = today.slice(0, 7);
    const m = { rdv: 0, signed: 0, present: 0, thinking: 0, comm: 0 };
    const owners: Record<string, number> = {};
    for (const a of appts) {
      if (!a.startDateTime) continue;
      if (parisDate(new Date(a.startDateTime)).slice(0, 7) !== monthKey) continue;
      m.rdv++;
      if (a.present) m.present++;
      if (a.signStatus === "thinking") m.thinking++;
      if (a.signStatus === "signed") { m.signed++; m.comm += commission(a); owners[a.owner || "—"] = (owners[a.owner || "—"] || 0) + commission(a); }
    }
    return { groups: g, total, month: m, byOwner: owners };
  }, [appts, search]);

  const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const signBtn = (a: Appt, val: Sign, label: string, color: string) => {
    const locked = !!a.signStatus;       // un statut déjà choisi -> tout est verrouillé
    const active = a.signStatus === val;
    return (
      <button
        onClick={() => {
          if (locked) return;            // pas de désélection ni de changement
          setLocal(a.id, { signStatus: val });
          save(a.id, { signStatus: val });
        }}
        disabled={locked && !active}
        style={{
          flex: 1, padding: "7px 4px", fontSize: 12, fontWeight: 600, borderRadius: 7,
          cursor: locked ? "default" : "pointer",
          border: active ? `1.5px solid ${color}` : "1.5px solid #e5e7eb",
          background: active ? color : "#fff",
          color: active ? "#fff" : "#6b7280",
          opacity: locked && !active ? 0.45 : 1,
        }}
      >
        {label}
      </button>
    );
  };

  const card = (a: Appt) => (
    <div key={a.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY }}>{a.firstName} {a.lastName}</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{a.phone} · {a.email}</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{a.platform}{isAdmin && a.owner ? ` · par ${a.owner}` : ""}</div>
          {a.listingUrl && <a href={a.listingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: PINK, textDecoration: "none", fontWeight: 600 }}>🔗 Voir l&apos;annonce</a>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.startDateTime ? fmt(a.startDateTime) : "—"}</div>
          {a.signStatus === "signed" && <div style={{ color: "#16a34a", fontWeight: 700, fontSize: 14, marginTop: 2 }}>{eur(commission(a))}</div>}
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={a.present} onChange={(e) => { setLocal(a.id, { present: e.target.checked }); save(a.id, { present: e.target.checked }); }} /> Client présent
      </label>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {signBtn(a, "signed", "✅ Signé", "#16a34a")}
        {signBtn(a, "thinking", "🤔 Réfléchit", "#ca8a04")}
        {signBtn(a, "unsigned", "❌ Pas signé", "#dc2626")}
      </div>
      {a.signStatus === "signed" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Négo €</span>
          <input type="number" value={a.negotiation || ""} onChange={(e) => setLocal(a.id, { negotiation: Number(e.target.value) })} onBlur={(e) => save(a.id, { negotiation: Number(e.target.value) })} placeholder="0" style={{ width: 110, padding: "8px 10px", fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb" }} />
          <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>= {eur(commission(a))} <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(50€ + 10%)</span></span>
        </div>
      )}
      {a.history.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Historique ({a.history.length})</summary>
          <div style={{ marginTop: 8, borderLeft: `2px solid ${PINK}`, paddingLeft: 10 }}>
            {a.history.map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: "#6b7280", padding: "3px 0" }}>
                <span style={{ color: NAVY, fontWeight: 600 }}>{histLabel(h.t)}</span>
                {h.t === "rescheduled" && h.info ? ` → ${new Date(h.info).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}` : ""}
                {" · "}
                {new Date(h.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}
              </div>
            ))}
          </div>
        </details>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <a href={`/reschedule?eid=${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", padding: "9px 12px", borderRadius: 8, background: NAVY, color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>Reprogrammer</a>
        <button onClick={() => cancel(a)} style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );

  const section = (title: string, list: Appt[]) => list.length === 0 ? null : (
    <div key={title} style={{ marginBottom: 22 }}>
      <h2 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 14, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>{title} <span style={{ color: "#9aa6b8" }}>({list.length})</span></h2>
      <div style={{ display: "grid", gap: 10 }}>{list.map(card)}</div>
    </div>
  );

  return (
    <>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Ce mois-ci</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, textAlign: "center" }}>
          {[{ n: month.rdv, l: "RDV", c: NAVY }, { n: month.present, l: "Présents", c: NAVY }, { n: month.signed, l: "Signés", c: "#16a34a" }, { n: month.thinking, l: "Réfléchit", c: "#ca8a04" }].map((s) => (
            <div key={s.l}><div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: s.c }}>{s.n}</div><div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>{s.l}</div></div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #f0f1f3", marginTop: 14, paddingTop: 12 }}>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Commission du mois</span>
          <span style={{ fontFamily: "'Cabin',sans-serif", fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{eur(month.comm)}</span>
        </div>
        {isAdmin && Object.keys(byOwner).length > 0 && (
          <div style={{ borderTop: "1px solid #f0f1f3", marginTop: 10, paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: "#9aa6b8", textTransform: "uppercase", marginBottom: 6 }}>Par collaborateur (mois)</div>
            {Object.entries(byOwner).sort((a, b) => b[1] - a[1]).map(([o, v]) => (
              <div key={o} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
                <span style={{ color: "#6b7280" }}>{o}</span><span style={{ fontWeight: 600 }}>{eur(v)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ color: "#9aa6b8", fontSize: 12 }}>Total tous mois</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>{eur(total)}</span>
        </div>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Rechercher par téléphone du client" style={{ width: "100%", padding: 12, fontSize: 15, borderRadius: 10, border: "1.5px solid #e5e7eb", boxSizing: "border-box", marginBottom: 20 }} />

      {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}
      {section("Aujourd'hui", groups.auj)}
      {section("Demain", groups.dem)}
      {section("À venir", groups.avenir)}
      {section("Hier", groups.hier)}
      {section("Passés", groups.passes)}
      {appts.length === 0 && !loading && <p style={{ color: "#6b7280", textAlign: "center" }}>Aucun rendez-vous.</p>}
    </>
  );
}

export default function Page() {
  return <Shell active="agenda"><Agenda /></Shell>;
}

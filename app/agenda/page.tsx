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
  email: string; phone: string; platform: string; listingUrl: string;
  carBrand: string; carModel: string; carFinish: string; location: string;
  present: boolean; signStatus: Sign; negotiation: number; owner: string; commercial: string;
  relation?: "created" | "assigned" | "both" | "none";
  type?: "physique" | "visio" | "telephone" | "deplacement";
  civility: string; createdAt: string | null; history: { t: string; at: string; info?: string }[];
  parkingRequested: boolean; parkingSent: boolean; cancelled: boolean;
  bcSigned: boolean; bcSignedAt: string | null;
  vehicleSold: boolean; soldAt: string | null;
};
type Reminder = {
  id: number; first_name: string; last_name: string; phone: string;
  listing_url: string; note: string; remind_at: string; status: string; owner: string;
};

const histLabel = (t: string) =>
  ({ created: "Rendez-vous créé + mail de confirmation", rescheduled: "Reprogrammé", reminder_24h: "Rappel 24h envoyé", reminder_2h: "Rappel 2h envoyé", parking_requested: "Place de parking réservée", parking_cancelled: "Réservation parking annulée", parking_sent: "Mail parking envoyé au client" } as Record<string, string>)[t] ?? t;

const parisDate = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const onlyDigits = (s: string) => s.replace(/\D/g, "");
const commission = (a: Appt) => (a.signStatus === "signed" ? BASE_COMMISSION + NEGO_RATE * (a.negotiation || 0) : 0);
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const safeUrl = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`;

function Agenda() {
  const me = getUser();
  const isAdmin = me?.role === "admin";
  const [appts, setAppts] = useState<Appt[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  type RelFilter = "mine" | "created" | "assigned" | "team";
  const [relFilter, setRelFilter] = useState<RelFilter>("mine");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/appointments", { headers: authHeaders() }).then((r) => r.json()),
        fetch("/api/reminders", { headers: authHeaders() }).then((r) => r.json()).catch(() => ({ ok: false })),
      ]);
      if (r1.ok) setAppts(r1.appointments);
      else setErr(r1.error ?? "Erreur");
      if (r2.ok) setReminders(r2.reminders);
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  function setLocal(id: string, patch: Partial<Appt>) {
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  async function save(id: string, patch: { present?: boolean; signStatus?: Sign; negotiation?: number; bcSigned?: boolean; vehicleSold?: boolean }) {
    await fetch("/api/status", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ eid: id, ...patch }) }).catch(() => {});
  }
  async function toggleParking(a: Appt) {
    const next = !a.parkingRequested;
    if (next && !confirm(`Envoyer le mail de réservation parking à ${a.firstName} ${a.lastName} (${a.email}) ?`)) return;
    setLocal(a.id, { parkingRequested: next });
    try {
      const res = await fetch("/api/parking", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ eid: a.id, requested: next }) });
      const d = await res.json();
      if (!d.ok) {
        setLocal(a.id, { parkingRequested: !next });
        alert(d.error ?? "Erreur");
        return;
      }
      if (next) {
        if (d.emailSent) {
          setLocal(a.id, { parkingSent: true });
          alert("✅ Mail parking envoyé à " + a.email);
        } else {
          alert("Réservation enregistrée, mais mail non envoyé : " + (d.emailError ?? "raison inconnue"));
        }
      } else {
        setLocal(a.id, { parkingSent: false });
      }
    } catch (e) {
      setLocal(a.id, { parkingRequested: !next });
      alert(e instanceof Error ? e.message : "Erreur");
    }
  }
  async function cancel(a: Appt) {
    if (!confirm(`Annuler le RDV de ${a.firstName} ${a.lastName} ? Un mail d'annulation sera envoyé.`)) return;
    const res = await fetch("/api/cancel", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ eid: a.id }) });
    const d = await res.json();
    if (d.ok) setLocal(a.id, { cancelled: true });
    else alert("Erreur : " + (d.error ?? ""));
  }

  // Filtre par relation : tous mes RDV / créés par moi / qui me sont affectés / équipe.
  const relMatch = (a: Appt): boolean => {
    switch (relFilter) {
      case "created": return a.relation === "created" || a.relation === "both";
      case "assigned": return a.relation === "assigned" || a.relation === "both";
      case "mine": return a.relation === "created" || a.relation === "assigned" || a.relation === "both";
      case "team": default: return true;
    }
  };

  // Filtre recherche (garde annulés pour les voir en rouge)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qd = onlyDigits(q);
    return appts.filter((a) => {
      if (!a.startDateTime) return false;
      if (!relMatch(a)) return false;
      if (!q) return true;
      if (qd && onlyDigits(a.phone).includes(qd)) return true;
      const hay = `${a.firstName} ${a.lastName} ${a.email} ${a.carBrand} ${a.carModel} ${a.carFinish} ${a.platform}`.toLowerCase();
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appts, search, relFilter]);

  // Couleur dominante d'un jour selon priorité : annulé > signé > réfléchit > pris
  const dayColor = (list: Appt[]): string => {
    if (list.length === 0) return "transparent";
    if (list.some((a) => a.cancelled)) return "#dc2626"; // rouge
    if (list.some((a) => a.signStatus === "signed" || a.bcSigned || a.vehicleSold)) return "#16a34a"; // vert
    if (list.some((a) => a.signStatus === "thinking")) return "#f59e0b"; // orange
    if (list.some((a) => a.signStatus === "unsigned")) return "#6b7280"; // gris
    return "#2563eb"; // bleu (RDV pris sans statut)
  };
  const statusColor = (a: Appt): string => {
    if (a.cancelled) return "#dc2626";
    if (a.signStatus === "signed" || a.bcSigned || a.vehicleSold) return "#16a34a";
    if (a.signStatus === "thinking") return "#f59e0b";
    if (a.signStatus === "unsigned") return "#6b7280";
    return "#2563eb";
  };

  // Index par jour (YYYY-MM-DD)
  const byDay = useMemo(() => {
    const m = new Map<string, Appt[]>();
    for (const a of filtered) {
      const d = parisDate(new Date(a.startDateTime!));
      const list = m.get(d) ?? [];
      list.push(a);
      m.set(d, list);
    }
    for (const list of m.values()) list.sort((x, y) => (x.startDateTime! < y.startDateTime! ? -1 : 1));
    return m;
  }, [filtered]);

  // Rappels par jour
  const remindersByDay = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qd = onlyDigits(q);
    const filt = reminders.filter((r) => {
      if (r.status !== "pending") return false;
      if (!q) return true;
      if (qd && onlyDigits(r.phone).includes(qd)) return true;
      const hay = `${r.first_name} ${r.last_name} ${r.note}`.toLowerCase();
      return hay.includes(q);
    });
    const m = new Map<string, Reminder[]>();
    for (const r of filt) {
      const d = parisDate(new Date(r.remind_at));
      const list = m.get(d) ?? [];
      list.push(r);
      m.set(d, list);
    }
    for (const list of m.values()) list.sort((x, y) => x.remind_at < y.remind_at ? -1 : 1);
    return m;
  }, [reminders, search]);

  // Mois courant affiché + jour sélectionné
  const today = parisDate(new Date());
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string>(today);

  const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const signBtn = (a: Appt, val: Sign, label: string, color: string) => {
    const active = a.signStatus === val;
    return (
      <button
        onClick={() => {
          const next = active ? "" : val; // toggle : reclique = désélection
          setLocal(a.id, { signStatus: next });
          save(a.id, { signStatus: next });
        }}
        style={{
          flex: 1, padding: "7px 4px", fontSize: 12, fontWeight: 600, borderRadius: 7,
          cursor: "pointer",
          border: active ? `1.5px solid ${color}` : "1.5px solid #e5e7eb",
          background: active ? color : "#fff",
          color: active ? "#fff" : "#6b7280",
        }}
      >
        {label}
      </button>
    );
  };

  const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#9aa6b8", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 14, marginBottom: 6 };
  const vehicleLabel = (a: Appt) => [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ");

  const card = (a: Appt) => (
    <div key={a.id} style={{ background: a.cancelled ? "#fef2f2" : "#fff", border: `1px solid ${a.cancelled ? "#fecaca" : "#e5e7eb"}`, borderLeft: `4px solid ${statusColor(a)}`, borderRadius: 10, padding: 14, opacity: a.cancelled ? 0.85 : 1 }}>
      {a.cancelled && <div style={{ display: "inline-block", padding: "3px 9px", borderRadius: 6, background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>ANNULÉ</div>}
      {(() => {
        const b = a.relation === "both" ? { t: "🔁 Créé & à réaliser par moi", c: "#7c3aed", bg: "#f5f3ff" }
          : a.relation === "created" ? { t: `📤 Créé pour ${a.commercial || "—"}`, c: "#0369a1", bg: "#f0f9ff" }
          : a.relation === "assigned" ? { t: "🛠️ Intervention à réaliser", c: "#15803d", bg: "#f0fdf4" }
          : null;
        return b ? <div style={{ display: "inline-block", marginBottom: 8, marginLeft: a.cancelled ? 6 : 0, padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: b.c, background: b.bg }}>{b.t}</div> : null;
      })()}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <a href={`/client/${encodeURIComponent(a.id)}`} style={{ fontWeight: 700, color: NAVY, textDecoration: a.cancelled ? "line-through" : "none", fontSize: 15 }}>
            {a.firstName} {a.lastName} <span style={{ fontSize: 11, color: PINK, fontWeight: 500 }}>→ fiche</span>
          </a>
          {vehicleLabel(a) && <div style={{ fontSize: 13, color: NAVY, fontWeight: 600, marginTop: 2 }}>🚗 {vehicleLabel(a)}</div>}
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{a.phone} · {a.email}</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{({ physique: "🏢 Physique", visio: "💻 Visio", telephone: "📞 Téléphone", deplacement: "🚗 Déplacement" }[a.type ?? "physique"])}{a.platform ? ` · ${a.platform}` : ""}{a.commercial ? ` · 👤 Commercial : ${a.commercial}` : ""}</div>
          {(isAdmin || a.relation === "created" || a.relation === "both") && a.owner && <div style={{ fontSize: 12.5, color: "#9aa6b8" }}>✍️ Créé par : {a.owner}</div>}
          {a.listingUrl && <a href={safeUrl(a.listingUrl)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: PINK, textDecoration: "underline", fontWeight: 600, display: "inline-block", marginTop: 2 }}>🔗 Voir l&apos;annonce</a>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.startDateTime ? fmt(a.startDateTime) : "—"}</div>
          {a.signStatus === "signed" && <div style={{ color: "#16a34a", fontWeight: 700, fontSize: 14, marginTop: 2 }}>{eur(commission(a))}</div>}
          {a.vehicleSold && <div style={{ display: "inline-block", marginTop: 4, padding: "2px 7px", borderRadius: 5, background: "#16a34a", color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>🏁 VENDU</div>}
          {a.bcSigned && !a.vehicleSold && <div style={{ display: "inline-block", marginTop: 4, padding: "2px 7px", borderRadius: 5, background: "#2563eb", color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>📝 BC SIGNÉ</div>}
        </div>
      </div>

      <div style={sectionLabel}>Statut du RDV</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={a.present} onChange={(e) => { setLocal(a.id, { present: e.target.checked }); save(a.id, { present: e.target.checked }); }} /> Client présent
      </label>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {signBtn(a, "signed", "✅ Signé", "#16a34a")}
        {signBtn(a, "thinking", "🤔 Réfléchit", "#ca8a04")}
        {signBtn(a, "unsigned", "❌ Pas signé", "#dc2626")}
      </div>
      {a.signStatus === "signed" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Négo €</span>
            <input type="number" value={a.negotiation || ""} onChange={(e) => setLocal(a.id, { negotiation: Number(e.target.value) })} onBlur={(e) => save(a.id, { negotiation: Number(e.target.value) })} placeholder="0" style={{ width: 110, padding: "8px 10px", fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb" }} />
            <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>= {eur(commission(a))} <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(50€ + 10%)</span></span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 10px", borderRadius: 7, background: a.bcSigned ? "#eff6ff" : "#fff", border: `1.5px solid ${a.bcSigned ? "#2563eb" : "#e5e7eb"}`, fontSize: 13, fontWeight: 600, color: a.bcSigned ? "#1d4ed8" : NAVY, cursor: "pointer" }}>
            <input type="checkbox" checked={a.bcSigned} onChange={(e) => { setLocal(a.id, { bcSigned: e.target.checked }); save(a.id, { bcSigned: e.target.checked }); }} />
            📝 Bon de commande signé
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "8px 10px", borderRadius: 7, background: a.vehicleSold ? "#f0fdf4" : "#fff", border: `1.5px solid ${a.vehicleSold ? "#16a34a" : "#e5e7eb"}`, fontSize: 13, fontWeight: 600, color: a.vehicleSold ? "#166534" : NAVY, cursor: "pointer" }}>
            <input type="checkbox" checked={a.vehicleSold} onChange={(e) => { setLocal(a.id, { vehicleSold: e.target.checked }); save(a.id, { vehicleSold: e.target.checked }); }} />
            🏁 Véhicule vendu (livré / payé)
          </label>
        </>
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

      {!a.cancelled && (
        <>
          <div style={sectionLabel}>Actions rapides</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => toggleParking(a)} title={a.parkingSent ? "Mail parking déjà envoyé au client" : a.parkingRequested ? "Mail parking envoyé immédiatement au client" : "Réserve une place et envoie le mail parking au client maintenant"} style={{ flex: "1 1 30%", padding: "9px 12px", borderRadius: 8, background: a.parkingRequested ? PINK : "#fff", color: a.parkingRequested ? "#fff" : NAVY, border: `1.5px solid ${a.parkingRequested ? PINK : "#e5e7eb"}`, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              🅿️ {a.parkingSent ? "Parking envoyé" : "Mail parking"}
            </button>
            <a href={`/reschedule?eid=${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer" title="Ouvre la page pour changer le créneau (envoie un mail de reprogrammation au client)" style={{ flex: "1 1 30%", textAlign: "center", padding: "9px 12px", borderRadius: 8, background: NAVY, color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
              📅 Reprogrammer
            </a>
            <a href={`/client/${encodeURIComponent(a.id)}`} title="Fiche client complète (renvoyer mail/SMS, historique, etc.)" style={{ flex: "1 1 30%", textAlign: "center", padding: "9px 12px", borderRadius: 8, background: "#fff", color: PINK, textDecoration: "none", fontSize: 13, fontWeight: 600, border: `1.5px solid ${PINK}` }}>
              👤 Fiche client
            </a>
            <button onClick={() => cancel(a)} title="Annule le RDV (envoie un mail d'annulation au client)" style={{ flex: "1 1 100%", padding: "9px 12px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ❌ Annuler le RDV
            </button>
          </div>
        </>
      )}
    </div>
  );

  const reminderCard = (r: Reminder) => (
    <div key={`rem-${r.id}`} style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderLeft: "4px solid #8b5cf6", borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#8b5cf6", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>📞 Rappel téléphonique</div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: 14, marginTop: 2 }}>{r.first_name} {r.last_name}</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{r.phone}</div>
          {r.note && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2, fontStyle: "italic" }}>{r.note}</div>}
          {r.listing_url && <a href={r.listing_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#8b5cf6", textDecoration: "underline" }}>🔗 Annonce</a>}
        </div>
        <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: NAVY }}>
          {new Date(r.remind_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );

  // Recherche globale : quand on tape une recherche, on liste TOUS les résultats
  // de l'agenda (toutes dates confondues), pas seulement le jour sélectionné.
  const searchActive = search.trim() !== "";
  const searchAppts = [...filtered].sort((x, y) => (x.startDateTime! < y.startDateTime! ? -1 : 1));
  const searchRems = [...remindersByDay.values()].flat().sort((x, y) => (x.remind_at < y.remind_at ? -1 : 1));

  // === CALENDRIER MENSUEL ===
  const baseDate = new Date();
  baseDate.setDate(1);
  baseDate.setMonth(baseDate.getMonth() + monthOffset);
  const year = baseDate.getFullYear();
  const monthIdx = baseDate.getMonth();
  const monthName = baseDate.toLocaleString("fr-FR", { month: "long", year: "numeric" });

  // Cellules : 7 cols, commence lundi
  const firstDay = new Date(year, monthIdx, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // 0=lundi
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const cells: ({ date: string; day: number; inMonth: boolean })[] = [];
  // jours du mois précédent pour combler
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, monthIdx, -i);
    cells.push({ date: parisDate(d), day: d.getDate(), inMonth: false });
  }
  // mois courant
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: parisDate(new Date(year, monthIdx, d)), day: d, inMonth: true });
  }
  // mois suivant pour compléter à multiple de 7
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const d = new Date(year, monthIdx + 1, cells.length - daysInMonth - startWeekday + 1);
    cells.push({ date: parisDate(d), day: d.getDate(), inMonth: false });
  }

  const selectedList = byDay.get(selectedDay) ?? [];
  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Rechercher dans tout l'agenda (nom, tél, e-mail, marque, modèle)" style={{ width: "100%", padding: 12, fontSize: 15, borderRadius: 10, border: "1.5px solid #e5e7eb", boxSizing: "border-box", marginBottom: 10 }} />

      {/* Filtres par relation au RDV */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {([
          { k: "mine", label: "Tous mes RDV" },
          { k: "created", label: "Mes RDV créés" },
          { k: "assigned", label: "Mes RDV affectés" },
          { k: "team", label: isAdmin ? "Tous (équipe)" : "RDV de mon équipe" },
        ] as { k: RelFilter; label: string }[]).map((f) => (
          <button key={f.k} onClick={() => setRelFilter(f.k)} style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${relFilter === f.k ? PINK : "#e5e7eb"}`, background: relFilter === f.k ? PINK : "#fff", color: relFilter === f.k ? "#fff" : "#6b7280" }}>{f.label}</button>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => setMonthOffset(monthOffset - 1)} style={{ padding: "6px 12px", borderRadius: 7, background: "#fff", border: "1.5px solid #e5e7eb", fontSize: 14, fontWeight: 600, color: NAVY, cursor: "pointer" }}>‹</button>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 16, fontWeight: 700, color: NAVY, textTransform: "capitalize" }}>{monthName}</div>
          <button onClick={() => setMonthOffset(monthOffset + 1)} style={{ padding: "6px 12px", borderRadius: 7, background: "#fff", border: "1.5px solid #e5e7eb", fontSize: 14, fontWeight: 600, color: NAVY, cursor: "pointer" }}>›</button>
        </div>
        {monthOffset !== 0 && (
          <button onClick={() => { setMonthOffset(0); setSelectedDay(today); }} style={{ width: "100%", marginBottom: 10, padding: "6px 10px", borderRadius: 7, background: PINK, color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>← Aujourd&apos;hui</button>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 10, color: "#9aa6b8", fontWeight: 700, padding: 4 }}>{d}</div>
          ))}
          {cells.map((c) => {
            const list = byDay.get(c.date) ?? [];
            const rems = remindersByDay.get(c.date) ?? [];
            const isToday = c.date === today;
            const isSel = c.date === selectedDay;
            const dotColor = dayColor(list);
            const hasReminder = rems.length > 0;
            const totalCount = list.length + rems.length;
            return (
              <button
                key={c.date}
                onClick={() => setSelectedDay(c.date)}
                style={{
                  aspectRatio: "1 / 1.1",
                  padding: 2,
                  borderRadius: 7,
                  border: isSel ? `2px solid ${PINK}` : isToday ? "1.5px solid " + NAVY : "1px solid #f0f1f3",
                  background: !c.inMonth ? "#fafafa" : isSel ? "#fff5f9" : "#fff",
                  color: !c.inMonth ? "#cbd5e1" : NAVY,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  fontSize: 13,
                  fontWeight: isToday ? 800 : 600,
                  paddingTop: 4,
                  position: "relative",
                }}
              >
                <span>{c.day}</span>
                {totalCount > 0 && (
                  <span style={{ marginTop: "auto", marginBottom: 2, display: "flex", alignItems: "center", gap: 2 }}>
                    {list.length > 0 && <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor }} />}
                    {hasReminder && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#8b5cf6" }} />}
                    <span style={{ fontSize: 10, fontWeight: 700, color: dotColor !== "transparent" ? dotColor : "#8b5cf6" }}>{totalCount}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}

      {searchActive ? (
        <div style={{ marginBottom: 22 }}>
          <h2 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 14, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>
            🔍 Résultats pour « {search.trim()} » <span style={{ color: "#9aa6b8" }}>({searchAppts.length + searchRems.length})</span>
          </h2>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#9aa6b8" }}>Recherche sur tout l&apos;agenda (toutes dates). La date du RDV est indiquée sur chaque résultat.</p>
          {searchRems.map(reminderCard)}
          {searchAppts.length === 0 && searchRems.length === 0 ? (
            <p style={{ color: "#9aa6b8", textAlign: "center", padding: 20, background: "#fff", border: "1px solid #f0f1f3", borderRadius: 10, fontSize: 14, fontStyle: "italic" }}>Aucun résultat dans l&apos;agenda.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>{searchAppts.map(card)}</div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 22 }}>
          <h2 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 14, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>
            {selectedDay === today ? "Aujourd'hui" : ""} <span style={{ color: NAVY, textTransform: "capitalize" }}>{dayLabel(selectedDay)}</span> <span style={{ color: "#9aa6b8" }}>({selectedList.length + (remindersByDay.get(selectedDay)?.length ?? 0)})</span>
          </h2>
          {(remindersByDay.get(selectedDay) ?? []).map(reminderCard)}
          {selectedList.length === 0 && (remindersByDay.get(selectedDay) ?? []).length === 0 ? (
            <p style={{ color: "#9aa6b8", textAlign: "center", padding: 20, background: "#fff", border: "1px solid #f0f1f3", borderRadius: 10, fontSize: 14, fontStyle: "italic" }}>Rien ce jour.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>{selectedList.map(card)}</div>
          )}
        </div>
      )}

      {appts.length === 0 && !loading && <p style={{ color: "#6b7280", textAlign: "center" }}>Aucun rendez-vous.</p>}
    </>
  );
}

export default function Page() {
  return <Shell active="agenda"><Agenda /></Shell>;
}

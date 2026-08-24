"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DatePicker, TimePicker } from "./Pickers";
import { formatMobileEnCours, mobileFR } from "@/lib/telephone-fr";
import { INK, BG, LINE, MUTED, SOFT, input as inputStyle, label as labelStyle, pill } from "./theme";

export type Rappel = {
  id: number; nom: string; prenom: string; telephone: string;
  callback_at: string; notes: string; statut: string;
  telepro_email: string; telepro_name: string;
  done_at: string | null; sms_confirm_at: string | null; sms_24h_at: string | null; sms_2h_at: string | null;
};

type Me = { email: string; name: string; role: "admin" | "telepro" };

function headers(): Record<string, string> {
  const t = typeof window === "undefined" ? null : localStorage.getItem("dde_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}

const fmtHeure = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(":", "h");

const fmtJour = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso));

const jourParis = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);

/** Où en est un rappel : en retard, aujourd'hui, plus tard, ou déjà traité. */
export function etatRappel(r: Rappel, maintenant = Date.now()): "fait" | "annule" | "retard" | "aujourdhui" | "avenir" {
  if (r.statut === "fait") return "fait";
  if (r.statut === "annule") return "annule";
  const t = new Date(r.callback_at).getTime();
  if (t < maintenant) return "retard";
  return jourParis(new Date(r.callback_at)) === jourParis(new Date(maintenant)) ? "aujourdhui" : "avenir";
}

/** Rappels qui réclament une action maintenant : en retard ou prévus aujourd'hui. */
export function rappelsUrgents(rappels: Rappel[], maintenant = Date.now()): Rappel[] {
  return rappels.filter((r) => ["retard", "aujourdhui"].includes(etatRappel(r, maintenant)));
}

// ---------- Cloche ----------

/** Cloche du bandeau : nombre de rappels à traiter, ouvre la liste au clic. */
export function ClocheRappels({ rappels, onOuvrir }: { rappels: Rappel[]; onOuvrir: () => void }) {
  const n = rappelsUrgents(rappels).length;
  const enRetard = rappels.some((r) => etatRappel(r) === "retard");
  return (
    <button
      onClick={onOuvrir}
      title={n === 0 ? "Aucun rappel à traiter" : `${n} rappel${n > 1 ? "s" : ""} à traiter`}
      aria-label={`Rappels : ${n} à traiter`}
      style={{ position: "relative", height: 36, width: 36, borderRadius: 18, border: `1px solid ${LINE}`, background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {n > 0 && (
        <span style={{
          position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, padding: "0 5px", borderRadius: 10,
          background: enRetard ? "#b3261e" : INK, color: "#fff", fontSize: 11, fontWeight: 800,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>{n}</span>
      )}
    </button>
  );
}

// ---------- Fenêtre de la cloche ----------

export function ModaleRappels({ rappels, onClose, onCocher, onOuvrirOnglet }: {
  rappels: Rappel[]; onClose: () => void; onCocher: (r: Rappel, fait: boolean) => void; onOuvrirOnglet: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groupes: { titre: string; etat: ReturnType<typeof etatRappel>; liste: Rappel[] }[] = [
    { titre: "En retard", etat: "retard", liste: rappels.filter((r) => etatRappel(r) === "retard") },
    { titre: "Aujourd'hui", etat: "aujourdhui", liste: rappels.filter((r) => etatRappel(r) === "aujourdhui") },
    { titre: "À venir", etat: "avenir", liste: rappels.filter((r) => etatRappel(r) === "avenir") },
  ];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(26,26,26,0.35)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: BG, borderRadius: 18, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", margin: 0 }}>Mes rappels</h2>
          <button onClick={onClose} aria-label="Fermer" style={{ height: 34, width: 34, borderRadius: 17, border: `1px solid ${LINE}`, background: "#fff", fontSize: 15, cursor: "pointer", color: MUTED }}>✕</button>
        </div>

        {groupes.every((g) => g.liste.length === 0) ? (
          <div style={{ fontSize: 16, color: MUTED, marginBottom: 20 }}>Aucun rappel en attente.</div>
        ) : (
          groupes.filter((g) => g.liste.length > 0).map((g) => (
            <div key={g.titre} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: g.etat === "retard" ? "#b3261e" : MUTED, marginBottom: 8 }}>
                {g.titre} ({g.liste.length})
              </div>
              <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
                {g.liste.map((r, i) => (
                  <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${SOFT}`, cursor: "pointer" }}>
                    <input type="checkbox" checked={false} onChange={() => onCocher(r, true)} title="Marquer comme fait" style={{ width: 18, height: 18, cursor: "pointer" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{r.nom.toUpperCase()} {r.prenom}</div>
                      <div style={{ fontSize: 13, color: MUTED }}>
                        {fmtJour(r.callback_at)} à {fmtHeure(r.callback_at)} · {r.telephone}
                      </div>
                    </div>
                    <a href={`tel:${r.telephone.replace(/\s/g, "")}`} onClick={(e) => e.stopPropagation()} style={{ height: 32, padding: "0 12px", borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", fontSize: 13, fontWeight: 700, color: INK, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Appeler</a>
                  </label>
                ))}
              </div>
            </div>
          ))
        )}

        <button onClick={() => { onOuvrirOnglet(); onClose(); }} style={{ height: 44, padding: "0 20px", borderRadius: 22, border: `1px solid ${LINE}`, background: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Voir tous les rappels
        </button>
      </div>
    </div>
  );
}

// ---------- Onglet Rappels ----------

export function OngletRappels({ me, rappels, reload }: { me: Me; rappels: Rappel[]; reload: () => void }) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const telephoneValide = mobileFR(telephone) !== null;
  const canSubmit = nom.trim() !== "" && telephoneValide && date !== "" && heure !== "" && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setErr(""); setConfirm("");
    try {
      const r = await fetch("/api/dde/callbacks", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ nom, prenom, telephone, date, heure, notes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erreur.");
      setNom(""); setPrenom(""); setTelephone(""); setDate(""); setHeure(""); setNotes("");
      setConfirm("Rappel enregistré.");
      setTimeout(() => setConfirm(""), 4000);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function cocher(r: Rappel, fait: boolean) {
    await fetch("/api/dde/callbacks", { method: "PATCH", headers: headers(), body: JSON.stringify({ id: r.id, statut: fait ? "fait" : "a_faire" }) });
    reload();
  }
  async function supprimer(r: Rappel) {
    await fetch(`/api/dde/callbacks?id=${r.id}`, { method: "DELETE", headers: headers() });
    reload();
  }

  const groupes = useMemo(() => ([
    { titre: "En retard", etat: "retard" as const },
    { titre: "Aujourd'hui", etat: "aujourdhui" as const },
    { titre: "À venir", etat: "avenir" as const },
    { titre: "Faits", etat: "fait" as const },
  ]).map((g) => ({ ...g, liste: rappels.filter((r) => etatRappel(r) === g.etat) })), [rappels]);

  return (
    <div style={{ display: "grid", gap: 48 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 16px" }}>Nouveau rappel</h1>
        <p style={{ margin: "0 0 40px", fontSize: 15, color: MUTED, lineHeight: 1.5 }}>
          La personne n&apos;est pas disponible : on programme un rappel téléphonique au lieu d&apos;un rendez-vous.
        </p>

        <label htmlFor="r-nom" style={labelStyle}>Nom</label>
        <input id="r-nom" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...inputStyle, marginBottom: 24 }} />

        <label htmlFor="r-prenom" style={labelStyle}>Prénom <span style={{ fontWeight: 400, color: MUTED, fontSize: 15 }}>(facultatif)</span></label>
        <input id="r-prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} style={{ ...inputStyle, marginBottom: 24 }} />

        <label htmlFor="r-tel" style={labelStyle}>Numéro de téléphone</label>
        <input
          id="r-tel" type="tel" inputMode="tel" placeholder="06 12 34 56 78" value={telephone}
          onChange={(e) => setTelephone(formatMobileEnCours(e.target.value))}
          style={{ ...inputStyle, marginBottom: telephone && !telephoneValide ? 10 : 24 }}
        />
        {telephone && !telephoneValide && (
          <div style={{ fontSize: 14, color: MUTED, marginBottom: 24 }}>Mobile français attendu : 10 chiffres commençant par 06 ou 07.</div>
        )}

        <div style={labelStyle}>Date du rappel</div>
        <div style={{ marginBottom: 24 }}><DatePicker value={date} onChange={setDate} /></div>

        <div style={labelStyle}>Heure du rappel</div>
        <div style={{ marginBottom: 24 }}><TimePicker value={heure} onChange={setHeure} date={date} /></div>

        <label htmlFor="r-notes" style={labelStyle}>Commentaire <span style={{ fontWeight: 400, color: MUTED, fontSize: 15 }}>(facultatif)</span></label>
        <textarea id="r-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, height: "auto", padding: "16px 18px", marginBottom: 24, fontFamily: "inherit", resize: "vertical" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <button type="submit" disabled={!canSubmit} style={pill(canSubmit)}>{busy ? "Enregistrement…" : "Enregistrer le rappel"}</button>
          {confirm && <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{confirm}</span>}
          {err && <span style={{ fontSize: 15, fontWeight: 700, color: "#b3261e" }}>{err}</span>}
        </div>
      </form>

      <div>
        {groupes.every((g) => g.liste.length === 0) ? (
          <div style={{ fontSize: 17, color: MUTED, textAlign: "center" }}>Aucun rappel enregistré pour le moment.</div>
        ) : (
          groupes.filter((g) => g.liste.length > 0).map((g) => (
            <div key={g.titre} style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: g.etat === "retard" ? "#b3261e" : MUTED, marginBottom: 10 }}>
                {g.titre} ({g.liste.length})
              </div>
              <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
                {g.liste.map((r, i) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderTop: i === 0 ? "none" : `1px solid ${SOFT}`, flexWrap: "wrap" }}>
                    <input
                      type="checkbox" checked={r.statut === "fait"} onChange={(e) => cocher(r, e.target.checked)}
                      title={r.statut === "fait" ? "Remettre à faire" : "Marquer comme fait"}
                      style={{ width: 18, height: 18, cursor: "pointer" }}
                    />
                    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, textDecoration: r.statut === "fait" ? "line-through" : "none" }}>
                        {r.nom.toUpperCase()} {r.prenom}
                      </div>
                      <div style={{ fontSize: 13, color: MUTED }}>
                        {fmtJour(r.callback_at)} à {fmtHeure(r.callback_at)} · {r.telephone}
                        {me.role === "admin" && r.telepro_name ? ` · ${r.telepro_name}` : ""}
                      </div>
                      {r.notes && <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{r.notes}</div>}
                    </div>
                    <a href={`tel:${r.telephone.replace(/\s/g, "")}`} style={{ height: 32, padding: "0 12px", borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", fontSize: 13, fontWeight: 700, color: INK, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Appeler</a>
                    <button onClick={() => supprimer(r)} title="Supprimer le rappel" style={{ height: 32, width: 32, borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", fontSize: 14, cursor: "pointer", color: MUTED }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Chargement des rappels, partagé entre la cloche et l'onglet. */
export function useRappels(actif: boolean) {
  const [rappels, setRappels] = useState<Rappel[]>([]);

  const reload = useCallback(async () => {
    if (!actif) return;
    try {
      const r = await fetch("/api/dde/callbacks", { headers: headers() });
      const j = await r.json();
      if (r.ok) setRappels(j.rappels);
    } catch { /* réseau indisponible : on garde la liste précédente */ }
  }, [actif]);

  useEffect(() => { reload(); }, [reload]);

  // La cloche doit rester juste sans recharger la page : relecture toutes les 2 minutes.
  useEffect(() => {
    if (!actif) return;
    const t = setInterval(reload, 120_000);
    return () => clearInterval(t);
  }, [actif, reload]);

  return { rappels, reload };
}

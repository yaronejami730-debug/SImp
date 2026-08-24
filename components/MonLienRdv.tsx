"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders, getUser } from "@/lib/client";
import { Card, Badge, DatePicker, T, R, S } from "@/components/ui";

type Creneau = { time: string; taken?: boolean; free?: boolean };

const isoJour = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);
const enLettres = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};

/** Lien de prise de RDV personnel + aperçu concret des créneaux réellement libres. */
export default function MonLienRdv() {
  const [lien, setLien] = useState("");
  const [copie, setCopie] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [jour, setJour] = useState(isoJour(new Date()));
  const [creneaux, setCreneaux] = useState<Creneau[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const user = getUser();

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/mon-lien", { headers: authHeaders() });
      const d = await r.json();
      if (d.ok) setLien(d.url);
    })().catch(() => {});
  }, []);

  const chargerCreneaux = useCallback(async () => {
    if (!ouvert) return;
    setChargement(true);
    try {
      const q = new URLSearchParams({ date: jour, type: "agence" });
      if (user?.isCommercial && user?.name) q.set("commercial", user.name);
      const r = await fetch(`/api/availability?${q}`, { headers: authHeaders() });
      const d = await r.json();
      // L'API renvoie selon les cas { slots: [...] } de chaînes ou d'objets.
      const bruts = d.slots ?? d.creneaux ?? [];
      setCreneaux(bruts.map((s: string | Creneau) => (typeof s === "string" ? { time: s, free: true } : s)));
    } catch {
      setCreneaux([]);
    } finally {
      setChargement(false);
    }
  }, [ouvert, jour, user?.isCommercial, user?.name]);

  useEffect(() => { chargerCreneaux(); }, [chargerCreneaux]);

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch { /* presse-papiers refusé : le lien reste sélectionnable à la main */ }
  }

  const libres = (creneaux ?? []).filter((c) => c.free !== false && !c.taken);
  const pris = (creneaux ?? []).filter((c) => c.free === false || c.taken);

  return (
    <Card
      title="Mon lien de rendez-vous"
      description="Envoie ce lien à un client : il choisit lui-même un créneau parmi tes disponibilités, et le rendez-vous arrive directement dans ton agenda."
      actions={<Badge ton="info">Valable 21 jours</Badge>}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: S.md }}>
        <input
          readOnly value={lien} onFocus={(e) => e.currentTarget.select()}
          style={{ flex: "1 1 320px", minWidth: 0, height: 44, padding: "0 14px", fontSize: 14, border: `1px solid ${T.line}`, borderRadius: R.sm, background: T.surface2, color: T.ink2 }}
        />
        <button onClick={copier} disabled={!lien}
          style={{ height: 40, padding: "0 16px", borderRadius: R.sm, border: "none", background: lien ? T.brand : T.surface3, color: lien ? "#fff" : T.ink3, fontSize: 13.5, fontWeight: 700, cursor: lien ? "pointer" : "not-allowed" }}>
          {copie ? "Lien copié" : "Copier le lien"}
        </button>
        <a href={lien || "#"} target="_blank" rel="noopener noreferrer"
          style={{ height: 40, padding: "0 16px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          Ouvrir
        </a>
      </div>

      <button onClick={() => setOuvert((o) => !o)}
        style={{ height: 38, padding: "0 16px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
        {ouvert ? "Masquer mes horaires" : "Afficher mes horaires"}
      </button>

      {ouvert && (
        <div style={{ marginTop: S.md, display: "grid", gap: S.md, gridTemplateColumns: "minmax(240px, 300px) 1fr", alignItems: "start" }}>
          <DatePicker label="Jour à consulter" value={jour} onChange={(v) => setJour(v || isoJour(new Date()))} min={isoJour(new Date())} />

          <div style={{ border: `1px solid ${T.line}`, borderRadius: R.md, padding: S.md, background: T.surface2 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, textTransform: "capitalize" }}>{enLettres(jour)}</div>
            <div style={{ fontSize: 13, color: T.ink2, marginBottom: 12 }}>
              {chargement ? "Lecture de ton agenda…"
                : libres.length === 0 ? "Aucun créneau libre ce jour-là."
                : `${libres.length} créneau${libres.length > 1 ? "x" : ""} libre${libres.length > 1 ? "s" : ""} — c'est exactement ce que verra ton client.`}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {libres.map((c) => (
                <span key={c.time} style={{ height: 36, padding: "0 14px", borderRadius: R.pill, background: T.surface, border: `1px solid ${T.line}`, fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center" }}>
                  {c.time}
                </span>
              ))}
              {pris.map((c) => (
                <span key={`x-${c.time}`} title="Créneau déjà occupé" style={{ height: 36, padding: "0 14px", borderRadius: R.pill, background: T.surface3, fontSize: 14, color: T.ink3, textDecoration: "line-through", display: "inline-flex", alignItems: "center" }}>
                  {c.time}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

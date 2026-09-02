"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";
import { T, R, S } from "@/components/ui/tokens";

type Item = {
  id: string; client: string; car: string; immatriculation: string; commercial: string;
  callCenterId: number; callCenter: string; teleprospector: string; mandatAt: string | null;
  days: number; negotiation: number; listingUrl: string; photo: string;
};
type Group = { key: string; label: string; enStock: number; vendues: number; retires: number; enCours: number };
type Data = {
  ok: true; enStock: number; vendues: number; retires: number; enCours: number;
  stock: Item[]; byCallCenter: Group[]; byCommercial: Group[];
  viewerRole: "admin" | "responsable" | "commercial" | "collab";
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Tuile({ label, value, ton, sub }: { label: string; value: number; ton?: "brand" | "success" | "danger" | "info"; sub?: string }) {
  const couleur = ton === "success" ? T.success : ton === "danger" ? T.danger : ton === "info" ? T.info : T.brand;
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: R.md, padding: `${S.md}px ${S.md}px` }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: T.ink2 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 800, color: couleur, lineHeight: 1.15, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Repartition({ titre, groupes, actif, onSelect }: { titre: string; groupes: Group[]; actif: string; onSelect: (k: string) => void }) {
  const max = Math.max(1, ...groupes.map((g) => g.enStock));
  return (
    <section style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: R.md, padding: S.md }}>
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: T.ink2, marginBottom: S.sm }}>{titre}</div>
      {groupes.length === 0 && <div style={{ fontSize: 13.5, color: T.ink3 }}>Aucun mandat.</div>}
      <div style={{ display: "grid", gap: 6 }}>
        {groupes.map((g) => {
          const on = actif === g.key;
          return (
            <button key={g.key} type="button" onClick={() => onSelect(on ? "" : g.key)}
              style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center", textAlign: "left", padding: "8px 10px", borderRadius: R.sm, cursor: "pointer",
                border: on ? `1px solid ${T.brandLine}` : `1px solid transparent`, background: on ? T.brandSoft : "transparent" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, color: T.ink, fontWeight: on ? 700 : 500 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                  <span style={{ fontWeight: 800, color: T.brand }}>{g.enStock}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: T.surface3, marginTop: 5, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round((g.enStock / max) * 100)}%`, height: "100%", background: T.brand, borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 4 }}>
                  {g.vendues} vendue{g.vendues > 1 ? "s" : ""} · {g.retires} retiré{g.retires > 1 ? "s" : ""} · {g.enCours} en cours
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Stock() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [fCc, setFCc] = useState("");
  const [fCom, setFCom] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/stock", { headers: authHeaders() });
        const d = await r.json();
        if (d.ok) setData(d); else setErr(d.error ?? "Erreur");
      } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
      finally { setLoading(false); }
    })();
  }, []);

  const tok = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

  const liste = useMemo(() => {
    if (!data) return [];
    let l = data.stock;
    if (fCc) l = l.filter((i) => String(i.callCenterId) === fCc);
    if (fCom) l = l.filter((i) => (tok(i.commercial) || "?") === fCom);
    const needle = q.trim().toLowerCase();
    if (needle) l = l.filter((i) => [i.client, i.car, i.immatriculation, i.commercial, i.callCenter].join(" ").toLowerCase().includes(needle));
    return l;
  }, [data, fCc, fCom, q]);

  const moyenneJours = liste.length ? Math.round(liste.reduce((a, i) => a + i.days, 0) / liste.length) : 0;

  return (
    <Shell active="stock" wide>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: S.md, flexWrap: "wrap", marginBottom: S.md }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: T.ink }}>Stock</h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: T.ink2 }}>Véhicules sous mandat signé, pas encore vendus. Répartition par call center et par commercial.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher client, véhicule, immat…"
          style={{ height: 40, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 14, minWidth: 240, fontFamily: "inherit" }} />
      </div>

      {loading && <p style={{ color: T.ink3 }}>Chargement…</p>}
      {err && <p style={{ color: T.danger }}>❌ {err}</p>}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: S.sm, marginBottom: S.md }}>
            <Tuile label="En stock" value={data.enStock} ton="brand" sub="mandats signés, non vendus" />
            <Tuile label="Vendues" value={data.vendues} ton="success" sub="sorties du stock" />
            <Tuile label="Mandats retirés" value={data.retires} ton="danger" />
            <Tuile label="En cours" value={data.enCours} ton="info" sub="annonce en ligne, mandat à signer" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: S.sm, marginBottom: S.md }}>
            {data.viewerRole !== "commercial" && (
              <Repartition titre="Par call center" groupes={data.byCallCenter} actif={fCc} onSelect={setFCc} />
            )}
            <Repartition titre="Par commercial" groupes={data.byCommercial} actif={fCom} onSelect={setFCom} />
          </div>

          <section style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: R.md, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: S.sm, padding: `${S.sm}px ${S.md}px`, borderBottom: `1px solid ${T.line}`, background: T.surface2, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: T.ink2 }}>
                Véhicules en stock · {liste.length}{liste.length !== data.enStock ? ` / ${data.enStock}` : ""}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: T.ink3 }}>
                {liste.length > 0 && <span>Ancienneté moyenne : {moyenneJours} j</span>}
                {(fCc || fCom) && (
                  <button type="button" onClick={() => { setFCc(""); setFCom(""); }}
                    style={{ height: 28, padding: "0 10px", borderRadius: R.pill, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 12, cursor: "pointer" }}>
                    Effacer les filtres
                  </button>
                )}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ color: T.ink3, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {["Véhicule", "Immat.", "Client", "Commercial", "Call center", "Mandat", "En stock", "Négo"].map((h) => (
                      <th key={h} style={{ textAlign: h === "En stock" || h === "Négo" ? "right" : "left", padding: "8px 12px", borderBottom: `1px solid ${T.line}`, fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liste.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 20, color: T.ink3, textAlign: "center" }}>Aucun véhicule en stock.</td></tr>
                  )}
                  {liste.map((i) => (
                    <tr key={i.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                      <td style={{ padding: "9px 12px", fontWeight: 600, color: T.ink }}>
                        <a href={`/client/${encodeURIComponent(i.id)}`} style={{ color: T.ink, textDecoration: "none" }}>{i.car || "Véhicule non renseigné"}</a>
                      </td>
                      <td style={{ padding: "9px 12px", color: T.ink2, whiteSpace: "nowrap" }}>{i.immatriculation || "—"}</td>
                      <td style={{ padding: "9px 12px", color: T.ink2 }}>{i.client || "—"}</td>
                      <td style={{ padding: "9px 12px", color: T.ink2 }}>{i.commercial || "—"}</td>
                      <td style={{ padding: "9px 12px", color: T.ink2 }}>{i.callCenter}</td>
                      <td style={{ padding: "9px 12px", color: T.ink2, whiteSpace: "nowrap" }}>{fmtDate(i.mandatAt)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: i.days > 60 ? T.danger : i.days > 30 ? T.warning : T.ink }}>{i.days} j</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap", color: T.ink2 }}>{i.negotiation ? eur(i.negotiation) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}

export default Stock;

"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const ACCENT = "#24B9D7";

type Row = {
  id: number;
  url: string;
  platform: string;
  title: string | null;
  price_eur: number | null;
  km: number | null;
  year: number | null;
  brand: string | null;
  location: string | null;
  image_url: string | null;
  is_pro: boolean;
  email_received_at: string;
  dismissed: boolean;
};

const BRAND_CHOICES = [
  "Volkswagen", "Mercedes", "Toyota", "BYD", "Tesla", "Audi", "BMW",
  "Peugeot", "Renault", "Citroën", "DS", "Ford", "Hyundai", "Kia",
  "Skoda", "Seat", "Cupra", "Polestar", "Volvo", "MINI", "Porsche",
];

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600 };
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, fontSize: 14, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" };

function Scan() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [maxKm, setMaxKm] = useState(130000);
  const [minYear, setMinYear] = useState(2016);
  const [particulierOnly, setParticulierOnly] = useState(true);
  const [includeDismissed, setIncludeDismissed] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (brands.length) p.set("brands", brands.join(","));
    p.set("maxKm", String(maxKm));
    p.set("minYear", String(minYear));
    if (particulierOnly) p.set("particulierOnly", "1");
    if (includeDismissed) p.set("includeDismissed", "1");
    return p.toString();
  }, [brands, maxKm, minYear, particulierOnly, includeDismissed]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/scan/list?${params}`, { headers: authHeaders() });
      const d = await r.json();
      if (d.ok) setRows(d.rows);
      else setErr(d.error ?? "Erreur");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function toggleBrand(b: string) {
    setBrands((bs) => (bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]));
  }

  async function dismiss(id: number) {
    await fetch("/api/scan/dismiss", {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ id }),
    });
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  function createRdv(url: string) {
    sessionStorage.setItem("prefillListingUrl", url);
    window.location.href = "/";
  }

  return (
    <>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 14px", fontFamily: "'Cabin',sans-serif", fontSize: 20, fontWeight: 700, color: NAVY, textTransform: "uppercase" }}>Scan annonces</h1>
        <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 13 }}>Feed des alertes mail LBC / LaCentrale / ParuVendu. Configure tes recherches sauvegardées côté sites, fais-les arriver dans ce flux.</p>

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>Marques</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {BRAND_CHOICES.map((b) => {
                const on = brands.includes(b);
                return (
                  <button key={b} type="button" onClick={() => toggleBrand(b)}
                    style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: on ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb",
                      background: on ? PINK : "#fff", color: on ? "#fff" : NAVY }}>{b}</button>
                );
              })}
              {brands.length > 0 && (
                <button type="button" onClick={() => setBrands([])} style={{ padding: "6px 10px", borderRadius: 999, fontSize: 12, background: "#fff", border: "1.5px solid #e5e7eb", color: "#6b7280", cursor: "pointer" }}>Tout déselectionner</button>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Km max : <span style={{ color: NAVY }}>{maxKm.toLocaleString("fr-FR")} km</span></label>
              <input type="range" min={20000} max={200000} step={5000} value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value))} style={{ width: "100%", accentColor: PINK }} />
            </div>
            <div>
              <label style={labelStyle}>Année min</label>
              <select value={minYear} onChange={(e) => setMinYear(Number(e.target.value))} style={inputStyle}>
                {[2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: NAVY, cursor: "pointer" }}>
              <input type="checkbox" checked={particulierOnly} onChange={(e) => setParticulierOnly(e.target.checked)} style={{ accentColor: PINK }} />
              Particulier uniquement
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: NAVY, cursor: "pointer" }}>
              <input type="checkbox" checked={includeDismissed} onChange={(e) => setIncludeDismissed(e.target.checked)} style={{ accentColor: PINK }} />
              Inclure les annonces masquées
            </label>
            <button onClick={load} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#fff", color: NAVY, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>↻ Rafraîchir</button>
          </div>
        </div>
      </div>

      {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}
      {loading && <p style={{ color: "#6b7280", textAlign: "center" }}>Chargement…</p>}

      {!loading && rows.length === 0 && (
        <div style={{ background: "#fff", border: "1px dashed #e5e7eb", borderRadius: 12, padding: 24, textAlign: "center", color: "#6b7280", fontSize: 14 }}>
          Aucune annonce. Vérifie tes alertes mail ou détend les filtres.
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
            {r.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.image_url} alt="" width={84} height={84} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, flexShrink: 0, background: "#f4f4f5" }} />
            ) : (
              <div style={{ width: 84, height: 84, borderRadius: 8, background: "#f4f4f5", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 11 }}>Pas d&apos;image</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.4 }}>{r.platform}</span>
                {r.brand && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#eef2ff", color: NAVY, fontWeight: 600 }}>{r.brand}</span>}
                {r.is_pro && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", fontWeight: 600 }}>PRO</span>}
              </div>
              <div style={{ fontSize: 14, color: NAVY, fontWeight: 600, marginTop: 2, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{r.title ?? r.url}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {r.price_eur != null && <span style={{ color: NAVY, fontWeight: 600 }}>{r.price_eur.toLocaleString("fr-FR")} €</span>}
                {r.km != null && <span>{r.km.toLocaleString("fr-FR")} km</span>}
                {r.year != null && <span>{r.year}</span>}
                {r.location && <span>· {r.location}</span>}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: ACCENT, fontWeight: 600, textDecoration: "none" }}>Voir annonce →</a>
                <button onClick={() => createRdv(r.url)} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "none", background: PINK, color: "#fff", fontWeight: 600, cursor: "pointer" }}>Créer RDV</button>
                <button onClick={() => dismiss(r.id)} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "#fff", border: "1.5px solid #e5e7eb", color: "#6b7280", cursor: "pointer", marginLeft: "auto" }}>Masquer</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return <Shell active="scan"><Scan /></Shell>;
}

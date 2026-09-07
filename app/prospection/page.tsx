"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";
import { extractUrl } from "@/lib/parse";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const ACCENT = "#24B9D7";

type Lead = {
  id: number; phone: string; listing_url: string; note: string | null; lead_ref: string; created_at: string;
  first_name: string | null; last_name: string | null; email: string | null; campaign: string | null;
  raw_data: Record<string, string> | null; status: string;
};
type ParsedLead = { phone: string; url: string; note: string; firstName?: string; lastName?: string; email?: string; campaign?: string; raw?: Record<string, string> };

// ── Statut d'appel, choisi via menu déroulant sur chaque lead. ──
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  nouveau: { label: "Nouveau", color: "#6b7280", bg: "#f3f4f6" },
  absent: { label: "Absent", color: "#b45309", bg: "#fef3c7" },
  ne_repond_pas: { label: "Ne répond pas", color: "#b45309", bg: "#fef3c7" },
  faux_numero: { label: "Faux numéro", color: "#dc2626", bg: "#fee2e2" },
  nrp1: { label: "NRP 1", color: "#b45309", bg: "#fef3c7" },
  nrp2: { label: "NRP 2", color: "#b45309", bg: "#fef3c7" },
  nrp3: { label: "NRP 3", color: "#dc2626", bg: "#fee2e2" },
  rdv_pris: { label: "RDV pris", color: "#16a34a", bg: "#dcfce7" },
};
const LEAD_STATUSES_DISPLAY = ["nouveau", "absent", "ne_repond_pas", "faux_numero", "nrp1", "nrp2", "nrp3", "rdv_pris"];

const waPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("33")) return d;
  if (d.startsWith("0")) return "33" + d.slice(1);
  return d;
};
const waUrl = (raw: string) => `https://wa.me/${waPhone(raw)}`;

// URL de la prise de RDV pré-remplie avec les infos du lead.
function rdvHref(l: Lead) {
  const p = new URLSearchParams();
  if (l.first_name) p.set("firstName", l.first_name);
  if (l.last_name) p.set("lastName", l.last_name);
  if (l.email) p.set("email", l.email);
  if (l.phone) p.set("phone", l.phone);
  if (l.listing_url) p.set("listingUrl", l.listing_url);
  return `/simplicicar?${p.toString()}`;
}

const platformOf = (url: string) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.includes("leboncoin")) return "LeBonCoin";
    if (h.includes("lacentrale")) return "LaCentrale";
    if (h.includes("seloger")) return "SeLoger";
    return h;
  } catch { return "Lien"; }
};

const inp: React.CSSProperties = { width: "100%", padding: 12, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box", fontFamily: "inherit" };

// Découpe une ligne d'import en (téléphone, lien, note) — tolère virgule, point-virgule, tabulation ou espaces.
function parseLeadLine(line: string): { phone: string; url: string; note: string } | null {
  const parts = (line.includes(",") ? line.split(",") : line.includes(";") ? line.split(";") : line.split(/\t+/).length > 1 ? line.split(/\t+/) : line.split(/\s+/))
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  let phone = "";
  let url = "";
  const rest: string[] = [];
  for (const p of parts) {
    const asUrl = extractUrl(p);
    if (!url && (asUrl.startsWith("http") || p.includes("."))) { url = asUrl; continue; }
    if (!phone && p.replace(/\D/g, "").length >= 6) { phone = p; continue; }
    rest.push(p);
  }
  if (!phone || !url) return null;
  return { phone, url, note: rest.join(" ") };
}

// Parseur CSV tolérant aux guillemets et virgules/points-virgules dans les champs.
function parseCsv(text: string): string[][] {
  const delim = (text.split("\n")[0]?.split(";").length ?? 0) > (text.split("\n")[0]?.split(",").length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const HEADER_KEYS = {
  phone: ["telephone", "téléphone", "phone", "tel", "numero", "numéro", "mobile"],
  url: ["lien", "url", "annonce", "listing", "link"],
  note: ["note", "commentaire", "comment", "notes"],
  firstName: ["prenom", "prénom", "first name", "firstname"],
  lastName: ["nom de famille", "last name", "lastname", "nom"],
  email: ["email", "e-mail", "mail"],
  campaign: ["campagne", "campaign", "pub"],
};
function normHeader(h: string) { return h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

// Cherche une valeur dans les données brutes du CSV par mots-clés d'en-tête (ex : le modèle du véhicule).
const MODEL_KEYS = ["marque/modele", "marque", "modele", "vehicule", "voiture", "model"];
function findRaw(raw: Record<string, string> | null, keys: string[]): string {
  if (!raw) return "";
  const hit = Object.entries(raw).find(([k]) => keys.some((key) => normHeader(k).includes(key)));
  return hit?.[1] ?? "";
}

// Une valeur "ressemble" à un numéro de téléphone : entre 8 et 15 chiffres une fois les séparateurs enlevés.
function looksLikePhone(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15;
}
// Devine la colonne téléphone par son contenu (>=60% des cellules non vides ressemblent à un numéro),
// utilisé quand l'en-tête ne contient aucun mot-clé reconnu (colonnes en anglais, mal nommées, etc.).
function guessPhoneColumn(rows: string[][]): number {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = -1, bestScore = 0;
  for (let c = 0; c < width; c++) {
    let hits = 0, total = 0;
    for (const r of rows.slice(0, 60)) {
      const v = (r[c] ?? "").trim();
      if (!v) continue;
      total++;
      if (looksLikePhone(v)) hits++;
    }
    const score = total > 0 ? hits / total : 0;
    if (total > 0 && score >= 0.6 && score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// Convertit les lignes CSV parsées en leads, avec ou sans ligne d'en-tête ; conserve la ligne brute (toutes colonnes) pour la fiche détail.
// Accepte n'importe quel jeu de colonnes : seul le téléphone est requis (détecté par mot-clé, sinon par contenu).
function csvToLeads(rows: string[][]): { leads: ParsedLead[]; skipped: number } {
  if (rows.length === 0) return { leads: [], skipped: 0 };
  const headerRow = rows[0].map(normHeader);
  // "prenom" contient "nom" comme sous-chaîne : on exclut la colonne déjà prise par prénom avant de chercher le nom.
  const idx = (keys: string[], exclude: number[] = []) => headerRow.findIndex((h, i) => !exclude.includes(i) && keys.some((k) => h.includes(normHeader(k))));
  let phoneIdx = idx(HEADER_KEYS.phone);
  let hasHeader = phoneIdx !== -1;
  if (!hasHeader) {
    // Aucun mot-clé reconnu dans la 1ère ligne : on devine la colonne téléphone par son contenu.
    const guess = guessPhoneColumn(rows);
    if (guess !== -1) {
      phoneIdx = guess;
      // Si la 1ère ligne a elle-même une valeur "téléphone" dans cette colonne, ce n'est pas un en-tête.
      hasHeader = !looksLikePhone((rows[0][guess] ?? "").trim());
    }
  }
  const urlIdx = hasHeader ? idx(HEADER_KEYS.url) : -1;
  const noteIdx = hasHeader ? idx(HEADER_KEYS.note) : -1;
  const firstNameIdx = hasHeader ? idx(HEADER_KEYS.firstName) : -1;
  const lastNameIdx = hasHeader ? idx(HEADER_KEYS.lastName, [firstNameIdx]) : -1;
  const emailIdx = hasHeader ? idx(HEADER_KEYS.email) : -1;
  const campaignIdx = hasHeader ? idx(HEADER_KEYS.campaign) : -1;
  const originalHeader = hasHeader ? rows[0] : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const pI = phoneIdx; // trouvé par mot-clé ou deviné par contenu — correct dans les deux cas
  const uI = hasHeader ? urlIdx : -1; // sans en-tête, impossible de savoir quelle colonne est le lien -> on l'ignore
  const leads = dataRows
    .map((r) => {
      const raw = originalHeader
        ? Object.fromEntries(originalHeader.map((h, i) => [h.trim() || `col${i + 1}`, (r[i] ?? "").trim()]).filter(([, v]) => v))
        : undefined;
      return {
        phone: (r[pI] ?? "").trim(),
        url: uI !== -1 ? extractUrl((r[uI] ?? "").trim()) : "",
        note: noteIdx !== -1 ? (r[noteIdx] ?? "").trim() : (!hasHeader ? (r[2] ?? "").trim() : ""),
        firstName: firstNameIdx !== -1 ? (r[firstNameIdx] ?? "").trim() : undefined,
        lastName: lastNameIdx !== -1 ? (r[lastNameIdx] ?? "").trim() : undefined,
        email: emailIdx !== -1 ? (r[emailIdx] ?? "").trim() : undefined,
        campaign: campaignIdx !== -1 ? (r[campaignIdx] ?? "").trim() : undefined,
        raw,
      };
    })
    .filter((l) => l.phone);
  return { leads, skipped: dataRows.length - leads.length };
}

function Prospection() {
  const [phone, setPhone] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  // ── Import en masse (colle plusieurs lignes : téléphone + lien + note optionnelle) ──
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; fail: number } | null>(null);

  // ── Conversion d'un lead en RDV téléphonique (rappel) ──
  const [cvId, setCvId] = useState<number | null>(null);
  const [cvFirstName, setCvFirstName] = useState("");
  const [cvLastName, setCvLastName] = useState("");
  const [cvEmail, setCvEmail] = useState("");
  const [cvDate, setCvDate] = useState("");
  const [cvTime, setCvTime] = useState("09:00");
  const [cvNote, setCvNote] = useState("");
  const [cvBusy, setCvBusy] = useState(false);

  // ── Fiche détail d'un lead (toutes les infos importées) ──
  const [ficheLead, setFicheLead] = useState<Lead | null>(null);

  async function fetchLeads(q: string) {
    try {
      const res = await fetch(`/api/leads?phone=${encodeURIComponent(q)}`, { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) setLeads(d.leads); else setErr(d.error ?? "Erreur");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
  }

  useEffect(() => { fetchLeads(""); }, []);
  useEffect(() => { const t = setTimeout(() => fetchLeads(search), 350); return () => clearTimeout(t); }, [search]);

  async function add() {
    if (!phone.trim() || !url.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ phone, listingUrl: url, note }) });
      const d = await res.json();
      if (d.ok) { setPhone(""); setUrl(""); setNote(""); fetchLeads(search); }
      else alert(d.error ?? "Erreur");
    } finally { setAdding(false); }
  }
  async function del(id: number) {
    await fetch(`/api/leads?id=${id}`, { method: "DELETE", headers: authHeaders() });
    setLeads((l) => l.filter((x) => x.id !== id));
  }

  // keepalive : le fetch part avant que le navigateur suive le lien "Prendre rendez-vous".
  function setLeadStatus(id: number, status: string) {
    setLeads((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    fetch("/api/leads", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ id, status }), keepalive: true }).catch(() => {});
  }

  async function importLeadsBatch(items: ParsedLead[]) {
    setBulkBusy(true);
    setBulkResult(null);
    let ok = 0, fail = 0;
    for (const it of items) {
      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            phone: it.phone, listingUrl: it.url, note: it.note || undefined,
            firstName: it.firstName || undefined, lastName: it.lastName || undefined,
            email: it.email || undefined, campaign: it.campaign || undefined, rawData: it.raw,
          }),
        });
        const d = await res.json();
        if (d.ok) ok++; else fail++;
      } catch { fail++; }
    }
    setBulkBusy(false);
    setBulkResult({ ok, fail });
    if (ok > 0) fetchLeads(search);
  }

  async function doBulkImport() {
    const lignes = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lignes.length === 0) return;
    const items = lignes.map(parseLeadLine).filter((x): x is { phone: string; url: string; note: string } => !!x);
    const fail0 = lignes.length - items.length;
    await importLeadsBatch(items);
    setBulkResult((r) => (r ? { ok: r.ok, fail: r.fail + fail0 } : r));
    setBulkText("");
  }

  async function handleCsvFile(file: File) {
    const text = await file.text();
    const { leads: items, skipped } = csvToLeads(parseCsv(text));
    if (items.length === 0) { alert("Aucune ligne valide trouvée dans le CSV (téléphone + lien requis)."); return; }
    await importLeadsBatch(items);
    setBulkResult((r) => (r ? { ok: r.ok, fail: r.fail + skipped } : r));
  }

  function startConvert(l: Lead) {
    setCvId(l.id);
    setCvFirstName("");
    setCvLastName("");
    setCvEmail("");
    setCvDate("");
    setCvTime("09:00");
    setCvNote(l.note ?? "");
  }
  function cancelConvert() { setCvId(null); }

  async function submitConvert(l: Lead) {
    if (!cvDate) return;
    setCvBusy(true);
    try {
      const remindAt = new Date(`${cvDate}T${cvTime}:00`).toISOString();
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          firstName: cvFirstName,
          lastName: cvLastName,
          phone: l.phone,
          clientEmail: cvEmail,
          listingUrl: l.listing_url,
          note: cvNote,
          remindAt,
          leadId: l.id,
        }),
      });
      const d = await res.json();
      if (!d.ok) { alert(d.error ?? "Erreur lors de la création du RDV téléphonique."); return; }
      // Lead converti -> on le retire de la liste prospection.
      await fetch(`/api/leads?id=${l.id}`, { method: "DELETE", headers: authHeaders() });
      setLeads((arr) => arr.filter((x) => x.id !== l.id));
      setCvId(null);
    } finally { setCvBusy(false); }
  }

  return (
    <>
      <style jsx>{`
        .lp-toggle:hover { border-color: #c7cbd1; }
        .lp-file-btn:hover { background: #f0f1f3; border-color: #c7cbd1; }
        .lp-input { transition: border-color 0.15s, box-shadow 0.15s; }
        .lp-input:focus { outline: none; border-color: ${PINK}; box-shadow: 0 0 0 3px rgba(230, 30, 105, 0.1); }
        .lp-primary:hover:not(:disabled) { filter: brightness(1.06); }
        .lp-primary:active:not(:disabled) { filter: brightness(0.96); }
        .lp-danger:hover { background: #fef2f2; border-color: #fca5a5; }
        .lp-ghost:hover:not(:disabled) { background: #f3f4f6; }
        .lp-wa:hover { filter: brightness(1.06); }
        .lp-lead-card { transition: box-shadow 0.15s, border-color 0.15s; }
        .lp-lead-card:hover { box-shadow: 0 4px 14px rgba(26,39,58,0.08); border-color: #e2e5ea; }
      `}</style>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Cabin','Manrope',Arial,sans-serif", fontSize: 21, fontWeight: 700, color: NAVY, textTransform: "uppercase" }}>Prospection</h1>
          <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 13.5 }}>Enregistre tes appels sortants et convertis les prospects chauds en RDV.</p>
        </div>
        {leads.length > 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: NAVY, background: "#eef1f5", padding: "5px 12px", borderRadius: 999, whiteSpace: "nowrap" }}>
            {leads.length} lead{leads.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {leads.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {LEAD_STATUSES_DISPLAY.map((st) => {
            const n = leads.filter((l) => (l.status || "nouveau") === st).length;
            if (n === 0) return null;
            const meta = STATUS_LABELS[st];
            return (
              <span key={st} style={{ fontSize: 12, fontWeight: 700, color: meta.color, background: meta.bg, padding: "5px 11px", borderRadius: 999 }}>
                {meta.label} · {n}
              </span>
            );
          })}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18, marginBottom: 18, boxShadow: "0 1px 3px rgba(26,39,58,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
            {bulkOpen ? "Importer des leads" : "Nouveau lead (appel)"}
          </div>
          <button className="lp-toggle" onClick={() => { setBulkOpen((v) => !v); setBulkResult(null); }} style={{ padding: "7px 13px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: bulkOpen ? PINK : "#fff", color: bulkOpen ? "#fff" : NAVY, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            {bulkOpen ? "← Ajout manuel" : "📥 Importer plusieurs leads"}
          </button>
        </div>
        {bulkOpen ? (
          <div style={{ display: "grid", gap: 10 }}>
            <label htmlFor="leads-csv-input" className="lp-file-btn" style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8,
              border: "1.5px solid #e5e7eb", background: "#f8f9fa", color: NAVY, fontSize: 14, fontWeight: 600,
              cursor: bulkBusy ? "wait" : "pointer", userSelect: "none", width: "fit-content",
            }}>
              📄 Choisir un fichier CSV
              <input id="leads-csv-input" type="file" accept=".csv,text/csv" disabled={bulkBusy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ""; }}
                style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }} />
            </label>
            <p style={{ fontSize: 12, color: "#9aa6b8", margin: 0 }}>
              Colonnes reconnues par en-tête (téléphone, lien, note) ou par ordre — sinon, colle directement en dessous :
            </p>
            <textarea
              className="lp-input"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"06 12 34 56 78, https://leboncoin.fr/..., relancer jeudi\n07 98 76 54 32, https://lacentrale.fr/..."}
              rows={6}
              style={{ ...inp, fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="lp-primary" onClick={doBulkImport} disabled={bulkBusy || !bulkText.trim()} style={{ padding: "11px 18px", borderRadius: 8, border: "none", background: bulkBusy || !bulkText.trim() ? "#cbd5e1" : PINK, color: "#fff", fontWeight: 600, fontSize: 14, cursor: bulkBusy || !bulkText.trim() ? "not-allowed" : "pointer" }}>
                {bulkBusy ? "Import…" : "Importer"}
              </button>
              {bulkResult && (
                <span style={{ fontSize: 13, color: bulkResult.fail > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                  {bulkResult.fail > 0 ? "⚠️" : "✅"} {bulkResult.ok} ajouté{bulkResult.ok > 1 ? "s" : ""}{bulkResult.fail > 0 ? ` — ${bulkResult.fail} ligne${bulkResult.fail > 1 ? "s" : ""} ignorée${bulkResult.fail > 1 ? "s" : ""} (format non reconnu)` : ""}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <input className="lp-input" style={inp} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone appelé" />
            <input className="lp-input" style={inp} value={url} onChange={(e) => setUrl(extractUrl(e.target.value))} onPaste={(e) => { e.preventDefault(); setUrl(extractUrl(e.clipboardData.getData("text"))); }} placeholder="Colle le lien (texte ou URL)" />
            <input className="lp-input" style={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optionnel)" />
            <button className="lp-primary" onClick={add} disabled={adding || !phone.trim() || !url.trim()} style={{ padding: 13, borderRadius: 8, border: "none", background: adding || !phone.trim() || !url.trim() ? "#cbd5e1" : PINK, color: "#fff", fontWeight: 600, fontSize: 15, cursor: adding || !phone.trim() || !url.trim() ? "not-allowed" : "pointer" }}>
              {adding ? "Ajout…" : "Ajouter le lead"}
            </button>
          </div>
        )}
      </div>

      <div style={{ position: "relative", marginBottom: 18 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.5, pointerEvents: "none" }}>🔍</span>
        <input
          className="lp-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Le client rappelle ? Cherche son numéro (même partiel)"
          style={{ ...inp, padding: "14px 14px 14px 40px", fontSize: 15, boxShadow: "0 1px 3px rgba(26,39,58,0.04)" }}
        />
      </div>
      {err && <p style={{ color: "#dc2626", fontSize: 13.5 }}>❌ {err}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {leads.map((l) => {
          const displayName = [l.first_name, l.last_name].filter(Boolean).join(" ");
          const model = findRaw(l.raw_data, MODEL_KEYS);
          const isCsvLead = !!l.raw_data;
          return (
          <div key={l.id} className="lp-lead-card" onClick={() => setFicheLead(l)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <a href={`/lead/${l.lead_ref}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, fontWeight: 700, color: PINK, background: "#fdf2f8", padding: "3px 9px", borderRadius: 999, textDecoration: "none" }}>{l.lead_ref}</a>
                  {l.campaign && <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, background: "#e6fbfd", padding: "3px 9px", borderRadius: 999 }}>{l.campaign}</span>}
                  {(() => { const st = STATUS_LABELS[l.status || "nouveau"]; return st && l.status !== "nouveau" ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, padding: "3px 9px", borderRadius: 999 }}>{st.label}</span>
                  ) : null; })()}
                </div>
                {displayName ? (
                  <>
                    <span style={{ fontWeight: 700, color: NAVY, fontSize: 16.5 }}>{displayName}</span>
                    <div style={{ fontSize: 14, color: "#6b7280", fontWeight: 600 }}>{l.phone}{l.email ? ` · ${l.email}` : ""}</div>
                  </>
                ) : (
                  <span style={{ fontWeight: 700, color: NAVY, fontSize: 16.5 }}>{l.phone}</span>
                )}
                {model && <div style={{ fontSize: 13.5, color: NAVY, fontWeight: 600, marginTop: 2 }}>🚗 {model}</div>}
                {l.listing_url && (
                  <div style={{ marginTop: 4 }}>
                    <a href={l.listing_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: ACCENT, fontSize: 13.5, textDecoration: "none", fontWeight: 600 }}>{platformOf(l.listing_url)} — ouvrir l&apos;annonce →</a>
                  </div>
                )}
                {l.note && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{l.note}</div>}
                <div style={{ fontSize: 11, color: "#9aa6b8", marginTop: 4 }}>{new Date(l.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}</div>
              </div>
              <button className="lp-danger" onClick={(e) => { e.stopPropagation(); del(l.id); }} style={{ flexShrink: 0, padding: "8px 11px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Suppr.</button>
            </div>
            {isCsvLead ? (
              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <button
                  className="lp-ghost"
                  onClick={() => setFicheLead(l)}
                  style={{ flex: "1 1 auto", padding: "11px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", cursor: "pointer", background: "#fff", color: NAVY, fontSize: 14, fontWeight: 600 }}
                >
                  👁️ Voir le lead
                </button>
                <select
                  value={l.status || "nouveau"}
                  onChange={(e) => setLeadStatus(l.id, e.target.value)}
                  style={{ flex: "0 0 auto", padding: "11px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", cursor: "pointer", background: "#fff", color: NAVY, fontSize: 13.5, fontWeight: 600 }}
                >
                  {LEAD_STATUSES_DISPLAY.map((st) => (
                    <option key={st} value={st}>{STATUS_LABELS[st].label}</option>
                  ))}
                </select>
                <a
                  className="lp-primary"
                  href={rdvHref(l)}
                  onClick={() => setLeadStatus(l.id, "rdv_pris")}
                  style={{ flex: "1 1 auto", textAlign: "center", padding: "11px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: PINK, color: "#fff", fontSize: 15, fontWeight: 600, textDecoration: "none" }}
                >
                  📅 Prendre rendez-vous
                </a>
              </div>
            ) : cvId !== l.id ? (
              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <a
                  className="lp-primary"
                  href={rdvHref(l)}
                  onClick={() => setLeadStatus(l.id, "rdv_pris")}
                  style={{ flex: "1 1 auto", textAlign: "center", padding: "11px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: PINK, color: "#fff", fontSize: 15, fontWeight: 600, textDecoration: "none" }}
                >
                  📅 Prendre rendez-vous
                </a>
                <select
                  value={l.status || "nouveau"}
                  onChange={(e) => setLeadStatus(l.id, e.target.value)}
                  style={{ flex: "0 0 auto", padding: "11px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", cursor: "pointer", background: "#fff", color: NAVY, fontSize: 13.5, fontWeight: 600 }}
                >
                  {LEAD_STATUSES_DISPLAY.map((st) => (
                    <option key={st} value={st}>{STATUS_LABELS[st].label}</option>
                  ))}
                </select>
                <button
                  className="lp-ghost"
                  onClick={() => startConvert(l)}
                  style={{ flex: "0 0 auto", padding: "11px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", cursor: "pointer", background: "#fff", color: NAVY, fontSize: 14, fontWeight: 600 }}
                >
                  📞 Rappel téléphonique
                </button>
                <a
                  className="lp-wa"
                  href={waUrl(l.phone)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ flex: "0 0 auto", padding: "11px 14px", borderRadius: 8, textDecoration: "none", background: "#25D366", color: "#fff", fontSize: 15, fontWeight: 600 }}
                >
                  💬 WhatsApp
                </a>
              </div>
            ) : (
              <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, padding: 14, background: "#fafbfc", border: "1px solid #e5e7eb", borderRadius: 10, display: "grid", gap: 10 }}>
                <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 12, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
                  Nouveau RDV téléphonique
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input className="lp-input" style={inp} value={cvFirstName} onChange={(e) => setCvFirstName(e.target.value)} placeholder="Prénom" />
                  <input className="lp-input" style={inp} value={cvLastName} onChange={(e) => setCvLastName(e.target.value)} placeholder="Nom (optionnel)" />
                </div>
                <input className="lp-input" style={inp} type="email" value={cvEmail} onChange={(e) => setCvEmail(e.target.value)} placeholder="E-mail client (optionnel — reçoit un rappel + ajouté aux contacts Google)" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input className="lp-input" style={inp} type="date" value={cvDate} onChange={(e) => setCvDate(e.target.value)} />
                  <input className="lp-input" style={inp} type="time" value={cvTime} onChange={(e) => setCvTime(e.target.value)} />
                </div>
                <input className="lp-input" style={inp} value={cvNote} onChange={(e) => setCvNote(e.target.value)} placeholder="Note (optionnel)" />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="lp-primary"
                    onClick={() => submitConvert(l)}
                    disabled={cvBusy || !cvDate}
                    style={{ flex: "1 1 auto", padding: "11px 12px", borderRadius: 8, border: "none", cursor: cvBusy || !cvDate ? "not-allowed" : "pointer", background: cvBusy || !cvDate ? "#cbd5e1" : PINK, color: "#fff", fontSize: 15, fontWeight: 600 }}
                  >
                    {cvBusy ? "Création…" : "✅ Programmer + ajouter à Google Agenda"}
                  </button>
                  <button
                    className="lp-ghost"
                    onClick={cancelConvert}
                    disabled={cvBusy}
                    style={{ flex: "0 0 auto", padding: "11px 14px", borderRadius: 8, border: "1.5px solid #e5e7eb", cursor: "pointer", background: "#fff", color: NAVY, fontSize: 14, fontWeight: 600 }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })}
        {leads.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#9aa6b8" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <p style={{ margin: 0, fontSize: 14 }}>Aucun lead pour l&apos;instant.</p>
          </div>
        )}
      </div>

      {ficheLead && (
        <div onClick={() => setFicheLead(null)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(26,26,26,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 32px rgba(26,39,58,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: PINK, background: "#fdf2f8", padding: "3px 9px", borderRadius: 999, display: "inline-block", marginBottom: 6 }}>{ficheLead.lead_ref}</div>
                <h2 style={{ margin: 0, fontSize: 19, color: NAVY, fontFamily: "'Cabin',sans-serif" }}>
                  {[ficheLead.first_name, ficheLead.last_name].filter(Boolean).join(" ") || ficheLead.phone}
                </h2>
              </div>
              <button onClick={() => setFicheLead(null)} style={{ border: "none", background: "#f3f4f6", color: NAVY, width: 28, height: 28, borderRadius: 8, fontSize: 15, cursor: "pointer", flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 16, fontSize: 14 }}>
              <div><strong style={{ color: "#6b7280", fontWeight: 600 }}>Téléphone :</strong> {ficheLead.phone}</div>
              {ficheLead.email && <div><strong style={{ color: "#6b7280", fontWeight: 600 }}>E-mail :</strong> {ficheLead.email}</div>}
              {ficheLead.campaign && <div><strong style={{ color: "#6b7280", fontWeight: 600 }}>Campagne :</strong> {ficheLead.campaign}</div>}
              {ficheLead.listing_url && (
                <div><strong style={{ color: "#6b7280", fontWeight: 600 }}>Annonce :</strong> <a href={ficheLead.listing_url} target="_blank" rel="noreferrer" style={{ color: ACCENT }}>{platformOf(ficheLead.listing_url)} →</a></div>
              )}
              {ficheLead.note && <div><strong style={{ color: "#6b7280", fontWeight: 600 }}>Note :</strong> {ficheLead.note}</div>}
              <div><strong style={{ color: "#6b7280", fontWeight: 600 }}>Reçu le :</strong> {new Date(ficheLead.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" })}</div>
            </div>

            {ficheLead.raw_data && Object.keys(ficheLead.raw_data).length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 12, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 8 }}>
                  Données brutes du CSV
                </div>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                  {Object.entries(ficheLead.raw_data).map(([k, v], i) => (
                    <div key={k} style={{ display: "flex", gap: 10, padding: "7px 10px", fontSize: 12.5, background: i % 2 ? "#fafbfc" : "#fff", borderTop: i > 0 ? "1px solid #f0f1f3" : "none" }}>
                      <span style={{ color: "#9aa6b8", fontWeight: 600, flex: "0 0 40%", wordBreak: "break-word" }}>{k}</span>
                      <span style={{ color: NAVY, flex: "1 1 auto", wordBreak: "break-word" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <a
              href={rdvHref(ficheLead)}
              onClick={() => setLeadStatus(ficheLead.id, "rdv_pris")}
              style={{ display: "block", textAlign: "center", marginTop: 20, padding: "12px 16px", borderRadius: 8, border: "none", background: PINK, color: "#fff", fontSize: 15, fontWeight: 600, textDecoration: "none" }}
            >
              📅 Prendre rendez-vous
            </a>
          </div>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <Shell active="prospection"><Prospection /></Shell>;
}

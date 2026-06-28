"use client";

import { useRef, useState } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";

/**
 * Modal "Ajouter une signature" :
 *  1. le commercial joint le PDF du mandat (non signé)
 *  2. il signe sur le pavé tactile
 *  3. la signature est incrustée sur le PDF (pdf-lib) -> PDF signé
 *  4. envoi à /api/sign-mandate -> stockage Blob + statut RDV mis à jour
 */
export default function SignatureModal({
  eid, clientName, vehicle, commercial, onClose, onDone,
}: {
  eid: string; clientName: string; vehicle: string; commercial: string;
  onClose: () => void; onDone: (url: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasSig, setHasSig] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true; last.current = pos(e);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = "#0b1f3a"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; setHasSig(true);
  }
  function up() { drawing.current = false; last.current = null; }
  function clearSig() {
    const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHasSig(false);
  }

  async function validate() {
    setError("");
    if (!file) { setError("Joins d'abord le PDF du mandat."); return; }
    if (!hasSig) { setError("Signe dans le cadre avant de valider."); return; }
    setBusy(true);
    try {
      // 1. Incruster la signature sur le PDF.
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      const pngDataUrl = canvasRef.current!.toDataURL("image/png");
      const png = await pdf.embedPng(pngDataUrl);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const page = pdf.getPages()[pdf.getPageCount() - 1]; // dernière page
      const { width } = page.getSize();
      const sigW = 160, sigH = (png.height / png.width) * sigW;
      const x = width - sigW - 40, y = 60;
      const stamp = new Date().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      // Mention manuscrite obligatoire "Lu et approuvé" au-dessus de la signature.
      page.drawText("Lu et approuvé", { x, y: y + 18 + sigH, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
      page.drawImage(png, { x, y: y + 14, width: sigW, height: sigH });
      page.drawText(`Signé électroniquement le ${stamp}`, { x, y: y - 2, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(commercial ? `Commercial : ${commercial}` : "", { x, y: y - 12, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
      const bytes = await pdf.save();

      // 2. Envoyer le PDF signé.
      const signedFile = new File([bytes as BlobPart], "mandat-signe.pdf", { type: "application/pdf" });
      const fd = new FormData();
      fd.append("file", signedFile);
      fd.append("eid", eid);
      fd.append("clientName", clientName);
      fd.append("vehicle", vehicle);
      fd.append("commercial", commercial);
      const r = await fetch("/api/sign-mandate", { method: "POST", headers: authHeaders(), body: fd });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "Erreur");
      onDone(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setBusy(false);
    }
  }

  const inp: React.CSSProperties = { padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, width: "100%", boxSizing: "border-box" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, zIndex: 60, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, maxWidth: 560, width: "100%", margin: "24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 19, color: NAVY }}>✍️ Ajouter une signature</h2>
          <button onClick={onClose} style={{ border: "none", background: "#f3f4f6", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 13 }}>
          {clientName}{vehicle ? ` · ${vehicle}` : ""}{commercial ? ` · ${commercial}` : ""}.
          Le client signe ci-dessous, la signature est apposée sur le mandat puis enregistrée. Le RDV passe automatiquement en <b>présent</b> + <b>mandat signé</b>.
        </p>

        <label style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4, display: "block" }}>1. Mandat (PDF)</label>
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ ...inp, marginBottom: 16 }} />

        <label style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4, display: "block" }}>2. Signature</label>
        <canvas
          ref={canvasRef}
          width={500}
          height={180}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          style={{ width: "100%", height: 180, border: "1.5px dashed #cbd5e1", borderRadius: 10, background: "#fff", touchAction: "none", cursor: "crosshair", marginBottom: 6 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: "#9aa6b8" }}>Signe avec le doigt ou la souris.</span>
          <button onClick={clearSig} style={{ background: "none", border: "none", color: PINK, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Effacer</button>
        </div>

        {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>❌ {error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "11px 16px", borderRadius: 9, border: "1.5px solid #e5e7eb", background: "#fff", color: NAVY, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
          <button onClick={validate} disabled={busy} style={{ padding: "11px 20px", borderRadius: 9, border: "none", background: PINK, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Enregistrement…" : "✅ Valider la signature"}
          </button>
        </div>
      </div>
    </div>
  );
}

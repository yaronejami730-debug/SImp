"use client";

import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";

/**
 * Modal "Ajouter une signature" — mandat Simplicicar.
 *  Le client remplit DEUX pavés manuscrits successifs :
 *    1. la mention « Lu et approuvé bon pour accord »
 *    2. sa signature
 *  Les deux images sont incrustées sur la PAGE 2 du mandat, sous le libellé
 *  « Le Mandant » (bas-gauche). Rien d'autre n'est écrit sur le PDF : la date,
 *  le commercial, etc. restent dans l'application.
 */
export default function SignatureModal({
  eid, clientName, vehicle, commercial, onClose, onDone,
}: {
  eid: string; clientName: string; vehicle: string; commercial: string;
  onClose: () => void; onDone: (url: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<1 | 2>(1); // 1 = mention, 2 = signature
  const [mentionData, setMentionData] = useState<string>(""); // PNG dataURL
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasInk, setHasInk] = useState(false);

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
    last.current = p; setHasInk(true);
  }
  function up() { drawing.current = false; last.current = null; }
  function clearPad() {
    const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHasInk(false);
  }

  function nextStep() {
    if (!file) { setError("Joins d'abord le PDF du mandat."); return; }
    if (!hasInk) { setError("Écris la mention « Lu et approuvé bon pour accord »."); return; }
    setError("");
    setMentionData(canvasRef.current!.toDataURL("image/png"));
    clearPad();
    setStep(2);
  }
  function backStep() {
    setError(""); clearPad(); setStep(1);
    // on laisse le client réécrire la mention si besoin
  }

  async function validate() {
    setError("");
    if (!hasInk) { setError("Signe dans le cadre avant de valider."); return; }
    const sigData = canvasRef.current!.toDataURL("image/png");
    setBusy(true);
    try {
      const pdf = await PDFDocument.load(await file!.arrayBuffer());
      const pages = pdf.getPages();
      // La signature du mandant est TOUJOURS en page 2.
      const page = pages.length >= 2 ? pages[1] : pages[pages.length - 1];

      const mention = await pdf.embedPng(mentionData);
      const sig = await pdf.embedPng(sigData);

      // Colonne gauche « Le Mandant » (libellé à y≈64). On empile la mention puis
      // la signature juste au-dessus du libellé.
      const drawAt = (img: { width: number; height: number }, targetH: number, yBottom: number) => {
        const w = Math.min(220, (img.width / img.height) * targetH);
        return { x: 50, y: yBottom, width: w, height: targetH };
      };
      page.drawImage(mention, drawAt(mention, 24, 106));
      page.drawImage(sig, drawAt(sig, 32, 70));

      const bytes = await pdf.save();
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
  const padNote = step === 1
    ? "Le client écrit à la main : « Lu et approuvé bon pour accord »"
    : "Le client signe ci-dessous.";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, zIndex: 60, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, maxWidth: 560, width: "100%", margin: "24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 19, color: NAVY }}>✍️ Signature du mandat</h2>
          <button onClick={onClose} style={{ border: "none", background: "#f3f4f6", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 13 }}>
          {clientName}{vehicle ? ` · ${vehicle}` : ""}{commercial ? ` · ${commercial}` : ""}.
          Signature apposée en <b>page 2</b>, sous « Le Mandant ». Le RDV passe auto en <b>présent</b> + <b>mandat signé</b>.
        </p>

        <label style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4, display: "block" }}>Mandat (PDF)</label>
        <input type="file" accept="application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); }} style={{ ...inp, marginBottom: 16 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: "50%", background: step === 1 ? PINK : "#16a34a", color: "#fff", fontSize: 12, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>{step === 1 ? "1" : "✓"}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{step === 1 ? "Étape 1/2 — Mention manuscrite" : "Étape 2/2 — Signature"}</span>
        </div>
        <p style={{ margin: "0 0 6px", fontSize: 13, color: step === 1 ? PINK : NAVY, fontWeight: 600 }}>{padNote}</p>

        <canvas
          ref={canvasRef}
          width={500}
          height={170}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          style={{ width: "100%", height: 170, border: "1.5px dashed #cbd5e1", borderRadius: 10, background: "#fff", touchAction: "none", cursor: "crosshair", marginBottom: 6 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button onClick={clearPad} style={{ background: "none", border: "none", color: PINK, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Effacer</button>
        </div>

        {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>❌ {error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "11px 16px", borderRadius: 9, border: "1.5px solid #e5e7eb", background: "#fff", color: NAVY, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
          {step === 1 ? (
            <button onClick={nextStep} style={{ padding: "11px 20px", borderRadius: 9, border: "none", background: NAVY, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Suivant →</button>
          ) : (
            <>
              <button onClick={backStep} style={{ padding: "11px 16px", borderRadius: 9, border: "1.5px solid #e5e7eb", background: "#fff", color: NAVY, fontWeight: 600, cursor: "pointer" }}>← Retour</button>
              <button onClick={validate} disabled={busy} style={{ padding: "11px 20px", borderRadius: 9, border: "none", background: PINK, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                {busy ? "Enregistrement…" : "✅ Valider"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

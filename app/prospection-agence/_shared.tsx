"use client";

import { useState } from "react";
import { authHeaders } from "@/lib/client";
import { Button, Field, FormGrid, champ, T, S } from "@/components/ui";

export type Prices = { rdv: number; lead: number };
export type Prospect = {
  id: number; name: string; prenom: string; email: string; phone: string; token: string;
  etablissement: string; localisation: string; needs_form_enabled: boolean;
  created_at: string; last_sent_at: string | null; last_sent_prices: Prices | null;
  needs_answers: Record<string, string> | null; needs_raw: string | null; needs_submitted_at: string | null;
};

export const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

export async function chargerProspects(): Promise<{ prospects: Prospect[]; defaultPrices: Prices } | null> {
  const r = await fetch("/api/prospection-agence", { headers: authHeaders() });
  const d = await r.json();
  return d.ok ? { prospects: d.prospects, defaultPrices: d.defaultPrices } : null;
}

export function copierLienBesoins(p: Prospect) {
  const url = `${window.location.origin}/agence-mes-besoins/${p.token}`;
  navigator.clipboard?.writeText(url).then(
    () => alert(`Lien copié :\n${url}`),
    () => alert(url),
  );
}

export function BesoinsModal({ prospect, onClose }: { prospect: Prospect; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 640, width: "100%", margin: "24px 0", padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.ink }}>Besoins exprimés</h3>
            <div style={{ fontSize: 13, color: T.ink2, marginTop: 2 }}>
              {prospect.name} — répondu le {fmtDate(prospect.needs_submitted_at)}
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: T.surface3, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 15, color: T.ink2, flexShrink: 0 }}>✕</button>
        </div>
        <pre style={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: 16, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 420, overflow: "auto", fontFamily: "inherit" }}>
          {prospect.needs_raw || "—"}
        </pre>
      </div>
    </div>
  );
}

export function EnvoiModal({ prospect, defaultPrices, onClose, onSent }: {
  prospect: Prospect; defaultPrices: Prices; onClose: () => void; onSent: () => void;
}) {
  const [civilite, setCivilite] = useState("Monsieur");
  const [prix, setPrix] = useState<Prices>(prospect.last_sent_prices ?? defaultPrices);
  const [signataireNom, setSignataireNom] = useState("Yaron Jami");
  const [signataireTitre, setSignataireTitre] = useState("");
  const [signataireTel, setSignataireTel] = useState("");
  const [etape, setEtape] = useState<"prix" | "confirmation">("prix");
  const [envoi, setEnvoi] = useState(false);

  async function envoyer() {
    setEnvoi(true);
    try {
      const r = await fetch("/api/prospection-agence", {
        method: "POST", headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          action: "send", id: prospect.id, civility: civilite, prices: prix,
          signataire: { name: signataireNom.trim(), title: signataireTitre.trim(), phone: signataireTel.trim() },
        }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.error ?? "Erreur"); return; }
      alert(`Mail envoyé à ${prospect.email}.`);
      onSent();
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 560, width: "100%", margin: "24px 0", padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.ink }}>Envoyer la proposition</h3>
            <div style={{ fontSize: 13, color: T.ink2, marginTop: 2 }}>à {prospect.name} — {prospect.email}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: T.surface3, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 15, color: T.ink2, flexShrink: 0 }}>✕</button>
        </div>

        {etape === "prix" ? (
          <>
            <Field label="Civilité">
              <select value={civilite} onChange={(e) => setCivilite(e.target.value)} style={champ}>
                <option value="Monsieur">Monsieur</option>
                <option value="Madame">Madame</option>
              </select>
            </Field>
            <div style={{ marginTop: S.md, fontSize: 13, fontWeight: 700, color: T.ink }}>Signataire — qui écrit ce mail</div>
            <FormGrid colonnes="repeat(auto-fit, minmax(140px, 1fr))">
              <Field label="Nom"><input type="text" value={signataireNom} onChange={(e) => setSignataireNom(e.target.value)} style={champ} /></Field>
              <Field label="Fonction"><input type="text" value={signataireTitre} onChange={(e) => setSignataireTitre(e.target.value)} style={champ} /></Field>
              <Field label="Téléphone (facultatif)"><input type="tel" value={signataireTel} onChange={(e) => setSignataireTel(e.target.value)} style={champ} /></Field>
            </FormGrid>
            <div style={{ marginTop: S.md, fontSize: 13, fontWeight: 700, color: T.ink }}>Tarif — Formule Rendez-vous rentré</div>
            <FormGrid colonnes="repeat(auto-fit, minmax(140px, 1fr))">
              <Field label="Rendez-vous rentré (€ HT)"><input type="number" value={prix.rdv} onChange={(e) => setPrix({ ...prix, rdv: Number(e.target.value) })} style={{ ...champ, textAlign: "right" }} /></Field>
            </FormGrid>
            <div style={{ marginTop: S.md, fontSize: 13, fontWeight: 700, color: T.ink }}>Tarif — Formule Lead</div>
            <FormGrid colonnes="repeat(auto-fit, minmax(140px, 1fr))">
              <Field label="Lead qualifié (€ HT)"><input type="number" value={prix.lead} onChange={(e) => setPrix({ ...prix, lead: Number(e.target.value) })} style={{ ...champ, textAlign: "right" }} /></Field>
            </FormGrid>
            <div style={{ marginTop: S.lg, display: "flex", justifyContent: "flex-end" }}>
              <Button variante="principal" onClick={() => setEtape("confirmation")}>Continuer</Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: S.md, fontSize: 13.5, lineHeight: 1.7 }}>
              Ce mail sera signé <strong>{signataireNom}</strong> ({signataireTitre ? `${signataireTitre} — ` : ""}YJ Solutions, jamais Simplicicar),
              envoyé à <strong>{prospect.email}</strong>, avec la formule « {civilite} {prospect.name}, », le tarif RDV rentré
              (<strong>{prix.rdv} € HT</strong>) et lead
              (<strong>{prix.lead} € HT</strong>), avec un lien vers le questionnaire de cadrage des besoins.
            </div>
            <div style={{ marginTop: S.lg, display: "flex", justifyContent: "space-between", gap: 10 }}>
              <Button variante="secondaire" onClick={() => setEtape("prix")}>Retour</Button>
              <Button variante="principal" onClick={envoyer} disabled={envoi}>{envoi ? "Envoi…" : "Confirmer et envoyer"}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

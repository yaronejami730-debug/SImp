"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DatePicker, TimePicker } from "./Pickers";
import { DDE_CRITERES, type DdeCritereKey } from "@/lib/dde-criteres";
import {
  DDE_PROSPECT_STATUTS, DDE_PROSPECT_A_APPELER, libelleStatutProspect, libelleResultatRdv, libellePresence,
  type DdeProspect,
} from "@/lib/dde-prospects";
import { estCreneauValide, HORAIRES_TEXTE } from "@/lib/dde-horaires";
import { appelerAvecRingover, numeroInternational } from "@/lib/ringover";
import { INFOS_CLIENT, INK, BG, LINE, MUTED, SOFT, input as inputStyle, label as labelStyle, pill } from "./theme";

type Me = { email: string; name: string; role: "admin" | "telepro" };

function headers(): Record<string, string> {
  const t = typeof window === "undefined" ? null : localStorage.getItem("dde_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}

function frDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

const fmtInstant = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Comparaison souple : sans accents, sans casse, sans espaces parasites. */
function normalise(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Statuts proposés en un clic sur la fiche : ceux qu'on pose pendant un appel. */
const STATUTS_APPEL = DDE_PROSPECT_STATUTS.filter((s) => s.travail);

// ---------- Chargement ----------

export function useProspects(actif: boolean) {
  const [prospects, setProspects] = useState<DdeProspect[]>([]);
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/dde/prospects", { headers: headers() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erreur.");
      setProspects(j.prospects as DdeProspect[]);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur.");
    }
  }, []);

  useEffect(() => { if (actif) reload(); }, [actif, reload]);
  return { prospects, err, reload };
}

// ---------- Prise de rendez-vous depuis une fiche ----------

/** Formulaire de rendez-vous pré-rempli : les coordonnées viennent du prospect,
 *  il ne reste que la date, l'heure, le questionnaire et le commentaire. */
function ModaleRdv({ prospect, me, onClose, onSaved }: {
  prospect: DdeProspect; me: Me; onClose: () => void; onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("");
  const [notes, setNotes] = useState(prospect.notes);
  const [criteres, setCriteres] = useState<Partial<Record<DdeCritereKey, boolean>>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tousRepondus = DDE_CRITERES.every((c) => typeof criteres[c.key] === "boolean");
  const critereRate = DDE_CRITERES.some((c) => typeof criteres[c.key] === "boolean" && criteres[c.key] !== c.attendu);
  const canSubmit = date !== "" && heure !== "" && tousRepondus && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/dde/appointments", {
        method: "POST", headers: headers(),
        body: JSON.stringify({
          nom: prospect.nom, prenom: prospect.prenom, email: prospect.email, telephone: prospect.telephone,
          date, heure, notes, criteres, prospectId: prospect.id,
          teleproEmail: prospect.telepro_email || me.email,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erreur.");
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  const ligne: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", fontSize: 15 };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(26,26,26,0.35)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto" }}
    >
      <form
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        style={{ width: "100%", maxWidth: 520, background: BG, borderRadius: 18, padding: 28, boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em", margin: 0 }}>Prendre rendez-vous</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ height: 34, width: 34, borderRadius: 17, border: `1px solid ${LINE}`, background: "#fff", fontSize: 15, cursor: "pointer", color: MUTED }}>✕</button>
        </div>

        {/* Coordonnées : déjà connues, rien à ressaisir. */}
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: "#fff", padding: "6px 18px", marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED, padding: "12px 0 2px" }}>
            Coordonnées reprises de la fiche
          </div>
          <div style={{ ...ligne, borderTop: `1px solid ${SOFT}` }}><span style={{ color: MUTED }}>Nom</span><strong>{prospect.nom.toUpperCase()}</strong></div>
          <div style={{ ...ligne, borderTop: `1px solid ${SOFT}` }}><span style={{ color: MUTED }}>Prénom</span><strong>{prospect.prenom || "—"}</strong></div>
          <div style={{ ...ligne, borderTop: `1px solid ${SOFT}` }}><span style={{ color: MUTED }}>Téléphone</span><strong>{prospect.telephone}</strong></div>
          <div style={{ ...ligne, borderTop: `1px solid ${SOFT}`, wordBreak: "break-all" }}><span style={{ color: MUTED }}>E-mail</span><strong>{prospect.email || "—"}</strong></div>
        </div>

        <div style={labelStyle}>Date de rendez-vous</div>
        <div style={{ marginBottom: 24 }}>
          <DatePicker
            value={date}
            onChange={(iso) => { setDate(iso); if (heure && !estCreneauValide(iso, heure)) setHeure(""); }}
          />
        </div>

        <div style={labelStyle}>Heure de rendez-vous</div>
        <div style={{ marginBottom: 24 }}>
          <TimePicker value={heure} onChange={setHeure} date={date} />
          <div style={{ marginTop: 10, fontSize: 14, color: MUTED }}>{HORAIRES_TEXTE}</div>
        </div>

        <div style={{ marginBottom: 24, padding: "6px 18px", borderRadius: 12, background: SOFT, fontSize: 15, lineHeight: 1.5 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED, padding: "12px 0 4px" }}>
            À donner au client s’il pose la question
          </div>
          {INFOS_CLIENT.map((info, i) => (
            <div key={info.titre} style={{ padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${LINE}33` }}>
              <strong>{info.titre}</strong><br />{info.valeur}
            </div>
          ))}
        </div>

        <div style={labelStyle}>Éligibilité</div>
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: "#fff", padding: "6px 18px", marginBottom: critereRate ? 16 : 24 }}>
          {DDE_CRITERES.map((c, i) => (
            <div
              key={c.key}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "14px 0", borderTop: i === 0 ? "none" : `1px solid ${SOFT}` }}
            >
              <span style={{ fontSize: 16 }}>{c.question}</span>
              <div style={{ display: "flex", gap: 8 }}>
                {[true, false].map((v) => {
                  const actif = criteres[c.key] === v;
                  return (
                    <button
                      key={String(v)} type="button"
                      onClick={() => setCriteres((p) => ({ ...p, [c.key]: v }))}
                      style={{
                        height: 36, padding: "0 18px", borderRadius: 18, fontSize: 14, fontWeight: 700, cursor: "pointer",
                        border: actif ? "none" : `1px solid ${LINE}`,
                        background: actif ? INK : "#fff", color: actif ? "#fff" : MUTED,
                      }}
                    >{v ? "Oui" : "Non"}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {critereRate && (
          <div style={{ marginBottom: 24, padding: "14px 18px", borderRadius: 12, background: SOFT, fontSize: 15, lineHeight: 1.5 }}>
            <strong>Profil non éligible.</strong> Le rendez-vous sera enregistré avec le statut « Pas éligible ».
          </div>
        )}

        <label htmlFor="p-notes" style={labelStyle}>Commentaire <span style={{ fontWeight: 400, color: MUTED, fontSize: 15 }}>(facultatif)</span></label>
        <textarea id="p-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, height: "auto", padding: "16px 18px", marginBottom: 28, fontFamily: "inherit", resize: "vertical" }} />

        {err && <div style={{ marginBottom: 20, fontSize: 15, fontWeight: 700, color: "#b3261e" }}>{err}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button type="submit" disabled={!canSubmit} style={pill(canSubmit)}>{busy ? "Enregistrement…" : "Enregistrer le rendez-vous"}</button>
          <button type="button" onClick={onClose} style={{ height: 56, padding: "0 24px", borderRadius: 28, border: `1px solid ${LINE}`, background: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", color: MUTED }}>Annuler</button>
        </div>
      </form>
    </div>
  );
}

// ---------- Fiche prospect ----------

/** Bloc de lignes « libellé — valeur », vide masqué. */
function Bloc({ titre, lignes }: { titre: string; lignes: { label: string; valeur: string }[] }) {
  const remplies = lignes.filter((l) => l.valeur.trim() !== "");
  if (!remplies.length) return null;
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: "#fff", padding: "6px 18px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED, padding: "12px 0 2px" }}>{titre}</div>
      {remplies.map((l) => (
        <div key={l.label} style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "10px 0", borderTop: `1px solid ${SOFT}`, fontSize: 15 }}>
          <span style={{ color: MUTED }}>{l.label}</span>
          <strong style={{ textAlign: "right", wordBreak: "break-word" }}>{l.valeur}</strong>
        </div>
      ))}
    </div>
  );
}

function FicheProspect({ prospect, me, titre, onPatch, onRdv, onSuivant, onFermer, restants }: {
  prospect: DdeProspect; me: Me;
  /** « Nouveau prospect » dans la file d'appel, « Fiche prospect » dans la fenêtre. */
  titre: string;
  onPatch: (body: Record<string, unknown>) => void;
  onRdv: () => void;
  onSuivant?: () => void;
  onFermer?: () => void;
  restants?: number;
}) {
  const [notes, setNotes] = useState(prospect.notes);
  const [noteEnregistree, setNoteEnregistree] = useState(false);
  const [numeroCopie, setNumeroCopie] = useState(false);

  // Changer de prospect remet le commentaire affiché sur celui de la nouvelle fiche.
  useEffect(() => { setNotes(prospect.notes); setNoteEnregistree(false); }, [prospect.id, prospect.notes]);

  const dernierRdv = prospect.dernier_rdv_date
    ? `${frDate(prospect.dernier_rdv_date)}${prospect.dernier_rdv_heure ? ` à ${prospect.dernier_rdv_heure}` : ""}`
    : "";

  const suivi = [
    { label: "Dernier rendez-vous", valeur: dernierRdv },
    { label: "Ce qu'il en est advenu", valeur: libellePresence(prospect.dernier_rdv_presence) },
    { label: "Résultat du rendez-vous", valeur: prospect.crm_resultat_rdv ? libelleResultatRdv(prospect.crm_resultat_rdv) : "" },
    { label: "Rendez-vous pris au total", valeur: prospect.nb_rdv ? String(prospect.nb_rdv) : "" },
    { label: "Statut dans l'ancien CRM", valeur: prospect.crm_statut },
    { label: "Campagne d'origine", valeur: prospect.crm_campagne },
    { label: "Ancien télépro", valeur: prospect.crm_telepro },
    { label: "Ancien commercial", valeur: prospect.crm_commercial },
    { label: "Créé dans l'ancien CRM le", valeur: prospect.crm_cree_le ? fmtInstant(prospect.crm_cree_le) : "" },
    { label: "Dernière mise à jour", valeur: prospect.crm_maj_le ? fmtInstant(prospect.crm_maj_le) : "" },
  ];

  const coordonnees = [
    { label: "Téléphone", valeur: prospect.telephone },
    { label: "Second numéro", valeur: prospect.telephone_2 },
    { label: "E-mail", valeur: prospect.email },
    { label: "Adresse", valeur: prospect.adresse },
    { label: "Code postal", valeur: [prospect.code_postal, prospect.ville].filter(Boolean).join(" ") },
    { label: "Département", valeur: prospect.departement },
  ];

  const appels = [
    { label: "Appels passés", valeur: String(prospect.appels) },
    { label: "Dernier appel", valeur: prospect.dernier_appel_at ? fmtInstant(prospect.dernier_appel_at) : "" },
    ...(me.role === "admin" ? [{ label: "Attribué à", valeur: prospect.telepro_name || prospect.telepro_email }] : []),
  ];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.01em", color: INK, margin: 0 }}>{titre}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {restants !== undefined && <span style={{ fontSize: 14, color: MUTED }}>{restants} prospect{restants > 1 ? "s" : ""} à appeler</span>}
            {onFermer && (
              <button type="button" onClick={onFermer} aria-label="Fermer" style={{ height: 34, width: 34, borderRadius: 17, border: `1px solid ${LINE}`, background: "#fff", fontSize: 15, cursor: "pointer", color: MUTED }}>✕</button>
            )}
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 24, fontWeight: 700 }}>{prospect.nom.toUpperCase()} {prospect.prenom}</div>
        <div style={{ marginTop: 4, fontSize: 16, color: MUTED }}>
          {prospect.telephone}{prospect.email ? ` · ${prospect.email}` : ""}
        </div>
      </div>

      {/* Appeler — Statut — Prendre rendez-vous : les trois gestes de l'appel. */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          title={`Appeler ${numeroInternational(prospect.telephone)} depuis Ringover`}
          onClick={async () => {
            await appelerAvecRingover(prospect.telephone);
            setNumeroCopie(true);
            onPatch({ appel: true });
          }}
          style={{ height: 56, padding: "0 32px", borderRadius: 28, border: "none", background: INK, color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
          </svg>
          Appeler
        </button>
        <button
          type="button" onClick={onRdv}
          style={{ height: 56, padding: "0 28px", borderRadius: 28, border: `1px solid ${INK}`, background: "#fff", color: INK, fontSize: 17, fontWeight: 700, cursor: "pointer" }}
        >Prendre rendez-vous</button>
        {onSuivant && (
          <button
            type="button" onClick={onSuivant}
            style={{ height: 56, padding: "0 24px", borderRadius: 28, border: `1px solid ${LINE}`, background: "#fff", color: MUTED, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
          >Prospect suivant</button>
        )}
      </div>

      {numeroCopie && (
        <div style={{ fontSize: 14, color: MUTED }}>
          Ringover ouvert sur {numeroInternational(prospect.telephone)} — le numéro est aussi dans le presse-papiers.
        </div>
      )}

      <div>
        <div style={labelStyle}>Statut</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUTS_APPEL.map((st) => {
            const actif = prospect.statut === st.key;
            return (
              <button
                key={st.key} type="button" title={st.label}
                onClick={() => onPatch({ statut: actif ? "nouveau" : st.key })}
                style={{
                  height: 44, padding: "0 20px", borderRadius: 22, fontSize: 15, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                  border: actif ? "none" : `1px solid ${LINE}`,
                  background: actif ? INK : "#fff", color: actif ? "#fff" : MUTED,
                }}
              >{actif ? `✓ ${st.court}` : st.court}</button>
            );
          })}
        </div>
        {prospect.statut === "rdv_pris" && (
          <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700 }}>Rendez-vous déjà pris pour ce prospect.</div>
        )}
      </div>

      <div>
        <label htmlFor="f-notes" style={labelStyle}>Commentaire</label>
        <textarea
          id="f-notes" value={notes} onChange={(e) => { setNotes(e.target.value); setNoteEnregistree(false); }}
          rows={3} style={{ ...inputStyle, height: "auto", padding: "16px 18px", marginBottom: 12, fontFamily: "inherit", resize: "vertical" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            onClick={() => { onPatch({ notes }); setNoteEnregistree(true); }}
            style={{ height: 40, padding: "0 20px", borderRadius: 20, border: "none", background: INK, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >Enregistrer le commentaire</button>
          {noteEnregistree && <span style={{ fontSize: 14, fontWeight: 700 }}>Commentaire enregistré.</span>}
        </div>
      </div>

      {/* Tout ce que disait l'ancien CRM sur ce client. */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Bloc titre="Coordonnées" lignes={coordonnees} />
        <Bloc titre="Historique des rendez-vous" lignes={suivi} />
        <Bloc titre="Dossier du client" lignes={prospect.profil ?? []} />
        <Bloc titre="Appels" lignes={appels} />
        <Bloc titre="Commentaire de l'ancien CRM" lignes={[{ label: "Notes", valeur: prospect.crm_commentaire }]} />
      </div>

      {prospect.historique?.length > 0 && (
        <details style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: "#fff", padding: "14px 18px" }}>
          <summary style={{ fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Journal de l&apos;ancien CRM ({prospect.historique.length})
          </summary>
          <div style={{ marginTop: 12 }}>
            {prospect.historique.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 14, padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${SOFT}`, fontSize: 14 }}>
                <span style={{ color: MUTED, whiteSpace: "nowrap" }}>{h.date ? fmtInstant(h.date) : "—"}</span>
                <span>{h.action}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Fiche complète d'un prospect dans une fenêtre : ouverte depuis le fichier d'appel. */
function ModaleProspect({ prospect, me, onPatch, onRdv, onClose }: {
  prospect: DdeProspect; me: Me;
  onPatch: (body: Record<string, unknown>) => void;
  onRdv: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(26,26,26,0.35)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 16px", overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 900, background: BG, borderRadius: 18, padding: 28, boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}
      >
        <FicheProspect
          prospect={prospect} me={me} titre="Fiche prospect"
          onPatch={onPatch} onRdv={onRdv} onFermer={onClose}
        />
      </div>
    </div>
  );
}

// ---------- Onglet ----------

export function OngletProspects({ me, prospects, reload, onRdvCree }: {
  me: Me; prospects: DdeProspect[]; reload: () => void; onRdvCree: () => void;
}) {
  const [selection, setSelection] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreTelepro, setFiltreTelepro] = useState("");
  const [fiche, setFiche] = useState<number | null>(null);   // prospect ouvert en fenêtre
  const [rdvPour, setRdvPour] = useState<number | null>(null); // prospect dont on prend le rendez-vous
  const [err, setErr] = useState("");

  // File d'appel : ce qui reste à traiter, dans l'ordre donné par le serveur.
  const file = useMemo(() => prospects.filter((p) => DDE_PROSPECT_A_APPELER.includes(p.statut)), [prospects]);
  const courant = prospects.find((p) => p.id === selection) ?? file[0] ?? prospects[0] ?? null;
  const ficheOuverte = fiche === null ? null : prospects.find((p) => p.id === fiche) ?? null;
  const rdvProspect = rdvPour === null ? null : prospects.find((p) => p.id === rdvPour) ?? null;

  const telepros = useMemo(
    () => [...new Map(prospects.map((p) => [p.telepro_email.toLowerCase(), p.telepro_name || p.telepro_email])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1])),
    [prospects],
  );

  async function patch(id: number, body: Record<string, unknown>) {
    const r = await fetch("/api/dde/prospects", { method: "PATCH", headers: headers(), body: JSON.stringify({ id, ...body }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error || "Modification impossible.");
    } else {
      setErr("");
    }
    reload();
  }

  async function remove(id: number) {
    await fetch(`/api/dde/prospects?id=${id}`, { method: "DELETE", headers: headers() });
    if (selection === id) setSelection(null);
    if (fiche === id) setFiche(null);
    reload();
  }

  /** Passe au prospect suivant de la file, en repartant du début si on est au bout. */
  function suivant() {
    if (!file.length) { setSelection(null); return; }
    const i = courant ? file.findIndex((p) => p.id === courant.id) : -1;
    setSelection(file[(i + 1) % file.length].id);
  }

  const termes = normalise(q).split(" ").filter(Boolean);
  const visibles = prospects.filter((p) => {
    if (filtreStatut && p.statut !== filtreStatut) return false;
    if (filtreTelepro && p.telepro_email.toLowerCase() !== filtreTelepro) return false;
    if (!termes.length) return true;
    const foin = normalise([
      p.nom, p.prenom, p.telephone, p.telephone.replace(/\s/g, ""), p.email, p.ville, p.code_postal,
      libelleStatutProspect(p.statut), p.crm_campagne, p.crm_commercial, p.notes, p.crm_commentaire,
      (p.profil ?? []).map((l) => l.valeur).join(" "),
    ].join(" "));
    return termes.every((t) => foin.includes(t));
  });

  const compte = (key: string) => prospects.filter((p) => p.statut === key).length;

  const th: React.CSSProperties = { textAlign: "left", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED, padding: "0 14px 12px", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: 14, padding: "14px", borderTop: `1px solid ${SOFT}`, verticalAlign: "middle" };

  if (!prospects.length) {
    return <div style={{ fontSize: 17, color: MUTED }}>Aucun prospect dans le fichier d&apos;appel.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 48 }}>
      {err && <div style={{ fontSize: 15, fontWeight: 700, color: "#b3261e" }}>{err}</div>}

      {courant && (
        <FicheProspect
          prospect={courant} me={me} titre="Nouveau prospect" restants={file.length}
          onPatch={(body) => patch(courant.id, body)}
          onRdv={() => setRdvPour(courant.id)}
          onSuivant={suivant}
        />
      )}

      <div>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 18px" }}>Fichier d&apos;appel</h2>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {[{ key: "", label: "Tous", n: prospects.length }, ...DDE_PROSPECT_STATUTS.map((s) => ({ key: s.key, label: s.court, n: compte(s.key) }))]
            .filter((b) => b.key === "" || b.n > 0 || filtreStatut === b.key)
            .map((b) => {
              const actif = filtreStatut === b.key;
              return (
                <button
                  key={b.key || "tous"} onClick={() => setFiltreStatut(b.key)}
                  style={{
                    height: 40, padding: "0 18px", borderRadius: 20, fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                    border: actif ? "none" : `1px solid ${LINE}`,
                    background: actif ? INK : "#fff", color: actif ? "#fff" : b.n === 0 ? MUTED : INK,
                  }}
                >{b.label} ({b.n})</button>
              );
            })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 420 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.4" strokeLinecap="round"
                 style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-4.2-4.2" />
            </svg>
            <input
              type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un prospect, un téléphone, une ville…"
              aria-label="Rechercher un prospect"
              style={{ width: "100%", boxSizing: "border-box", height: 44, padding: "0 16px 0 42px", fontSize: 15, border: `1px solid ${LINE}`, borderRadius: 22, background: "#fff", color: INK }}
            />
          </div>
          {telepros.length > 1 && (
            <select
              value={filtreTelepro} onChange={(e) => setFiltreTelepro(e.target.value)}
              aria-label="Filtrer par telepro"
              style={{ height: 44, padding: "0 14px", borderRadius: 22, border: `1px solid ${LINE}`, background: "#fff", fontSize: 14, fontWeight: 700, color: INK, cursor: "pointer", maxWidth: 240 }}
            >
              <option value="">Toutes les telepros</option>
              {telepros.map(([email, nom]) => <option key={email} value={email}>{nom}</option>)}
            </select>
          )}
          <span style={{ fontSize: 14, color: MUTED }}>
            {visibles.length} sur {prospects.length}
          </span>
        </div>

        <div className="dde-card" style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, maxWidth: "100%", overflowX: "auto" }}>
          <table className="dde-table" style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Client</th>
                <th style={th}>Téléphone</th>
                <th style={th}>E-mail</th>
                <th style={th}>Dernier RDV</th>
                <th style={th}>Statut</th>
                <th style={th}>Appels</th>
                {me.role === "admin" && <th style={th}>Telepro</th>}
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} style={{ background: courant?.id === p.id ? SOFT : undefined }} title={p.notes || undefined}>
                  <td data-label="Client" style={{ ...td, fontWeight: 700 }}>{p.nom.toUpperCase()} {p.prenom}</td>
                  <td data-label="Téléphone" style={td}><a href={`tel:${p.telephone.replace(/\s/g, "")}`} style={{ color: INK, whiteSpace: "nowrap" }}>{p.telephone}</a></td>
                  <td data-label="E-mail" style={{ ...td, wordBreak: "break-all" }}>{p.email || "—"}</td>
                  <td data-label="Dernier RDV" style={{ ...td, whiteSpace: "nowrap" }}>{p.dernier_rdv_date ? frDate(p.dernier_rdv_date) : "—"}</td>
                  <td data-label="Statut" style={td}>
                    <span style={{
                      display: "inline-block", padding: "6px 14px", borderRadius: 16, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                      border: p.statut === "rdv_pris" ? "none" : `1px solid ${LINE}`,
                      background: p.statut === "rdv_pris" ? INK : "#fff", color: p.statut === "rdv_pris" ? "#fff" : MUTED,
                    }}>{libelleStatutProspect(p.statut)}</span>
                  </td>
                  <td data-label="Appels" style={td}>{p.appels}</td>
                  {me.role === "admin" && <td data-label="Telepro" style={td}>{p.telepro_name || p.telepro_email}</td>}
                  <td data-label="" className="dde-td-actions" style={td}>
                    <div className="dde-actions">
                      <button
                        onClick={() => setFiche(p.id)}
                        style={{ height: 32, padding: "0 14px", borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                      >Ouvrir</button>
                      {me.role === "admin" && (
                        <button onClick={() => remove(p.id)} title="Retirer du fichier" aria-label="Retirer du fichier" style={{ height: 32, width: 32, borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", fontSize: 14, cursor: "pointer", color: MUTED }}>✕</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visibles.length === 0 && (
            <div style={{ padding: "28px 14px", textAlign: "center", fontSize: 15, color: MUTED }}>
              Aucun prospect ne correspond{q.trim() ? ` à « ${q.trim()} »` : ""}.
            </div>
          )}
        </div>
      </div>

      {ficheOuverte && (
        <ModaleProspect
          prospect={ficheOuverte} me={me}
          onPatch={(body) => patch(ficheOuverte.id, body)}
          onRdv={() => setRdvPour(ficheOuverte.id)}
          onClose={() => setFiche(null)}
        />
      )}

      {rdvProspect && (
        <ModaleRdv
          prospect={rdvProspect} me={me}
          onClose={() => setRdvPour(null)}
          onSaved={() => { reload(); onRdvCree(); setFiche(null); setSelection(null); }}
        />
      )}
    </div>
  );
}

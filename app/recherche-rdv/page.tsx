"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders, sessionExpiree } from "@/lib/client";
import {
  PageHeader, Card, Badge, DataTable, DateRange, T, S, R, type Colonne, type Ton,
} from "@/components/ui";

type Appt = {
  id: string; startDateTime: string | null; firstName: string; lastName: string;
  email: string; phone: string; carBrand: string; carModel: string; carFinish: string;
  immatriculation: string; commercial: string; teleprospector: string; platform: string;
  signStatus: string; presence?: string; present?: boolean; cancelled: boolean;
  bcSigned: boolean; negotiation: number; mandatRemoved?: boolean;
  ffStatus: string; commStatus: string;
};

/** Où en est la facturation de ce dossier.
 *  Deux lignes d'argent : le frais fixe par rendez-vous, et la part variable sur la marge.
 *  « Payé » ne se dit que si les deux le sont — sinon on nomme celle qui reste. */
function etatFacturation(a: Appt): { texte: string; ton: Ton } {
  if (a.cancelled || a.signStatus !== "signed" || a.mandatRemoved) return { texte: "À venir", ton: "neutre" };

  const rang = (v: string) => (v === "paid" ? 3 : v === "invoiced" ? 2 : v === "requested" ? 1 : 0);
  const fixe = rang(a.ffStatus);
  const aVariable = a.bcSigned && a.negotiation > 0;
  const variable = aVariable ? rang(a.commStatus) : null;

  if (!aVariable) {
    if (fixe === 3) return { texte: "Payé", ton: "succes" };
    if (fixe === 2) return { texte: "Facturé", ton: "info" };
    if (fixe === 1) return { texte: "Appel à facturation", ton: "attente" };
    return { texte: "À payer", ton: "danger" };
  }

  if (fixe === 3 && variable === 3) return { texte: "Payé intégralement", ton: "succes" };
  if (fixe === 3) return { texte: "Frais fixe payé", ton: "attente" };
  if (variable === 3) return { texte: "Part variable payée", ton: "attente" };

  const pire = Math.min(fixe, variable ?? 0);
  if (pire === 2) return { texte: "Facturé", ton: "info" };
  if (pire === 1) return { texte: "Appel à facturation", ton: "attente" };
  return { texte: "À payer", ton: "danger" };
}

const normalise = (v: string) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const chiffres = (v: string) => (v ?? "").replace(/\D/g, "");
const plaque = (v: string) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const fmtHeure = (d: string | null) =>
  d ? new Date(d).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }) : "";
const jour = (d: string | null) => (d ? new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(d)) : "");

function etat(a: Appt): { texte: string; ton: Ton } {
  if (a.cancelled) return { texte: "Annulé", ton: "danger" };
  if (a.signStatus === "signed") return { texte: "Mandat signé", ton: "succes" };
  if (a.signStatus === "thinking") return { texte: "En réflexion", ton: "attente" };
  if (a.signStatus === "unsigned" || a.signStatus === "listed") return { texte: "Non signé", ton: "neutre" };
  if (a.presence === "absent") return { texte: "Absent", ton: "danger" };
  if (a.presence === "present") return { texte: "Client venu", ton: "info" };
  return { texte: "À venir", ton: "neutre" };
}

function Recherche() {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [q, setQ] = useState("");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [loading, setLoading] = useState(true);
  const [enCours, setEnCours] = useState("");
  const [aide, setAide] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState<{ titre: string; message: string; libelle: string; action: () => Promise<void> } | null>(null);
  const [enTrain, setEnTrain] = useState(false);
  const [err, setErr] = useState("");

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/appointments?all=1", { headers: authHeaders() });
      if (res.status === 401) { sessionExpiree(); return; }
      const d = await res.json();
      if (d.ok) setAppts(d.appointments); else setErr(d.error ?? "Erreur");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const resultats = useMemo(() => {
    const termes = normalise(q).split(" ").filter(Boolean);
    const num = chiffres(q);
    const imm = plaque(q);

    return appts
      .filter((a) => {
        const j = jour(a.startDateTime);
        if (du && j < du) return false;
        if (au && j > au) return false;
        if (termes.length === 0) return true;

        // Un numéro saisi cherche dans le téléphone ; une plaque dans l'immatriculation.
        if (num.length >= 4 && chiffres(a.phone).includes(num)) return true;
        if (imm.length >= 4 && plaque(a.immatriculation).includes(imm)) return true;

        const foin = normalise([
          a.firstName, a.lastName, a.email, a.phone, chiffres(a.phone),
          a.carBrand, a.carModel, a.carFinish, a.immatriculation,
          a.commercial, a.teleprospector, a.platform,
          fmtDate(a.startDateTime), j,
        ].join(" "));
        return termes.every((t) => foin.includes(t));
      })
      .sort((x, y) => ((x.startDateTime ?? "") < (y.startDateTime ?? "") ? 1 : -1));
  }, [appts, q, du, au]);

  const nomDe = (a: Appt) => `${a.firstName} ${a.lastName}`.trim() || "ce client";

  function basculerSelection(id: string) {
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  /** Applique un même changement à tous les dossiers sélectionnés. */
  async function appliquerGroupe(patch: (a: Appt) => Record<string, unknown>) {
    setEnTrain(true);
    try {
      const cibles = appts.filter((a) => selection.has(a.id));
      for (const a of cibles) {
        await fetch("/api/status", {
          method: "POST", headers: authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ eid: a.id, ...patch(a) }),
        });
      }
      setSelection(new Set());
      await charger();
    } finally {
      setEnTrain(false);
      setConfirmation(null);
    }
  }

  /** Écrit un changement de statut sans envoyer de mail, puis rafraîchit la liste. */
  async function majStatut(a: Appt, patch: Record<string, unknown>) {
    setEnCours(a.id);
    try {
      await fetch("/api/status", {
        method: "POST", headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ eid: a.id, ...patch }),
      });
      await charger();
    } finally {
      setEnCours("");
    }
  }

  const bouton = (actif: boolean, libelle: string, couleur: string, onClick: () => void, titre?: string, id?: string): React.ReactNode => (
    <button
      onClick={onClick} title={titre} disabled={!!id && enCours === id}
      style={{
        height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
        border: actif ? "none" : `1px solid ${T.line}`,
        background: actif ? couleur : T.surface,
        color: actif ? "#fff" : T.ink2,
      }}
    >
      {actif ? `✓ ${libelle}` : libelle}
    </button>
  );

  const colonnes: Colonne<Appt>[] = [
    {
      cle: "select", titre: "", rendu: (a) => (
        <input
          type="checkbox" checked={selection.has(a.id)} onChange={() => basculerSelection(a.id)}
          aria-label={`Sélectionner ${nomDe(a)}`}
          style={{ width: 17, height: 17, cursor: "pointer" }}
        />
      ),
    },
    {
      cle: "date", titre: "Rendez-vous", rendu: (a) => (
        <span style={{ whiteSpace: "nowrap" }}>
          <strong>{fmtDate(a.startDateTime)}</strong>
          <span style={{ color: T.ink2 }}> {fmtHeure(a.startDateTime)}</span>
        </span>
      ),
    },
    {
      cle: "client", titre: "Client", rendu: (a) => (
        <a href={`/client/${encodeURIComponent(a.id)}`} style={{ color: T.ink, fontWeight: 700 }}>
          {`${a.firstName} ${a.lastName}`.trim() || "—"}
        </a>
      ),
    },
    {
      cle: "contact", titre: "Contact", rendu: (a) => (
        <div style={{ fontSize: 13.5 }}>
          {a.phone && <div><a href={`tel:${chiffres(a.phone)}`} style={{ color: T.ink }}>{a.phone}</a></div>}
          {a.email && <div style={{ color: T.ink2 }}>{a.email}</div>}
          {!a.phone && !a.email && "—"}
        </div>
      ),
    },
    {
      cle: "vehicule", titre: "Véhicule", rendu: (a) => (
        <div style={{ fontSize: 13.5 }}>
          <div>{[a.carBrand, a.carModel].filter(Boolean).join(" ") || "—"}</div>
          {a.immatriculation && <div style={{ color: T.ink2, letterSpacing: "0.04em" }}>{a.immatriculation}</div>}
        </div>
      ),
    },
    { cle: "commercial", titre: "Commercial", rendu: (a) => <span style={{ color: T.ink2 }}>{a.commercial || "—"}</span> },
    {
      cle: "mandat", titre: "Mandat signé", aligne: "centre",
      rendu: (a) => bouton(
        a.signStatus === "signed" && !a.mandatRemoved,
        "Mandat signé", "#16a34a",
        // Un clic par inadvertance sur un tableau se paie cher : on demande confirmation.
        () => setConfirmation(a.signStatus === "signed"
          ? {
              titre: "Retirer le mandat signé ?",
              message: `Le dossier de ${nomDe(a)} ne sera plus compté comme signé, et sa facturation repartira de zéro.`,
              libelle: "Retirer le mandat",
              action: async () => { await majStatut(a, { signStatus: "" }); },
            }
          : {
              titre: "Confirmer le mandat signé",
              message: `Es-tu sûr que le mandat a bien été signé pour ${nomDe(a)} ? Le client sera aussi marqué présent, et le dossier deviendra facturable.`,
              libelle: "Oui, mandat signé",
              action: async () => { await majStatut(a, { signStatus: "signed", present: true }); },
            }),
        a.signStatus === "signed" ? "Cliquer pour retirer le mandat signé" : "Marque le mandat signé et le client présent",
        a.id,
      ),
    },
    {
      cle: "bc", titre: "Bon de commande", aligne: "centre",
      rendu: (a) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {bouton(a.bcSigned, "BC signé", "#2563eb", () => majStatut(a, { bcSigned: !a.bcSigned }),
            a.signStatus === "signed" ? undefined : "Se pose en général après le mandat", a.id)}
          {a.bcSigned && (
            <input
              type="number" inputMode="numeric" defaultValue={a.negotiation || ""}
              placeholder="Marge €" title="Marge réalisée sur ce dossier"
              onBlur={(e) => { const v = Number(e.target.value); if (v !== a.negotiation) majStatut(a, { negotiation: v }); }}
              style={{ width: 96, height: 32, padding: "0 10px", textAlign: "right", fontSize: 12.5, border: `1px solid ${T.line}`, borderRadius: R.sm, background: T.surface, color: T.ink }}
            />
          )}
        </div>
      ),
    },
    { cle: "facturation", titre: "Facturation", aligne: "centre", rendu: (a) => <Badge ton={etatFacturation(a).ton}>{etatFacturation(a).texte}</Badge> },
    { cle: "etat", titre: "Statut", aligne: "centre", rendu: (a) => <Badge ton={etat(a).ton}>{etat(a).texte}</Badge> },
  ];

  return (
    <Shell active="recherche-rdv" wide>
      <PageHeader
        title="Recherche"
        subtitle="Retrouve un rendez-vous par téléphone, e-mail, nom du client, marque ou modèle, plaque d'immatriculation, ou date."
      />

      <Card>
        <div style={{ position: "relative", marginBottom: S.md }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.ink3} strokeWidth="2.2" strokeLinecap="round"
               style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" />
          </svg>
          <input
            autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="06 12 34 56 78 · jean@mail.com · AB-123-CD · Peugeot 208 · Dupont"
            aria-label="Rechercher un rendez-vous"
            style={{ width: "100%", boxSizing: "border-box", height: 52, padding: "0 18px 0 46px", fontSize: 16, border: `1px solid ${T.line}`, borderRadius: R.sm, background: T.surface, color: T.ink }}
          />
        </div>

        <div style={{ display: "flex", gap: S.md, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 380px", maxWidth: 460 }}>
            <DateRange from={du} to={au} onChange={(r) => { setDu(r.from); setAu(r.to); }} />
          </div>
          <button
            onClick={() => setAide((v) => !v)}
            style={{ height: 40, padding: "0 14px", borderRadius: R.sm, border: `1px solid ${aide ? T.lineStrong : T.line}`, background: aide ? T.surface2 : T.surface, color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            Client introuvable ?
          </button>
          {(q || du || au) && (
            <button
              onClick={() => { setQ(""); setDu(""); setAu(""); }}
              style={{ height: 40, padding: "0 14px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
            >
              Effacer la recherche
            </button>
          )}
        </div>
      </Card>

      {aide && (
        <Card
          title="Le client reste introuvable ?"
          description="Le rendez-vous est peut-être enregistré sous un autre nom que celui du dossier : celui du conjoint, d'un proche, ou du titulaire de la carte grise."
          actions={<button onClick={() => setAide(false)} style={{ height: 32, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Fermer</button>}
        >
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: T.ink }}>
            <li>
              <strong>Cherche par la plaque.</strong> C&apos;est le repère le plus fiable : elle ne change pas de nom.
              Tape-la avec ou sans tirets, en entier ou en partie (<code>AB123</code> suffit).
            </li>
            <li>
              <strong>Sinon, par le téléphone.</strong> Les chiffres seuls suffisent, et une partie du numéro marche aussi :
              tape <code>25 91</code> pour retrouver un 07 87 25 91 57.
            </li>
            <li>
              <strong>Numéro différent ? Passe par le véhicule.</strong> Marque et modèle (<code>Peugeot 208</code>),
              même approximatifs, ramènent souvent la bonne fiche.
            </li>
            <li>
              <strong>Élargis la période.</strong> Un intervalle de dates actif masque tout ce qui tombe en dehors —
              vide-le pour chercher sur tout l&apos;historique.
            </li>
            <li>
              <strong>Essaie un fragment de nom.</strong> Une seule syllabe suffit ; les accents et les majuscules sont ignorés.
              Pense au nom du conjoint ou au prénom seul.
            </li>
          </ol>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: S.md }}>
            <button
              onClick={() => { setDu(""); setAu(""); setAide(false); }}
              style={{ height: 36, padding: "0 14px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
            >
              Chercher sur tout l&apos;historique
            </button>
            <button
              onClick={() => { setQ(""); setDu(""); setAu(""); setAide(false); }}
              style={{ height: 36, padding: "0 14px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
            >
              Tout afficher
            </button>
          </div>

          <p style={{ margin: `${S.md}px 0 0`, fontSize: 13.5, color: T.ink2 }}>
            Toujours rien ? Le rendez-vous appartient peut-être à un autre commercial : dans ce cas, il n&apos;apparaît pas dans ta recherche.
          </p>
        </Card>
      )}

      {err && <Card><div style={{ color: T.danger, fontWeight: 700 }}>{err}</div></Card>}

      {/* Barre d'actions groupées : ne s'affiche que si des lignes sont cochées. */}
      {selection.size > 0 && (
        <div style={{
          position: "sticky", top: 12, zIndex: 40, marginBottom: S.md,
          background: T.surface, border: `1px solid ${T.lineStrong}`, borderRadius: R.md,
          boxShadow: "0 12px 32px rgba(26,26,26,0.16)", padding: `${S.sm}px ${S.md}px`,
          display: "flex", alignItems: "center", gap: S.md, flexWrap: "wrap",
        }}>
          <strong style={{ fontSize: 15 }}>
            {selection.size} dossier{selection.size > 1 ? "s" : ""} sélectionné{selection.size > 1 ? "s" : ""}
          </strong>

          <button
            onClick={() => setConfirmation({
              titre: "Confirmer les mandats signés",
              message: `Marquer ${selection.size} dossier${selection.size > 1 ? "s" : ""} comme mandat signé ? Les clients concernés seront aussi marqués présents.`,
              libelle: "Oui, mandats signés",
              action: () => appliquerGroupe(() => ({ signStatus: "signed", present: true })),
            })}
            style={{ height: 36, padding: "0 14px", borderRadius: R.sm, border: "none", background: "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            Mandat signé
          </button>

          <button
            onClick={() => setConfirmation({
              titre: "Confirmer les bons de commande",
              message: `Marquer ${selection.size} dossier${selection.size > 1 ? "s" : ""} comme bon de commande signé ? Tu pourras saisir la marge ligne par ligne ensuite.`,
              libelle: "Oui, bons de commande signés",
              action: () => appliquerGroupe(() => ({ bcSigned: true })),
            })}
            style={{ height: 36, padding: "0 14px", borderRadius: R.sm, border: "none", background: "#2563eb", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            Bon de commande signé
          </button>

          <button
            onClick={() => setSelection(new Set(resultats.map((a) => a.id)))}
            style={{ height: 36, padding: "0 14px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            Tout sélectionner ({resultats.length})
          </button>

          <button
            onClick={() => setSelection(new Set())}
            style={{ height: 36, padding: "0 14px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            Vider la sélection
          </button>

          <span style={{ fontSize: 13, color: T.ink2 }}>
            La sélection reste active quand tu changes de recherche.
          </span>
        </div>
      )}

      <Card
        title={loading ? "Chargement…" : `${resultats.length} rendez-vous`}
        description={q || du || au ? "Résultats correspondant à ta recherche." : "Tous tes rendez-vous, du plus récent au plus ancien."}
      >
        <DataTable
          colonnes={colonnes}
          lignes={resultats.slice(0, 200)}
          vide={loading ? "Chargement…" : "Aucun rendez-vous ne correspond."}
        />
        {resultats.length > 200 && (
          <div style={{ paddingTop: S.md, fontSize: 13.5, color: T.ink2 }}>
            200 premiers résultats affichés sur {resultats.length} — affine la recherche pour aller plus loin.
          </div>
        )}
      </Card>

      {/* Confirmation : rien ne part sur un clic malencontreux. */}
      {confirmation && (
        <div
          onClick={() => !enTrain && setConfirmation(null)}
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(26,26,26,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: T.surface, borderRadius: R.lg, padding: S.lg, boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>{confirmation.titre}</h2>
            <p style={{ margin: `10px 0 ${S.lg}px`, fontSize: 15, lineHeight: 1.55, color: T.ink2 }}>{confirmation.message}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={async () => { setEnTrain(true); try { await confirmation.action(); } finally { setEnTrain(false); setConfirmation(null); } }}
                disabled={enTrain}
                style={{ height: 38, padding: "0 16px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: enTrain ? "wait" : "pointer" }}
              >
                {enTrain ? "En cours…" : confirmation.libelle}
              </button>
              <button
                onClick={() => setConfirmation(null)} disabled={enTrain}
                style={{ height: 38, padding: "0 16px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

export default Recherche;

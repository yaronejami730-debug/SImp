"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/client";
import { PageHeader, Card, Button, Field, FormGrid, DataTable, champ, T, S, type Colonne } from "@/components/ui";
import EspaceAgenceShell from "@/components/layout/EspaceAgenceShell";
import { type Prospect, fmtDate, chargerProspects, copierLienBesoins, EnvoiModal, BesoinsModal } from "./_shared";

export default function ContactsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [defaultPrices, setDefaultPrices] = useState({ citadine: 80, suv: 100, premium: 150, lead: 20 });
  const [loading, setLoading] = useState(true);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [creating, setCreating] = useState(false);
  const [modal, setModal] = useState<Prospect | null>(null);
  const [besoinsAffiches, setBesoinsAffiches] = useState<Prospect | null>(null);

  async function charger() {
    try {
      const d = await chargerProspects();
      if (d) { setProspects(d.prospects); setDefaultPrices(d.defaultPrices); }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { charger(); }, []);

  async function ajouterContact() {
    if (!nom.trim() || !email.trim()) { alert("Nom et e-mail requis."); return; }
    setCreating(true);
    try {
      const r = await fetch("/api/prospection-agence", {
        method: "POST", headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action: "create", name: nom.trim(), email: email.trim(), phone: telephone.trim() }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.error ?? "Erreur"); return; }
      setNom(""); setEmail(""); setTelephone("");
      charger();
    } finally {
      setCreating(false);
    }
  }

  async function retirerContact(id: number) {
    if (!confirm("Retirer ce contact de la liste ?")) return;
    await fetch(`/api/prospection-agence?id=${id}`, { method: "DELETE", headers: authHeaders() });
    charger();
  }

  const colonnes: Colonne<Prospect>[] = [
    { cle: "nom", titre: "Nom", rendu: (p) => <strong>{p.name}</strong> },
    { cle: "email", titre: "E-mail", rendu: (p) => p.email },
    { cle: "tel", titre: "Téléphone", rendu: (p) => p.phone || <span style={{ color: T.ink2 }}>—</span> },
    {
      cle: "envoi", titre: "Dernier envoi",
      rendu: (p) => p.last_sent_at ? fmtDate(p.last_sent_at) : <span style={{ color: T.ink2 }}>Jamais envoyé</span>,
    },
    {
      cle: "besoins", titre: "Besoins",
      rendu: (p) => p.needs_submitted_at
        ? <button onClick={() => setBesoinsAffiches(p)} style={{ border: "none", background: "none", color: T.brand, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>Réponse reçue — voir</button>
        : <span style={{ color: T.ink2 }}>En attente</span>,
    },
    {
      cle: "actions", titre: "", aligne: "droite",
      rendu: (p) => (
        <div style={{ display: "inline-flex", gap: 6 }}>
          <Button variante="discret" onClick={() => copierLienBesoins(p)} title="Copier le lien du questionnaire besoins">Copier lien</Button>
          <Button variante="principal" onClick={() => setModal(p)}>Envoyer proposition</Button>
          <Button variante="danger" onClick={() => retirerContact(p.id)}>Retirer</Button>
        </div>
      ),
    },
  ];

  return (
    <EspaceAgenceShell active="contacts">
      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: T.ink2 }}>Chargement…</div>
      ) : (
        <>
          <PageHeader
            title="Contacts"
            subtitle="Démarchage B2B des agences à qui on apporte de l'acquisition client. Les e-mails partent toujours au nom de YJ Solutions, jamais Simplicicar."
          />
          <Card title="Nouveau contact" description="Nom, e-mail et téléphone de la personne à démarcher.">
            <FormGrid>
              <Field label="Nom"><input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Dupont" style={champ} /></Field>
              <Field label="E-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@agence.fr" style={champ} /></Field>
              <Field label="Téléphone (facultatif)"><input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="06 00 00 00 00" style={champ} /></Field>
            </FormGrid>
            <div style={{ marginTop: S.md }}>
              <Button variante="principal" onClick={ajouterContact} disabled={creating}>{creating ? "Ajout…" : "+ Ajouter le contact"}</Button>
            </div>
          </Card>
          <Card title={`Tous les contacts (${prospects.length})`} description="« Envoyer proposition » ouvre l'aperçu du mail et les tarifs. « Copier lien » donne le questionnaire de cadrage à joindre où tu veux.">
            <DataTable colonnes={colonnes} lignes={prospects} vide="Aucun contact pour l'instant." />
          </Card>
        </>
      )}

      {modal && (
        <EnvoiModal prospect={modal} defaultPrices={defaultPrices} onClose={() => setModal(null)} onSent={() => { setModal(null); charger(); }} />
      )}
      {besoinsAffiches && <BesoinsModal prospect={besoinsAffiches} onClose={() => setBesoinsAffiches(null)} />}
    </EspaceAgenceShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Button, DataTable, T, type Colonne } from "@/components/ui";
import EspaceAgenceShell from "@/components/layout/EspaceAgenceShell";
import { type Prospect, type Prices, fmtDate, chargerProspects, EnvoiModal } from "../_shared";

export default function PropositionsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [defaultPrices, setDefaultPrices] = useState<Prices>({ citadine: 80, suv: 100, premium: 150, lead: 20 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Prospect | null>(null);

  async function charger() {
    try {
      const d = await chargerProspects();
      if (d) { setProspects(d.prospects); setDefaultPrices(d.defaultPrices); }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { charger(); }, []);

  const envoyees = prospects.filter((p) => p.last_sent_at);
  const colonnes: Colonne<Prospect>[] = [
    { cle: "nom", titre: "Nom", rendu: (p) => <strong>{p.name}</strong> },
    { cle: "email", titre: "E-mail", rendu: (p) => p.email },
    { cle: "envoi", titre: "Envoyée le", rendu: (p) => fmtDate(p.last_sent_at) },
    {
      cle: "prix", titre: "Tarifs envoyés",
      rendu: (p) => p.last_sent_prices
        ? <span style={{ fontSize: 12.5 }}>{p.last_sent_prices.citadine}€ / {p.last_sent_prices.suv}€ / {p.last_sent_prices.premium}€ · lead {p.last_sent_prices.lead}€</span>
        : <span style={{ color: T.ink2 }}>—</span>,
    },
    {
      cle: "actions", titre: "", aligne: "droite",
      rendu: (p) => <Button variante="principal" onClick={() => setModal(p)}>Renvoyer</Button>,
    },
  ];

  return (
    <EspaceAgenceShell active="propositions">
      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: T.ink2 }}>Chargement…</div>
      ) : (
        <>
          <PageHeader title="Propositions envoyées" subtitle="Historique des propositions commerciales envoyées, avec les tarifs retenus." />
          <Card title={`Envoyées (${envoyees.length})`}>
            <DataTable colonnes={colonnes} lignes={envoyees} vide="Aucune proposition envoyée pour l'instant." />
          </Card>
        </>
      )}
      {modal && (
        <EnvoiModal prospect={modal} defaultPrices={defaultPrices} onClose={() => setModal(null)} onSent={() => { setModal(null); charger(); }} />
      )}
    </EspaceAgenceShell>
  );
}

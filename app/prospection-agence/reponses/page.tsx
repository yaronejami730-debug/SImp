"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Button, DataTable, T, type Colonne } from "@/components/ui";
import EspaceAgenceShell from "@/components/layout/EspaceAgenceShell";
import { type Prospect, fmtDate, chargerProspects, BesoinsModal } from "../_shared";

export default function ReponsesPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [besoinsAffiches, setBesoinsAffiches] = useState<Prospect | null>(null);

  useEffect(() => {
    chargerProspects().then((d) => { if (d) setProspects(d.prospects); }).finally(() => setLoading(false));
  }, []);

  const recues = prospects.filter((p) => p.needs_submitted_at);
  const colonnes: Colonne<Prospect>[] = [
    { cle: "nom", titre: "Nom", rendu: (p) => <strong>{p.name}</strong> },
    { cle: "email", titre: "E-mail", rendu: (p) => p.email },
    { cle: "date", titre: "Répondu le", rendu: (p) => fmtDate(p.needs_submitted_at) },
    {
      cle: "voir", titre: "", aligne: "droite",
      rendu: (p) => <Button variante="principal" onClick={() => setBesoinsAffiches(p)}>Voir les réponses</Button>,
    },
  ];

  return (
    <EspaceAgenceShell active="reponses">
      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: T.ink2 }}>Chargement…</div>
      ) : (
        <>
          <PageHeader title="Réponses reçues" subtitle="Questionnaires de cadrage remplis par les contacts, via le lien envoyé dans le mail." />
          <Card title={`Reçues (${recues.length})`}>
            <DataTable colonnes={colonnes} lignes={recues} vide="Aucune réponse pour l'instant." />
          </Card>
        </>
      )}
      {besoinsAffiches && <BesoinsModal prospect={besoinsAffiches} onClose={() => setBesoinsAffiches(null)} />}
    </EspaceAgenceShell>
  );
}

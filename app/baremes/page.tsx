"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";
import {
  PageHeader, Card, StatCard, StatRow, Badge, Button, Field, FormGrid, DataTable, Euro, champ, T, S,
  type Colonne,
} from "@/components/ui";


interface CallCenter { id: number; name: string; responsable_email?: string; gestionnaire_email?: string; }
interface Commercial { id: number; name: string; email: string; }
interface DirectUser { id: number; name: string; email: string; commission_base: number; commission_pct: number; is_commercial: boolean; }
interface AccordIndep {
  id: number;
  commercial_email: string; commercial_name: string | null;
  payee_email: string; telepro_name: string | null;
  base_eur: string; pct_nego: string; trigger_kind: string;
}

interface Agreement {
  id: number;
  call_center_name: string;
  commercial_name: string;
  commercial_email: string;
  base_amount: number;
  gestionnaire_amount: number;
  call_center_amount: number;
  status: "pending_confirmation" | "active" | "rejected";
  confirmed_at: string | null;
  created_at: string;
}

export default function BaremesPage() {
  const [callCenters, setCallCenters] = useState<CallCenter[]>([]);
  const [selectedCC, setSelectedCC] = useState<string>("");
  const [commercials, setCommercials] = useState<Commercial[]>([]);
  const [selectedCommercial, setSelectedCommercial] = useState<string>("");
  const [baseAmount, setBaseAmount] = useState("");
  const [trigger, setTrigger] = useState<"signed" | "honored">("signed");
  const [gestionnaireAmount, setGestionnaireAmount] = useState("");
  const [callCenterAmount, setCallCenterAmount] = useState("");
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [userCC, setUserCC] = useState<number>(0);
  const [directUsers, setDirectUsers] = useState<DirectUser[]>([]);
  const [directDraft, setDirectDraft] = useState<Record<number, { base: string; pct: string }>>({});
  const [savingDirect, setSavingDirect] = useState<number | null>(null);
  const [vue, setVue] = useState<"direct" | "callcenter">("direct");
  const [formOuvert, setFormOuvert] = useState(false);
  const [typeAccord, setTypeAccord] = useState<"callcenter" | "independant">("callcenter");
  const [accordsIndep, setAccordsIndep] = useState<AccordIndep[]>([]);
  const [telepros, setTelepros] = useState<{ email: string; name: string }[]>([]);
  const [indepCommercial, setIndepCommercial] = useState("");
  const [indepTelepro, setIndepTelepro] = useState("");
  const [indepBase, setIndepBase] = useState("");
  const [indepPct, setIndepPct] = useState("");

  useEffect(() => {
    loadUser();
    loadAgreements();
  }, []);

  useEffect(() => {
    if (userRole !== "admin") return;
    // Accords passés en direct avec des téléprospecteurs indépendants.
    fetch("/api/accords-telepro", { headers: authHeaders() })
      .then((r) => r.json()).then((d) => { if (d.ok) setAccordsIndep(d.accords); }).catch(() => {});
    fetch("/api/users", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setTelepros((d.users as { email: string; name: string; is_teleprospector?: boolean }[])
          .filter((u) => u.is_teleprospector).map((u) => ({ email: u.email, name: u.name })));
      }).catch(() => {});
  }, [userRole]);

  async function creerAccordIndep() {
    const res = await fetch("/api/accords-telepro", {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        commercialEmail: indepCommercial, teleproEmail: indepTelepro,
        baseEur: parseFloat(indepBase) || 0, pctNego: parseFloat(indepPct) || 0, trigger,
      }),
    });
    const d = await res.json();
    if (!d.ok) { alert(d.error ?? "Erreur"); return; }
    setIndepBase(""); setIndepPct(""); setIndepTelepro("");
    const r = await fetch("/api/accords-telepro", { headers: authHeaders() });
    const j = await r.json();
    if (j.ok) setAccordsIndep(j.accords);
  }

  async function supprimerAccordIndep(id: number) {
    if (!confirm("Désactiver cet accord ? La trace est conservée.")) return;
    await fetch(`/api/accords-telepro?id=${id}`, { method: "DELETE", headers: authHeaders() });
    setAccordsIndep((l) => l.filter((x) => x.id !== id));
  }

  useEffect(() => {
    if (userRole === "admin") loadDirectUsers();
  }, [userRole]);

  async function loadDirectUsers() {
    try {
      const res = await fetch("/api/users", { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) {
        const list = (data.users || []).filter((u: DirectUser) => u.is_commercial);
        setDirectUsers(list);
        setDirectDraft(Object.fromEntries(list.map((u: DirectUser) => [u.id, { base: String(Number(u.commission_base)), pct: String(Number(u.commission_pct)) }])));
      }
    } catch (e) {
      console.error("Failed to load direct users:", e);
    }
  }

  async function saveDirect(id: number) {
    const d = directDraft[id];
    if (!d) return;
    setSavingDirect(id);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH", headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ id, commissionBase: parseFloat(d.base) || 0, commissionPct: parseFloat(d.pct) || 0 }),
      });
      const data = await res.json();
      if (data.ok) loadDirectUsers(); else alert(data.error ?? "Erreur");
    } finally {
      setSavingDirect(null);
    }
  }

  useEffect(() => {
    if (userRole && userCC) loadCallCenters();
  }, [userRole, userCC]);

  useEffect(() => {
    if (selectedCC) loadCommercials();
  }, [selectedCC]);

  async function loadUser() {
    try {
      const res = await fetch("/api/me", { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) {
        setUserRole(data.role);
        setUserCC(data.callCenterId);
        // Auto-select if gestionnaire
        if (data.role === "gestionnaire") {
          setSelectedCC(String(data.callCenterId));
        }
      }
    } catch (e) {
      console.error("Failed to load user:", e);
    }
  }

  async function loadCallCenters() {
    try {
      const res = await fetch("/api/callcenters", { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) {
        const ccs = data.callCenters || data.callcenters || [];
        // Filter if gestionnaire
        if (userRole === "gestionnaire") {
          setCallCenters(ccs.filter((cc: CallCenter) => cc.id === userCC));
        } else {
          setCallCenters(ccs);
        }
      }
    } catch (e) {
      console.error("Failed to load call centers:", e);
    }
  }

  async function loadCommercials() {
    try {
      const res = await fetch(`/api/users?callCenterId=${selectedCC}&role=commercial`, { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) setCommercials((data.users || []).filter((u: { is_commercial?: boolean }) => u.is_commercial));
    } catch (e) {
      console.error("Failed to load commercials:", e);
    }
  }

  async function loadAgreements() {
    try {
      const res = await fetch(`/api/pricing-agreements`, { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) setAgreements(data.agreements || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleEdit(a: Agreement) {
    const base = prompt("Montant de base (€ / RDV signé) :", String(Number(a.base_amount)));
    if (base === null) return;
    const gest = prompt("Part gestionnaire (€) :", String(Number(a.gestionnaire_amount)));
    if (gest === null) return;
    const cc = prompt("Part call center (€) :", String(Number(a.call_center_amount)));
    if (cc === null) return;
    const trig = prompt("Déclencheur — tape 'signe' ou 'honore' :", (a as unknown as { trigger_kind?: string }).trigger_kind === "honored" ? "honore" : "signe");
    if (trig === null) return;
    const res = await fetch("/api/pricing-agreements", {
      method: "PATCH", headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ agreementId: a.id, baseAmount: Number(base), gestionnaireAmount: Number(gest), callCenterAmount: Number(cc), trigger: trig.toLowerCase().startsWith("hono") ? "honored" : "signed" }),
    });
    const d = await res.json();
    if (d.ok) { alert("Accord renégocié — repasse en attente de confirmation du commercial."); loadAgreements(); }
    else alert(d.error ?? "Erreur");
  }
  async function handleDelete(a: Agreement) {
    if (!confirm(`Supprimer l'accord ${a.call_center_name} × ${a.commercial_name} ?`)) return;
    const res = await fetch(`/api/pricing-agreements?id=${a.id}`, { method: "DELETE", headers: authHeaders() });
    const d = await res.json();
    if (d.ok) loadAgreements(); else alert(d.error ?? "Erreur");
  }

  async function handleCreate() {
    if (!selectedCC || !selectedCommercial || !baseAmount || gestionnaireAmount === "" || callCenterAmount === "") {
      alert("Tous les champs obligatoires");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/pricing-agreements", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          callCenterId: parseInt(selectedCC),
          commercialId: parseInt(selectedCommercial),
          baseAmount: parseFloat(baseAmount),
          gestionnaireAmount: parseFloat(gestionnaireAmount),
          callCenterAmount: parseFloat(callCenterAmount),
          trigger,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        alert("Accord créé avec succès");
        setBaseAmount("");
        setGestionnaireAmount("");
        setCallCenterAmount("");
        setSelectedCommercial("");
        loadAgreements();
      } else {
        alert(data.error || "Erreur lors de la création");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <Shell active="baremes" wide>
        <div style={{ padding: 60, textAlign: "center", color: T.ink2 }}>Chargement…</div>
      </Shell>
    );
  }

  const actifs = agreements.filter((a) => a.status === "active").length;
  const enAttente = agreements.filter((a) => a.status === "pending_confirmation").length;
  const avecBareme = directUsers.filter((u) => Number(u.commission_base) > 0 || Number(u.commission_pct) > 0).length;

  const statutBadge = (a: Agreement) =>
    a.status === "active" ? <Badge ton="succes">Actif</Badge>
      : a.status === "pending_confirmation" ? <Badge ton="attente">En attente</Badge>
      : <Badge ton="danger">Rejeté</Badge>;

  const colonnes: Colonne<Agreement>[] = [
    { cle: "cc", titre: "Call center", rendu: (a) => <strong>{a.call_center_name}</strong> },
    { cle: "com", titre: "Commercial", rendu: (a) => a.commercial_name },
    {
      cle: "decl", titre: "Payé quand", rendu: (a) =>
        <Badge ton="info">{(a as unknown as { trigger_kind?: string }).trigger_kind === "honored" ? "RDV honoré" : "Mandat signé"}</Badge>,
    },
    { cle: "base", titre: "Commercial", aligne: "droite", rendu: (a) => <Euro montant={Number(a.base_amount)} /> },
    { cle: "gest", titre: "Gestionnaire", aligne: "droite", rendu: (a) => <Euro montant={Number(a.gestionnaire_amount)} discret /> },
    { cle: "ccm", titre: "Call center", aligne: "droite", rendu: (a) => <Euro montant={Number(a.call_center_amount)} discret /> },
    { cle: "statut", titre: "Statut", aligne: "centre", rendu: statutBadge },
    {
      cle: "actions", titre: "", aligne: "droite", rendu: (a) => (
        <div style={{ display: "inline-flex", gap: 6 }}>
          <Button variante="discret" onClick={() => handleEdit(a)} title="Renégocier les montants">Modifier</Button>
          <Button variante="danger" onClick={() => handleDelete(a)} title="Supprimer l'accord">Supprimer</Button>
        </div>
      ),
    },
  ];

  return (
    <Shell active="baremes" wide>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <PageHeader
          title="Barèmes"
          subtitle="Qui touche combien sur un dossier. Deux cas : un accord direct avec un commercial, ou un accord passant par un call center."
        />

        {userRole === "admin" && (
          <div style={{ display: "flex", gap: 6, marginBottom: S.md, flexWrap: "wrap" }}>
            <Button variante={vue === "direct" ? "principal" : "secondaire"} onClick={() => setVue("direct")}>
              Commerciaux ({directUsers.length})
            </Button>
            <Button variante={vue === "callcenter" ? "principal" : "secondaire"} onClick={() => setVue("callcenter")}>
              Call centers ({agreements.length})
            </Button>
          </div>
        )}

        <StatRow>
          <StatCard label="Commerciaux" value={directUsers.length} hint={`${avecBareme} avec un barème posé`} />
          <StatCard label="Accords actifs" value={actifs} hint="confirmés par le commercial" />
          <StatCard label="En attente" value={enAttente} hint="à confirmer par le commercial" />
        </StatRow>

        {vue === "direct" && userRole === "admin" && (
          <Card
            title="Accord direct avec un commercial"
            description="Sans call center ni gestionnaire : ce que tu verses au commercial pour chaque dossier. Un montant fixe, plus éventuellement un pourcentage du montant négocié. C'est ce barème qui alimente le Bilan et la facturation."
          >
            {directUsers.length === 0 ? (
              <div style={{ padding: `${S.lg}px 0`, textAlign: "center", color: T.ink2 }}>Aucun commercial enregistré.</div>
            ) : (
              <div style={{ display: "grid", gap: 0 }}>
                {directUsers.map((u, i) => {
                  const d = directDraft[u.id] ?? { base: "0", pct: "0" };
                  return (
                    <div key={u.id} style={{ display: "flex", alignItems: "flex-end", gap: S.md, flexWrap: "wrap", padding: `${S.md}px 0`, borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}>
                      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15.5 }}>{u.name}</div>
                        <div style={{ fontSize: 13, color: T.ink2 }}>{u.email}</div>
                      </div>
                      <div style={{ width: 150 }}>
                        <Field label="Fixe par dossier">
                          <input
                            type="number" step="0.01" value={d.base}
                            onChange={(e) => setDirectDraft((m) => ({ ...m, [u.id]: { ...d, base: e.target.value } }))}
                            style={{ ...champ, textAlign: "right" }}
                          />
                        </Field>
                      </div>
                      <div style={{ width: 150 }}>
                        <Field label="% du négocié">
                          <input
                            type="number" step="0.1" value={d.pct}
                            onChange={(e) => setDirectDraft((m) => ({ ...m, [u.id]: { ...d, pct: e.target.value } }))}
                            style={{ ...champ, textAlign: "right" }}
                          />
                        </Field>
                      </div>
                      <Button variante="principal" onClick={() => saveDirect(u.id)} disabled={savingDirect === u.id}>
                        {savingDirect === u.id ? "…" : "Enregistrer"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {(vue === "callcenter" || userRole !== "admin") && (
          <>
            <Card
              title="Accords call center"
              description="Un dossier apporté par un call center se partage en trois : la part du commercial, celle du gestionnaire qui a apporté le call center, et celle du call center."
              actions={<Button variante={formOuvert ? "secondaire" : "principal"} onClick={() => setFormOuvert((v) => !v)}>{formOuvert ? "Fermer" : "Nouvel accord"}</Button>}
            >
              {formOuvert && (
                <div style={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 12, padding: S.md, marginBottom: S.md }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: S.md }}>
                    <Button variante={typeAccord === "callcenter" ? "principal" : "secondaire"} onClick={() => setTypeAccord("callcenter")}>
                      Avec un call center
                    </Button>
                    <Button variante={typeAccord === "independant" ? "principal" : "secondaire"} onClick={() => setTypeAccord("independant")}>
                      Avec un téléprospecteur indépendant
                    </Button>
                  </div>

                  {typeAccord === "independant" ? (
                    <>
                      <p style={{ margin: `0 0 ${S.md}px`, fontSize: 14, color: T.ink2, lineHeight: 1.5, maxWidth: "70ch" }}>
                        Pas de call center ici : le commercial paie directement le téléprospecteur pour chaque rendez-vous
                        qu&apos;il lui apporte. Montant fixe, pourcentage du négocié, ou les deux.
                      </p>
                      <FormGrid>
                        <Field label="Commercial qui paie">
                          <select value={indepCommercial} onChange={(e) => setIndepCommercial(e.target.value)} style={champ}>
                            <option value="">À sélectionner</option>
                            {directUsers.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
                          </select>
                        </Field>
                        <Field label="Téléprospecteur payé">
                          <select value={indepTelepro} onChange={(e) => setIndepTelepro(e.target.value)} style={champ}>
                            <option value="">À sélectionner</option>
                            {telepros.map((t) => <option key={t.email} value={t.email}>{t.name}</option>)}
                          </select>
                        </Field>
                        <Field label="La rémunération tombe" hint="Au mandat signé, ou dès que le client est venu.">
                          <select value={trigger} onChange={(e) => setTrigger(e.target.value as "signed" | "honored")} style={champ}>
                            <option value="signed">Au mandat signé</option>
                            <option value="honored">Au rendez-vous honoré</option>
                          </select>
                        </Field>
                      </FormGrid>

                      <FormGrid colonnes="repeat(auto-fit, minmax(180px, 1fr))">
                        <Field label="Montant fixe (€)" hint="Par rendez-vous.">
                          <input type="number" step="0.01" value={indepBase} onChange={(e) => setIndepBase(e.target.value)} placeholder="50" style={{ ...champ, textAlign: "right" }} />
                        </Field>
                        <Field label="Pourcentage du négocié (%)" hint="Facultatif.">
                          <input type="number" step="0.1" value={indepPct} onChange={(e) => setIndepPct(e.target.value)} placeholder="10" style={{ ...champ, textAlign: "right" }} />
                        </Field>
                      </FormGrid>

                      <div style={{ display: "flex", alignItems: "center", gap: S.md, flexWrap: "wrap" }}>
                        <Button
                          variante="principal" onClick={creerAccordIndep}
                          disabled={!indepCommercial || !indepTelepro || (!indepBase && !indepPct)}
                        >
                          Créer l&apos;accord
                        </Button>
                        <span style={{ fontSize: 13.5, color: T.ink2 }}>
                          Sur un dossier signé à 2 000 € de marge :{" "}
                          <Euro montant={(parseFloat(indepBase) || 0) + ((parseFloat(indepPct) || 0) / 100) * 2000} /> versés au téléprospecteur.
                        </span>
                      </div>
                    </>
                  ) : (
                  <>
                  <FormGrid>
                    <Field label="Call center">
                      <select value={selectedCC} onChange={(e) => { setSelectedCC(e.target.value); setSelectedCommercial(""); }} style={champ}>
                        <option value="">À sélectionner</option>
                        {callCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Commercial" hint={selectedCC ? undefined : "Choisis d'abord un call center."}>
                      <select value={selectedCommercial} onChange={(e) => setSelectedCommercial(e.target.value)} disabled={!selectedCC} style={{ ...champ, color: selectedCC ? T.ink : T.ink3 }}>
                        <option value="">À sélectionner</option>
                        {commercials.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                    <Field label="La rémunération tombe" hint="Au mandat signé, ou dès que le client est venu.">
                      <select value={trigger} onChange={(e) => setTrigger(e.target.value as "signed" | "honored")} style={champ}>
                        <option value="signed">Au mandat signé</option>
                        <option value="honored">Au rendez-vous honoré</option>
                      </select>
                    </Field>
                  </FormGrid>

                  <FormGrid colonnes="repeat(auto-fit, minmax(160px, 1fr))">
                    <Field label="Part commercial (€)">
                      <input type="number" step="0.01" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} placeholder="60" style={{ ...champ, textAlign: "right" }} />
                    </Field>
                    <Field label="Part gestionnaire (€)">
                      <input type="number" step="0.01" value={gestionnaireAmount} onChange={(e) => setGestionnaireAmount(e.target.value)} placeholder="30" style={{ ...champ, textAlign: "right" }} />
                    </Field>
                    <Field label="Part call center (€)">
                      <input type="number" step="0.01" value={callCenterAmount} onChange={(e) => setCallCenterAmount(e.target.value)} placeholder="30" style={{ ...champ, textAlign: "right" }} />
                    </Field>
                  </FormGrid>

                  <Repartition
                    commercial={commercials.find((c) => String(c.id) === selectedCommercial)?.name}
                    callCenter={callCenters.find((cc) => String(cc.id) === selectedCC)}
                    partCommercial={parseFloat(baseAmount) || 0}
                    partGestionnaire={parseFloat(gestionnaireAmount) || 0}
                    partCallCenter={parseFloat(callCenterAmount) || 0}
                    declencheur={trigger}
                  />

                  <div style={{ display: "flex", alignItems: "center", gap: S.md, flexWrap: "wrap", marginTop: S.md }}>
                    <Button variante="principal" onClick={handleCreate} disabled={creating || !selectedCommercial}>
                      {creating ? "Création…" : "Créer l'accord"}
                    </Button>
                  </div>
                  </>
                  )}
                </div>
              )}

              <DataTable colonnes={colonnes} lignes={agreements} vide="Aucun accord pour l'instant." />
            </Card>

            {userRole === "admin" && (
              <Card
                title={`Accords avec des téléprospecteurs indépendants (${accordsIndep.length})`}
                description="Sans call center : le commercial paie directement le téléprospecteur qui lui apporte le rendez-vous."
              >
                <DataTable
                  colonnes={[
                    { cle: "com", titre: "Commercial", rendu: (x: AccordIndep) => <strong>{x.commercial_name || x.commercial_email}</strong> },
                    { cle: "tel", titre: "Téléprospecteur", rendu: (x: AccordIndep) => x.telepro_name || x.payee_email },
                    { cle: "decl", titre: "Payé quand", rendu: (x: AccordIndep) => <Badge ton="info">{x.trigger_kind === "honored" ? "RDV honoré" : "Mandat signé"}</Badge> },
                    { cle: "fixe", titre: "Fixe", aligne: "droite", rendu: (x: AccordIndep) => <Euro montant={Number(x.base_eur)} /> },
                    { cle: "pct", titre: "Du négocié", aligne: "droite", rendu: (x: AccordIndep) => Number(x.pct_nego) > 0 ? `${Number(x.pct_nego)} %` : <span style={{ color: T.ink2 }}>—</span> },
                    {
                      cle: "actions", titre: "", aligne: "droite",
                      rendu: (x: AccordIndep) => <Button variante="danger" onClick={() => supprimerAccordIndep(x.id)}>Retirer</Button>,
                    },
                  ]}
                  lignes={accordsIndep}
                  vide="Aucun accord direct avec un téléprospecteur indépendant."
                />
              </Card>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

/** Répartition d'un dossier, ligne par ligne : qui touche quoi, et ce qu'il en coûte au total.
 *  Se met à jour pendant la saisie : plus besoin d'imaginer le résultat. */
function Repartition({ commercial, callCenter, partCommercial, partGestionnaire, partCallCenter, declencheur }: {
  commercial?: string;
  callCenter?: { name: string; responsable_email?: string; gestionnaire_email?: string };
  partCommercial: number; partGestionnaire: number; partCallCenter: number;
  declencheur: "signed" | "honored";
}) {
  const total = partCommercial + partGestionnaire + partCallCenter;
  const lignes = [
    { role: "Commercial", qui: commercial ?? "à sélectionner", montant: partCommercial, aide: "Celui qui reçoit le client et signe le mandat." },
    { role: "Référent", qui: callCenter?.gestionnaire_email || "aucun référent", montant: partGestionnaire, aide: "Celui qui a apporté le call center." },
    { role: "Call center", qui: callCenter?.name ?? "à sélectionner", montant: partCallCenter, aide: "Reversé au call center, qui paie ses téléprospecteurs." },
  ];

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: S.md, marginTop: S.md }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: T.ink3, marginBottom: 10 }}>
        Ce que verse un dossier — {declencheur === "signed" ? "au mandat signé" : "au rendez-vous honoré"}
      </div>

      {lignes.map((l, i) => (
        <div key={l.role} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: S.md, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{l.role} <span style={{ fontWeight: 500, color: T.ink2 }}>— {l.qui}</span></div>
            <div style={{ fontSize: 12.5, color: T.ink3 }}>{l.aide}</div>
          </div>
          <Euro montant={l.montant} discret={l.montant === 0} />
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S.md, padding: "12px 0 0", borderTop: `2px solid ${T.line}`, marginTop: 4 }}>
        <strong style={{ fontSize: 15 }}>Total par dossier</strong>
        <Euro montant={total} />
      </div>

      <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 10, lineHeight: 1.5 }}>
        Le téléprospecteur qui a décroché le rendez-vous est payé par son call center, sur la part ci-dessus —
        son barème personnel se règle dans l&apos;onglet Commerciaux ou sur sa fiche de compte.
      </div>
    </div>
  );
}

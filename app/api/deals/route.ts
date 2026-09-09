import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { listAccords, explainAccord, linesFor, type Accord } from "@/lib/remuneration";
import { listAppointments } from "@/lib/google";
import { listCallCenters, ancestryMap, type CallCenter } from "@/lib/callcenters";
import { listUsers, listCommercials, listTeleprospectors } from "@/lib/users";

export const dynamic = "force-dynamic";

/** "Deal" — constructeur de deals de rémunération (remuneration_accords), au-dessus du moteur
 *  existant (lib/remuneration.ts).
 *
 *  Logique métier (voix du client, pas inventée) : un deal se négocie TOUJOURS entre un
 *  GESTIONNAIRE et un COMMERCIAL — c'est le gestionnaire qui vend des rendez-vous au commercial,
 *  le commercial est son client. Le gestionnaire touche sa part sur chaque dossier ; ensuite,
 *  DEUX façons de rémunérer le travail de prospection derrière :
 *   1) le call center prend une part et son RESPONSABLE redistribue lui-même en interne à ses
 *      téléprospecteurs (le gestionnaire ne s'en mêle pas) ;
 *   2) le gestionnaire a négocié DIRECT avec UN téléprospecteur précis — c'est alors le
 *      gestionnaire qui le paie sur sa propre part (le téléprospecteur peut même être le
 *      gestionnaire lui-même : les rôles sont cumulables).
 *  D'où le flux "Nouveau deal" : 1) quel commercial, 2) quel gestionnaire s'en occupe,
 *  3) call center (responsable redistribue) OU téléprospecteur précis (gestionnaire paie direct).
 *
 *  Qui peut CRÉER : le super-admin, ou un gestionnaire (toujours pour LUI-même — jamais au nom
 *  d'un autre gestionnaire, sauf l'admin). Le responsable de call center VOIT les deals qui le
 *  concernent (lecture) mais ne les négocie pas — son levier est le "Deal € par téléprospecteur"
 *  (/api/deal-telepro) quand le mode de rémunération le lui donne. */

const seesCc = (me: string, cc: CallCenter): boolean => {
  const isResp = me === (cc.responsable_email || "").toLowerCase() || me === (cc.responsable_email_2 || "").toLowerCase();
  const isGest = !!cc.gestionnaire_email && me === cc.gestionnaire_email.toLowerCase();
  return isResp || isGest;
};
const managesCc = (me: string, cc: CallCenter): boolean =>
  !!cc.gestionnaire_email && me === cc.gestionnaire_email.toLowerCase();

function nameFor(email: string, users: { email: string; name: string }[]): string {
  return users.find((x) => x.email.toLowerCase() === email.toLowerCase())?.name ?? email;
}

/** Tous les commerciaux actifs actuellement rattachés (directement ou via un call center
 *  descendant) à cette agence — pour "faire le deal avec toute l'agence" (bulk, voir brokerDeal). */
async function commercialsOfAgence(agenceId: number): Promise<string[]> {
  const [ccs, users] = await Promise.all([listCallCenters(), listUsers()]);
  const ancestry = ancestryMap(ccs);
  const inAgence = (ccId: number | null) => {
    if (ccId == null) return false;
    if (ccId === agenceId) return true;
    return (ancestry.get(ccId) ?? []).includes(agenceId);
  };
  // call_center_id remonte en string (bigint pg non casté par listUsers()) : Number() avant comparaison.
  return users.filter((u) => u.is_commercial && u.active && inAgence(Number(u.call_center_id))).map((u) => u.email.toLowerCase());
}

export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const me = s.email.toLowerCase();
    const [accords, ccs, users, commercialsDir, teleprosDir] = await Promise.all([
      listAccords(), listCallCenters(), listUsers(), listCommercials(), listTeleprospectors(),
    ]);
    const ccById = new Map(ccs.map((c) => [c.id, c]));
    const ancestry = ancestryMap(ccs);
    // listUsers() ne cast pas call_center_id (bigint pg -> string) : on force en number ici,
    // sinon ça ne matche aucune clé des Maps (ccById/ancestry, indexées par number).
    const ccOf = (email: string) => {
      const v = users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.call_center_id;
      return v == null ? undefined : Number(v);
    };
    const ccNameOf = (id?: number) => (id != null ? ccById.get(id)?.name ?? null : null);
    // Racine de la hiérarchie (l'agence/franchise) d'un call center — pour regrouper "par agence"
    // dans les pickers, comme demandé : Simplicicar / Agence Automobilière / …
    const agenceIdOf = (ccId?: number | null): number | null => {
      if (ccId == null) return null;
      const chain = ancestry.get(ccId);
      return chain && chain.length ? chain[chain.length - 1] : ccId;
    };
    const agenceNameOf = (ccId?: number | null) => {
      const id = agenceIdOf(ccId);
      return id != null ? ccById.get(id)?.name ?? null : null;
    };

    const visible = accords.filter((a) => {
      if (s.role === "admin") return true;
      if (a.payer_email.toLowerCase() === me || a.payee_email.toLowerCase() === me) return true;
      const cc = a.call_center_id != null ? ccById.get(a.call_center_id) : undefined;
      return !!cc && seesCc(me, cc);
    });

    const out = visible.map((a) => {
      const cc = a.call_center_id != null ? ccById.get(a.call_center_id) : undefined;
      // Un call_center_id sans CC résolu = call center supprimé AVANT le passage en soft-delete
      // (donnée historique orpheline) : on le dit clairement plutôt que de laisser un trou muet.
      const ccName = cc ? cc.name : a.call_center_id != null ? `call center supprimé (#${a.call_center_id})` : null;
      const payeeName = nameFor(a.payee_email, users);
      const payerName = a.payer_email ? nameFor(a.payer_email, users) : "";
      return {
        ...a,
        ccName,
        agenceWide: a.includes_descendants,
        canEdit: s.role === "admin" || (!!cc && managesCc(me, cc)) || a.payer_email.toLowerCase() === me,
        explain: explainAccord(a, { payeeName, payerName }),
      };
    });

    // Commerciaux : toute la base, regroupés par AGENCE (pas par call center précis — le deal se
    // fait avec le commercial, l'agence n'est qu'un repère de recherche) — un gestionnaire peut
    // vendre des rendez-vous à n'importe quel commercial, pas seulement ceux "de son" call center.
    const commercials = commercialsDir.map((c) => ({ email: c.email, name: c.name, agenceName: agenceNameOf(ccOf(c.email)) }));
    const teleprosAll = teleprosDir.map((t) => ({ email: t.email, name: t.name, ccName: ccNameOf(ccOf(t.email)) }));
    // Agences (call centers racine) : pour "faire le deal avec toute l'agence" — crée le même
    // deal pour chaque commercial actuellement rattaché, en une fois.
    const agences = ccs.filter((c) => c.active !== false && c.parent_id == null).map((c) => ({ id: c.id, name: c.name }));

    // Gestionnaires : soit déjà posés sur un call center (call_centers.gestionnaire_email), soit
    // un compte avec le rôle gestionnaire (is_gestionnaire, cumulable avec commercial/téléprospecteur/
    // associé — voir Comptes). Un gestionnaire ne peut agir qu'en son propre nom ; l'admin voit tout.
    const gestEmailsFromCcs = ccs.filter((c) => c.gestionnaire_email).map((c) => c.gestionnaire_email!.toLowerCase());
    const gestEmailsFromAccounts = users.filter((u) => u.is_gestionnaire && u.active).map((u) => u.email.toLowerCase());
    const gestEmails = [...new Set([...gestEmailsFromCcs, ...gestEmailsFromAccounts])]
      .filter((e) => s.role === "admin" || e === me);
    const gestionnaires = gestEmails.map((email) => ({ email, name: nameFor(email, users) }));

    const canCreate = s.role === "admin" || gestionnaires.length > 0;

    // Call centers pour la distribution "un call center redistribue" : TOUS ceux avec un
    // responsable, peu importe leur gestionnaire habituel — le gestionnaire de CE deal peut très
    // bien faire redistribuer par n'importe quel call center, pas seulement "le sien".
    const callCentersAvecResponsable = ccs
      .filter((c) => c.active !== false && c.responsable_email)
      .map((c) => ({ id: c.id, name: c.name, responsable: { email: c.responsable_email!, name: nameFor(c.responsable_email!, users) } }));

    // Associé possible : uniquement les comptes marqués associé (is_associe, cumulable) ou
    // super-admin — pas n'importe qui, un rôle précis à cocher dans Comptes. Liste non filtrée
    // par "moi" : c'est justement pour désigner quelqu'un d'autre. Identifié par e-mail (jamais
    // par nom, deux personnes peuvent s'appeler pareil).
    const possibleAssocies = users.filter((u) => u.active && (u.is_associe || u.role === "admin")).map((u) => ({ email: u.email.toLowerCase(), name: u.name }));

    // Vue simplifiée pour LE COMMERCIAL sur ses propres deals : jamais le détail interne
    // (gestionnaire, associés, répartition) — juste "je paie X €, je travaille avec Y", même
    // règle que l'ancien système de commission (répartition interne cachée au commercial).
    // Regroupé par deal_ref (les 2-4 lignes créées ensemble par un même "Nouveau deal").
    const mesDealsAccords = accords.filter((a) => a.deal_ref && a.commercial_email.toLowerCase() === me);
    const groupesParRef = new Map<string, Accord[]>();
    for (const a of mesDealsAccords) {
      const key = a.deal_ref!;
      (groupesParRef.get(key) ?? groupesParRef.set(key, []).get(key)!).push(a);
    }
    const mesDealsSimplifies = [...groupesParRef.entries()].map(([ref, lignes]) => {
      // Total = tout ce que payer_email === moi dans ce groupe (gestionnaire + call_center le cas
      // échéant + associés) ; ce qui est payé par le gestionnaire (télépro) ne me concerne pas.
      const mesLignes = lignes.filter((l) => l.payer_email.toLowerCase() === me);
      const total = mesLignes.reduce((n, l) => n + l.base_eur, 0);
      const pctTotal = mesLignes.reduce((n, l) => n + l.pct_nego, 0);
      // Le commercial ne connaît que son gestionnaire — jamais le call center/téléprospecteur
      // derrière (répartition interne), même si techniquement il paie aussi le call center
      // directement dans certains cas : ce qu'il retient, c'est "je paie mon gestionnaire".
      const gestLigne = lignes.find((l) => l.payee_kind === "gestionnaire");
      const gestionnaireName = gestLigne ? nameFor(gestLigne.payee_email, users) : "votre gestionnaire";
      const first = lignes[0];
      const declencheur = first.trigger_kind === "honored" ? "dès que le client est venu (RDV honoré)" : "au mandat signé";
      const montant = pctTotal > 0 ? `${total} € + ${pctTotal} % du négocié` : `${total} €`;
      return {
        ref, montant: total, explain: `Vous devez payer ${montant} ${declencheur} à votre gestionnaire${gestionnaireName ? ` (${gestionnaireName})` : ""}.`,
        paymentMethod: first.payment_method, paymentDelayDays: first.payment_delay_days,
      };
    });

    // RDV réels, sur les 90 derniers jours, qui déclenchent effectivement une de MES lignes de
    // deal (payer = moi) — ce qui manquait pour voir "concrètement" un deal s'appliquer à un RDV,
    // pas juste la règle générale (mesDealsSimplifies) toujours affichée qu'il y ait eu un RDV ou non.
    // Couvre les deals brokerés (deal_ref) ET les accords directs (accords-telepro, deal_ref null) —
    // dans les deux cas, payer_email = moi et commercial_email = moi.
    const mesAccordsPayeur = accords.filter((a) => a.payer_email.toLowerCase() === me && a.commercial_email.toLowerCase() === me);
    const now = new Date();
    const appts = (await listAppointments(new Date(now.getTime() - 90 * 86400e3), new Date(now.getTime() + 86400e3)))
      .filter((a) => !a.cancelled);
    const accordById = new Map(accords.map((a) => [a.id, a]));
    const mesRdvDus = appts
      .map((appt) => {
        const lignes = linesFor(appt, mesAccordsPayeur, undefined, ancestry).filter((l) => l.payer === me);
        if (!lignes.length) return null;
        const total = Math.round(lignes.reduce((n, l) => n + l.amount, 0));
        const gestLigne = lignes.find((l) => l.kind === "gestionnaire") ?? lignes[0];
        const refAccord = accordById.get(gestLigne.accordId);
        return {
          apptId: appt.id, date: appt.startDateTime, client: `${appt.firstName} ${appt.lastName}`.trim(),
          total, declencheur: refAccord?.trigger_kind === "honored" ? "RDV honoré" : "mandat signé",
          gestionnaireName: nameFor(gestLigne.payee, users),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());

    return NextResponse.json({ ok: true, deals: out, mesDealsSimplifies, mesRdvDus, commercials, gestionnaires, teleprosAll, agences, possibleAssocies, callCentersAvecResponsable, myEmail: me, canCreate });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

type LegAmounts = { eur?: number; pct?: number; soldEur?: number; soldPct?: number };
type AssocieShare = { email: string; sharePct: number };
type BrokerPayload = {
  action: "broker";
  dealName?: string; // nom donné au deal, affiché dans la liste (les 2-4 lignes créées ensemble)
  commercialEmail?: string; agenceId?: number; gestionnaireEmail?: string; gest?: LegAmounts;
  montantTotal?: number; // ce que paie le commercial pour ce deal — sert de base au calcul du "reste"
  associes?: AssocieShare[]; // 0, 1 ou plusieurs — se partagent LE RESTE (total - gestionnaire - distribution), payés par le commercial
  distribution?: "call_center" | "telepro";
  ccId?: number; ccAmounts?: LegAmounts;
  teleproEmail?: string; teleproAmounts?: LegAmounts;
  triggerKind?: "signed" | "honored"; paymentMethod?: string; paymentDelayDays?: number;
};
type SimplePayload = {
  action?: undefined;
  ccId?: number; includesDescendants?: boolean; commercialEmail?: string;
  payeeKind?: Accord["payee_kind"]; payeeEmail?: string;
  baseEur?: number; pctNego?: number; soldEur?: number; soldPct?: number;
  triggerKind?: "signed" | "honored"; paymentMethod?: string; paymentDelayDays?: number;
  payerEmail?: string; label?: string;
};

export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as BrokerPayload | SimplePayload;
    if (b.action === "broker") return brokerDeal(s, b);

    const ccId = b.ccId ?? null;
    const commercialEmail = (b.commercialEmail || "").trim().toLowerCase();
    if (!ccId) return NextResponse.json({ error: "Choisis une agence ou un call center." }, { status: 400 });
    if (!b.payeeKind || !b.payeeEmail?.trim()) return NextResponse.json({ error: "Qui touche ce deal ? (bénéficiaire requis)" }, { status: 400 });
    const me = s.email.toLowerCase();
    if (s.role !== "admin") {
      const cc = (await listCallCenters()).find((c) => c.id === ccId);
      if (!cc || !managesCc(me, cc)) {
        return NextResponse.json({ error: "Seul le gestionnaire de ce call center (ou le super-admin) peut créer un deal ici." }, { status: 403 });
      }
    }
    const payer = (b.payerEmail || (commercialEmail || me)).trim().toLowerCase();
    await getPool().query(
      `insert into remuneration_accords
         (call_center_id, commercial_email, payee_email, payee_kind, base_eur, pct_nego, sold_eur, sold_pct,
          trigger_kind, payer_email, label, payment_method, payment_delay_days, includes_descendants)
       values ($1,$2,lower($3),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        ccId, commercialEmail, b.payeeEmail.trim(), b.payeeKind,
        Number(b.baseEur ?? 0), Number(b.pctNego ?? 0), Number(b.soldEur ?? 0), Number(b.soldPct ?? 0),
        b.triggerKind === "honored" ? "honored" : "signed", payer,
        b.label || `Deal créé par ${s.name}`,
        (b.paymentMethod || "").trim(), Math.max(0, Math.round(Number(b.paymentDelayDays ?? 0))),
        !!b.includesDescendants,
      ],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** Le flux "Nouveau deal" tel que décrit par le client : commercial -> gestionnaire -> soit le
 *  call center (son responsable redistribue en interne) soit un téléprospecteur précis
 *  (payé direct par le gestionnaire, sur sa propre part). Crée 1 ou 2 accords d'un coup ;
 *  renégocier = désactive les anciens du même triplet (commercial, gestionnaire, distribution). */
async function brokerDeal(s: { email: string; name: string; role: string }, b: BrokerPayload) {
  const gestionnaireEmail = (b.gestionnaireEmail || "").trim().toLowerCase();
  if (!gestionnaireEmail) return NextResponse.json({ error: "Choisis le gestionnaire qui s'occupe de ce deal." }, { status: 400 });
  const me = s.email.toLowerCase();
  if (s.role !== "admin" && gestionnaireEmail !== me) {
    return NextResponse.json({ error: "Tu ne peux créer un deal qu'en tant que toi-même." }, { status: 403 });
  }

  // "Toute l'agence" : même deal pour chaque commercial actuellement rattaché (un par un —
  // il n'existe pas d'accord "joker" sans commercial précis, voir commercialsOfAgence).
  let commercialEmails: string[];
  if (b.agenceId) {
    commercialEmails = await commercialsOfAgence(b.agenceId);
    if (!commercialEmails.length) return NextResponse.json({ error: "Aucun commercial actif dans cette agence." }, { status: 400 });
  } else {
    const one = (b.commercialEmail || "").trim().toLowerCase();
    if (!one) return NextResponse.json({ error: "Choisis le commercial." }, { status: 400 });
    commercialEmails = [one];
  }

  for (const commercialEmail of commercialEmails) {
    const r = await brokerDealForCommercial(s, b, commercialEmail, gestionnaireEmail);
    if (r) return r; // erreur -> on s'arrête et on la remonte telle quelle
  }
  return NextResponse.json({ ok: true, count: commercialEmails.length });
}

/** Crée les 1-2 accords pour UN commercial. Retourne une NextResponse d'erreur si ça échoue,
 *  sinon undefined (créé avec succès) — appelé en boucle par brokerDeal pour le mode agence. */
async function brokerDealForCommercial(
  s: { email: string; name: string; role: string }, b: BrokerPayload, commercialEmail: string, gestionnaireEmail: string,
) {
  const trig = b.triggerKind === "honored" ? "honored" : "signed";
  const method = (b.paymentMethod || "").trim();
  const delay = Math.max(0, Math.round(Number(b.paymentDelayDays ?? 0)));
  const dealName = (b.dealName || "").trim() || null;
  const pool = getPool();
  let ccId: number | null = null;

  if (b.distribution === "call_center") {
    if (!b.ccId) return NextResponse.json({ error: "Choisis le call center dont le responsable redistribue." }, { status: 400 });
    // N'importe quel call center avec un responsable — pas seulement "celui du gestionnaire" :
    // ce dernier peut très bien faire redistribuer par n'importe quel call center pour ce deal.
    const cc = (await listCallCenters()).find((c) => c.id === b.ccId);
    if (!cc) return NextResponse.json({ error: "Call center introuvable." }, { status: 404 });
    if (!cc.responsable_email) return NextResponse.json({ error: "Ce call center n'a pas de responsable." }, { status: 400 });
    ccId = cc.id;
  } else if (b.distribution === "telepro") {
    if (!b.teleproEmail?.trim()) return NextResponse.json({ error: "Choisis le téléprospecteur." }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Choisis comment ça se distribue : call center ou téléprospecteur précis." }, { status: 400 });
  }

  // Renégociation = on remplace : désactive les accords précédents de ce triplet (associé inclus).
  await pool.query(
    `update remuneration_accords set active=false
       where lower(commercial_email)=$1 and (lower(payer_email)=$1 or lower(payer_email)=$2) and payee_kind in ('gestionnaire','call_center','telepro','associe')`,
    [commercialEmail, gestionnaireEmail],
  );

  // deal_ref relie les 2-4 lignes créées ici : sert à reconstruire une vue simplifiée côté
  // commercial (il ne doit voir ni gestionnaire ni associés ni répartition interne — juste
  // "je paie X €, je travaille avec Y", voir GET plus bas).
  const dealRef = randomUUID();

  // Le gestionnaire touche TOUJOURS son montant plein — jamais rogné par les associés.
  const gest = b.gest ?? {};
  await pool.query(
    `insert into remuneration_accords
       (call_center_id, commercial_email, payee_email, payee_kind, base_eur, pct_nego, sold_eur, sold_pct,
        trigger_kind, payer_email, label, payment_method, payment_delay_days, deal_ref, deal_name)
     values ($1,$2,$3,'gestionnaire',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [ccId, commercialEmail, gestionnaireEmail, Number(gest.eur ?? 0), Number(gest.pct ?? 0), Number(gest.soldEur ?? 0), Number(gest.soldPct ?? 0),
      trig, commercialEmail, `Deal ${s.name} : gestionnaire`, method, delay, dealRef, dealName],
  );

  let distributionEur = 0;
  if (b.distribution === "call_center") {
    const cc = (await listCallCenters()).find((c) => c.id === b.ccId)!;
    const cca = b.ccAmounts ?? {};
    distributionEur = Number(cca.eur ?? 0);
    await pool.query(
      `insert into remuneration_accords
         (call_center_id, commercial_email, payee_email, payee_kind, base_eur, pct_nego, sold_eur, sold_pct,
          trigger_kind, payer_email, label, payment_method, payment_delay_days, deal_ref, deal_name)
       values ($1,$2,$3,'call_center',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ccId, commercialEmail, cc.responsable_email!.toLowerCase(), distributionEur, Number(cca.pct ?? 0), Number(cca.soldEur ?? 0), Number(cca.soldPct ?? 0),
        trig, commercialEmail, `Deal ${s.name} : call center (responsable redistribue)`, method, delay, dealRef, dealName],
    );
  } else {
    const teleproEmail = b.teleproEmail!.trim().toLowerCase();
    const teleproCc = (await listUsers()).find((u) => u.email.toLowerCase() === teleproEmail)?.call_center_id ?? null;
    const ta = b.teleproAmounts ?? {};
    distributionEur = Number(ta.eur ?? 0);
    await pool.query(
      `insert into remuneration_accords
         (call_center_id, commercial_email, payee_email, payee_kind, base_eur, pct_nego, sold_eur, sold_pct,
          trigger_kind, payer_email, label, payment_method, payment_delay_days, deal_ref, deal_name)
       values ($1,$2,$3,'telepro',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [teleproCc, commercialEmail, teleproEmail, distributionEur, Number(ta.pct ?? 0), Number(ta.soldEur ?? 0), Number(ta.soldPct ?? 0),
        trig, gestionnaireEmail, `Deal ${s.name} : gestionnaire paie le téléprospecteur direct`, method, delay, dealRef, dealName],
    );
  }

  // Associé(s) : se partagent LE RESTE — total du deal moins gestionnaire moins distribution —
  // jamais la part du gestionnaire elle-même (il la garde en entier, voir plus haut). Payés
  // directement par le commercial, comme le reste de ce deal. 0, 1 ou plusieurs associés ;
  // parts au-delà de 100% plafonnées ; le gestionnaire peut très bien être aussi associé
  // (deux lignes distinctes : sa part fixe + sa part du reste).
  const reste = Math.max(0, Number(b.montantTotal ?? 0) - Number(gest.eur ?? 0) - distributionEur);
  const associes = (b.associes ?? [])
    .map((a) => ({ email: (a.email || "").trim().toLowerCase(), sharePct: Math.max(0, Number(a.sharePct ?? 0)) }))
    .filter((a) => a.email && a.sharePct > 0);
  const totalAssocieShare = Math.min(100, associes.reduce((n, a) => n + a.sharePct, 0));
  for (const a of associes) {
    const share = Math.min(a.sharePct, totalAssocieShare);
    await pool.query(
      `insert into remuneration_accords
         (call_center_id, commercial_email, payee_email, payee_kind, base_eur, pct_nego, sold_eur, sold_pct,
          trigger_kind, payer_email, label, payment_method, payment_delay_days, deal_ref, deal_name)
       values ($1,$2,$3,'associe',$4,0,0,0,$5,$6,$7,$8,$9,$10,$11)`,
      [ccId, commercialEmail, a.email, reste * (share / 100),
        trig, commercialEmail, `Deal ${s.name} : associé (${a.sharePct}% du reste — ${reste} € de base)`, method, delay, dealRef, dealName],
    );
  }

  // La part du reste non attribuée à un associé (ou tout le reste, s'il n'y a aucun associé)
  // ne disparaît pas dans la nature : elle revient par défaut au super-admin (Yarone) —
  // "de manière générale, ça revient à Yaron", donc pas juste laissé non tracé.
  const nonAttribue = reste * ((100 - totalAssocieShare) / 100);
  if (nonAttribue > 0) {
    const admin = await defaultAdminEmail();
    if (admin) {
      await pool.query(
        `insert into remuneration_accords
           (call_center_id, commercial_email, payee_email, payee_kind, base_eur, pct_nego, sold_eur, sold_pct,
            trigger_kind, payer_email, label, payment_method, payment_delay_days, deal_ref, deal_name)
         values ($1,$2,$3,'associe',$4,0,0,0,$5,$6,$7,$8,$9,$10,$11)`,
        [ccId, commercialEmail, admin, nonAttribue,
          trig, commercialEmail, `Deal ${s.name} : reste non attribué — revient par défaut au super-admin`, method, delay, dealRef, dealName],
      );
    }
  }

  return undefined;
}

/** Le super-admin "par défaut" qui touche le reste d'un deal non attribué à un associé —
 *  aujourd'hui le seul compte admin (Yarone) ; s'il y en a plusieurs un jour, le plus ancien. */
async function defaultAdminEmail(): Promise<string | null> {
  const { rows } = await getPool().query<{ email: string }>(
    `select email from users where role = 'admin' and active order by id limit 1`,
  );
  return rows[0]?.email.toLowerCase() ?? null;
}

/** PATCH { id, ...mêmes champs que POST } -> renégocie les montants/modalités en place.
 *  DELETE ?id= -> désactive (jamais de hard delete, l'historique reste consultable). */
export async function PATCH(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as { id?: number; baseEur?: number; pctNego?: number; soldEur?: number; soldPct?: number; paymentMethod?: string; paymentDelayDays?: number; triggerKind?: "signed" | "honored" };
    if (!b.id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    const pool = getPool();
    const { rows } = await pool.query<{ call_center_id: number | null; payer_email: string; payee_email: string }>(
      `select call_center_id, payer_email, payee_email from remuneration_accords where id = $1`, [b.id],
    );
    const existing = rows[0];
    if (!existing) return NextResponse.json({ error: "Deal introuvable." }, { status: 404 });
    if (s.role !== "admin") {
      const me = s.email.toLowerCase();
      let allowed = existing.payer_email.toLowerCase() === me;
      if (!allowed && existing.call_center_id != null) {
        const cc = (await listCallCenters()).find((c) => c.id === existing.call_center_id);
        allowed = !!cc && managesCc(me, cc);
      }
      if (!allowed) return NextResponse.json({ error: "Tu n'as pas la main sur ce deal." }, { status: 403 });
    }
    await pool.query(
      `update remuneration_accords set base_eur=coalesce($2,base_eur), pct_nego=coalesce($3,pct_nego),
         sold_eur=coalesce($4,sold_eur), sold_pct=coalesce($5,sold_pct), payment_method=coalesce($6,payment_method),
         payment_delay_days=coalesce($7,payment_delay_days), trigger_kind=coalesce($8,trigger_kind)
       where id=$1`,
      [b.id, b.baseEur, b.pctNego, b.soldEur, b.soldPct, b.paymentMethod, b.paymentDelayDays, b.triggerKind],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
  try {
    const pool = getPool();
    const { rows } = await pool.query<{ call_center_id: number | null; payer_email: string; payee_email: string }>(
      `select call_center_id, payer_email, payee_email from remuneration_accords where id = $1`, [id],
    );
    const existing = rows[0];
    if (!existing) return NextResponse.json({ error: "Deal introuvable." }, { status: 404 });
    if (s.role !== "admin") {
      const me = s.email.toLowerCase();
      let allowed = existing.payer_email.toLowerCase() === me;
      if (!allowed && existing.call_center_id != null) {
        const cc = (await listCallCenters()).find((c) => c.id === existing.call_center_id);
        allowed = !!cc && managesCc(me, cc);
      }
      if (!allowed) return NextResponse.json({ error: "Tu n'as pas la main sur ce deal." }, { status: 403 });
    }
    await pool.query(`update remuneration_accords set active=false where id=$1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

// Espace DDE : univers totalement isolé du CRM auto (comptes, jeton, rendez-vous).

import { createHmac, createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { getPool } from "./db";
import { hashPassword, verifyPassword } from "./auth";

const SECRET = process.env.AUTH_SECRET ?? "dev-secret-change-me";
const TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30 jours

export type DdeRole = "admin" | "telepro";

// ---------- Accès aux outils d'appel (Ringover, AS Classicall) ----------
// Ces mots de passe doivent pouvoir être réaffichés à leur propriétaire : ils sont donc chiffrés
// (et non hachés), avec une clé dérivée de AUTH_SECRET. Un dump de la base ne les livre pas.

const CLE = scryptSync(SECRET, "dde-outils", 32);

export function chiffre(valeur: string): string {
  if (!valeur) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", CLE, iv);
  const out = Buffer.concat([c.update(valeur, "utf8"), c.final()]);
  return `${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${out.toString("base64url")}`;
}

export function dechiffre(stocke: string): string {
  if (!stocke) return "";
  const [iv, tag, corps] = stocke.split(".");
  if (!iv || !tag || !corps) return "";
  try {
    const d = createDecipheriv("aes-256-gcm", CLE, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(corps, "base64url")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}
export type DdeSession = { email: string; name: string; role: DdeRole };

/** Jeton propre au DDE : scope "dde" pour qu'un jeton CRM ne puisse jamais l'ouvrir (et inversement). */
export function signDdeToken(s: DdeSession): string {
  const body = Buffer.from(JSON.stringify({ ...s, scope: "dde", exp: Date.now() + TOKEN_TTL })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyDdeToken(token: string): DdeSession | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (createHmac("sha256", SECRET).update(body).digest("base64url") !== sig) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.scope !== "dde" || !p.exp || p.exp < Date.now()) return null;
    return { email: p.email, name: p.name, role: p.role === "admin" ? "admin" : "telepro" };
  } catch {
    return null;
  }
}

export function getDdeAuth(req: Request): DdeSession | null {
  const bearer = req.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ")) return null;
  return verifyDdeToken(bearer.slice(7));
}

// ---------- Comptes ----------

export type DdeAcces = { ascLogin: string; ascPassword: string; ringoverLogin: string; ringoverPassword: string };
export type DdeUser = { id: number; email: string; name: string; role: DdeRole; phone: string; active: boolean; created_at?: string; acces?: DdeAcces };

const COLS = `id, email, name, role, phone, active, created_at`;
const COLS_ACCES = `${COLS}, asc_login, asc_password, ringover_login, ringover_password`;

export async function ddeLogin(email: string, password: string): Promise<DdeSession | null> {
  const { rows } = await getPool().query(
    `select ${COLS}, password_hash from dde_users where lower(email) = lower($1) and active = true`,
    [email.trim()],
  );
  const u = rows[0] as (DdeUser & { password_hash: string }) | undefined;
  if (!u || !verifyPassword(password, u.password_hash)) return null;
  return { email: u.email, name: u.name, role: u.role };
}

/** Vue admin : les comptes avec leurs accès outils en clair (l'API est réservée à l'admin). */
export async function listDdeUsers(): Promise<DdeUser[]> {
  const { rows } = await getPool().query(`select ${COLS_ACCES} from dde_users order by role, name`);
  return (rows as (DdeUser & { asc_login: string; asc_password: string; ringover_login: string; ringover_password: string })[])
    .map(({ asc_login, asc_password, ringover_login, ringover_password, ...u }) => ({
      ...u,
      acces: {
        ascLogin: dechiffre(asc_login), ascPassword: dechiffre(asc_password),
        ringoverLogin: dechiffre(ringover_login), ringoverPassword: dechiffre(ringover_password),
      },
    }));
}

/** Accès outils d'un compte, pour son propriétaire uniquement. */
export async function ddeAccesOutils(email: string): Promise<DdeAcces> {
  const { rows } = await getPool().query(
    `select asc_login, asc_password, ringover_login, ringover_password from dde_users where lower(email) = lower($1)`,
    [email],
  );
  const r = rows[0];
  return {
    ascLogin: dechiffre(r?.asc_login ?? ""), ascPassword: dechiffre(r?.asc_password ?? ""),
    ringoverLogin: dechiffre(r?.ringover_login ?? ""), ringoverPassword: dechiffre(r?.ringover_password ?? ""),
  };
}

export async function createDdeUser(input: { email: string; password: string; name: string; role?: DdeRole; phone?: string }): Promise<DdeUser> {
  const { rows } = await getPool().query(
    `insert into dde_users (email, password_hash, name, role, phone)
     values ($1,$2,$3,$4,$5) returning ${COLS}`,
    [input.email.trim().toLowerCase(), hashPassword(input.password), input.name.trim(), input.role ?? "telepro", (input.phone ?? "").trim()],
  );
  return rows[0] as DdeUser;
}

export async function updateDdeUser(id: number, patch: {
  password?: string; active?: boolean; name?: string; phone?: string;
  ascLogin?: string; ascPassword?: string; ringoverLogin?: string; ringoverPassword?: string;
}): Promise<void> {
  const chiffreOuRien = (v?: string) => (v === undefined ? undefined : chiffre(v.trim()));
  const map: Record<string, unknown> = {
    password_hash: patch.password ? hashPassword(patch.password) : undefined,
    active: patch.active, name: patch.name, phone: patch.phone,
    asc_login: chiffreOuRien(patch.ascLogin),
    asc_password: chiffreOuRien(patch.ascPassword),
    ringover_login: chiffreOuRien(patch.ringoverLogin),
    ringover_password: chiffreOuRien(patch.ringoverPassword),
  };
  const sets: string[] = []; const params: unknown[] = [];
  for (const [col, val] of Object.entries(map)) if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
  if (!sets.length) return;
  params.push(id);
  await getPool().query(`update dde_users set ${sets.join(", ")} where id = $${params.length}`, params);
}

/** Suppression d'un compte téléprospecteur (jamais un admin). */
export async function deleteDdeUser(id: number): Promise<void> {
  await getPool().query(`delete from dde_users where id = $1 and role <> 'admin'`, [id]);
}

// ---------- Rendez-vous ----------

/** Statuts d'un rendez-vous DDE. Seul « honoré » ouvre la facturation et le paiement du call center.
 *  « Déplacé » n'est pas un statut : c'est un fait constaté quand la date ou l'heure change. */
export const DDE_STATUTS = ["a_venir", "honore", "absent", "annule", "non_eligible"] as const;
export type DdeStatut = (typeof DDE_STATUTS)[number];

/** Critères posés au client pendant l'appel. Éligible = chaque réponse égale la réponse attendue. */
export const DDE_CRITERES = [
  { key: "crit_titre_sejour", question: "Avez-vous un titre de séjour valide ?", attendu: true },
  { key: "crit_sans_diplome", question: "Avez-vous un diplôme ?", attendu: false },
  { key: "crit_carte_vitale", question: "Avez-vous une carte Vitale ?", attendu: true },
  { key: "crit_sans_dossier_prefecture", question: "Avez-vous un dossier en cours à la préfecture ?", attendu: false },
  { key: "crit_moins_60_ans", question: "Avez-vous moins de 60 ans ?", attendu: true },
] as const;
export type DdeCritereKey = (typeof DDE_CRITERES)[number]["key"];
export type DdeCriteres = Partial<Record<DdeCritereKey, boolean>>;

/** Facturation de l'entreprise cliente (argent entrant), dans l'ordre. */
export const DDE_FACTURATION = ["a_facturer", "edition", "facturee", "encaissee"] as const;
/** Facture du call center puis son paiement (argent sortant), dans l'ordre. */
export const DDE_CALLCENTER = ["appel_facture", "facture_recue", "paye"] as const;
export type DdeFacturation = (typeof DDE_FACTURATION)[number];
export type DdeCallcenter = (typeof DDE_CALLCENTER)[number];

export type DdeAppointment = {
  id: number; nom: string; prenom: string; rdv_date: string; rdv_time: string; telephone: string;
  telepro_email: string; telepro_name: string; saisi_par_email: string; saisi_par_name: string;
  statut: string; facturation_statut: string; callcenter_statut: string; notes: string; created_at: string;
  crit_titre_sejour: boolean | null; crit_sans_diplome: boolean | null; crit_carte_vitale: boolean | null;
  crit_sans_dossier_prefecture: boolean | null; crit_moins_60_ans: boolean | null;
  whatsapp_sent_at: string | null; invoiced_at: string | null; callcenter_paid_at: string | null;
  rdv_date_initiale: string | null; rdv_time_initiale: string | null; deplace_le: string | null;
};

const A_COLS = `id, nom, prenom, to_char(rdv_date,'YYYY-MM-DD') as rdv_date, rdv_time, telephone, telepro_email, telepro_name, saisi_par_email, saisi_par_name, statut, facturation_statut, callcenter_statut, notes, created_at, whatsapp_sent_at, invoiced_at, callcenter_paid_at, to_char(rdv_date_initiale,'YYYY-MM-DD') as rdv_date_initiale, rdv_time_initiale, deplace_le, ${DDE_CRITERES.map((c) => c.key).join(", ")}`;

/** Admin -> tous les RDV ; téléprospectrice -> uniquement les siens. */
export async function listDdeAppointments(s: DdeSession): Promise<DdeAppointment[]> {
  if (s.role === "admin") {
    const { rows } = await getPool().query(`select ${A_COLS} from dde_appointments order by rdv_date desc, rdv_time desc, id desc`);
    return rows as DdeAppointment[];
  }
  const { rows } = await getPool().query(
    `select ${A_COLS} from dde_appointments where lower(telepro_email) = lower($1) order by rdv_date desc, rdv_time desc, id desc`,
    [s.email],
  );
  return rows as DdeAppointment[];
}

/**
 * Enregistre un RDV. Le RDV est rattaché à une téléprospectrice (`teleproEmail`) ;
 * l'admin peut saisir à la place de quelqu'un d'autre, on garde alors qui a rempli le formulaire.
 */
export async function createDdeAppointment(s: DdeSession, input: {
  nom: string; prenom: string; date: string; heure: string; telephone: string; notes?: string; teleproEmail?: string;
  criteres?: DdeCriteres;
}): Promise<DdeAppointment> {
  let telepro = { email: s.email, name: s.name };
  const cible = input.teleproEmail?.trim().toLowerCase();
  if (s.role === "admin" && cible && cible !== s.email.toLowerCase()) {
    const { rows } = await getPool().query(`select email, name from dde_users where lower(email) = $1`, [cible]);
    if (!rows[0]) throw new Error("Téléprospectrice introuvable.");
    telepro = { email: rows[0].email as string, name: rows[0].name as string };
  }
  // Un critère manqué -> le RDV entre directement en « pas éligible ».
  const reponses = DDE_CRITERES.map((c) => input.criteres?.[c.key] ?? null);
  const statut = DDE_CRITERES.some((c, i) => reponses[i] !== c.attendu) ? "non_eligible" : "a_venir";

  const { rows } = await getPool().query(
    `insert into dde_appointments (nom, prenom, rdv_date, rdv_time, telephone, telepro_email, telepro_name, saisi_par_email, saisi_par_name, notes, statut, ${DDE_CRITERES.map((c) => c.key).join(", ")})
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning ${A_COLS}`,
    [input.nom.trim(), input.prenom.trim(), input.date, input.heure.trim(), input.telephone.trim(),
     telepro.email, telepro.name, s.email, s.name, (input.notes ?? "").trim(), statut, ...reponses],
  );
  return rows[0] as DdeAppointment;
}

/** Marqueurs de suivi : un booléen -> horodatage (coché) ou null (décoché). */
export type DdeAppointmentPatch = {
  statut?: string; notes?: string;
  nom?: string; prenom?: string; date?: string; heure?: string; telephone?: string; // correction d'un RDV saisi
  dateInitiale?: string | null; heureInitiale?: string | null; // déplacement saisi à la main (RDV antérieurs au suivi)
  whatsappSent?: boolean;          // message WhatsApp envoyé
  facturationStatut?: string;      // avancement de la facture envoyée à l'entreprise cliente
  callcenterStatut?: string;       // avancement de la facture du call center
};

/** Un rendez-vous par son identifiant (contrôles serveur avant correction). */
export async function getDdeAppointment(id: number): Promise<DdeAppointment | null> {
  const { rows } = await getPool().query(`select ${A_COLS} from dde_appointments where id = $1`, [id]);
  return (rows[0] as DdeAppointment | undefined) ?? null;
}

export async function updateDdeAppointment(s: DdeSession, id: number, patch: DdeAppointmentPatch): Promise<void> {
  const stamp = (v?: boolean) => (v === undefined ? undefined : v ? new Date().toISOString() : null);
  const now = new Date().toISOString();

  // Facturation / rémunération du call center : uniquement sur un RDV honoré.
  const suivi = patch.facturationStatut !== undefined || patch.callcenterStatut !== undefined;
  if (suivi) {
    const { rows } = await getPool().query(`select statut from dde_appointments where id = $1`, [id]);
    const statutFinal = patch.statut ?? (rows[0]?.statut as string | undefined);
    if (statutFinal !== "honore") throw new Error("Suivi de facturation possible uniquement sur un rendez-vous honoré.");
  }

  // Déplacement : dès que la date ou l'heure change réellement, on garde la date d'origine
  // (celle du tout premier rendez-vous, jamais écrasée) et on horodate le déplacement.
  let deplacement: { date: string | null; heure: string | null } | null = null;
  if (patch.date !== undefined || patch.heure !== undefined) {
    const { rows } = await getPool().query(
      `select to_char(rdv_date,'YYYY-MM-DD') as rdv_date, rdv_time, rdv_date_initiale from dde_appointments where id = $1`,
      [id],
    );
    const avant = rows[0] as { rdv_date: string; rdv_time: string; rdv_date_initiale: string | null } | undefined;
    if (avant) {
      const change = (patch.date !== undefined && patch.date !== avant.rdv_date)
        || (patch.heure !== undefined && patch.heure.trim() !== avant.rdv_time);
      // La date d'origine ne se fixe qu'au premier déplacement.
      if (change && !avant.rdv_date_initiale) deplacement = { date: avant.rdv_date, heure: avant.rdv_time };
      else if (change) deplacement = { date: null, heure: null };
    }
  }

  const map: Record<string, unknown> = {
    statut: patch.statut, notes: patch.notes,
    nom: patch.nom?.trim(), prenom: patch.prenom?.trim(),
    rdv_date: patch.date, rdv_time: patch.heure?.trim(), telephone: patch.telephone?.trim(),
    whatsapp_sent_at: stamp(patch.whatsappSent),
    facturation_statut: patch.facturationStatut,
    callcenter_statut: patch.callcenterStatut,
  };

  if (deplacement) {
    map.deplace_le = now;
    if (deplacement.date) { map.rdv_date_initiale = deplacement.date; map.rdv_time_initiale = deplacement.heure; }
    // Un rendez-vous absent ou annulé qu'on replace redevient un rendez-vous à venir.
    if (patch.statut === undefined) {
      const { rows } = await getPool().query(`select statut from dde_appointments where id = $1`, [id]);
      if (["absent", "annule"].includes(rows[0]?.statut as string)) map.statut = "a_venir";
    }
  }

  // Déplacement renseigné à la main : utile pour les rendez-vous déplacés avant ce suivi.
  if (patch.dateInitiale !== undefined) {
    map.rdv_date_initiale = patch.dateInitiale || null;
    map.rdv_time_initiale = patch.heureInitiale ?? null;
    map.deplace_le = patch.dateInitiale ? now : null;
  }

  // Horodatages conservés pour l'historique : facture envoyée, call center payé.
  if (patch.facturationStatut !== undefined) {
    map.invoiced_at = ["facturee", "encaissee"].includes(patch.facturationStatut) ? now : null;
  }
  if (patch.callcenterStatut !== undefined) {
    map.callcenter_paid_at = patch.callcenterStatut === "paye" ? now : null;
  }

  // Un RDV qui quitte « honoré » repart de zéro côté facturation.
  if (patch.statut !== undefined && patch.statut !== "honore") {
    map.facturation_statut = "a_facturer";
    map.callcenter_statut = "appel_facture";
    map.invoiced_at = null;
    map.callcenter_paid_at = null;
  }

  const sets: string[] = []; const params: unknown[] = [];
  for (const [col, val] of Object.entries(map)) if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
  if (!sets.length) return;
  params.push(id);
  const guard = s.role === "admin" ? "" : ` and lower(telepro_email) = lower($${params.length + 1})`;
  if (guard) params.push(s.email);
  await getPool().query(`update dde_appointments set ${sets.join(", ")} where id = $${sets.length + 1}${guard}`, params);
}

export async function deleteDdeAppointment(s: DdeSession, id: number): Promise<void> {
  if (s.role === "admin") {
    await getPool().query(`delete from dde_appointments where id = $1`, [id]);
    return;
  }
  await getPool().query(`delete from dde_appointments where id = $1 and lower(telepro_email) = lower($2)`, [id, s.email]);
}

// ---------- Cadence (production quotidienne) ----------

export type DdeProductionJour = {
  jour: string; total: number; valides: number;
  /** Minutes depuis minuit de la première et de la dernière saisie : c'est le temps réellement passé. */
  premiere: number; derniere: number;
};
export type DdeProductionTelepro = { email: string; name: string; jours: DdeProductionJour[] };

const JOURS_HISTORIQUE = 13; // aujourd'hui + 13 jours en arrière

/** Rendez-vous saisis par jour (fuseau de Paris) : total et « valides » = hors profils non éligibles. */
export async function ddeProductionTelepro(email: string): Promise<DdeProductionJour[]> {
  const { rows } = await getPool().query(
    `select to_char((created_at at time zone 'Europe/Paris')::date, 'YYYY-MM-DD') as jour,
            count(*)::int as total,
            count(*) filter (where statut <> 'non_eligible')::int as valides,
            min(extract(epoch from (created_at at time zone 'Europe/Paris')::time) / 60)::int as premiere,
            max(extract(epoch from (created_at at time zone 'Europe/Paris')::time) / 60)::int as derniere
       from dde_appointments
      where lower(telepro_email) = lower($1)
        and (created_at at time zone 'Europe/Paris')::date >= (now() at time zone 'Europe/Paris')::date - $2::int
      group by 1
      order by 1`,
    [email, JOURS_HISTORIQUE],
  );
  return rows as DdeProductionJour[];
}

/** Même chose pour l'équipe de téléprospection : l'admin suit la cadence de chacune (jamais la sienne). */
export async function ddeProductionEquipe(): Promise<DdeProductionTelepro[]> {
  const { rows } = await getPool().query(
    `select u.email, u.name,
            to_char((a.created_at at time zone 'Europe/Paris')::date, 'YYYY-MM-DD') as jour,
            count(a.*)::int as total,
            count(a.*) filter (where a.statut <> 'non_eligible')::int as valides,
            min(extract(epoch from (a.created_at at time zone 'Europe/Paris')::time) / 60)::int as premiere,
            max(extract(epoch from (a.created_at at time zone 'Europe/Paris')::time) / 60)::int as derniere
       from dde_users u
       left join dde_appointments a
         on lower(a.telepro_email) = lower(u.email)
        and (a.created_at at time zone 'Europe/Paris')::date >= (now() at time zone 'Europe/Paris')::date - $1::int
      where u.active = true and u.role = 'telepro'
      group by u.email, u.name, jour
      order by u.name`,
    [JOURS_HISTORIQUE],
  );

  const par: Map<string, DdeProductionTelepro> = new Map();
  for (const r of rows as (DdeProductionJour & { email: string; name: string; jour: string | null })[]) {
    const cle = r.email.toLowerCase();
    if (!par.has(cle)) par.set(cle, { email: r.email, name: r.name, jours: [] });
    if (r.jour) par.get(cle)!.jours.push({ jour: r.jour, total: r.total, valides: r.valides, premiere: r.premiere, derniere: r.derniere });
  }
  return [...par.values()];
}

export type DdeCreneauHoraire = { jour: string; heure: number; total: number; valides: number };

/** Rendez-vous saisis par jour et par heure (fuseau de Paris) — équipe entière, admin uniquement. */
export async function ddeProductionParHeure(joursEnArriere = 7): Promise<DdeCreneauHoraire[]> {
  const { rows } = await getPool().query(
    `select to_char((a.created_at at time zone 'Europe/Paris')::date, 'YYYY-MM-DD') as jour,
            extract(hour from a.created_at at time zone 'Europe/Paris')::int as heure,
            count(*)::int as total,
            count(*) filter (where a.statut <> 'non_eligible')::int as valides
       from dde_appointments a
       join dde_users u on lower(u.email) = lower(a.telepro_email) and u.role = 'telepro'
      where (a.created_at at time zone 'Europe/Paris')::date >= (now() at time zone 'Europe/Paris')::date - $1::int
      group by 1, 2
      order by 1, 2`,
    [joursEnArriere],
  );
  return rows as DdeCreneauHoraire[];
}

// ---------- Raisons d'une cadence faible ----------

/** Réponses proposées à la téléprospectrice : une seule liste, partagée UI et API. */
export const DDE_RAISONS_CADENCE = [
  "Les gens ne répondent pas",
  "Beaucoup de numéros hors cible (HRP)",
  "Les appels durent longtemps",
  "Beaucoup de refus",
  "Numéros déjà appelés dans la base",
  "Problème technique ou de ligne",
  "Autre",
] as const;

export type DdeRaisonCadence = { telepro_name: string; telepro_email: string; jour: string; heure: number; raison: string };

/** Une réponse par heure et par personne : recliquer met simplement la raison à jour. */
export async function enregistreRaisonCadence(s: DdeSession, jour: string, heure: number, raison: string): Promise<void> {
  await getPool().query(
    `delete from dde_cadence_raisons where lower(telepro_email) = lower($1) and jour = $2 and heure = $3`,
    [s.email, jour, heure],
  );
  await getPool().query(
    `insert into dde_cadence_raisons (telepro_email, telepro_name, jour, heure, raison) values ($1,$2,$3,$4,$5)`,
    [s.email, s.name, jour, heure, raison],
  );
}

/** Dernières raisons signalées par l'équipe (vue admin). */
export async function listeRaisonsCadence(limite = 12): Promise<DdeRaisonCadence[]> {
  const { rows } = await getPool().query(
    `select telepro_name, telepro_email, to_char(jour,'YYYY-MM-DD') as jour, heure, raison
       from dde_cadence_raisons order by jour desc, heure desc, id desc limit $1`,
    [limite],
  );
  return rows as DdeRaisonCadence[];
}

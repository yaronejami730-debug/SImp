// Espace DDE : univers totalement isolé du CRM auto (comptes, jeton, rendez-vous).

import { createHmac } from "crypto";
import { getPool } from "./db";
import { hashPassword, verifyPassword } from "./auth";

const SECRET = process.env.AUTH_SECRET ?? "dev-secret-change-me";
const TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30 jours

export type DdeRole = "admin" | "telepro";
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

export type DdeUser = { id: number; email: string; name: string; role: DdeRole; phone: string; active: boolean; created_at?: string };

const COLS = `id, email, name, role, phone, active, created_at`;

export async function ddeLogin(email: string, password: string): Promise<DdeSession | null> {
  const { rows } = await getPool().query(
    `select ${COLS}, password_hash from dde_users where lower(email) = lower($1) and active = true`,
    [email.trim()],
  );
  const u = rows[0] as (DdeUser & { password_hash: string }) | undefined;
  if (!u || !verifyPassword(password, u.password_hash)) return null;
  return { email: u.email, name: u.name, role: u.role };
}

export async function listDdeUsers(): Promise<DdeUser[]> {
  const { rows } = await getPool().query(`select ${COLS} from dde_users order by role, name`);
  return rows as DdeUser[];
}

export async function createDdeUser(input: { email: string; password: string; name: string; role?: DdeRole; phone?: string }): Promise<DdeUser> {
  const { rows } = await getPool().query(
    `insert into dde_users (email, password_hash, name, role, phone)
     values ($1,$2,$3,$4,$5) returning ${COLS}`,
    [input.email.trim().toLowerCase(), hashPassword(input.password), input.name.trim(), input.role ?? "telepro", (input.phone ?? "").trim()],
  );
  return rows[0] as DdeUser;
}

export async function updateDdeUser(id: number, patch: { password?: string; active?: boolean; name?: string; phone?: string }): Promise<void> {
  const map: Record<string, unknown> = {
    password_hash: patch.password ? hashPassword(patch.password) : undefined,
    active: patch.active, name: patch.name, phone: patch.phone,
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

/** Statuts d'un rendez-vous DDE. Seul « honoré » ouvre la facturation et le paiement du call center. */
export const DDE_STATUTS = ["a_venir", "honore", "absent", "annule", "deplace", "non_eligible"] as const;
export type DdeStatut = (typeof DDE_STATUTS)[number];

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
  whatsapp_sent_at: string | null; invoiced_at: string | null; callcenter_paid_at: string | null;
};

const A_COLS = `id, nom, prenom, to_char(rdv_date,'YYYY-MM-DD') as rdv_date, rdv_time, telephone, telepro_email, telepro_name, saisi_par_email, saisi_par_name, statut, facturation_statut, callcenter_statut, notes, created_at, whatsapp_sent_at, invoiced_at, callcenter_paid_at`;

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
}): Promise<DdeAppointment> {
  let telepro = { email: s.email, name: s.name };
  const cible = input.teleproEmail?.trim().toLowerCase();
  if (s.role === "admin" && cible && cible !== s.email.toLowerCase()) {
    const { rows } = await getPool().query(`select email, name from dde_users where lower(email) = $1`, [cible]);
    if (!rows[0]) throw new Error("Téléprospectrice introuvable.");
    telepro = { email: rows[0].email as string, name: rows[0].name as string };
  }
  const { rows } = await getPool().query(
    `insert into dde_appointments (nom, prenom, rdv_date, rdv_time, telephone, telepro_email, telepro_name, saisi_par_email, saisi_par_name, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning ${A_COLS}`,
    [input.nom.trim(), input.prenom.trim(), input.date, input.heure.trim(), input.telephone.trim(),
     telepro.email, telepro.name, s.email, s.name, (input.notes ?? "").trim()],
  );
  return rows[0] as DdeAppointment;
}

/** Marqueurs de suivi : un booléen -> horodatage (coché) ou null (décoché). */
export type DdeAppointmentPatch = {
  statut?: string; notes?: string;
  whatsappSent?: boolean;          // message WhatsApp envoyé
  facturationStatut?: string;      // avancement de la facture envoyée à l'entreprise cliente
  callcenterStatut?: string;       // avancement de la facture du call center
};

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

  const map: Record<string, unknown> = {
    statut: patch.statut, notes: patch.notes,
    whatsapp_sent_at: stamp(patch.whatsappSent),
    facturation_statut: patch.facturationStatut,
    callcenter_statut: patch.callcenterStatut,
  };

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

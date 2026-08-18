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

export type DdeAppointment = {
  id: number; nom: string; prenom: string; rdv_date: string; rdv_time: string; telephone: string;
  telepro_email: string; telepro_name: string; statut: string; notes: string; created_at: string;
};

const A_COLS = `id, nom, prenom, to_char(rdv_date,'YYYY-MM-DD') as rdv_date, rdv_time, telephone, telepro_email, telepro_name, statut, notes, created_at`;

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

export async function createDdeAppointment(s: DdeSession, input: {
  nom: string; prenom: string; date: string; heure: string; telephone: string; notes?: string;
}): Promise<DdeAppointment> {
  const { rows } = await getPool().query(
    `insert into dde_appointments (nom, prenom, rdv_date, rdv_time, telephone, telepro_email, telepro_name, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning ${A_COLS}`,
    [input.nom.trim(), input.prenom.trim(), input.date, input.heure.trim(), input.telephone.trim(), s.email, s.name, (input.notes ?? "").trim()],
  );
  return rows[0] as DdeAppointment;
}

export async function updateDdeAppointment(s: DdeSession, id: number, patch: { statut?: string; notes?: string }): Promise<void> {
  const map: Record<string, unknown> = { statut: patch.statut, notes: patch.notes };
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

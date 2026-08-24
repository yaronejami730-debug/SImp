// Rappels téléphoniques DDE : planification, suivi et SMS (expéditeur Allo Démarche).

import { getPool } from "./db";
import { sendSMS } from "./allmysms";
import type { DdeSession } from "./dde";

/** Expéditeur des SMS DDE : marque distincte de l'univers auto. */
export const DDE_SMS_SENDER = (process.env.DDE_SMS_SENDER ?? "AlloD").trim();

export const DDE_RAPPEL_STATUTS = ["a_faire", "fait", "annule"] as const;
export type DdeRappelStatut = (typeof DDE_RAPPEL_STATUTS)[number];

export type DdeRappel = {
  id: number; nom: string; prenom: string; telephone: string;
  callback_at: string; notes: string; statut: string;
  telepro_email: string; telepro_name: string; saisi_par_email: string; saisi_par_name: string;
  done_at: string | null; sms_confirm_at: string | null; sms_24h_at: string | null; sms_2h_at: string | null;
  created_at: string;
};

const COLS = `id, nom, prenom, telephone, callback_at, notes, statut, telepro_email, telepro_name,
  saisi_par_email, saisi_par_name, done_at, sms_confirm_at, sms_24h_at, sms_2h_at, created_at`;

/** Admin -> tous les rappels ; telepro -> les siens. */
export async function listDdeRappels(s: DdeSession): Promise<DdeRappel[]> {
  if (s.role === "admin") {
    const { rows } = await getPool().query(`select ${COLS} from dde_callbacks order by callback_at asc`);
    return rows as DdeRappel[];
  }
  const { rows } = await getPool().query(
    `select ${COLS} from dde_callbacks where lower(telepro_email) = lower($1) order by callback_at asc`,
    [s.email],
  );
  return rows as DdeRappel[];
}

export async function createDdeRappel(s: DdeSession, input: {
  nom: string; prenom: string; telephone: string; callbackAt: string; notes?: string; teleproEmail?: string; teleproName?: string;
}): Promise<DdeRappel> {
  // L'admin peut planifier un rappel pour une telepro ; sinon le rappel est au créateur.
  const proprietaireEmail = (s.role === "admin" && input.teleproEmail ? input.teleproEmail : s.email).toLowerCase();
  const proprietaireNom = s.role === "admin" && input.teleproEmail ? (input.teleproName ?? "") : s.name;
  const { rows } = await getPool().query(
    `insert into dde_callbacks (nom, prenom, telephone, callback_at, notes, telepro_email, telepro_name, saisi_par_email, saisi_par_name)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${COLS}`,
    [
      input.nom.trim(), input.prenom.trim(), input.telephone.trim(), input.callbackAt, (input.notes ?? "").trim(),
      proprietaireEmail, proprietaireNom, s.email.toLowerCase(), s.name,
    ],
  );
  return rows[0] as DdeRappel;
}

export type DdeRappelPatch = {
  statut?: DdeRappelStatut; nom?: string; prenom?: string; telephone?: string; callbackAt?: string; notes?: string;
};

export async function updateDdeRappel(s: DdeSession, id: number, patch: DdeRappelPatch): Promise<void> {
  const map: Record<string, unknown> = {
    statut: patch.statut, nom: patch.nom?.trim(), prenom: patch.prenom?.trim(),
    telephone: patch.telephone?.trim(), callback_at: patch.callbackAt, notes: patch.notes,
  };
  // Cocher « fait » horodate ; décocher efface l'horodatage.
  if (patch.statut !== undefined) map.done_at = patch.statut === "fait" ? new Date().toISOString() : null;

  const sets: string[] = []; const params: unknown[] = [];
  for (const [col, val] of Object.entries(map)) if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
  if (!sets.length) return;
  params.push(id);
  const garde = s.role === "admin" ? "" : ` and lower(telepro_email) = lower($${params.length + 1})`;
  if (garde) params.push(s.email);
  await getPool().query(`update dde_callbacks set ${sets.join(", ")} where id = $${sets.length + 1}${garde}`, params);
}

export async function deleteDdeRappel(s: DdeSession, id: number): Promise<void> {
  if (s.role === "admin") {
    await getPool().query(`delete from dde_callbacks where id = $1`, [id]);
    return;
  }
  await getPool().query(`delete from dde_callbacks where id = $1 and lower(telepro_email) = lower($2)`, [id, s.email]);
}

// ---------- SMS ----------

/** Heure française lisible dans un SMS, sans accents (alphabet GSM). */
function quandFR(iso: string): { date: string; heure: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }).format(d);
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
  return { date, heure };
}

const sansAccents = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function texteConfirmation(r: { callback_at: string }): string {
  const { date, heure } = quandFR(r.callback_at);
  return sansAccents(`Allo Demarche: votre rappel telephonique est enregistre pour le ${date} a ${heure}. A bientot! STOP au 36180`);
}

export function texteVeille(r: { callback_at: string }): string {
  const { heure } = quandFR(r.callback_at);
  return sansAccents(`Allo Demarche: votre rendez-vous telephonique a lieu demain a ${heure}. Pensez a repondre a l'agent qui vous appellera. STOP au 36180`);
}

export function texteDeuxHeures(r: { callback_at: string }): string {
  const { heure } = quandFR(r.callback_at);
  return sansAccents(`Allo Demarche: votre rendez-vous telephonique a lieu dans 2h, a ${heure}. Pensez a repondre a l'agent qui vous appellera. STOP au 36180`);
}

/** Envoi non bloquant : un SMS raté ne doit jamais faire échouer l'enregistrement. */
export async function envoyerSmsRappel(id: number, telephone: string, texte: string, colonne: "sms_confirm_at" | "sms_24h_at" | "sms_2h_at"): Promise<boolean> {
  try {
    await sendSMS({ to: telephone, text: texte, from: DDE_SMS_SENDER });
    await getPool().query(`update dde_callbacks set ${colonne} = now() where id = $1`, [id]);
    return true;
  } catch {
    return false;
  }
}

/** Rappels dont le SMS de veille (24h) ou de 2h est dû. Appelé par le cron. */
export async function rappelsAvertir(): Promise<{ veille: DdeRappel[]; deuxHeures: DdeRappel[] }> {
  const { rows: veille } = await getPool().query(
    `select ${COLS} from dde_callbacks
      where statut = 'a_faire' and sms_24h_at is null and telephone <> ''
        and callback_at between now() + interval '23 hours' and now() + interval '25 hours'`,
  );
  const { rows: deuxHeures } = await getPool().query(
    `select ${COLS} from dde_callbacks
      where statut = 'a_faire' and sms_2h_at is null and telephone <> ''
        and callback_at between now() + interval '1 hour 30 minutes' and now() + interval '2 hours 30 minutes'`,
  );
  return { veille: veille as DdeRappel[], deuxHeures: deuxHeures as DdeRappel[] };
}

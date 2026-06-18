import { getPool } from "./db";

export type Reminder = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  listing_url: string;
  note: string;
  remind_at: string;
  status: string; // pending | done | skipped | nrp
  nrp_count: number; // nb de tentatives "ne répond pas"
  owner: string;
  lead_id: number | null;
  event_id: string;
  client_email: string;
  notified_at: string | null;
  created_at: string;
};

/** Ajoute un rappel. */
export async function addReminder(opts: {
  firstName: string;
  lastName: string;
  phone: string;
  listingUrl?: string;
  note?: string;
  remindAt: string;
  owner: string;
  leadId?: number | null;
  clientEmail?: string;
  callCenterId: number;
}): Promise<Reminder> {
  const { rows } = await getPool().query<Reminder>(
    `insert into reminders (first_name, last_name, phone, listing_url, note, remind_at, owner, lead_id, client_email, call_center_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`,
    [
      opts.firstName.trim(),
      opts.lastName.trim(),
      opts.phone.trim(),
      opts.listingUrl?.trim() || "",
      opts.note?.trim() || "",
      opts.remindAt,
      opts.owner,
      opts.leadId ?? null,
      opts.clientEmail?.trim() || "",
      opts.callCenterId,
    ],
  );
  return rows[0];
}

/** Liste les rappels d'une entité (call center). owner = filtre collaborateur. */
export async function listReminders(callCenterId: number, owner?: string): Promise<Reminder[]> {
  if (owner) {
    const { rows } = await getPool().query<Reminder>(
      `select * from reminders where call_center_id = $1 and owner = $2 order by remind_at asc`,
      [callCenterId, owner],
    );
    return rows;
  }
  const { rows } = await getPool().query<Reminder>(
    `select * from reminders where call_center_id = $1 order by remind_at asc`,
    [callCenterId],
  );
  return rows;
}

/** Met à jour le statut d'un rappel (done / skipped / pending). */
export async function updateReminderStatus(id: number, status: string): Promise<void> {
  await getPool().query(`update reminders set status = $2 where id = $1`, [id, status]);
}

/** Marque "ne répond pas" : incrémente le compteur, passe le statut à 'nrp'. */
export async function incrementNrp(id: number): Promise<number> {
  const { rows } = await getPool().query<{ nrp_count: number }>(
    `update reminders set nrp_count = nrp_count + 1, status = 'nrp' where id = $1 returning nrp_count`,
    [id],
  );
  return rows[0]?.nrp_count ?? 0;
}

/** Supprime un rappel. */
export async function deleteReminder(id: number): Promise<void> {
  await getPool().query(`delete from reminders where id = $1`, [id]);
}

/** Renseigne l'id de l'événement Google Agenda lié au rappel. */
export async function setReminderEventId(id: number, eventId: string): Promise<void> {
  await getPool().query(`update reminders set event_id = $2 where id = $1`, [id, eventId]);
}

/** Récupère l'event_id d'un rappel (pour supprimer dans Google Agenda). */
export async function getReminderEventId(id: number): Promise<string> {
  const { rows } = await getPool().query<{ event_id: string }>(
    `select event_id from reminders where id = $1`,
    [id],
  );
  return rows[0]?.event_id ?? "";
}

/** Rappels arrivant dans <= windowMin minutes, pending, pas encore notifiés. */
export async function dueReminders(windowMin = 30): Promise<Reminder[]> {
  const { rows } = await getPool().query<Reminder>(
    `select * from reminders
     where status = 'pending'
       and notified_at is null
       and remind_at <= now() + ($1 || ' minutes')::interval
       and remind_at >= now() - interval '1 hour'
     order by remind_at asc`,
    [String(windowMin)],
  );
  return rows;
}

/** Marque un rappel comme "notifié" (e-mail organisateur envoyé). */
export async function markReminderNotified(id: number): Promise<void> {
  await getPool().query(`update reminders set notified_at = now() where id = $1`, [id]);
}

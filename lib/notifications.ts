import { getPool } from "./db";

/** Centre de notifications interne (cloche 🔔). Architecture multi-canal :
 *  notify() écrit en base (canal "interne") ; d'autres canaux (SMS, mail, push)
 *  pourront être branchés au même endroit sans toucher les appelants. */

export type Notification = {
  id: number; user_email: string; kind: string; title: string; body: string;
  link: string; read: boolean; archived: boolean; created_at: string;
};

/** Envoie une notification à un ou plusieurs utilisateurs (e-mails de compte). Non bloquant côté appelant. */
export async function notify(emails: (string | undefined | null)[], kind: string, title: string, body = "", link = "") {
  const uniq = [...new Set(emails.filter((e): e is string => !!e && !!e.trim()).map((e) => e.trim().toLowerCase()))];
  if (!uniq.length) return;
  const pool = getPool();
  for (const e of uniq) {
    await pool.query(
      `insert into notifications (user_email, kind, title, body, link) values ($1,$2,$3,$4,$5)`,
      [e, kind, title.slice(0, 200), body.slice(0, 500), link.slice(0, 300)],
    );
  }
}

export async function listNotifications(email: string, includeArchived = false): Promise<Notification[]> {
  const { rows } = await getPool().query<Notification>(
    `select id, user_email, kind, title, body, link, read, archived, created_at
       from notifications
      where lower(user_email) = lower($1) ${includeArchived ? "" : "and archived = false"}
      order by created_at desc limit 100`,
    [email],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

export async function unreadCount(email: string): Promise<number> {
  const { rows } = await getPool().query<{ c: string }>(
    `select count(*)::int as c from notifications where lower(user_email) = lower($1) and read = false and archived = false`,
    [email],
  );
  return Number(rows[0]?.c ?? 0);
}

export async function markRead(email: string, id?: number) {
  if (id) await getPool().query(`update notifications set read = true where id = $1 and lower(user_email) = lower($2)`, [id, email]);
  else await getPool().query(`update notifications set read = true where lower(user_email) = lower($1)`, [email]);
}
export async function archiveNotification(email: string, id: number) {
  await getPool().query(`update notifications set archived = true, read = true where id = $1 and lower(user_email) = lower($2)`, [id, email]);
}
export async function deleteNotification(email: string, id: number) {
  await getPool().query(`delete from notifications where id = $1 and lower(user_email) = lower($2)`, [id, email]);
}

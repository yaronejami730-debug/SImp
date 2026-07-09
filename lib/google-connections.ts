import { getPool } from "./db";
import { encrypt, decrypt } from "./crypto";

export type GoogleConnection = {
  user_email: string; google_user_id: string; gmail: string; calendar_id: string;
  connected_at: string; last_sync_at: string | null; sync_state: string;
};
export type GoogleTokens = { access_token: string; refresh_token: string; token_expiry: string | null };

/** Enregistre / met à jour la connexion Google d'un commercial (tokens chiffrés). */
export async function upsertConnection(email: string, data: {
  googleUserId: string; gmail: string; calendarId?: string;
  accessToken: string; refreshToken: string; tokenExpiry?: Date | null;
}) {
  const e = email.trim().toLowerCase();
  await getPool().query(
    `insert into google_connections (user_email, google_user_id, gmail, calendar_id, access_token, refresh_token, token_expiry, connected_at, sync_state)
     values ($1,$2,$3,$4,$5,$6,$7, now(), 'connected')
     on conflict (user_email) do update set
       google_user_id = excluded.google_user_id, gmail = excluded.gmail, calendar_id = excluded.calendar_id,
       access_token = excluded.access_token,
       refresh_token = case when excluded.refresh_token <> '' then excluded.refresh_token else google_connections.refresh_token end,
       token_expiry = excluded.token_expiry, connected_at = now(), sync_state = 'connected'`,
    [e, data.googleUserId, data.gmail, data.calendarId ?? "primary", encrypt(data.accessToken), encrypt(data.refreshToken), data.tokenExpiry ?? null],
  );
}

/** Statut public (sans tokens) pour l'UI. */
export async function getConnectionStatus(email: string): Promise<GoogleConnection | null> {
  const { rows } = await getPool().query<GoogleConnection>(
    `select user_email, google_user_id, gmail, calendar_id, connected_at, last_sync_at, sync_state
       from google_connections where user_email = lower($1)`,
    [email.trim()],
  );
  return rows[0] ?? null;
}

/** Tokens déchiffrés (usage serveur uniquement). */
export async function getTokens(email: string): Promise<GoogleTokens | null> {
  const { rows } = await getPool().query<{ access_token: string; refresh_token: string; token_expiry: string | null }>(
    `select access_token, refresh_token, token_expiry from google_connections where user_email = lower($1)`,
    [email.trim()],
  );
  if (!rows[0]) return null;
  return { access_token: decrypt(rows[0].access_token), refresh_token: decrypt(rows[0].refresh_token), token_expiry: rows[0].token_expiry };
}

export async function deleteConnection(email: string) {
  await getPool().query(`delete from google_connections where user_email = lower($1)`, [email.trim()]);
}

export async function touchSync(email: string, state: string = "connected") {
  await getPool().query(`update google_connections set last_sync_at = now(), sync_state = $2 where user_email = lower($1)`, [email.trim(), state]);
}

/** Commercial (par nom OU email) a-t-il une connexion Google ? Renvoie son email si oui. */
export async function connectionEmailFor(commercialEmail?: string): Promise<string | null> {
  if (!commercialEmail?.trim()) return null;
  const s = await getConnectionStatus(commercialEmail);
  return s && s.sync_state === "connected" ? s.user_email : null;
}

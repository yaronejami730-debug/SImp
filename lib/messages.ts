import { getPool } from "./db";
import { normalizePhoneFR } from "./allmysms";

export type MessageChannel = "email" | "sms";

export type MessageRow = {
  id: number;
  channel: MessageChannel;
  direction: string;
  client_key: string;
  to_email: string;
  to_phone: string;
  client_name: string;
  owner: string;
  event_id: string;
  template_key: string;
  subject: string;
  body_html: string;
  body_text: string;
  provider: string;
  provider_message_id: string;
  status: string;
  origin: string;
  error: string;
  sent_at: string;
  meta: Record<string, unknown>;
};

export type LogMessageInput = {
  channel: MessageChannel;
  toEmail?: string;
  toPhone?: string;
  clientName?: string;
  owner?: string;
  eventId?: string;
  templateKey?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  provider?: string;
  providerMessageId?: string;
  status?: string;
  origin?: "auto" | "manual";
  error?: string;
};

/** Clé client = tél normalisé sinon email en minuscule. */
export function clientKeyOf(email?: string, phone?: string): string {
  const p = phone ? normalizePhoneFR(phone) : null;
  if (p) return p;
  return (email ?? "").trim().toLowerCase();
}

/** Journalise un message envoyé. Ne jette jamais (le log ne doit pas casser l'envoi). */
export async function logMessage(m: LogMessageInput): Promise<void> {
  try {
    const clientKey = clientKeyOf(m.toEmail, m.toPhone);
    const phoneNorm = m.toPhone ? normalizePhoneFR(m.toPhone) ?? m.toPhone : "";
    await getPool().query(
      `insert into messages
        (channel, client_key, to_email, to_phone, client_name, owner, event_id, template_key,
         subject, body_html, body_text, provider, provider_message_id, status, origin, error)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        m.channel,
        clientKey,
        (m.toEmail ?? "").trim().toLowerCase(),
        phoneNorm,
        m.clientName ?? "",
        m.owner ?? "",
        m.eventId ?? "",
        m.templateKey ?? "",
        m.subject ?? "",
        m.bodyHtml ?? "",
        m.bodyText ?? "",
        m.provider ?? "",
        m.providerMessageId ?? "",
        m.status ?? "sent",
        m.origin ?? "auto",
        m.error ?? "",
      ],
    );
  } catch (e) {
    console.error("logMessage error:", e instanceof Error ? e.message : e);
  }
}

/** Timeline d'un client : par clé, email, téléphone ou event lié. */
export async function listMessagesForClient(opts: { email?: string; phone?: string; eventId?: string }): Promise<MessageRow[]> {
  const email = (opts.email ?? "").trim().toLowerCase();
  const phone = opts.phone ? normalizePhoneFR(opts.phone) ?? "" : "";
  const key = clientKeyOf(opts.email, opts.phone);
  const { rows } = await getPool().query<MessageRow>(
    `select * from messages
     where ($1 <> '' and client_key = $1)
        or ($2 <> '' and to_email = $2)
        or ($3 <> '' and to_phone = $3)
        or ($4 <> '' and event_id = $4)
     order by sent_at desc
     limit 200`,
    [key, email, phone, opts.eventId ?? ""],
  );
  return rows;
}

export type RelanceGroup = {
  client_key: string;
  client_name: string;
  to_email: string;
  to_phone: string;
  count: number;
  last_sent: string;
  types: string[];
};

/** Récapitulatif des relances (followups + no-show) groupées par client. */
export async function listRelances(owner?: string): Promise<RelanceGroup[]> {
  const params: string[] = [];
  let ownerClause = "";
  if (owner) { params.push(owner); ownerClause = "and owner = $1"; }
  const { rows } = await getPool().query<RelanceGroup>(
    `select client_key,
            max(client_name) as client_name,
            max(to_email) as to_email,
            max(to_phone) as to_phone,
            count(*)::int as count,
            max(sent_at) as last_sent,
            array_agg(distinct template_key) as types
     from messages
     where channel = 'email'
       and (template_key like 'followup\\_%' or template_key = 'noshow')
       ${ownerClause}
     group by client_key
     order by last_sent desc
     limit 300`,
    params,
  );
  return rows;
}

export type BookingInvite = {
  to_email: string;
  template_key: string;
  provider_message_id: string;
  sent_at: string;
  owner: string;
};

/** Dernière invitation booking (choix créneau / confirmation) par e-mail. */
export async function listBookingInvites(owner?: string): Promise<BookingInvite[]> {
  const params: string[] = [];
  let ownerClause = "";
  if (owner) { params.push(owner); ownerClause = "and owner = $1"; }
  const { rows } = await getPool().query<BookingInvite>(
    `select distinct on (to_email)
            to_email, template_key, provider_message_id, sent_at, owner
     from messages
     where channel = 'email'
       and template_key in ('booking_invite', 'booking_confirm')
       and to_email <> ''
       ${ownerClause}
     order by to_email, sent_at desc`,
    params,
  );
  return rows;
}

/** Un message par id. */
export async function getMessage(id: number): Promise<MessageRow | null> {
  const { rows } = await getPool().query<MessageRow>(`select * from messages where id = $1`, [id]);
  return rows[0] ?? null;
}

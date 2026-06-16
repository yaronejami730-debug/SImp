import { logMessage } from "./messages";

/** Contexte de journalisation (timeline CRM). Optionnel. */
type LogCtx = {
  templateKey?: string;
  clientName?: string;
  owner?: string;
  eventId?: string;
  origin?: "auto" | "manual";
};

type SendOpts = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  log?: LogCtx; // si fourni -> journalise le mail (preuve timeline)
};

/** Envoie un e-mail transactionnel via l'API Brevo. Renvoie { messageId }. */
export async function sendEmail(opts: SendOpts): Promise<{ messageId?: string }> {
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY ?? "",
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME ?? "Simplisicar",
          email: process.env.BREVO_SENDER_EMAIL,
        },
        to: [{ email: opts.to, name: opts.toName }],
        subject: opts.subject,
        htmlContent: opts.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Brevo ${res.status}: ${body}`);
    }
    const json = await res.json();

    if (opts.log) {
      await logMessage({
        channel: "email",
        toEmail: opts.to,
        clientName: opts.log.clientName ?? opts.toName,
        owner: opts.log.owner,
        eventId: opts.log.eventId,
        templateKey: opts.log.templateKey,
        origin: opts.log.origin,
        subject: opts.subject,
        bodyHtml: opts.html,
        provider: "brevo",
        providerMessageId: json?.messageId,
        status: "sent",
      });
    }
    return json;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (opts.log) {
      await logMessage({
        channel: "email",
        toEmail: opts.to,
        clientName: opts.log.clientName ?? opts.toName,
        owner: opts.log.owner,
        eventId: opts.log.eventId,
        templateKey: opts.log.templateKey,
        origin: opts.log.origin,
        subject: opts.subject,
        bodyHtml: opts.html,
        provider: "brevo",
        status: "error",
        error: errMsg,
      });
    }
    throw e;
  }
}

export type BrevoSentEmail = { uuid: string; messageId: string; subject: string; date: string };

/** Normalise un messageId Brevo (sans chevrons) pour comparaison/dedup. */
export function normMessageId(id?: string): string {
  return (id ?? "").replace(/^<|>$/g, "").trim();
}

const DAY_MS = 24 * 3600 * 1000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function fetchEmailsWindow(email: string, startDate: string, endDate: string): Promise<BrevoSentEmail[]> {
  const params = new URLSearchParams({ email, sort: "desc", limit: "100", startDate, endDate });
  const res = await fetch(`https://api.brevo.com/v3/smtp/emails?${params.toString()}`, {
    headers: { "api-key": process.env.BREVO_API_KEY ?? "", accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo emails ${res.status}: ${body}`);
  }
  const json = await res.json();
  return (json?.transactionalEmails ?? []).map((e: { uuid: string; messageId: string; subject: string; date: string }) => ({
    uuid: e.uuid, messageId: e.messageId, subject: e.subject, date: e.date,
  }));
}

/** Liste les mails transactionnels déjà envoyés à un destinataire (historique Brevo).
 *  Brevo limite chaque requête à 30 jours -> on boucle par fenêtres de 30 jours. */
export async function listSentEmails(email: string, windows = 3): Promise<BrevoSentEmail[]> {
  if (!email) return [];
  const out: BrevoSentEmail[] = [];
  const seen = new Set<string>();
  const now = Date.now();
  for (let i = 0; i < windows; i++) {
    const end = new Date(now - i * 30 * DAY_MS);
    const start = new Date(end.getTime() - 30 * DAY_MS);
    let batch: BrevoSentEmail[] = [];
    try {
      batch = await fetchEmailsWindow(email, ymd(start), ymd(end));
    } catch {
      break; // on garde ce qu'on a déjà récupéré
    }
    for (const e of batch) {
      const k = e.uuid || e.messageId;
      if (k && !seen.has(k)) { seen.add(k); out.push(e); }
    }
  }
  return out;
}

/** Récupère le contenu HTML personnalisé d'un mail envoyé (par uuid). */
export async function getEmailContent(uuid: string): Promise<{ subject: string; html: string } | null> {
  if (!uuid) return null;
  const res = await fetch(`https://api.brevo.com/v3/smtp/emails/${encodeURIComponent(uuid)}`, {
    headers: { "api-key": process.env.BREVO_API_KEY ?? "", accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return { subject: json?.subject ?? "", html: json?.body ?? "" };
}

export type BrevoEvent = { event: string; date: string; ip?: string; reason?: string; messageId?: string };

/** Récupère les events Brevo d'un mail (envoyé / délivré / ouvert / clic) par messageId. */
export async function getEmailEvents(messageId: string): Promise<BrevoEvent[]> {
  if (!messageId) return [];
  // L'API attend l'id sans chevrons.
  const id = messageId.replace(/^<|>$/g, "");
  const url = `https://api.brevo.com/v3/smtp/statistics/events?messageId=${encodeURIComponent(id)}&sort=asc&limit=100`;
  const res = await fetch(url, {
    headers: { "api-key": process.env.BREVO_API_KEY ?? "", accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo events ${res.status}: ${body}`);
  }
  const json = await res.json();
  const events: BrevoEvent[] = (json?.events ?? []).map((e: { event: string; date: string; ip?: string; reason?: string; messageId?: string }) => ({
    event: e.event,
    date: e.date,
    ip: e.ip,
    reason: e.reason,
    messageId: e.messageId,
  }));
  return events;
}

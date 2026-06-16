import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getEvent } from "@/lib/google";
import { listMessagesForClient } from "@/lib/messages";
import { listSentEmails, normMessageId } from "@/lib/brevo";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function ownsOrAdmin(ev: Awaited<ReturnType<typeof getEvent>>, email: string, role: string) {
  const owner = ev.extendedProperties?.private?.owner ?? "";
  return role === "admin" || owner === email;
}

type TimelineItem = {
  key: string;            // db:<id> | brevo:<uuid>
  source: "db" | "brevo"; // base de données | système de mailing
  channel: "email" | "sms";
  templateKey: string;
  subject: string;
  preview: string;
  toEmail: string;
  toPhone: string;
  provider: string;
  providerMessageId: string;
  status: string;
  origin: string; // auto | manual | "" (inconnu, ex: récupéré Brevo)
  error: string;
  sentAt: string;
};

/** GET -> timeline mails + SMS (DB + récupération Brevo), avec source de chaque donnée. */
export async function GET(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  try {
    const ev = await getEvent(id);
    if (!ownsOrAdmin(ev, s.email, s.role)) return NextResponse.json({ error: "Interdit." }, { status: 403 });
    const priv = ev.extendedProperties?.private ?? {};
    const clientEmail = priv.clientEmail ?? "";

    // 1) Messages journalisés en base.
    const dbRows = await listMessagesForClient({ email: clientEmail, phone: priv.clientPhone, eventId: id });
    const items: TimelineItem[] = dbRows.map((m) => ({
      key: `db:${m.id}`,
      source: "db",
      channel: m.channel,
      templateKey: m.template_key,
      subject: m.subject,
      preview: m.channel === "sms" ? m.body_text : m.subject,
      toEmail: m.to_email,
      toPhone: m.to_phone,
      provider: m.provider,
      providerMessageId: m.provider_message_id,
      status: m.status,
      origin: m.origin,
      error: m.error,
      sentAt: m.sent_at,
    }));

    // 2) Récupération de l'historique mails via Brevo (envois antérieurs au log).
    let brevoError: string | undefined;
    if (clientEmail) {
      try {
        const known = new Set(items.map((i) => normMessageId(i.providerMessageId)).filter(Boolean));
        const sent = await listSentEmails(clientEmail, 3); // ~90 derniers jours (3 fenêtres de 30j)
        for (const m of sent) {
          if (known.has(normMessageId(m.messageId))) continue; // déjà en base
          items.push({
            key: `brevo:${m.uuid}`,
            source: "brevo",
            channel: "email",
            templateKey: "",
            subject: m.subject,
            preview: m.subject,
            toEmail: clientEmail,
            toPhone: "",
            provider: "brevo",
            providerMessageId: m.messageId,
            status: "sent",
            origin: "",
            error: "",
            sentAt: m.date,
          });
        }
      } catch (e) {
        brevoError = e instanceof Error ? e.message : "Erreur Brevo.";
      }
    }

    items.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    return NextResponse.json({ ok: true, messages: items, brevoError });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

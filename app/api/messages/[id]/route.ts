import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getMessage } from "@/lib/messages";
import { getEmailEvents, type BrevoEvent } from "@/lib/brevo";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET -> détail complet d'un message + events Brevo (envoyé / délivré / 1ère ouverture). */
export async function GET(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  try {
    const m = await getMessage(Number(id));
    if (!m) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
    // Collaborateur : limité à ses propres envois.
    if (s.role !== "admin" && m.owner && m.owner !== s.email) {
      return NextResponse.json({ error: "Interdit." }, { status: 403 });
    }

    // Events Brevo en direct (mails uniquement) — preuves de livraison/ouverture.
    let events: BrevoEvent[] = [];
    let eventsError: string | undefined;
    if (m.channel === "email" && m.provider_message_id) {
      try {
        events = await getEmailEvents(m.provider_message_id);
      } catch (e) {
        eventsError = e instanceof Error ? e.message : "Erreur events Brevo.";
      }
    }

    return NextResponse.json({
      ok: true,
      message: {
        id: m.id,
        channel: m.channel,
        templateKey: m.template_key,
        subject: m.subject,
        bodyHtml: m.body_html,
        bodyText: m.body_text,
        toEmail: m.to_email,
        toPhone: m.to_phone,
        clientName: m.client_name,
        owner: m.owner,
        provider: m.provider,
        providerMessageId: m.provider_message_id,
        status: m.status,
        error: m.error,
        sentAt: m.sent_at,
      },
      events,
      eventsError,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

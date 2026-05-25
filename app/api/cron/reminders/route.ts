import { NextResponse } from "next/server";
import { listEvents, markReminderSent } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { reminderEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const H24 = 24 * 60 * 60 * 1000;
const H2 = 2 * 60 * 60 * 1000;

/**
 * Rappels dynamiques. À lancer souvent (~toutes les 15 min).
 * Pour chaque RDV à venir :
 *   - 2h avant  -> mail (si pas déjà envoyé)
 *   - 24h avant -> mail (si pas déjà envoyé)
 * Les flags reminder24Sent / reminder2Sent sont stockés sur l'event et
 * remis à zéro à chaque reprogrammation -> les rappels suivent la nouvelle heure.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const events = await listEvents(now, new Date(now.getTime() + H24 + 60 * 60 * 1000));

  const base = baseUrlFrom();
  let sent = 0;
  const errors: string[] = [];

  for (const ev of events) {
    const startIso = ev.start?.dateTime;
    if (!startIso || !ev.id) continue;
    const msUntil = new Date(startIso).getTime() - now.getTime();
    if (msUntil <= 0) continue;

    const priv = ev.extendedProperties?.private ?? {};
    let kind: "24h" | "2h" | null = null;
    if (msUntil <= H2 && !priv.reminder2Sent) kind = "2h";
    else if (msUntil <= H24 && msUntil > H2 && !priv.reminder24Sent) kind = "24h";
    if (!kind) continue;

    const email = priv.clientEmail;
    const firstName = priv.clientFirstName ?? "";
    if (!email) continue;

    const mail = reminderEmail({
      firstName,
      startDateTime: startIso,
      location: ev.location ?? "",
      kind,
      whatsappUrl: whatsappUrl(),
      rescheduleUrl: rescheduleUrl(base, ev.id),
    });

    try {
      await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html });
      await markReminderSent(ev.id, kind);
      sent++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ ok: true, checked: events.length, sent, errors });
}

import { NextResponse } from "next/server";
import { listEvents } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { reminderEmail } from "@/lib/email-templates";

export const maxDuration = 60;

/** Date au format YYYY-MM-DD dans le fuseau Europe/Paris. */
function parisDate(d: Date) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function GET(req: Request) {
  // Sécurité : Vercel Cron envoie "Authorization: Bearer <CRON_SECRET>"
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const tomorrow = parisDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  // On regarde les 3 prochains jours puis on filtre ceux de "demain"
  const events = await listEvents(
    now,
    new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
  );

  let sent = 0;
  const errors: string[] = [];

  for (const ev of events) {
    const startIso = ev.start?.dateTime;
    if (!startIso) continue;
    if (parisDate(new Date(startIso)) !== tomorrow) continue;

    const priv = ev.extendedProperties?.private;
    const email = priv?.clientEmail;
    if (!email) continue;

    const firstName = priv?.clientFirstName ?? "";

    const mail = reminderEmail({
      firstName,
      startDateTime: startIso,
      location: ev.location ?? "",
    });

    try {
      await sendEmail({
        to: email,
        toName: firstName,
        subject: mail.subject,
        html: mail.html,
      });
      sent++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ ok: true, date: tomorrow, sent, errors });
}

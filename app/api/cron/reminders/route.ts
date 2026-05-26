import { NextResponse } from "next/server";
import { listEvents, markReminderSent } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { reminderEmail, cancellationFollowupEmail, phoneRappelOrganizerEmail, phoneRappelClientEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";
import { signBooking } from "@/lib/auth";
import { dueFollowups, advanceFollowup } from "@/lib/followups";
import { dueReminders, markReminderNotified } from "@/lib/reminders";
import { getUserByEmail } from "@/lib/users";

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
      civility: priv.clientCivility,
      firstName,
      lastName: priv.clientLastName,
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

  // === Séquence de relances après annulation (J+7, J+14, J+30) ===
  let followupsSent = 0;
  try {
    const due = await dueFollowups();
    for (const r of due) {
      try {
        const stage = (r.stage + 1) as 1 | 2 | 3;
        const token = signBooking({ email: r.email, listingUrl: r.listing_url, owner: r.owner, civility: r.civility });
        const bookUrl = `${base}/book?t=${encodeURIComponent(token)}`;
        const mail = cancellationFollowupEmail({
          stage,
          civility: r.civility,
          firstName: r.first_name,
          lastName: r.last_name,
          bookUrl,
        });
        await sendEmail({ to: r.email, toName: r.first_name, subject: mail.subject, html: mail.html });
        await advanceFollowup(r.id, r.stage);
        followupsSent++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  // === Rappels téléphoniques (RDV téléphoniques) : mail 30 min avant ===
  let phoneRappelsSent = 0;
  try {
    const due = await dueReminders(30);
    for (const r of due) {
      try {
        let organizerName = "";
        if (r.owner) {
          try {
            const u = await getUserByEmail(r.owner);
            organizerName = u?.name ?? "";
          } catch {}
        }
        // Mail organisateur (collaborateur).
        if (r.owner) {
          const mail = phoneRappelOrganizerEmail({
            organizerName,
            firstName: r.first_name,
            lastName: r.last_name,
            phone: r.phone,
            remindAt: r.remind_at,
            listingUrl: r.listing_url,
            note: r.note,
          });
          await sendEmail({ to: r.owner, toName: organizerName, subject: mail.subject, html: mail.html });
        }
        // Mail client (si email connu).
        if (r.client_email) {
          const mail = phoneRappelClientEmail({
            firstName: r.first_name || "",
            lastName: r.last_name,
            remindAt: r.remind_at,
          });
          await sendEmail({ to: r.client_email, toName: r.first_name, subject: mail.subject, html: mail.html });
        }
        await markReminderNotified(r.id);
        phoneRappelsSent++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return NextResponse.json({ ok: true, checked: events.length, sent, followupsSent, phoneRappelsSent, errors });
}

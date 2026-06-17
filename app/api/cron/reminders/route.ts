import { NextResponse } from "next/server";
import { listEvents, markReminderSent, markParkingSent } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { sendSMS } from "@/lib/allmysms";
import { reminderEmail, cancellationFollowupEmail, thinkingFollowupEmail, unsignedFollowupEmail, signedRatingEmail, phoneRappelOrganizerEmail, phoneRappelClientEmail, parkingReservationEmail, noShowFollowupEmail, reminderApproachEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";
import { signBooking, signReview } from "@/lib/auth";
import { dueFollowups, advanceFollowup } from "@/lib/followups";
import { dueReminders, markReminderNotified } from "@/lib/reminders";
import { getUserByEmail } from "@/lib/users";
import { commercialPhone, commercialPhoneStrict } from "@/lib/commerciaux";
import { mobileReminderEmail } from "@/lib/email-templates";
import { upcomingMobileAppts, markMobileReminderSent } from "@/lib/mobile";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const H24 = 24 * 60 * 60 * 1000;
const H2 = 2 * 60 * 60 * 1000;
const MIN15 = 15 * 60 * 1000;

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
  let smsSent = 0;
  let parkingSentCount = 0;
  const errors: string[] = [];

  // Texte SMS de rappel (24h ou 2h avant le RDV).
  const reminderSmsText = (startIso: string, location: string, kind: "24h" | "2h") => {
    const d = new Date(startIso);
    const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);
    const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
    const quand = kind === "2h" ? "dans 2h" : "demain";
    return `Simplicicar: rappel RDV ${quand}, ${date} a ${heure}${location ? ` - ${location}` : ""}. A bientot! STOP au 36180`;
  };

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

    const clientName = `${firstName} ${priv.clientLastName ?? ""}`.trim();
    try {
      await sendEmail({
        to: email, toName: firstName, subject: mail.subject, html: mail.html,
        log: { templateKey: kind === "2h" ? "reminder2" : "reminder24", clientName, owner: priv.owner, eventId: ev.id },
      });
      await markReminderSent(ev.id, kind);
      sent++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }

    // SMS de rappel (systématique, en plus du mail). Non-bloquant.
    const phone = priv.clientPhone;
    if (phone) {
      try {
        await sendSMS({
          to: phone, text: reminderSmsText(startIso, ev.location ?? "", kind),
          log: { templateKey: kind === "2h" ? "sms_reminder2" : "sms_reminder24", clientName, owner: priv.owner, eventId: ev.id, toEmail: email },
        });
        smsSent++;
      } catch (e) {
        errors.push(`SMS rappel ${kind}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // === SMS + mail 15 min avant le RDV : contact de l'interlocuteur (commercial) + accès ===
  let sms15Sent = 0;
  for (const ev of events) {
    const startIso = ev.start?.dateTime;
    if (!startIso || !ev.id) continue;
    const msUntil = new Date(startIso).getTime() - now.getTime();
    if (msUntil <= 0 || msUntil > MIN15) continue;
    const priv = ev.extendedProperties?.private ?? {};
    if (priv.reminder15Sent === "1") continue;
    const phone = priv.clientPhone;
    const email = priv.clientEmail;
    if (!phone && !email) continue;
    const firstName = priv.clientFirstName ?? "";
    const clientName = `${firstName} ${priv.clientLastName ?? ""}`.trim();
    const commercial = priv.commercial || "votre conseiller";
    const tel = commercialPhone(priv.commercial);
    let any = false;
    // SMS
    if (phone) {
      const text = `Bonjour ${firstName}, nous sommes a 15 minutes de votre rendez-vous chez Simplicicar. Voici le contact de votre interlocuteur: M. ${commercial} - ${tel}. N'hesitez pas a l'appeler une fois proche de l'agence. STOP au 36180`;
      try {
        await sendSMS({ to: phone, text, log: { templateKey: "sms_reminder15", clientName, owner: priv.owner, eventId: ev.id, toEmail: email } });
        any = true;
      } catch (e) { errors.push(`SMS 15min: ${e instanceof Error ? e.message : String(e)}`); }
    }
    // Mail (en même temps)
    if (email) {
      try {
        const mail = reminderApproachEmail({ firstName, commercial, phone: tel });
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html, log: { templateKey: "reminder15", clientName, owner: priv.owner, eventId: ev.id } });
        any = true;
      } catch (e) { errors.push(`Mail 15min: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (any) {
      try { await markReminderSent(ev.id, "15min"); } catch { /* non-bloquant */ }
      sms15Sent++;
    }
  }

  // === Rappels RDV DÉPLACEMENT (24h / 2h) : mail + SMS, à l'adresse du client ===
  let mobileReminders = 0;
  try {
    const mob = await upcomingMobileAppts(H24 + 60 * 60 * 1000);
    for (const a of mob) {
      const msUntil = new Date(a.start_datetime).getTime() - now.getTime();
      let kind: "24h" | "2h" | null = null;
      if (msUntil <= H2 && !a.reminder2_sent) kind = "2h";
      else if (msUntil <= H24 && msUntil > H2 && !a.reminder24_sent) kind = "24h";
      if (!kind) continue;
      const clientName = `${a.first_name} ${a.last_name}`.trim();
      const phone = commercialPhoneStrict(a.commercial);
      if (a.email) {
        try {
          const mail = mobileReminderEmail({ civility: a.civility, firstName: a.first_name, lastName: a.last_name, startDateTime: a.start_datetime, address: a.address, conseiller: a.commercial, phone, kind });
          await sendEmail({ to: a.email, toName: a.first_name, subject: mail.subject, html: mail.html, log: { templateKey: kind === "2h" ? "mobile_reminder2" : "mobile_reminder24", clientName, owner: a.teleprospecteur } });
        } catch (e) { errors.push(`Mail mobile ${kind}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      if (a.phone) {
        try {
          const d = new Date(a.start_datetime);
          const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);
          const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
          const quand = kind === "2h" ? "dans 2h" : "demain";
          const text = `Simplicicar: rappel RDV a domicile ${quand}, ${date} a ${heure}, a votre adresse. Conseiller M. ${a.commercial}. STOP au 36180`;
          await sendSMS({ to: a.phone, text, log: { templateKey: kind === "2h" ? "sms_mobile_reminder2" : "sms_mobile_reminder24", clientName, owner: a.teleprospecteur, toEmail: a.email } });
        } catch (e) { errors.push(`SMS mobile ${kind}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      await markMobileReminderSent(a.id, kind);
      mobileReminders++;
    }
  } catch (e) { errors.push(`Mobile reminders: ${e instanceof Error ? e.message : String(e)}`); }

  // === Mail parking : envoyé ~2h avant le RDV si parkingRequested et pas encore envoyé ===
  for (const ev of events) {
    const startIso = ev.start?.dateTime;
    if (!startIso || !ev.id) continue;
    const msUntil = new Date(startIso).getTime() - now.getTime();
    if (msUntil <= 0 || msUntil > H2) continue;
    const priv = ev.extendedProperties?.private ?? {};
    if (priv.parkingRequested !== "1" || priv.parkingSent === "1") continue;
    const email = priv.clientEmail;
    const firstName = priv.clientFirstName ?? "";
    if (!email) continue;
    try {
      const mail = parkingReservationEmail({
        civility: priv.clientCivility,
        firstName,
        lastName: priv.clientLastName,
        startDateTime: startIso,
      });
      await sendEmail({
        to: email, toName: firstName, subject: mail.subject, html: mail.html,
        log: { templateKey: "parking", clientName: `${firstName} ${priv.clientLastName ?? ""}`.trim(), owner: priv.owner, eventId: ev.id },
      });
      await markParkingSent(ev.id);
      parkingSentCount++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  // === Séquence de relances (annulation / réflexion / non-signé) ===
  let followupsSent = 0;
  try {
    const due = await dueFollowups();
    for (const r of due) {
      try {
        const stage = (r.stage + 1) as 1 | 2 | 3;
        const token = signBooking({ email: r.email, listingUrl: r.listing_url, owner: r.owner, civility: r.civility });
        const bookUrl = `${base}/book?t=${encodeURIComponent(token)}`;
        const unsubUrl = `${base}/unsubscribe?t=${encodeURIComponent(token)}`;
        const type = r.type ?? "cancel";

        let mail: { subject: string; html: string };
        if (type === "signed") {
          const reviewToken = signReview({ firstName: r.first_name, lastName: r.last_name, email: r.email, vehicle: r.vehicle ?? "" });
          mail = signedRatingEmail({ civility: r.civility, firstName: r.first_name, lastName: r.last_name, avisUrl: `${base}/avis?t=${encodeURIComponent(reviewToken)}` });
        } else if (type === "thinking") {
          mail = thinkingFollowupEmail({ stage: stage as 1 | 2, civility: r.civility, firstName: r.first_name, lastName: r.last_name, bookUrl, unsubUrl });
        } else if (type === "unsigned") {
          mail = unsignedFollowupEmail({ stage: stage as 1 | 2 | 3, civility: r.civility, firstName: r.first_name, lastName: r.last_name, bookUrl, unsubUrl });
        } else if (type === "noshow") {
          mail = noShowFollowupEmail({ stage, civility: r.civility, firstName: r.first_name, lastName: r.last_name, bookUrl, unsubUrl });
        } else {
          mail = cancellationFollowupEmail({ stage: stage as 1 | 2 | 3, civility: r.civility, firstName: r.first_name, lastName: r.last_name, bookUrl, unsubUrl });
        }

        await sendEmail({
          to: r.email, toName: r.first_name, subject: mail.subject, html: mail.html,
          log: { templateKey: type === "noshow" ? "noshow" : `followup_${type}_${stage}`, clientName: `${r.first_name} ${r.last_name ?? ""}`.trim(), owner: r.owner },
        });
        await advanceFollowup(r.id, r.stage, type);
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
          await sendEmail({
            to: r.owner, toName: organizerName, subject: mail.subject, html: mail.html,
            log: { templateKey: "phone_rappel_organizer", clientName: `${r.first_name} ${r.last_name ?? ""}`.trim(), owner: r.owner },
          });
        }
        // Mail client (si email connu).
        if (r.client_email) {
          const mail = phoneRappelClientEmail({
            firstName: r.first_name || "",
            lastName: r.last_name,
            remindAt: r.remind_at,
          });
          await sendEmail({
            to: r.client_email, toName: r.first_name, subject: mail.subject, html: mail.html,
            log: { templateKey: "phone_rappel_client", clientName: `${r.first_name} ${r.last_name ?? ""}`.trim(), owner: r.owner },
          });
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

  return NextResponse.json({ ok: true, checked: events.length, sent, smsSent, sms15Sent, mobileReminders, parkingSent: parkingSentCount, followupsSent, phoneRappelsSent, errors });
}

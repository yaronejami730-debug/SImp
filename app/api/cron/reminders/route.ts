import { NextResponse } from "next/server";
import { listEvents, markReminderSent, markReminderSmsSent, markParkingSent, markCommercialNotified } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { sendSMS } from "@/lib/allmysms";
import { reminderEmail, cancellationFollowupEmail, thinkingFollowupEmail, unsignedFollowupEmail, signedRatingEmail, phoneRappelOrganizerEmail, phoneRappelClientEmail, parkingReservationEmail, noShowFollowupEmail, reminderApproachEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";
import { signBooking, signReview } from "@/lib/auth";
import { dueFollowups, advanceFollowup } from "@/lib/followups";
import { dueReminders, markReminderNotified } from "@/lib/reminders";
import { getUserByEmail } from "@/lib/users";
import { commercialPhoneStrict } from "@/lib/commerciaux";
import { mobileReminderEmail } from "@/lib/email-templates";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const H24 = 24 * 60 * 60 * 1000;
const H2 = 2 * 60 * 60 * 1000;
const MIN15 = 15 * 60 * 1000;
const MIN10 = 12 * 60 * 1000; // fenêtre "10 min avant" (marge pour la cadence du cron)

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
  // RDV annulés : exclus de TOUS les rappels/SMS (confirmation, 24h, 2h, 15min, SMS commercial 10min).
  const events = (await listEvents(now, new Date(now.getTime() + H24 + 60 * 60 * 1000)))
    .filter((ev) => ev.extendedProperties?.private?.cancelled !== "1");

  const base = baseUrlFrom();
  let sent = 0;
  let smsSent = 0;
  let parkingSentCount = 0;
  const errors: string[] = [];

  // Texte SMS de rappel (24h ou 2h avant le RDV), par type (agence / déplacement).
  const reminderSmsText = (startIso: string, location: string, kind: "24h" | "2h", isDep = false, commercial = "") => {
    const d = new Date(startIso);
    const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);
    const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
    const quand = kind === "2h" ? "dans 2h" : "demain";
    const conseiller = commercial ? ` Conseiller M. ${commercial}.` : "";
    return isDep
      ? `Simplicicar: rappel RDV a domicile ${quand}, ${date} a ${heure}, a votre adresse.${conseiller} STOP au 36180`
      : `Simplicicar: rappel RDV ${quand}, ${date} a ${heure}${location ? ` - ${location}` : ""}.${conseiller} A bientot! STOP au 36180`;
  };

  for (const ev of events) {
    const startIso = ev.start?.dateTime;
    if (!startIso || !ev.id) continue;
    const msUntil = new Date(startIso).getTime() - now.getTime();
    if (msUntil <= 0) continue;

    const priv = ev.extendedProperties?.private ?? {};
    // Anciens RDV déplacement de la table appointments_mobile : ils ont aussi un event Google
    // tagué mobile=1 ; gérés par leur propre section. On les ignore ici pour éviter le double.
    if (priv.mobile === "1") continue;
    const isDep = priv.deplacement === "1";

    // Flags MAIL et SMS indépendants.
    let emailKind: "24h" | "2h" | null = null;
    if (msUntil <= H2 && !priv.reminder2Sent) emailKind = "2h";
    else if (msUntil <= H24 && msUntil > H2 && !priv.reminder24Sent) emailKind = "24h";
    let smsKind: "24h" | "2h" | null = null;
    if (msUntil <= H2 && !priv.reminder2SmsSent) smsKind = "2h";
    else if (msUntil <= H24 && msUntil > H2 && !priv.reminder24SmsSent) smsKind = "24h";
    if (!emailKind && !smsKind) continue;

    const email = priv.clientEmail;
    const phone = priv.clientPhone;
    const firstName = priv.clientFirstName ?? "";
    const clientName = `${firstName} ${priv.clientLastName ?? ""}`.trim();
    const commPhone = priv.commercialPhone || commercialPhoneStrict(priv.commercial);

    // Mail de rappel (par type). Flag marqué APRÈS LA TENTATIVE (succès OU échec)
    // -> un destinataire invalide ne fait pas reboucler le cron toutes les 10 min.
    if (emailKind && email) {
      const mail = isDep
        ? mobileReminderEmail({ civility: priv.clientCivility, firstName, lastName: priv.clientLastName, startDateTime: startIso, address: ev.location ?? "", conseiller: priv.commercial || "", phone: commPhone, kind: emailKind })
        : reminderEmail({ civility: priv.clientCivility, firstName, lastName: priv.clientLastName, startDateTime: startIso, location: ev.location ?? "", kind: emailKind, whatsappUrl: whatsappUrl(), rescheduleUrl: rescheduleUrl(base, ev.id) });
      try {
        await sendEmail({
          to: email, toName: firstName, subject: mail.subject, html: mail.html,
          log: { templateKey: `${isDep ? "mobile_" : ""}reminder${emailKind === "2h" ? "2" : "24"}`, clientName, owner: priv.owner, eventId: ev.id },
        });
        sent++;
      } catch (e) {
        errors.push(`Mail rappel ${emailKind}: ${e instanceof Error ? e.message : String(e)}`);
      }
      try { await markReminderSent(ev.id, emailKind); } catch { /* non-bloquant */ }
    }

    // SMS de rappel (flag séparé). Marqué après tentative.
    if (smsKind && phone) {
      try {
        await sendSMS({
          to: phone, text: reminderSmsText(startIso, ev.location ?? "", smsKind, isDep, priv.commercial),
          log: { templateKey: `${isDep ? "sms_mobile_" : "sms_"}reminder${smsKind === "2h" ? "2" : "24"}`, clientName, owner: priv.owner, eventId: ev.id, toEmail: email },
        });
        smsSent++;
      } catch (e) {
        errors.push(`SMS rappel ${smsKind}: ${e instanceof Error ? e.message : String(e)}`);
      }
      try { await markReminderSmsSent(ev.id, smsKind); } catch { /* non-bloquant */ }
    }
  }

  // === SMS + mail 15 min avant le RDV : contact du conseiller (commercial) + accès ===
  let sms15Sent = 0;
  for (const ev of events) {
    const startIso = ev.start?.dateTime;
    if (!startIso || !ev.id) continue;
    const msUntil = new Date(startIso).getTime() - now.getTime();
    if (msUntil <= 0 || msUntil > MIN15) continue;
    const priv = ev.extendedProperties?.private ?? {};
    if (priv.reminder15Sent === "1") continue;
    if (priv.mobile === "1") continue; // anciens RDV déplacement (table) gérés ailleurs
    const isDep = priv.deplacement === "1";
    const phone = priv.clientPhone;
    const email = priv.clientEmail;
    if (!phone && !email) continue;
    const firstName = priv.clientFirstName ?? "";
    const clientName = `${firstName} ${priv.clientLastName ?? ""}`.trim();
    const commercial = priv.commercial || "votre conseiller";
    // Coordonnées DU commercial sélectionné (stockées sur l'event ; fallback legacy).
    const tel = priv.commercialPhone || commercialPhoneStrict(priv.commercial);
    let attempted = false; // marqué après tentative (succès OU échec) -> pas de reboucle
    // SMS
    if (phone) {
      attempted = true;
      const text = isDep
        ? `Bonjour ${firstName}, nous sommes a 15 minutes de votre rendez-vous a domicile chez Simplicicar. Votre conseiller M. ${commercial}${tel ? ` - ${tel}` : ""} arrive. STOP au 36180`
        : `Bonjour ${firstName}, nous sommes a 15 minutes de votre rendez-vous chez Simplicicar. Voici le contact de votre conseiller: M. ${commercial}${tel ? ` - ${tel}` : ""}. N'hesitez pas a l'appeler une fois proche de l'agence. STOP au 36180`;
      try {
        await sendSMS({ to: phone, text, log: { templateKey: "sms_reminder15", clientName, owner: priv.owner, eventId: ev.id, toEmail: email } });
      } catch (e) { errors.push(`SMS 15min: ${e instanceof Error ? e.message : String(e)}`); }
    }
    // Mail (en même temps)
    if (email) {
      attempted = true;
      try {
        const mail = reminderApproachEmail({ firstName, commercial, phone: tel });
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html, log: { templateKey: "reminder15", clientName, owner: priv.owner, eventId: ev.id } });
      } catch (e) { errors.push(`Mail 15min: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (attempted) {
      try { await markReminderSent(ev.id, "15min"); } catch { /* non-bloquant */ }
      sms15Sent++;
    }
  }

  // === SMS au COMMERCIAL assigné ~10 min avant (1 seul). Sauf Bonamy (lui a le partage de l'event). ===
  let commercialSmsSent = 0;
  const norm10 = (x: string) => (x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const ev of events) {
    const startIso = ev.start?.dateTime;
    if (!startIso || !ev.id) continue;
    const msUntil = new Date(startIso).getTime() - now.getTime();
    if (msUntil <= 0 || msUntil > MIN10) continue;
    const priv = ev.extendedProperties?.private ?? {};
    if (priv.mobile === "1") continue;
    if (priv.commercialSms10Sent === "1") continue;
    if (priv.confirmed !== "1") continue; // RDV non confirmé par le call center -> pas de SMS commercial
    const commercial = priv.commercial || "";
    if (!commercial) continue; // seulement si un commercial est assigné
    // Bonamy : déjà invité sur l'event Google -> pas de SMS, mais on marque pour ne pas re-vérifier.
    if (norm10(commercial).includes("bonamy")) { try { await markCommercialNotified(ev.id); } catch { /* non-bloquant */ } continue; }
    const commTel = priv.commercialPhone || commercialPhoneStrict(commercial);
    if (!commTel) continue;
    const clientName = `${priv.clientFirstName ?? ""} ${priv.clientLastName ?? ""}`.trim();
    const vehicle = [priv.carBrand, priv.carModel, priv.carFinish].filter(Boolean).join(" ");
    const civ = priv.clientCivility ? `${priv.clientCivility} ` : "";
    const text = `${commercial}, tu as un rendez-vous avec ${civ}${clientName}${vehicle ? ` pour ${vehicle}` : ""} dans 10 minutes. Numero du client: ${priv.clientPhone || "-"}.`;
    try {
      await sendSMS({ to: commTel, text, log: { templateKey: "sms_commercial_10min", clientName, owner: priv.owner, eventId: ev.id, toEmail: priv.clientEmail } });
      commercialSmsSent++;
    } catch (e) { errors.push(`SMS commercial 10min: ${e instanceof Error ? e.message : String(e)}`); }
    try { await markCommercialNotified(ev.id); } catch { /* non-bloquant */ }
  }

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

  return NextResponse.json({ ok: true, checked: events.length, sent, smsSent, sms15Sent, commercialSmsSent, parkingSent: parkingSentCount, followupsSent, phoneRappelsSent, errors });
}

import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getEvent, markReminderSent, patchVehicle, patchContact, patchNote, patchCommercial, appendHistory } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { sendSMS } from "@/lib/allmysms";
import { confirmationEmail, reminderEmail, customEmail, noShowFollowupEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";
import { signBooking } from "@/lib/auth";
import { scheduleFollowup, cancelFollowupOfType } from "@/lib/followups";
import { getUserByEmail } from "@/lib/users";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type GEvent = Awaited<ReturnType<typeof getEvent>>;
function ownsOrAdmin(ev: GEvent, email: string, role: string) {
  const owner = ev.extendedProperties?.private?.owner ?? "";
  return role === "admin" || owner === email;
}

/** GET → renvoie le RDV complet (extendedProperties incluses). */
export async function GET(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  try {
    const ev = await getEvent(id);
    if (!ownsOrAdmin(ev, s.email, s.role)) {
      return NextResponse.json({ error: "Interdit." }, { status: 403 });
    }
    const p = ev.extendedProperties?.private ?? {};
    // Schéma de commission de l'owner du RDV (base + % négo).
    let commissionBase = 50, commissionPct = 10;
    if (p.owner) {
      try { const u = await getUserByEmail(p.owner); if (u) { commissionBase = Number(u.commission_base); commissionPct = Number(u.commission_pct); } } catch { /* défaut */ }
    }
    return NextResponse.json({
      ok: true,
      appointment: {
        id: ev.id,
        ref: p.ref ?? "",
        deplacement: p.deplacement === "1",
        address: p.address ?? ev.location ?? "",
        commissionBase,
        commissionPct,
        startDateTime: ev.start?.dateTime ?? null,
        firstName: p.clientFirstName ?? "",
        lastName: p.clientLastName ?? "",
        civility: p.clientCivility ?? "",
        email: p.clientEmail ?? "",
        phone: p.clientPhone ?? "",
        platform: p.platform ?? "",
        listingUrl: p.listingUrl ?? "",
        carBrand: p.carBrand ?? "",
        carModel: p.carModel ?? "",
        carFinish: p.carFinish ?? "",
        note: p.note ?? "",
        location: ev.location ?? "",
        present: p.present === "1",
        signStatus: p.signStatus ?? "",
        negotiation: p.negotiation ? Number(p.negotiation) : 0,
        owner: p.owner ?? "",
        commercial: p.commercial ?? "",
        createdAt: ev.created ?? null,
        history: (() => { try { return JSON.parse(p.history ?? "[]"); } catch { return []; } })(),
        parkingRequested: p.parkingRequested === "1",
        parkingSent: p.parkingSent === "1",
        cancelled: p.cancelled === "1",
        reminder24Sent: p.reminder24Sent === "1",
        reminder2Sent: p.reminder2Sent === "1",
        bcSigned: p.bcSigned === "1",
        bcSignedAt: p.bcSignedAt || null,
        vehicleSold: p.vehicleSold === "1",
        soldAt: p.soldAt || null,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** PATCH { carBrand, carModel } → met à jour le véhicule. */
export async function PATCH(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  try {
    const ev = await getEvent(id);
    if (!ownsOrAdmin(ev, s.email, s.role)) {
      return NextResponse.json({ error: "Interdit." }, { status: 403 });
    }
    const body = (await req.json()) as { carBrand?: string; carModel?: string; carFinish?: string; phone?: string; email?: string; note?: string; commercial?: string };
    const hasVehicle = body.carBrand !== undefined || body.carModel !== undefined || body.carFinish !== undefined;
    const hasContact = body.phone !== undefined || body.email !== undefined;
    if (hasVehicle) {
      await patchVehicle(id, { carBrand: body.carBrand?.trim(), carModel: body.carModel?.trim(), carFinish: body.carFinish?.trim() });
    }
    if (hasContact) {
      await patchContact(id, { phone: body.phone?.trim(), email: body.email?.trim() });
    }
    if (body.note !== undefined) {
      await patchNote(id, body.note);
    }
    if (body.commercial !== undefined) {
      await patchCommercial(id, body.commercial);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { action, ... } → renvoie un mail/SMS lié au RDV.
 *  Actions : "resend_confirmation_mail" | "resend_confirmation_sms"
 *          | "send_reminder_24h" | "send_reminder_2h"
 *          | "send_custom_mail" (avec { subject, body })
 */
export async function POST(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  const payload = (await req.json()) as { action?: string; subject?: string; body?: string; text?: string };
  const action = payload.action;
  if (!action) return NextResponse.json({ error: "action manquante." }, { status: 400 });

  try {
    const ev = await getEvent(id);
    if (!ownsOrAdmin(ev, s.email, s.role)) {
      return NextResponse.json({ error: "Interdit." }, { status: 403 });
    }
    const p = ev.extendedProperties?.private ?? {};
    const email = p.clientEmail;
    const phone = p.clientPhone;
    const firstName = p.clientFirstName ?? "";
    const lastName = p.clientLastName ?? "";
    const civility = p.clientCivility;
    const startIso = ev.start?.dateTime;
    const location = ev.location ?? "";
    const base = baseUrlFrom(req);
    const clientName = `${firstName} ${lastName}`.trim();
    const logBase = { clientName, owner: p.owner ?? s.email, eventId: id, origin: "manual" as const };

    if (!startIso) return NextResponse.json({ error: "RDV sans date." }, { status: 400 });

    switch (action) {
      case "resend_confirmation_mail": {
        if (!email) return NextResponse.json({ error: "Pas d'e-mail client." }, { status: 400 });
        const mail = confirmationEmail({
          civility, firstName, lastName, startDateTime: startIso, location,
          platform: p.platform, listingUrl: p.listingUrl,
          whatsappUrl: whatsappUrl(),
          rescheduleUrl: ev.id ? rescheduleUrl(base, ev.id) : undefined,
        });
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html, log: { ...logBase, templateKey: "confirmation" } });
        return NextResponse.json({ ok: true, message: `Mail de confirmation renvoyé à ${email}.` });
      }
      case "resend_confirmation_sms": {
        if (!phone) return NextResponse.json({ error: "Pas de téléphone client." }, { status: 400 });
        const d = new Date(startIso);
        const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);
        const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
        const text = `Simplicicar: RDV confirme ${date} a ${heure} - ${location}. STOP au 36180`;
        await sendSMS({ to: phone, text, log: { ...logBase, templateKey: "sms_confirmation", toEmail: email } });
        return NextResponse.json({ ok: true, message: `SMS de confirmation renvoyé au ${phone}.` });
      }
      case "send_reminder_24h":
      case "send_reminder_2h": {
        const kind: "24h" | "2h" = action === "send_reminder_24h" ? "24h" : "2h";
        if (!email) return NextResponse.json({ error: "Pas d'e-mail client." }, { status: 400 });
        const mail = reminderEmail({
          civility, firstName, lastName, startDateTime: startIso, location, kind,
          whatsappUrl: whatsappUrl(),
          rescheduleUrl: ev.id ? rescheduleUrl(base, ev.id) : undefined,
        });
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html, log: { ...logBase, templateKey: kind === "2h" ? "reminder2" : "reminder24" } });
        if (ev.id) await markReminderSent(ev.id, kind);
        return NextResponse.json({ ok: true, message: `Rappel ${kind} envoyé à ${email}.` });
      }
      case "send_custom_mail": {
        if (!email) return NextResponse.json({ error: "Pas d'e-mail client." }, { status: 400 });
        const subject = (payload.subject || "").trim();
        const body = (payload.body || "").trim();
        if (!body) return NextResponse.json({ error: "Corps du mail vide." }, { status: 400 });
        const mail = customEmail({ civility, firstName, lastName, subject, body });
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html, log: { ...logBase, templateKey: "custom" } });
        return NextResponse.json({ ok: true, message: `Mail personnalisé envoyé à ${email}.` });
      }
      case "send_custom_sms": {
        if (!phone) return NextResponse.json({ error: "Pas de téléphone client." }, { status: 400 });
        const text = (payload.text || "").trim();
        if (!text) return NextResponse.json({ error: "SMS vide." }, { status: 400 });
        await sendSMS({ to: phone, text, log: { ...logBase, templateKey: "sms_custom", toEmail: email } });
        return NextResponse.json({ ok: true, message: `SMS personnalisé envoyé au ${phone}.` });
      }
      case "mark_noshow": {
        if (!email) return NextResponse.json({ error: "Pas d'e-mail client." }, { status: 400 });
        const vehicle = [p.carBrand, p.carModel, p.carFinish].filter(Boolean).join(" ");
        const token = signBooking({ email, listingUrl: p.listingUrl, owner: p.owner ?? s.email, civility });
        const bookUrl = `${base}/book?t=${encodeURIComponent(token)}`;
        const unsubUrl = `${base}/unsubscribe?t=${encodeURIComponent(token)}`;
        // 1er mail immédiat (stage 1), ton chaleureux.
        const mail = noShowFollowupEmail({ stage: 1, civility, firstName, lastName, bookUrl, unsubUrl });
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html, log: { ...logBase, templateKey: "noshow" } });
        // Programme les relances suivantes (tous les 2 jours).
        await scheduleFollowup({ email, civility, firstName, lastName, listingUrl: p.listingUrl, owner: p.owner ?? s.email, vehicle, type: "noshow" });
        await appendHistory(id, "noshow", `Absent — séquence de relance lancée par ${s.email}`);
        return NextResponse.json({ ok: true, message: `Client marqué absent. Mail envoyé à ${email}, relances programmées tous les 2 jours.` });
      }
      case "cancel_noshow": {
        if (email) await cancelFollowupOfType(email, "noshow");
        return NextResponse.json({ ok: true, message: "Séquence no-show stoppée." });
      }
      default:
        return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

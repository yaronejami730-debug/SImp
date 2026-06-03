import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getEvent, markReminderSent, patchVehicle, patchContact, patchNote } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { sendSMS } from "@/lib/allmysms";
import { confirmationEmail, reminderEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";

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
    return NextResponse.json({
      ok: true,
      appointment: {
        id: ev.id,
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
    const body = (await req.json()) as { carBrand?: string; carModel?: string; carFinish?: string; phone?: string; email?: string; note?: string };
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
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { action } → renvoie un mail/SMS lié au RDV.
 *  Actions : "resend_confirmation_mail" | "resend_confirmation_sms"
 *          | "send_reminder_24h" | "send_reminder_2h"
 */
export async function POST(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  const { action } = (await req.json()) as { action?: string };
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
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html });
        return NextResponse.json({ ok: true, message: `Mail de confirmation renvoyé à ${email}.` });
      }
      case "resend_confirmation_sms": {
        if (!phone) return NextResponse.json({ error: "Pas de téléphone client." }, { status: 400 });
        const d = new Date(startIso);
        const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);
        const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
        const text = `Simplicicar: RDV confirme ${date} a ${heure} - ${location}. STOP au 36180`;
        await sendSMS({ to: phone, text });
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
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html });
        if (ev.id) await markReminderSent(ev.id, kind);
        return NextResponse.json({ ok: true, message: `Rappel ${kind} envoyé à ${email}.` });
      }
      default:
        return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

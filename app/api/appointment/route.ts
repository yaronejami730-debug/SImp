import { NextResponse } from "next/server";
import { buildAppointment, type AppointmentInput } from "@/lib/parse";
import { createEvent, isSlotFree, createGoogleContact } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { sendSMS } from "@/lib/allmysms";
import { confirmationEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";
import { SLOT_MIN } from "@/lib/slots";
import { getAuth } from "@/lib/auth";
import { cancelFollowup } from "@/lib/followups";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = getAuth(req);
    if (!auth) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

    const body = (await req.json()) as Partial<AppointmentInput>;
    const required: (keyof AppointmentInput)[] = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "date",
      "time",
    ];
    const missing = required.filter((k) => !body[k] || !String(body[k]).trim());
    // carBrand / carModel facultatifs : pas dans `required`.
    if (missing.length) {
      return NextResponse.json(
        { error: `Champs manquants : ${missing.join(", ")}.` },
        { status: 400 },
      );
    }

    // 1. Champs du formulaire -> rendez-vous structuré (sans IA)
    const appt = buildAppointment(body as AppointmentInput);

    // 1b. Anti-chevauchement : refuser si le créneau est déjà occupé.
    if (!(await isSlotFree(appt.startDateTime, SLOT_MIN, undefined, auth.callCenterId))) {
      return NextResponse.json(
        { error: "Ce créneau vient d'être pris. Choisissez-en un autre." },
        { status: 409 },
      );
    }

    // 2. Création de l'événement dans Google Agenda (owner = collaborateur)
    const event = await createEvent(appt, auth.email, auth.callCenterId);

    // 2b. Stoppe une éventuelle séquence de relances en cours pour ce client.
    try { await cancelFollowup(appt.email); } catch { /* non-bloquant */ }

    // 3. Mail de confirmation via Brevo (non-bloquant : si ça échoue,
    //    l'événement reste créé et la requête réussit quand même).
    let emailSent = false;
    let emailError: string | undefined;
    try {
      const base = baseUrlFrom(req);
      const mail = confirmationEmail({
        civility: appt.civility,
        firstName: appt.firstName,
        lastName: appt.lastName,
        startDateTime: appt.startDateTime,
        location: appt.location,
        platform: appt.platform,
        listingUrl: appt.listingUrl,
        whatsappUrl: whatsappUrl(),
        rescheduleUrl: event.id ? rescheduleUrl(base, event.id) : undefined,
      });
      await sendEmail({
        to: appt.email,
        toName: `${appt.firstName} ${appt.lastName}`,
        subject: mail.subject,
        html: mail.html,
        log: { templateKey: "confirmation", clientName: `${appt.firstName} ${appt.lastName}`.trim(), owner: appt.commercial, eventId: event.id ?? undefined },
      });
      emailSent = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Erreur e-mail.";
    }

    // 3b. SMS confirmation (non-bloquant).
    let smsSent = false;
    let smsError: string | undefined;
    try {
      const d = new Date(appt.startDateTime);
      const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);
      const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
      const text = `Simplicicar: RDV confirme ${date} a ${heure} - ${appt.location}. STOP au 36180`;
      await sendSMS({ to: appt.phone, text, log: { templateKey: "sms_confirmation", clientName: `${appt.firstName} ${appt.lastName}`.trim(), owner: appt.commercial, eventId: event.id ?? undefined, toEmail: appt.email } });
      smsSent = true;
    } catch (e) {
      smsError = e instanceof Error ? e.message : "Erreur SMS.";
      console.error("sendSMS failed in /api/appointment", e);
    }

    try {
      await createGoogleContact({
        firstName: appt.firstName,
        lastName: appt.lastName,
        phone: appt.phone,
        email: appt.email,
        note: [appt.platform, appt.listingUrl].filter(Boolean).join(" — "),
      });
    } catch (err) {
      console.error("createGoogleContact failed in /api/appointment", err);
    }

    return NextResponse.json({
      ok: true,
      appointment: appt,
      eventLink: event.htmlLink,
      emailSent,
      emailError,
      smsSent,
      smsError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

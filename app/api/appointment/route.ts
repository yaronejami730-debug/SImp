import { NextResponse } from "next/server";
import { buildAppointment, type AppointmentInput } from "@/lib/parse";
import { createEvent } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { confirmationEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AppointmentInput>;
    const required: (keyof AppointmentInput)[] = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "listingUrl",
      "date",
      "time",
    ];
    const missing = required.filter((k) => !body[k] || !String(body[k]).trim());
    if (missing.length) {
      return NextResponse.json(
        { error: `Champs manquants : ${missing.join(", ")}.` },
        { status: 400 },
      );
    }

    // 1. Champs du formulaire -> rendez-vous structuré (sans IA)
    const appt = buildAppointment(body as AppointmentInput);

    // 2. Création de l'événement dans Google Agenda
    const event = await createEvent(appt);

    // 3. Mail de confirmation via Brevo (non-bloquant : si ça échoue,
    //    l'événement reste créé et la requête réussit quand même).
    let emailSent = false;
    let emailError: string | undefined;
    try {
      const base = baseUrlFrom(req);
      const mail = confirmationEmail({
        firstName: appt.firstName,
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
      });
      emailSent = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Erreur e-mail.";
    }

    return NextResponse.json({
      ok: true,
      appointment: appt,
      eventLink: event.htmlLink,
      emailSent,
      emailError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

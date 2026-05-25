import { NextResponse } from "next/server";
import { buildAppointment, type AppointmentInput } from "@/lib/parse";
import { createEvent } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { confirmationEmail } from "@/lib/email-templates";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AppointmentInput>;
    const required: (keyof AppointmentInput)[] = [
      "firstName",
      "lastName",
      "email",
      "listingUrl",
      "location",
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

    // 3. Mail de confirmation via Brevo
    const mail = confirmationEmail({
      firstName: appt.firstName,
      startDateTime: appt.startDateTime,
      location: appt.location,
      platform: appt.platform,
      listingUrl: appt.listingUrl,
    });
    await sendEmail({
      to: appt.email,
      toName: `${appt.firstName} ${appt.lastName}`,
      subject: mail.subject,
      html: mail.html,
    });

    return NextResponse.json({
      ok: true,
      appointment: appt,
      eventLink: event.htmlLink,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

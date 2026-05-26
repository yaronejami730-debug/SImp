import { NextResponse } from "next/server";
import { getEvent, deleteEvent } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { cancelledEmail } from "@/lib/email-templates";
import { whatsappUrl } from "@/lib/links";
import { getAuth } from "@/lib/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST { eid } -> supprime l'événement Google + mail d'annulation au client. */
export async function POST(req: Request) {
  try {
    if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

    const { eid } = (await req.json()) as { eid?: string };
    if (!eid) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }

    // Récupère les infos client avant suppression.
    let firstName = "";
    let lastName = "";
    let civility = "";
    let email = "";
    let location = "";
    let startDateTime = "";
    try {
      const ev = await getEvent(eid);
      const priv = ev.extendedProperties?.private;
      firstName = priv?.clientFirstName ?? "";
      lastName = priv?.clientLastName ?? "";
      civility = priv?.clientCivility ?? "";
      email = priv?.clientEmail ?? "";
      location = ev.location ?? "";
      startDateTime = ev.start?.dateTime ?? "";
    } catch {
      /* event déjà absent ? on tente quand même la suppression */
    }

    await deleteEvent(eid);

    let emailSent = false;
    if (email && startDateTime) {
      try {
        const mail = cancelledEmail({
          civility,
          firstName,
          lastName,
          startDateTime,
          location,
          whatsappUrl: whatsappUrl(),
        });
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html });
        emailSent = true;
      } catch {
        /* mail non-bloquant */
      }
    }

    return NextResponse.json({ ok: true, emailSent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

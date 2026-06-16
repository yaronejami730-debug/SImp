import { NextResponse } from "next/server";
import { getEvent, updateEvent, isSlotFree } from "@/lib/google";
import { toParisISO } from "@/lib/parse";
import { SLOT_MIN } from "@/lib/slots";
import { sendEmail } from "@/lib/brevo";
import { rescheduledEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** GET ?eid=... -> infos du rendez-vous (pour pré-remplir la page). */
export async function GET(req: Request) {
  const eid = new URL(req.url).searchParams.get("eid");
  if (!eid) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });

  try {
    const ev = await getEvent(eid);
    const priv = ev.extendedProperties?.private;
    return NextResponse.json({
      ok: true,
      firstName: priv?.clientFirstName ?? "",
      startDateTime: ev.start?.dateTime ?? null,
      location: ev.location ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Rendez-vous introuvable." }, { status: 404 });
  }
}

/** POST { eid, date, time } -> déplace l'événement Google + mail de confirmation. */
export async function POST(req: Request) {
  try {
    const { eid, date, time } = (await req.json()) as {
      eid?: string;
      date?: string;
      time?: string;
    };
    if (!eid || !date || !time) {
      return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
    }

    const newStart = toParisISO(date, time);

    // Anti-chevauchement (en ignorant le RDV lui-même).
    if (!(await isSlotFree(newStart, SLOT_MIN, eid))) {
      return NextResponse.json(
        { error: "Ce créneau est déjà pris. Choisissez-en un autre." },
        { status: 409 },
      );
    }

    const ev = await updateEvent(eid, newStart);

    const priv = ev.extendedProperties?.private;
    const email = priv?.clientEmail;
    const firstName = priv?.clientFirstName ?? "";

    let emailSent = false;
    if (email) {
      try {
        const base = baseUrlFrom(req);
        const mail = rescheduledEmail({
          civility: priv?.clientCivility,
          firstName,
          lastName: priv?.clientLastName,
          startDateTime: newStart,
          location: ev.location ?? "",
          platform: priv?.platform ?? "",
          listingUrl: priv?.listingUrl ?? "",
          whatsappUrl: whatsappUrl(),
          rescheduleUrl: rescheduleUrl(base, eid),
        });
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html, log: { templateKey: "rescheduled", clientName: `${firstName} ${priv?.clientLastName ?? ""}`.trim(), owner: priv?.owner, eventId: eid, origin: "manual" } });
        emailSent = true;
      } catch {
        /* mail non-bloquant */
      }
    }

    return NextResponse.json({ ok: true, startDateTime: newStart, emailSent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

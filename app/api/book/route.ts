import { NextResponse } from "next/server";
import { verifyBooking } from "@/lib/auth";
import { buildAppointment, platformFromUrl } from "@/lib/parse";
import { createEvent, isSlotFree } from "@/lib/google";
import { SLOT_MIN } from "@/lib/slots";
import { sendEmail } from "@/lib/brevo";
import { confirmationEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";
import { cancelFollowup } from "@/lib/followups";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** GET ?t= -> valide le lien et renvoie la plateforme (aperçu) + civilité pré-remplie. */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const p = verifyBooking(t);
  if (!p) return NextResponse.json({ ok: false, error: "Lien invalide ou expiré." }, { status: 400 });
  return NextResponse.json({ ok: true, platform: platformFromUrl(p.listingUrl), civility: p.civility ?? "" });
}

/** POST { t, civility, firstName, lastName, phone, date, time } -> crée le RDV (client). Public. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      t?: string; civility?: string; firstName?: string; lastName?: string; phone?: string; date?: string; time?: string;
    };
    const p = body.t ? verifyBooking(body.t) : null;
    if (!p) return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 400 });

    for (const k of ["firstName", "lastName", "phone", "date", "time"] as const) {
      if (!body[k]?.toString().trim()) return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
    }

    const appt = buildAppointment({
      civility: body.civility || p.civility || "",
      firstName: body.firstName!,
      lastName: body.lastName!,
      email: p.email,
      phone: body.phone!,
      listingUrl: p.listingUrl,
      date: body.date!,
      time: body.time!,
    });

    if (!(await isSlotFree(appt.startDateTime, SLOT_MIN))) {
      return NextResponse.json({ error: "Ce créneau vient d'être pris. Choisissez-en un autre." }, { status: 409 });
    }

    const event = await createEvent(appt, p.owner);
    try { await cancelFollowup(appt.email); } catch { /* non-bloquant */ }

    let emailSent = false;
    try {
      const base = baseUrlFrom(req);
      const mail = confirmationEmail({
        civility: appt.civility, firstName: appt.firstName, lastName: appt.lastName,
        startDateTime: appt.startDateTime, location: appt.location,
        whatsappUrl: whatsappUrl(),
        rescheduleUrl: event.id ? rescheduleUrl(base, event.id) : undefined,
      });
      await sendEmail({ to: appt.email, toName: `${appt.firstName} ${appt.lastName}`, subject: mail.subject, html: mail.html });
      emailSent = true;
    } catch { /* mail non-bloquant */ }

    return NextResponse.json({ ok: true, startDateTime: appt.startDateTime, emailSent });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

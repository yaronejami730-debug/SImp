import { NextResponse } from "next/server";
import { getAuth, signBooking } from "@/lib/auth";
import { baseUrlFrom } from "@/lib/links";
import { sendEmail } from "@/lib/brevo";
import { sendSMS } from "@/lib/allmysms";
import { bookingInviteEmail, bookingConfirmInviteEmail } from "@/lib/email-templates";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** POST { email?, phone?, civility?, listingUrl?, source?, carBrand?, carModel?, carFinish?, date?, time? }
 *  -> génère un lien de réservation + envoie mail (si email) et/ou SMS (si phone).
 *  Si date+time fournis = créneau imposé (le client ne saisit que son identité). */
export async function POST(req: Request) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const b = (await req.json()) as {
      email?: string; phone?: string; civility?: string; listingUrl?: string; source?: string; commercial?: string;
      carBrand?: string; carModel?: string; carFinish?: string; date?: string; time?: string;
    };
    const email = b.email?.trim();
    const phone = b.phone?.trim();
    if (!email && !phone) {
      return NextResponse.json({ error: "Renseigne au moins un e-mail ou un téléphone." }, { status: 400 });
    }

    const token = signBooking({
      owner: auth.email,
      callCenterId: auth.callCenterId,
      email: email || undefined,
      civility: b.civility,
      listingUrl: b.listingUrl?.trim() || undefined,
      source: b.source?.trim() || undefined,
      commercial: b.commercial?.trim() || undefined,
      carBrand: b.carBrand?.trim() || undefined,
      carModel: b.carModel?.trim() || undefined,
      carFinish: b.carFinish?.trim() || undefined,
      date: b.date?.trim() || undefined,
      time: b.time?.trim() || undefined,
    });
    const bookUrl = `${baseUrlFrom(req)}/book?t=${encodeURIComponent(token)}`;
    const fixedSlot = !!(b.date && b.time);
    const tplKey = fixedSlot ? "booking_confirm" : "booking_invite";

    let emailSent = false;
    if (email) {
      try {
        const mail = fixedSlot ? bookingConfirmInviteEmail({ bookUrl }) : bookingInviteEmail({ bookUrl });
        await sendEmail({ to: email, subject: mail.subject, html: mail.html, log: { templateKey: tplKey, owner: auth.email, origin: "manual" } });
        emailSent = true;
      } catch { /* mail non-bloquant */ }
    }

    let smsSent = false;
    if (phone) {
      try {
        const text = fixedSlot
          ? `Simplicicar: suite a notre echange, merci de confirmer votre RDV en remplissant vos infos ici: ${bookUrl} STOP au 36180`
          : `Simplicicar: choisissez votre creneau pour le rendez-vous ici: ${bookUrl} STOP au 36180`;
        await sendSMS({ to: phone, text, log: { templateKey: tplKey, owner: auth.email, toEmail: email || undefined, origin: "manual" } });
        smsSent = true;
      } catch { /* SMS non-bloquant */ }
    }

    return NextResponse.json({ ok: true, bookUrl, emailSent, smsSent });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

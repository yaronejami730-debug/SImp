import { NextResponse } from "next/server";
import { getAuth, signBooking } from "@/lib/auth";
import { baseUrlFrom } from "@/lib/links";
import { sendEmail } from "@/lib/brevo";
import { sendSMS } from "@/lib/allmysms";
import { bookingInviteEmail } from "@/lib/email-templates";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** POST { email, listingUrl, civility?, phone? } -> lien de réservation client + envoi du mail (et SMS si phone). */
export async function POST(req: Request) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const { email, listingUrl, civility, phone } = (await req.json()) as {
      email?: string; listingUrl?: string; civility?: string; phone?: string;
    };
    if (!email?.trim() || !listingUrl?.trim()) {
      return NextResponse.json({ error: "Email et lien requis." }, { status: 400 });
    }

    const token = signBooking({ email: email.trim(), listingUrl: listingUrl.trim(), owner: auth.email, civility });
    const bookUrl = `${baseUrlFrom(req)}/book?t=${encodeURIComponent(token)}`;

    let emailSent = false;
    try {
      const mail = bookingInviteEmail({ bookUrl });
      await sendEmail({ to: email.trim(), subject: mail.subject, html: mail.html });
      emailSent = true;
    } catch { /* mail non-bloquant, le lien reste utilisable */ }

    let smsSent = false;
    if (phone?.trim()) {
      try {
        await sendSMS({
          to: phone.trim(),
          text: `Simplicicar: choisissez votre creneau pour le rendez-vous ici: ${bookUrl} STOP au 36180`,
        });
        smsSent = true;
      } catch { /* SMS non-bloquant */ }
    }

    return NextResponse.json({ ok: true, bookUrl, emailSent, smsSent });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

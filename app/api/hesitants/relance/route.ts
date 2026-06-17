import { NextResponse } from "next/server";
import { getAuth, signBooking } from "@/lib/auth";
import { baseUrlFrom } from "@/lib/links";
import { sendEmail } from "@/lib/brevo";
import { bookingInviteEmail } from "@/lib/email-templates";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** POST { email } -> renvoie l'invitation "choisissez votre créneau" (relance manuelle). */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email?.trim()) return NextResponse.json({ error: "E-mail manquant." }, { status: 400 });

    const token = signBooking({ owner: s.email, email: email.trim() });
    const bookUrl = `${baseUrlFrom(req)}/book?t=${encodeURIComponent(token)}`;
    const mail = bookingInviteEmail({ bookUrl });
    await sendEmail({ to: email.trim(), subject: mail.subject, html: mail.html, log: { templateKey: "booking_invite", owner: s.email, origin: "manual" } });

    return NextResponse.json({ ok: true, message: `Relance envoyée à ${email}.` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

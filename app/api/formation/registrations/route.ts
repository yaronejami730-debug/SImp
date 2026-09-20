import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listRegistrations, createRegistration, markRegistrationEmailSent, cancelRegistration, getSettings } from "@/lib/formation";
import { sendEmail } from "@/lib/brevo";
import { formationConfirmationEmail } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

/** GET ?slotId= -> inscriptions d'un créneau. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const slotId = Number(new URL(req.url).searchParams.get("slotId") || 0);
  if (!slotId) return NextResponse.json({ error: "slotId requis." }, { status: 400 });
  return NextResponse.json({ ok: true, registrations: await listRegistrations(slotId) });
}

/** POST { slotId, firstName, lastName, email } -> inscrit quelqu'un. N'envoie la confirmation
 *  RÉELLE que si l'envoi automatique est activé dans les réglages — sinon la ligne est créée
 *  mais rien ne part (à envoyer plus tard, ou juste tracé). */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  try {
    const { slotId, firstName, lastName, email } = (await req.json()) as { slotId?: number; firstName?: string; lastName?: string; email?: string };
    if (!slotId || !firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "slotId, firstName, lastName, email requis." }, { status: 400 });
    }
    const result = await createRegistration({ slotId, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), createdBy: s.email });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

    const settings = await getSettings();
    let emailSent = false;
    if (settings.autoSendEnabled) {
      const mail = formationConfirmationEmail({
        firstName: result.registration.firstName,
        date: result.slot.date, startTime: result.slot.startTime, endTime: result.slot.endTime,
        type: result.slot.type, partnerName: result.slot.partnerName,
        programme: settings.programme.map((p) => p.title),
      });
      await sendEmail({
        to: result.registration.email, toName: result.registration.firstName, subject: mail.subject, html: mail.html,
        log: { templateKey: "formation_confirmation", clientName: `${result.registration.firstName} ${result.registration.lastName}`, origin: "manual" },
      });
      await markRegistrationEmailSent(result.registration.id);
      emailSent = true;
    }
    return NextResponse.json({ ok: true, registration: result.registration, emailSent });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> annule une inscription (libère la place). */
export async function DELETE(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
  await cancelRegistration(id);
  return NextResponse.json({ ok: true });
}

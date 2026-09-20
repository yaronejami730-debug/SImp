import { NextResponse } from "next/server";
import { getRegistration, getSlot, moveRegistration, listSlots, setCalendarEventId, markRegistrationEmailSent, getSettings, type Slot } from "@/lib/formation";
import { sendEmail } from "@/lib/brevo";
import { formationConfirmationEmail } from "@/lib/email-templates";
import { createFormationEvent, deleteEvent } from "@/lib/google";
import { baseUrlFrom, formationRescheduleUrl } from "@/lib/links";

export const dynamic = "force-dynamic";

const slotISO = (slot: Slot, time: string) => `${slot.date}T${time}:00`;

/** GET ?rid= -> l'inscription (public, lien non signé — même principe que /api/reschedule
 *  pour les RDV, voir lib/links.ts rescheduleUrl) + les créneaux disponibles pour se reprogrammer. */
export async function GET(req: Request) {
  const rid = Number(new URL(req.url).searchParams.get("rid") || 0);
  if (!rid) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  const registration = await getRegistration(rid);
  if (!registration || registration.status !== "inscrit") return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 });
  const currentSlot = await getSlot(registration.slotId);

  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const all = await listSlots(today, in60);
  const available = all.filter((s) => s.active && s.id !== registration.slotId && s.registered < s.capacity);

  return NextResponse.json({
    ok: true,
    registration: { firstName: registration.firstName, lastName: registration.lastName },
    currentSlot,
    slots: available,
  });
}

/** POST { rid, newSlotId } -> déplace l'inscription, recrée l'event Google Agenda au nouvel
 *  horaire, renvoie TOUJOURS une confirmation par e-mail (indépendant du toggle : la personne
 *  a explicitement demandé le changement). */
export async function POST(req: Request) {
  try {
    const { rid, newSlotId } = (await req.json()) as { rid?: number; newSlotId?: number };
    if (!rid || !newSlotId) return NextResponse.json({ error: "rid et newSlotId requis." }, { status: 400 });

    const before = await getRegistration(rid);
    if (!before) return NextResponse.json({ error: "Inscription introuvable." }, { status: 404 });
    const oldEventId = before.calendarEventId;

    const result = await moveRegistration(rid, newSlotId);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

    if (oldEventId) await deleteEvent(oldEventId).catch(() => {});
    try {
      const eventId = await createFormationEvent({
        firstName: result.registration.firstName, lastName: result.registration.lastName, email: result.registration.email,
        startISO: slotISO(result.slot, result.slot.startTime), endISO: slotISO(result.slot, result.slot.endTime),
        partnerName: result.slot.partnerName, type: result.slot.type, registrationId: result.registration.id,
      });
      if (eventId) await setCalendarEventId(result.registration.id, eventId);
    } catch { /* la sync agenda ne doit jamais faire échouer la reprogrammation */ }

    const settings = await getSettings();
    const mail = formationConfirmationEmail({
      firstName: result.registration.firstName,
      date: result.slot.date, startTime: result.slot.startTime, endTime: result.slot.endTime,
      type: result.slot.type, partnerName: result.slot.partnerName,
      programme: settings.programme.map((p) => p.title),
      rescheduleUrl: formationRescheduleUrl(baseUrlFrom(req), result.registration.id),
    });
    await sendEmail({
      to: result.registration.email, toName: result.registration.firstName, subject: `Formation reprogrammée — ${mail.subject}`, html: mail.html,
      senderName: "YJ Solutions",
      log: { templateKey: "formation_confirmation", clientName: `${result.registration.firstName} ${result.registration.lastName}`, origin: "manual" },
    });
    await markRegistrationEmailSent(result.registration.id);

    return NextResponse.json({ ok: true, slot: result.slot });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { addReminder, listReminders, updateReminderStatus, incrementNrp, deleteReminder, setReminderEventId, getReminderEventId } from "@/lib/reminders";
import { createReminderEvent, deleteEvent, createGoogleContact } from "@/lib/google";
import { sendSMS } from "@/lib/allmysms";
import { getAuth } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET -> liste des rappels (admin = tous, collab = les siens). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const reminders = s.role === "admin"
      ? await listReminders(s.callCenterId)
      : await listReminders(s.callCenterId, s.email);
    return NextResponse.json({ ok: true, reminders });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { firstName, lastName, phone, listingUrl?, note?, remindAt, leadId? } -> crée un rappel. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const body = (await req.json()) as {
      firstName?: string;
      lastName?: string;
      phone?: string;
      listingUrl?: string;
      note?: string;
      remindAt?: string;
      leadId?: number;
      clientEmail?: string;
    };
    if (!body.phone?.trim() || !body.remindAt) {
      return NextResponse.json({ error: "Téléphone et date/heure requis." }, { status: 400 });
    }
    const reminder = await addReminder({
      firstName: body.firstName || "",
      lastName: body.lastName || "",
      phone: body.phone,
      listingUrl: body.listingUrl,
      note: body.note,
      remindAt: body.remindAt,
      owner: s.email,
      leadId: body.leadId ?? null,
      clientEmail: body.clientEmail,
      callCenterId: s.callCenterId,
    });
    // Pousser l'événement dans Google Agenda — n'empêche pas la création du rappel si KO.
    try {
      const eventId = await createReminderEvent({
        firstName: reminder.first_name,
        lastName: reminder.last_name,
        phone: reminder.phone,
        listingUrl: reminder.listing_url,
        note: reminder.note,
        remindAt: reminder.remind_at,
        owner: reminder.owner,
        clientEmail: reminder.client_email,
      });
      if (eventId) {
        await setReminderEventId(reminder.id, eventId);
        reminder.event_id = eventId;
      }
    } catch (err) {
      console.error("createReminderEvent failed", err);
    }
    // Crée aussi un contact Google (People API). Best-effort, ne bloque pas.
    try {
      if (reminder.first_name || reminder.last_name || reminder.client_email) {
        await createGoogleContact({
          firstName: reminder.first_name,
          lastName: reminder.last_name,
          phone: reminder.phone,
          email: reminder.client_email,
          note: reminder.note || (reminder.listing_url ? `Annonce : ${ reminder.listing_url }` : ""),
        });
      }
    } catch (err) {
      console.error("createGoogleContact failed (vérifie le scope `contacts` du refresh token)", err);
    }
    // SMS confirmation du rappel au client (non-bloquant).
    let smsSent = false;
    let smsError: string | undefined;
    try {
      const d = new Date(reminder.remind_at);
      const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);
      const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
      const text = `Simplicicar: votre rappel est confirme ${ date } a ${ heure }.On vous appelle.STOP au 36180`;
      await sendSMS({ to: reminder.phone, text, log: { templateKey: "sms_rappel_confirm", clientName: `${ reminder.first_name } ${ reminder.last_name ?? "" }`.trim(), owner: reminder.owner, toEmail: reminder.client_email } });
      smsSent = true;
    } catch (err) {
      smsError = err instanceof Error ? err.message : "Erreur SMS.";
      console.error("sendSMS failed in /api/reminders", err);
    }
    return NextResponse.json({ ok: true, reminder, smsSent, smsError });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** PATCH { id, status } -> met à jour le statut d'un rappel. */
export async function PATCH(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const { id, status } = (await req.json()) as { id?: number; status?: string };
    if (!id || !status || !["pending", "done", "skipped", "nrp"].includes(status)) {
      return NextResponse.json({ error: "id et status (pending/done/skipped/nrp) requis." }, { status: 400 });
    }
    if (status === "nrp") {
      const nrpCount = await incrementNrp(id);
      return NextResponse.json({ ok: true, nrpCount });
    }
    await updateReminderStatus(id, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> supprime un rappel. */
export async function DELETE(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });

  try {
    const eventId = await getReminderEventId(id);
    await deleteReminder(id);
    if (eventId) {
      try { await deleteEvent(eventId); } catch (err) { console.error("deleteEvent failed", err); }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

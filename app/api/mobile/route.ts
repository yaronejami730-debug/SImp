import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { createMobileAppt, listMobileAppts, isMobileSlotFree, type MobileStatus } from "@/lib/mobile";
import { toParisISO } from "@/lib/parse";
import { sendEmail } from "@/lib/brevo";
import { sendSMS } from "@/lib/allmysms";
import { mobileConfirmationEmail } from "@/lib/email-templates";
import { commercialPhoneStrict } from "@/lib/commerciaux";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET ?status= -> liste des RDV déplacement. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const status = new URL(req.url).searchParams.get("status") as MobileStatus | null;
  try {
    const appts = await listMobileAppts(status ? { status } : undefined);
    return NextResponse.json({ ok: true, appointments: appts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> crée un RDV déplacement (+ sync Google bonami). */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as {
      civility?: string; firstName?: string; lastName?: string; email?: string; phone?: string;
      carBrand?: string; carModel?: string; immatriculation?: string; address?: string;
      date?: string; time?: string; notes?: string; commercial?: string; status?: MobileStatus;
    };
    if (!b.firstName?.trim() || !b.date || !b.time) {
      return NextResponse.json({ error: "Prénom, date et heure requis." }, { status: 400 });
    }
    const startDateTime = toParisISO(b.date, b.time);
    if (!(await isMobileSlotFree(startDateTime))) {
      return NextResponse.json({ error: "Ce créneau déplacement est déjà pris." }, { status: 409 });
    }
    const appt = await createMobileAppt({
      teleprospecteur: s.email,
      commercial: b.commercial || "Jeremy Bonamy",
      civility: b.civility, firstName: b.firstName, lastName: b.lastName, email: b.email, phone: b.phone,
      carBrand: b.carBrand, carModel: b.carModel, immatriculation: b.immatriculation, address: b.address,
      startDateTime, notes: b.notes, status: b.status,
    });
    // Confirmation client (mail + SMS), best-effort.
    const clientName = `${appt.first_name} ${appt.last_name}`.trim();
    const phone = commercialPhoneStrict(appt.commercial);
    if (appt.email) {
      try {
        const mail = mobileConfirmationEmail({ civility: appt.civility, firstName: appt.first_name, lastName: appt.last_name, startDateTime: appt.start_datetime, address: appt.address, conseiller: appt.commercial, phone });
        await sendEmail({ to: appt.email, toName: appt.first_name, subject: mail.subject, html: mail.html, log: { templateKey: "mobile_confirmation", clientName, owner: s.email, origin: "manual" } });
      } catch { /* non-bloquant */ }
    }
    if (appt.phone) {
      try {
        const d = new Date(appt.start_datetime);
        const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);
        const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
        const text = `Simplicicar: RDV a domicile confirme ${date} a ${heure}, a votre adresse. Conseiller M. ${appt.commercial}. STOP au 36180`;
        await sendSMS({ to: appt.phone, text, log: { templateKey: "sms_mobile_confirmation", clientName, owner: s.email, toEmail: appt.email, origin: "manual" } });
      } catch { /* non-bloquant */ }
    }

    return NextResponse.json({ ok: true, appointment: appt, synced: !!(appt.google_event_id || appt.google_event_id_own) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

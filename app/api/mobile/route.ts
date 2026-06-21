import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { createMobileAppt, listMobileApptsForEntities, listMobileApptsAssignedTo, isMobileSlotFree, type MobileStatus } from "@/lib/mobile";
import { descendantEntityIds } from "@/lib/call-centers";
import { commercialConflict } from "@/lib/google";
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
    // Hiérarchie : un admin voit son entité + ses sous-entités. Plus les RDV affectés à
    // l'utilisateur dans une AUTRE entité (commercial cross-entité), dédupliqués.
    const entityIds = s.role === "admin" ? await descendantEntityIds(s.callCenterId) : [s.callCenterId];
    const opt = status ? { status } : undefined;
    const [inEntity, assignedToMe] = await Promise.all([
      listMobileApptsForEntities(entityIds, opt),
      listMobileApptsAssignedTo(s.email, status ? { status } : undefined),
    ]);
    const byId = new Map<number, typeof inEntity[number]>();
    for (const a of [...inEntity, ...assignedToMe]) byId.set(a.id, a);
    const all = Array.from(byId.values()).sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
    const norm = (x: string) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
    const myName = norm(s.name);
    const myEmail = s.email.toLowerCase();
    const isCreator = (a: typeof all[number]) => a.teleprospecteur === s.email;
    // Affecté : lien robuste par e-mail du compte commercial ; fallback nom pour les anciens RDV.
    const isAssignee = (a: typeof all[number]) =>
      (!!a.commercial_email && a.commercial_email.toLowerCase() === myEmail) ||
      (!a.commercial_email && !!myName && norm(a.commercial) === myName);
    // Un RDV est visible par son CRÉATEUR (téléprospecteur) ET par l'AFFECTÉ (commercial). Admin : toute l'entité.
    const list = s.role === "admin" ? all : all.filter((a) => isCreator(a) || isAssignee(a));
    // Annotation de la relation pour l'affichage ("créé pour X" / "intervention à réaliser").
    const appts = list.map((a) => {
      const created = isCreator(a);
      const assigned = isAssignee(a);
      const relation: "created" | "assigned" | "both" | "none" =
        created && assigned ? "both" : created ? "created" : assigned ? "assigned" : "none";
      return { ...a, relation };
    });
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
    if (!(await isMobileSlotFree(s.callCenterId, startDateTime))) {
      return NextResponse.json({ error: "Ce créneau déplacement est déjà pris." }, { status: 409 });
    }
    // Alerte (NON bloquante) : le commercial a déjà un RDV à ce moment.
    const commercial = b.commercial || "Jeremy Bonamy";
    const conflict = await commercialConflict(commercial, startDateTime, true);
    const warning = conflict
      ? `⚠️ ${commercial} a déjà un RDV ${conflict.deplacement ? "en déplacement" : "physique"} à ce moment${conflict.ref ? ` (${conflict.ref})` : ""}. Pense au temps de RDV + ~20 min de trajet.`
      : undefined;
    const appt = await createMobileAppt({
      callCenterId: s.callCenterId,
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

    return NextResponse.json({ ok: true, appointment: appt, synced: !!(appt.google_event_id || appt.google_event_id_own), warning });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

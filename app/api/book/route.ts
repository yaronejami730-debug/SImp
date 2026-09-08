import { NextResponse } from "next/server";
import { verifyBooking } from "@/lib/auth";
import { buildAppointment } from "@/lib/parse";
import { commercialEmailByName } from "@/lib/users";
import { activeDelegate } from "@/lib/availability";
import { isFrenchMobile } from "@/lib/parse";
import { createEvent, isSlotFree, commercialConflict, halfDayModalityBlocked } from "@/lib/google";
import { SLOT_MIN } from "@/lib/slots";
import { sendEmail } from "@/lib/brevo";
import { confirmationEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";
import { cancelFollowup } from "@/lib/followups";
import { themeForCallCenter } from "@/lib/callcenters";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** GET ?t= -> valide le lien + renvoie ce que le client doit voir (jamais le commercial/source/lien). */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const p = verifyBooking(t);
  if (!p) return NextResponse.json({ ok: false, error: "Lien invalide ou expiré." }, { status: 400 });
  const vehicle = [p.carBrand, p.carModel, p.carFinish].filter(Boolean).join(" ");
  const theme = await themeForCallCenter(p.callCenterId ?? 1).catch(() => null);
  return NextResponse.json({
    ok: true,
    civility: p.civility ?? "",
    vehicle,                       // affiché au client (read-only) si pré-rempli
    fixedSlot: !!(p.date && p.time), // créneau imposé par le commercial
    date: p.date ?? "",
    time: p.time ?? "",
    needEmail: !p.email,           // le client doit saisir son e-mail si non pré-rempli
    theme,                          // logo/couleurs de l'agence du commercial qui a envoyé le lien
  });
}

/** POST { t, civility, firstName, lastName, phone, email?, date?, time? } -> crée le RDV. Public.
 *  email/date/time peuvent venir du token (pré-rempli commercial) ou du formulaire client. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      t?: string; civility?: string; firstName?: string; lastName?: string; phone?: string; email?: string; date?: string; time?: string;
    };
    const p = body.t ? verifyBooking(body.t) : null;
    if (!p) return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 400 });

    const email = (p.email || body.email || "").trim();
    const date = (p.date || body.date || "").trim();
    const time = (p.time || body.time || "").trim();

    if (!body.firstName?.trim() || !body.lastName?.trim() || !body.phone?.trim() || !email || !date || !time) {
      return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
    }
    if (!isFrenchMobile(body.phone)) {
      return NextResponse.json({ error: "Numéro invalide : merci d'indiquer un mobile en 06 ou 07." }, { status: 400 });
    }

    const appt = buildAppointment({
      civility: body.civility || p.civility || "",
      firstName: body.firstName,
      lastName: body.lastName,
      email,
      phone: body.phone,
      listingUrl: p.listingUrl,
      source: p.source,
      commercial: p.commercial, // reste le commercial titulaire : la commission ne bouge pas
      carBrand: p.carBrand,
      carModel: p.carModel,
      carFinish: p.carFinish,
      date,
      time,
    });

    // Délégation temporaire (ex : vacances) : à cette date, un autre commercial opère —
    // on vérifie SA disponibilité réelle (c'est lui qui est occupé), le RDV reste au nom du titulaire.
    let execName = appt.commercial;
    if (execName) {
      const ownerEmail = await commercialEmailByName(execName);
      const delegate = ownerEmail ? await activeDelegate(ownerEmail, date) : null;
      if (delegate) { execName = delegate.name; appt.operatedBy = delegate.name; }
    }

    // Créneaux par commercial : bloque seulement si CE commercial (celui qui opère) est déjà pris à ce moment.
    const isDep = appt.type === "deplacement";
    if (execName) {
      const conflict = await commercialConflict(execName, appt.startDateTime, isDep);
      if (conflict) return NextResponse.json({ error: "Ce créneau vient d'être pris. Choisissez-en un autre." }, { status: 409 });
      if (await halfDayModalityBlocked(execName, appt.startDateTime, isDep)) {
        return NextResponse.json({ error: "Ce créneau n'est plus disponible. Choisissez-en un autre." }, { status: 409 });
      }
    } else if (!(await isSlotFree(appt.startDateTime, SLOT_MIN, undefined, p.callCenterId ?? 1))) {
      return NextResponse.json({ error: "Ce créneau vient d'être pris. Choisissez-en un autre." }, { status: 409 });
    }

    const event = await createEvent(appt, p.owner, p.callCenterId ?? 1);
    try { await cancelFollowup(appt.email); } catch { /* non-bloquant */ }

    let emailSent = false;
    try {
      const base = baseUrlFrom(req);
      const theme = await themeForCallCenter(p.callCenterId ?? 1).catch(() => null);
      const mail = confirmationEmail({
        civility: appt.civility, firstName: appt.firstName, lastName: appt.lastName,
        startDateTime: appt.startDateTime, location: appt.location,
        whatsappUrl: whatsappUrl(),
        rescheduleUrl: event.id ? rescheduleUrl(base, event.id) : undefined,
        theme: theme ? { name: theme.name, logo: theme.logo } : undefined,
      });
      await sendEmail({ to: appt.email, toName: `${appt.firstName} ${appt.lastName}`, subject: mail.subject, html: mail.html, log: { templateKey: "confirmation", clientName: `${appt.firstName} ${appt.lastName}`.trim(), owner: p.owner, eventId: event.id ?? undefined } });
      emailSent = true;
    } catch { /* mail non-bloquant */ }

    return NextResponse.json({ ok: true, startDateTime: appt.startDateTime, emailSent });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

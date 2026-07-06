import { NextResponse } from "next/server";
import { buildAppointment, type AppointmentInput } from "@/lib/parse";
import { createEvent, createGoogleContact, commercialConflict, halfDayModalityBlocked } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { sendSMS } from "@/lib/allmysms";
import { confirmationEmail, mobileConfirmationEmail } from "@/lib/email-templates";
import { whatsappUrl, baseUrlFrom, rescheduleUrl } from "@/lib/links";
import { getAuth } from "@/lib/auth";
import { teleproRule, commercialAllowed } from "@/lib/telepro-rules";
import { cancelFollowup } from "@/lib/followups";
import { commercialPhoneByName } from "@/lib/users";
import { DEFAULT_LOCATION } from "@/lib/parse";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = getAuth(req);
    if (!auth) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

    const body = (await req.json()) as Partial<AppointmentInput>;
    const required: (keyof AppointmentInput)[] = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "date",
      "time",
    ];
    const missing = required.filter((k) => !body[k] || !String(body[k]).trim());
    // carBrand / carModel facultatifs : pas dans `required`.
    if (missing.length) {
      return NextResponse.json(
        { error: `Champs manquants : ${missing.join(", ")}.` },
        { status: 400 },
      );
    }

    // Téléprospecteur par défaut = l'utilisateur connecté (créateur du RDV).
    if (!body.teleprospectorEmail) body.teleprospectorEmail = auth.email;
    if (!body.teleprospector) body.teleprospector = auth.name;

    // 1. Champs du formulaire -> rendez-vous structuré (sans IA)
    const appt = buildAppointment(body as AppointmentInput);

    // 1a. Restriction du téléprospecteur (commerciaux autorisés + agence only).
    const rule = teleproRule(body.teleprospectorEmail);
    if (rule) {
      if (rule.agenceOnly && appt.type === "deplacement") {
        return NextResponse.json({ error: "Ce téléprospecteur ne peut prendre que des RDV en agence." }, { status: 403 });
      }
      if (appt.commercial && !commercialAllowed(rule, appt.commercial)) {
        return NextResponse.json({ error: `Ce téléprospecteur ne peut assigner qu'à : ${rule.commercials.join(", ")}.` }, { status: 403 });
      }
    }

    // 1b. Créneaux PAR COMMERCIAL : deux commerciaux peuvent avoir le même horaire.
    //     On bloque seulement si CE commercial est déjà pris à ce moment (+ marge trajet),
    //     ou si sa demi-journée est déjà dédiée à l'autre modalité (physique vs déplacement).
    const isDeplacementReq = appt.type === "deplacement";
    let commercialWarning: string | undefined;
    if (appt.commercial) {
      const conflict = await commercialConflict(appt.commercial, appt.startDateTime, isDeplacementReq);
      if (conflict) {
        return NextResponse.json(
          { error: `${appt.commercial} a déjà un RDV ${conflict.deplacement ? "en déplacement" : "physique"} à ce moment${conflict.ref ? ` (${conflict.ref})` : ""}. Choisis un autre créneau.` },
          { status: 409 },
        );
      }
      if (await halfDayModalityBlocked(appt.commercial, appt.startDateTime, isDeplacementReq)) {
        return NextResponse.json(
          { error: `${appt.commercial} a déjà des RDV ${isDeplacementReq ? "physiques" : "en déplacement"} sur cette demi-journée : les ${isDeplacementReq ? "déplacements" : "RDV en agence"} ne sont possibles que sur l'autre demi-journée.` },
          { status: 409 },
        );
      }
    }

    // 2. Création de l'événement dans Google Agenda (owner = collaborateur)
    const event = await createEvent(appt, auth.email, auth.callCenterId);

    // 2b. Stoppe une éventuelle séquence de relances en cours pour ce client.
    try { await cancelFollowup(appt.email); } catch { /* non-bloquant */ }

    // Téléphone du commercial (depuis la base — aucun numéro codé en dur).
    const commPhone = await commercialPhoneByName(appt.commercial);
    const isDeplacement = appt.type === "deplacement";

    // 3. Mail de confirmation PAR TYPE (non-bloquant).
    let emailSent = false;
    let emailError: string | undefined;
    try {
      const base = baseUrlFrom(req);
      const mail = isDeplacement
        ? mobileConfirmationEmail({
            civility: appt.civility, firstName: appt.firstName, lastName: appt.lastName,
            startDateTime: appt.startDateTime, address: appt.location,
            conseiller: appt.commercial, phone: commPhone,
          })
        : confirmationEmail({
            civility: appt.civility, firstName: appt.firstName, lastName: appt.lastName,
            startDateTime: appt.startDateTime, location: appt.location,
            platform: appt.platform, listingUrl: appt.listingUrl, whatsappUrl: whatsappUrl(),
            rescheduleUrl: event.id ? rescheduleUrl(base, event.id) : undefined,
            commercial: appt.commercial, phone: commPhone,
          });
      await sendEmail({
        to: appt.email,
        toName: `${appt.firstName} ${appt.lastName}`,
        subject: mail.subject,
        html: mail.html,
        log: { templateKey: isDeplacement ? "mobile_confirmation" : "confirmation", clientName: `${appt.firstName} ${appt.lastName}`.trim(), owner: appt.commercial, eventId: event.id ?? undefined },
      });
      emailSent = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Erreur e-mail.";
    }

    // 3b. SMS confirmation PAR TYPE (non-bloquant). Inclut le commercial + son tél.
    let smsSent = false;
    let smsError: string | undefined;
    try {
      const d = new Date(appt.startDateTime);
      const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);
      const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
      const conseiller = appt.commercial ? ` Conseiller M. ${appt.commercial}${commPhone ? ` (${commPhone})` : ""}.` : "";
      const text = isDeplacement
        ? `Simplicicar: RDV a domicile confirme ${date} a ${heure}, a votre adresse.${conseiller} STOP au 36180`
        : `Simplicicar: RDV confirme ${date} a ${heure} - ${appt.location || DEFAULT_LOCATION}.${conseiller} STOP au 36180`;
      await sendSMS({ to: appt.phone, text, log: { templateKey: isDeplacement ? "sms_mobile_confirmation" : "sms_confirmation", clientName: `${appt.firstName} ${appt.lastName}`.trim(), owner: appt.commercial, eventId: event.id ?? undefined, toEmail: appt.email } });
      smsSent = true;
    } catch (e) {
      smsError = e instanceof Error ? e.message : "Erreur SMS.";
      console.error("sendSMS failed in /api/appointment", e);
    }

    try {
      await createGoogleContact({
        firstName: appt.firstName,
        lastName: appt.lastName,
        phone: appt.phone,
        email: appt.email,
        note: [appt.platform, appt.listingUrl].filter(Boolean).join(" — "),
      });
    } catch (err) {
      console.error("createGoogleContact failed in /api/appointment", err);
    }

    return NextResponse.json({
      ok: true,
      appointment: appt,
      eventLink: event.htmlLink,
      emailSent,
      emailError,
      smsSent,
      smsError,
      warning: commercialWarning,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

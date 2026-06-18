import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import * as T from "@/lib/email-templates";
import { templateUsage } from "@/lib/messages";
import { listTemplateSettings, setTemplateEnabled } from "@/lib/template-settings";

export const dynamic = "force-dynamic";

// ── Données d'exemple ────────────────────────────────────
const now = Date.now();
const inDays = (n: number) => new Date(now + n * 86400000).toISOString();
const inHours = (n: number) => new Date(now + n * 3600000).toISOString();
const LOC = "3 rue Bélidor 75017 Paris";
const base = { civility: "Monsieur", firstName: "Jean", lastName: "Dupont" };
const u = {
  bookUrl: "https://exemple.fr/book", sellUrl: "https://exemple.fr/vendre", buyUrl: "https://exemple.fr/acheter",
  avisUrl: "https://exemple.fr/avis", unsubUrl: "https://exemple.fr/unsubscribe", rescheduleUrl: "https://exemple.fr/reschedule",
  listingUrl: "https://leboncoin.fr/annonce/123",
};

type Mail = { subject: string; html: string };
type Rendered = { channel: "email" | "sms"; subject?: string; html?: string; text?: string };
type Entry = {
  key: string;            // = template_key journalisé (pour l'usage)
  channel: "email" | "sms";
  group: string;
  label: string;
  when: string;           // quand / pourquoi c'est envoyé
  render: () => Rendered;
};

const mail = (m: Mail): Rendered => ({ channel: "email", subject: m.subject, html: m.html });
const sms = (text: string): Rendered => ({ channel: "sms", text });

// ── Catalogue complet (mails + SMS) ──────────────────────
const CATALOG: Entry[] = [
  // ===== Rendez-vous =====
  { key: "confirmation", channel: "email", group: "Rendez-vous", label: "Confirmation de RDV", when: "Automatique, dès la création d'un RDV (formulaire ou lien client). Confirme date/heure + adresse.", render: () => mail(T.confirmationEmail({ ...base, startDateTime: inDays(2), location: LOC, rescheduleUrl: u.rescheduleUrl })) },
  { key: "sms_confirmation", channel: "sms", group: "Rendez-vous", label: "SMS confirmation RDV", when: "Automatique, en même temps que le mail de confirmation, à la création du RDV.", render: () => sms("Simplicicar: RDV confirme jeudi 18 juin a 18h00 - 3 rue Belidor 75017 Paris. STOP au 36180") },
  { key: "reminder24", channel: "email", group: "Rendez-vous", label: "Rappel RDV — 24h avant", when: "Automatique (cron DB) ~24h avant le RDV.", render: () => mail(T.reminderEmail({ ...base, startDateTime: inDays(1), location: LOC, kind: "24h", rescheduleUrl: u.rescheduleUrl })) },
  { key: "sms_reminder24", channel: "sms", group: "Rendez-vous", label: "SMS rappel — 24h avant", when: "Automatique (cron DB) ~24h avant le RDV, avec le mail.", render: () => sms("Simplicicar: rappel RDV demain, jeudi 18 juin a 18h00 - 3 rue Belidor. A bientot! STOP au 36180") },
  { key: "reminder2", channel: "email", group: "Rendez-vous", label: "Rappel RDV — 2h avant", when: "Automatique (cron DB) ~2h avant le RDV.", render: () => mail(T.reminderEmail({ ...base, startDateTime: inHours(2), location: LOC, kind: "2h", rescheduleUrl: u.rescheduleUrl })) },
  { key: "sms_reminder2", channel: "sms", group: "Rendez-vous", label: "SMS rappel — 2h avant", when: "Automatique (cron DB) ~2h avant le RDV, avec le mail.", render: () => sms("Simplicicar: rappel RDV dans 2h, jeudi 18 juin a 18h00 - 3 rue Belidor. A bientot! STOP au 36180") },
  { key: "reminder15", channel: "email", group: "Rendez-vous", label: "Rappel 15 min — contact + accès", when: "Automatique (cron DB) ~15 min avant le RDV. Donne le contact du commercial + instructions d'accès/parking.", render: () => mail(T.reminderApproachEmail({ firstName: "Jean", commercial: "Raphaël Dahan", phone: "06 18 74 73 82" })) },
  { key: "sms_reminder15", channel: "sms", group: "Rendez-vous", label: "SMS 15 min — contact commercial", when: "Automatique (cron DB) ~15 min avant le RDV, avec le mail. Donne le numéro direct du conseiller.", render: () => sms("Bonjour Jean, nous sommes a 15 minutes de votre rendez-vous chez Simplicicar. Voici le contact de votre conseiller: M. Raphael Dahan - 06 18 74 73 82. N'hesitez pas a l'appeler une fois proche de l'agence. STOP au 36180") },
  { key: "parking", channel: "email", group: "Rendez-vous", label: "Place de parking réservée", when: "Bouton fiche client, ou auto ~2h avant si parking demandé.", render: () => mail(T.parkingReservationEmail({ ...base, startDateTime: inDays(2) })) },
  { key: "rescheduled", channel: "email", group: "Rendez-vous", label: "RDV reprogrammé", when: "Quand on change le créneau d'un RDV (page reprogrammation).", render: () => mail(T.rescheduledEmail({ ...base, startDateTime: inDays(3), location: LOC, rescheduleUrl: u.rescheduleUrl })) },
  { key: "cancelled", channel: "email", group: "Rendez-vous", label: "RDV annulé", when: "Quand on annule un RDV.", render: () => mail(T.cancelledEmail({ ...base, startDateTime: inDays(1), location: LOC })) },

  // ===== Invitations / liens =====
  { key: "booking_invite", channel: "email", group: "Invitations", label: "Invitation — le client choisit", when: "Feature « client hésitant » : il ne sait pas quand. On envoie un mail, il choisit son créneau.", render: () => mail(T.bookingInviteEmail({ bookUrl: u.bookUrl })) },
  { key: "booking_confirm", channel: "email", group: "Invitations", label: "Invitation — créneau imposé", when: "Feature « appel de mauvaise qualité » : on fixe le créneau, le client confirme juste son identité.", render: () => mail(T.bookingConfirmInviteEmail({ bookUrl: u.bookUrl })) },

  // ===== Rappel téléphonique (prospection) =====
  { key: "phone_rappel_organizer", channel: "email", group: "Rappel téléphonique", label: "Rappel tél — collaborateur", when: "Auto ~30 min avant un RDV téléphonique : prévient le commercial.", render: () => mail(T.phoneRappelOrganizerEmail({ organizerName: "Marie", firstName: "Jean", lastName: "Dupont", phone: "06 12 34 56 78", remindAt: inHours(0.5), listingUrl: u.listingUrl, note: "Veut vendre vite" })) },
  { key: "phone_rappel_client", channel: "email", group: "Rappel téléphonique", label: "Rappel tél — client", when: "Auto ~30 min avant un RDV téléphonique : prévient le client.", render: () => mail(T.phoneRappelClientEmail({ firstName: "Jean", lastName: "Dupont", remindAt: inHours(0.5) })) },
  { key: "sms_rappel_confirm", channel: "sms", group: "Rappel téléphonique", label: "SMS confirmation rappel tél", when: "Auto à la création d'un rappel téléphonique (prospection).", render: () => sms("Simplicicar: votre rappel est confirme jeudi 18 juin a 18h00. On vous appelle. STOP au 36180") },

  // ===== Relances post-RDV =====
  { key: "noshow", channel: "email", group: "Relances", label: "No-show — absent", when: "Bouton « Absent » sur la fiche : 1 mail immédiat puis relance tous les 2 jours (6 max).", render: () => mail(T.noShowFollowupEmail({ stage: 1, ...base, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl })) },
  { key: "followup_thinking_1", channel: "email", group: "Relances", label: "Réfléchit — relance 1 (J+3)", when: "Auto (cron DB) J+3 après un RDV statut « réfléchit ».", render: () => mail(T.thinkingFollowupEmail({ stage: 1, ...base, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl })) },
  { key: "followup_thinking_2", channel: "email", group: "Relances", label: "Réfléchit — relance 2 (J+13)", when: "Auto (cron DB) J+13 après un RDV « réfléchit ».", render: () => mail(T.thinkingFollowupEmail({ stage: 2, ...base, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl })) },
  { key: "followup_unsigned_1", channel: "email", group: "Relances", label: "Pas signé — relance 1 (J+14)", when: "Auto (cron DB) J+14 après un RDV non signé.", render: () => mail(T.unsignedFollowupEmail({ stage: 1, ...base, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl })) },
  { key: "followup_unsigned_2", channel: "email", group: "Relances", label: "Pas signé — relance 2 (J+44)", when: "Auto (cron DB) J+44 après un RDV non signé.", render: () => mail(T.unsignedFollowupEmail({ stage: 2, ...base, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl })) },
  { key: "followup_unsigned_3", channel: "email", group: "Relances", label: "Pas signé — relance 3 (J+119)", when: "Auto (cron DB) J+119 après un RDV non signé.", render: () => mail(T.unsignedFollowupEmail({ stage: 3, ...base, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl })) },
  { key: "followup_cancel_1", channel: "email", group: "Relances", label: "Annulation — relance 1 (J+7)", when: "Auto (cron DB) J+7 après une annulation.", render: () => mail(T.cancellationFollowupEmail({ stage: 1, ...base, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl })) },
  { key: "followup_cancel_2", channel: "email", group: "Relances", label: "Annulation — relance 2 (J+21)", when: "Auto (cron DB) J+21 après une annulation.", render: () => mail(T.cancellationFollowupEmail({ stage: 2, ...base, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl })) },
  { key: "followup_cancel_3", channel: "email", group: "Relances", label: "Annulation — relance 3 (J+51)", when: "Auto (cron DB) J+51 après une annulation (dernière).", render: () => mail(T.cancellationFollowupEmail({ stage: 3, ...base, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl })) },
  { key: "signed", channel: "email", group: "Relances", label: "Demande d'avis (après signature)", when: "Auto J+14 après une signature : invite à noter l'agence.", render: () => mail(T.signedRatingEmail({ ...base, avisUrl: u.avisUrl })) },

  // ===== Déplacement (RDV à domicile) =====
  { key: "mobile_confirmation", channel: "email", group: "Déplacement", label: "Confirmation RDV à domicile", when: "À la création d'un RDV déplacement. Confirme date/heure + adresse client + conseiller.", render: () => mail(T.mobileConfirmationEmail({ ...base, startDateTime: inDays(2), address: "12 rue Victor Hugo, 92700 Colombes", conseiller: "Jérémy Bonamy" })) },
  { key: "sms_mobile_confirmation", channel: "sms", group: "Déplacement", label: "SMS confirmation à domicile", when: "À la création d'un RDV déplacement, avec le mail.", render: () => sms("Simplicicar: RDV a domicile confirme jeudi 18 juin a 18h00, a votre adresse. Conseiller M. Jeremy Bonamy. STOP au 36180") },
  { key: "mobile_reminder24", channel: "email", group: "Déplacement", label: "Rappel domicile — 24h avant", when: "Automatique (cron DB) ~24h avant un RDV déplacement.", render: () => mail(T.mobileReminderEmail({ ...base, startDateTime: inDays(1), address: "12 rue Victor Hugo, 92700 Colombes", conseiller: "Jérémy Bonamy", kind: "24h" })) },
  { key: "sms_mobile_reminder24", channel: "sms", group: "Déplacement", label: "SMS rappel domicile — 24h", when: "Automatique (cron DB) ~24h avant, avec le mail.", render: () => sms("Simplicicar: rappel RDV a domicile demain, jeudi 18 juin a 18h00, a votre adresse. Conseiller M. Jeremy Bonamy. STOP au 36180") },
  { key: "mobile_reminder2", channel: "email", group: "Déplacement", label: "Rappel domicile — 2h avant", when: "Automatique (cron DB) ~2h avant un RDV déplacement.", render: () => mail(T.mobileReminderEmail({ ...base, startDateTime: inHours(2), address: "12 rue Victor Hugo, 92700 Colombes", conseiller: "Jérémy Bonamy", kind: "2h" })) },
  { key: "sms_mobile_reminder2", channel: "sms", group: "Déplacement", label: "SMS rappel domicile — 2h", when: "Automatique (cron DB) ~2h avant, avec le mail.", render: () => sms("Simplicicar: rappel RDV a domicile dans 2h, jeudi 18 juin a 18h00, a votre adresse. Conseiller M. Jeremy Bonamy. STOP au 36180") },

  // ===== Manuels / divers =====
  { key: "custom", channel: "email", group: "Manuels", label: "Mail personnalisé", when: "Bouton « mail personnalisé » sur la fiche client (texte libre).", render: () => mail(T.customEmail({ ...base, subject: "Votre message", body: "Exemple de mail personnalisé.\n\nDeuxième paragraphe." })) },
  { key: "sms_custom", channel: "sms", group: "Manuels", label: "SMS personnalisé", when: "Bouton « SMS personnalisé » sur la fiche client (texte libre).", render: () => sms("Simplicicar: bonjour Jean, [votre message]. STOP au 36180") },
  { key: "referral", channel: "email", group: "Manuels", label: "Recommandation (parrainage)", when: "Quand un client recommande un proche (parrainage).", render: () => mail(T.referralEmail({ friendName: "Paul", referrerName: "Jean Dupont", sellUrl: u.sellUrl, buyUrl: u.buyUrl })) },
];

/** GET -> liste { key, channel, label, group, when, used, count, lastUsed }.
 *  GET ?key=&channel= -> rendu (subject/html ou text). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const channel = url.searchParams.get("channel");
  if (key) {
    const entry = CATALOG.find((e) => e.key === key && (!channel || e.channel === channel));
    if (!entry) return NextResponse.json({ error: "Template inconnu." }, { status: 404 });
    try {
      const r = entry.render();
      return NextResponse.json({ ok: true, key, label: entry.label, when: entry.when, ...r });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
    }
  }

  // Usage réel + réglages d'activation.
  const [usage, settings] = await Promise.all([templateUsage(), listTemplateSettings()]);
  const usageMap = new Map<string, { count: number; last: string }>();
  for (const us of usage) usageMap.set(`${us.template_key}|${us.channel}`, { count: us.count, last: us.last_sent });
  const disabled = new Set(settings.filter((s) => !s.enabled).map((s) => `${s.template_key}|${s.channel}`));

  const templates = CATALOG.map((e) => {
    const k = `${e.key}|${e.channel}`;
    const us = usageMap.get(k);
    return {
      key: e.key, channel: e.channel, label: e.label, group: e.group, when: e.when,
      used: !!us, count: us?.count ?? 0, lastUsed: us?.last ?? null,
      enabled: !disabled.has(k),
    };
  });
  return NextResponse.json({ ok: true, templates });
}

/** PATCH { key, channel, enabled } -> active/désactive un template. */
export async function PATCH(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const { key, channel, enabled } = (await req.json()) as { key?: string; channel?: string; enabled?: boolean };
    if (!key || (channel !== "email" && channel !== "sms") || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "key, channel (email/sms) et enabled requis." }, { status: 400 });
    }
    await setTemplateEnabled(key, channel, enabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getEvent } from "@/lib/google";
import { consume, getBalance } from "@/lib/credits";
import { sendSMS } from "@/lib/allmysms";
import { sendEmail } from "@/lib/brevo";
import { themeForCallCenter } from "@/lib/callcenters";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** MODE AUTOMATIQUE (payant en crédits) : envoie le message généré directement au client.
 *  1 SMS = 1 crédit SMS · 1 e-mail = 1 crédit email. Solde insuffisant -> 402, l'UI
 *  bascule sur le mode gratuit copier-coller. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const { eid, kind } = (await req.json()) as { eid?: string; kind?: "sms_confirm" | "sms_rappel" | "email_confirm" };
    if (!eid || !kind) return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });

    const ev = await getEvent(eid);
    const p = ev.extendedProperties?.private ?? {};
    const brand = (await themeForCallCenter(s.callCenterId).catch(() => null))?.name || "Simplicicar";
    const startIso = ev.start?.dateTime ?? "";
    const d = startIso ? new Date(startIso) : null;
    const dateFr = d ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d) : "";
    const heure = d ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h") : "";
    const lieu = p.deplacement === "1" ? (p.address || "votre adresse") : (ev.location || "3 rue Bélidor, 75017 Paris");
    const clientName = `${p.clientFirstName ?? ""} ${p.clientLastName ?? ""}`.trim();

    const channel = kind.startsWith("sms") ? "sms" as const : "email" as const;
    const dest = channel === "sms" ? p.clientPhone : p.clientEmail;
    if (!dest) return NextResponse.json({ error: channel === "sms" ? "Pas de téléphone client." : "Pas d'e-mail client." }, { status: 400 });

    // Débit AVANT envoi (1 crédit) — refuse si insuffisant.
    const ok = await consume(s.email, channel, eid, kind);
    if (!ok) {
      const bal = await getBalance(s.email);
      return NextResponse.json({ error: `Crédits ${channel.toUpperCase()} épuisés (solde : ${channel === "sms" ? bal.sms : bal.email}). Utilise le mode copier-coller (gratuit) ou recharge.`, needCredits: true }, { status: 402 });
    }

    if (kind === "sms_confirm") {
      await sendSMS({ to: dest, text: `${brand}: RDV confirme ${dateFr} a ${heure} - ${lieu}.${p.commercial ? ` Conseiller M. ${p.commercial}.` : ""} STOP au 36180`, log: { templateKey: "sms_direct_confirm", clientName, owner: s.email, eventId: eid, toEmail: p.clientEmail } });
    } else if (kind === "sms_rappel") {
      await sendSMS({ to: dest, text: `${brand}: rappel de votre rendez-vous ${dateFr} a ${heure} - ${lieu}. A tres vite ! STOP au 36180`, log: { templateKey: "sms_direct_rappel", clientName, owner: s.email, eventId: eid, toEmail: p.clientEmail } });
    } else {
      await sendEmail({
        to: dest, toName: clientName || undefined,
        subject: `Votre rendez-vous ${brand}`,
        html: `<p>Bonjour ${p.clientCivility ?? ""} ${p.clientLastName ?? ""},</p><p>Nous vous confirmons votre rendez-vous le <strong>${dateFr} à ${heure}</strong>.<br/>Lieu : ${lieu}.${p.commercial ? `<br/>Votre conseiller : ${p.commercial}.` : ""}</p><p>À très bientôt,<br/>L'équipe ${brand}</p>`,
        log: { templateKey: "email_direct_confirm", clientName, owner: s.email, eventId: eid },
      });
    }
    const bal = await getBalance(s.email);
    return NextResponse.json({ ok: true, balance: bal });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

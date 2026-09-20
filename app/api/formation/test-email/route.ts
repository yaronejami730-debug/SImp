import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getSettings, getSlot, listPartners } from "@/lib/formation";
import { sendEmail } from "@/lib/brevo";
import { formationConfirmationEmail } from "@/lib/email-templates";
import { baseUrlFrom } from "@/lib/links";

export const dynamic = "force-dynamic";

/** POST { slotId? } -> envoie TOUJOURS à l'admin connecté (jamais à un participant),
 *  ignore auto_send_enabled, ne touche jamais formation_registrations. Garde-fou pour
 *  valider le contenu du mail avant de l'activer pour de vrai. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  try {
    const { slotId } = (await req.json().catch(() => ({}))) as { slotId?: number };
    const settings = await getSettings();

    let date: string, startTime: string, endTime: string, type: "individuel" | "groupe", partnerName: string;
    const slot = slotId ? await getSlot(slotId) : undefined;
    if (slot) {
      ({ date, startTime, endTime, type, partnerName } = slot);
    } else {
      const partners = await listPartners(true);
      const defaultPartner = partners.find((p) => p.id === settings.defaultPartnerId) ?? partners[0];
      date = new Date().toISOString().slice(0, 10);
      startTime = "10:00"; endTime = "12:00"; type = "individuel";
      partnerName = defaultPartner?.name ?? "Partenaire à définir";
    }

    const mail = formationConfirmationEmail({
      firstName: s.name || "Test",
      date, startTime, endTime, type, partnerName,
      programme: settings.programme.map((p) => p.title),
      rescheduleUrl: `${baseUrlFrom(req)}/yj/formation/reprogrammer?rid=0`, // aperçu du bouton uniquement, pas une vraie inscription
    });
    await sendEmail({
      to: s.email, toName: s.name || "Test", subject: `[TEST] ${mail.subject}`, html: mail.html,
      senderName: "YJ Solutions",
      log: { templateKey: "formation_confirmation_test", clientName: "Test admin", origin: "manual" },
    });
    return NextResponse.json({ ok: true, sentTo: s.email });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { listAppointments } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { baseUrlFrom } from "@/lib/links";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
// On regarde les RDV passés des 60 derniers jours : assez large pour ne rien
// oublier, sans relancer indéfiniment de très vieux dossiers.
const LOOKBACK_DAYS = 60;

const NAVY = "#1a273a";
const PINK = "#DB407A";

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

/**
 * Rappel quotidien (lundi → vendredi) aux téléprospecteurs.
 *
 * Pour chaque RDV PASSÉ, NON annulé, dont le statut du mandat n'a PAS encore été
 * tranché (signStatus vide), on envoie au téléprospecteur qui a généré le RDV un
 * mail : « le client a-t-il signé ? » + lien direct vers la fiche.
 * Objectif : ne laisser aucun dossier "sans statut". Dès qu'un statut est posé
 * (signé / réfléchit / non signé) dans la fiche, le RDV sort de la relance.
 *
 * À programmer du lundi au vendredi (ex. cron `0 7 * * 1-5`).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sécurité : lundi=1 … vendredi=5. Week-end -> on ne fait rien
  // (au cas où le cron serait programmé tous les jours).
  const dow = new Date().getDay();
  if (dow === 0 || dow === 6) {
    return NextResponse.json({ ok: true, skipped: "weekend" });
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - LOOKBACK_DAYS * DAY);

  let appts;
  try {
    appts = await listAppointments(timeMin, now);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }

  // RDV à relancer : passé, non annulé, client NON marqué absent, statut du mandat
  // non tranché. (Client absent = état terminal : rien à statuer, on ne relance pas.)
  const pending = appts.filter((a) =>
    a.startDateTime &&
    new Date(a.startDateTime) < now &&
    !a.cancelled &&
    a.presence !== "absent" &&
    (a.signStatus ?? "") === "",
  );

  // Regroupement par téléprospecteur (e-mail).
  const byTele = new Map<string, { name: string; items: typeof pending }>();
  for (const a of pending) {
    const email = (a.teleprospectorEmail ?? "").trim().toLowerCase();
    if (!email) continue; // pas d'e-mail connu -> impossible de relancer
    const g = byTele.get(email) ?? { name: a.teleprospector || "", items: [] };
    g.items.push(a);
    byTele.set(email, g);
  }

  const base = baseUrlFrom(req);
  let sent = 0;
  const errors: string[] = [];

  for (const [email, g] of byTele) {
    const greeting = g.name ? `Bonjour ${g.name},` : "Bonjour,";
    const blocks = g.items
      .sort((x, y) => (x.startDateTime! < y.startDateTime! ? 1 : -1))
      .map((a) => {
        const client = `${a.firstName} ${a.lastName}`.trim() || "Client";
        const vehicle = [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ");
        const immat = a.immatriculation ? ` · ${a.immatriculation}` : "";
        const ficheUrl = `${base}/client/${encodeURIComponent(a.id)}`;
        const commercial = a.commercial ? ` (commercial : ${a.commercial})` : "";
        return `
          <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:0 0 12px">
            <p style="margin:0 0 6px;font-size:15px;color:${NAVY}">
              Suite au rendez-vous de <strong>${client}</strong>${commercial} du <strong>${fmtDate(a.startDateTime!)}</strong>,
              le client a-t-il signé le mandat&nbsp;?
            </p>
            <p style="margin:0 0 12px;font-size:13px;color:#6b7280">
              ${vehicle || "Véhicule —"}${immat} · ${a.phone || "—"}
            </p>
            <a href="${ficheUrl}" style="display:inline-block;background:${PINK};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:9px 16px;border-radius:8px">
              Ouvrir la fiche &amp; mettre à jour le statut →
            </a>
          </div>`;
      })
      .join("");

    const n = g.items.length;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:${NAVY};max-width:640px;margin:0 auto;padding:8px">
        <p style="font-size:18px;font-weight:700;margin:0 0 8px">${greeting}</p>
        <p style="font-size:15px;margin:0 0 18px">
          ${n} rendez-vous ${n > 1 ? "sont en attente" : "est en attente"} d'un statut de signature.
          Merci d'indiquer pour chacun si le client a signé, réfléchit, ou n'a pas signé —
          pour qu'aucun dossier ne reste sans suivi.
        </p>
        ${blocks}
        <p style="font-size:13px;color:#6b7280;margin:18px 0 0">Rappel automatique Simplicicar.</p>
      </div>`;

    try {
      // Pas de `log` : c'est un mail interne (équipe), il ne doit pas apparaître
      // dans la timeline client ni gonfler les compteurs de relances du bilan.
      await sendEmail({
        to: email,
        toName: g.name,
        subject: `${n} dossier${n > 1 ? "s" : ""} à statuer — le client a-t-il signé ?`,
        html,
      });
      sent++;
    } catch (e) {
      errors.push(`${email}: ${e instanceof Error ? e.message : "Erreur"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    teleprospectors: byTele.size,
    pendingAppointments: pending.length,
    emailsSent: sent,
    errors,
  });
}

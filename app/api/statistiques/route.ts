import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listAppointments } from "@/lib/google";
import { listReminders } from "@/lib/reminders";
import { searchLeads } from "@/lib/leads";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Bucket = { matin: number; midi: number; aprem: number; soir: number };

function bucketHour(hourParis: number): keyof Bucket {
  if (hourParis < 12) return "matin";
  if (hourParis < 14) return "midi";
  if (hourParis < 18) return "aprem";
  return "soir";
}

function hourParis(iso: string): number {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

/** GET -> stats globales : conversion RDV, horaires préférés, NRP prospection. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const now = new Date();
    const yearAgo = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
    const yearAhead = new Date(now.getTime() + 365 * 24 * 3600 * 1000);

    const [appts, reminders, leads] = await Promise.all([
      listAppointments(yearAgo, yearAhead),
      listReminders(s.role === "admin" ? undefined : s.email),
      searchLeads(),
    ]);

    const visibleAppts = s.role === "admin" ? appts : appts.filter((a) => a.owner === s.email);

    // --- Funnel conversion ---
    const total = visibleAppts.length;
    const cancelled = visibleAppts.filter((a) => a.cancelled).length;
    const active = visibleAppts.filter((a) => !a.cancelled);
    const present = active.filter((a) => a.present).length;
    const signed = active.filter((a) => a.signStatus === "signed").length;
    const thinking = active.filter((a) => a.signStatus === "thinking").length;
    const unsigned = active.filter((a) => a.signStatus === "unsigned").length;
    const noShow = active.length - present;

    const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

    // --- Horaires préférés RDV (basé sur startDateTime) ---
    const apptBuckets: Bucket = { matin: 0, midi: 0, aprem: 0, soir: 0 };
    for (const a of active) {
      if (!a.startDateTime) continue;
      apptBuckets[bucketHour(hourParis(a.startDateTime))]++;
    }

    // --- Horaires préférés rappels téléphoniques ---
    const remBuckets: Bucket = { matin: 0, midi: 0, aprem: 0, soir: 0 };
    for (const r of reminders) {
      if (!r.remind_at) continue;
      remBuckets[bucketHour(hourParis(r.remind_at))]++;
    }

    // --- Prospection NRP : leads totaux vs convertis (= rappels créés depuis leads) ---
    const leadsTotal = leads.length;
    const leadsConverted = reminders.filter((r) => r.lead_id != null).length;
    const leadsNRP = Math.max(leadsTotal - leadsConverted, 0);

    // --- Commission cumulée (signés uniquement) ---
    const NEGO = 0.1;
    const BASE = 50;
    const commissionTotal = active
      .filter((a) => a.signStatus === "signed")
      .reduce((sum, a) => sum + BASE + NEGO * (a.negotiation || 0), 0);

    return NextResponse.json({
      ok: true,
      funnel: {
        total,
        cancelled,
        present,
        noShow,
        signed,
        thinking,
        unsigned,
        ratePresence: rate(present, active.length),
        rateSignature: rate(signed, present),
        rateGlobal: rate(signed, total),
        rateAnnulation: rate(cancelled, total),
      },
      heuresRdv: apptBuckets,
      heuresRappels: remBuckets,
      prospection: {
        total: leadsTotal,
        convertis: leadsConverted,
        nrp: leadsNRP,
        rateConversion: rate(leadsConverted, leadsTotal),
      },
      commissionTotal,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

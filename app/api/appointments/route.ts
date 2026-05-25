import { NextResponse } from "next/server";
import { listAppointments } from "@/lib/google";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** GET -> liste des RDV (passés récents + à venir). Protégé par code PIN. */
export async function GET(req: Request) {
  const pin = process.env.DASHBOARD_PIN;
  if (pin && req.headers.get("x-pin") !== pin) {
    return NextResponse.json({ error: "Code invalide." }, { status: 401 });
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - 60 * 24 * 3600 * 1000); // -60 j
  const timeMax = new Date(now.getTime() + 180 * 24 * 3600 * 1000); // +180 j

  try {
    const items = await listAppointments(timeMin, timeMax);
    return NextResponse.json({ ok: true, appointments: items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

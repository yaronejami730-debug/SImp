import { NextResponse } from "next/server";
import { listAppointments } from "@/lib/google";
import { getAuth } from "@/lib/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** GET -> liste des RDV. Admin = tous ; collaborateur = seulement les siens. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const now = new Date();
  const timeMin = new Date(now.getTime() - 60 * 24 * 3600 * 1000); // -60 j
  const timeMax = new Date(now.getTime() + 180 * 24 * 3600 * 1000); // +180 j

  try {
    // Visible par l'entité créatrice (téléprospecteur) ET par l'entité du commercial.
    const items = (await listAppointments(timeMin, timeMax)).filter((a) => a.callCenterId === s.callCenterId || a.commercialCc === s.callCenterId);
    // Collab : ses RDV (créés par lui) + ceux où il est le commercial de son entité.
    const visible = s.role === "admin" ? items : items.filter((a) => a.owner === s.email || a.commercialCc === s.callCenterId);
    return NextResponse.json({ ok: true, appointments: visible, role: s.role, email: s.email });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

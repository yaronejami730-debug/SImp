import { NextResponse } from "next/server";
import { listAppointments } from "@/lib/google";
import { getAuth } from "@/lib/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const tokset = (x: string) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

/** GET -> liste des RDV. Visibilité par RÔLE (sans entités) :
 *  super-admin = tout ; commercial = ses RDV affectés ; téléprospecteur = ses RDV créés. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const now = new Date();
  const timeMin = new Date(now.getTime() - 60 * 24 * 3600 * 1000); // -60 j
  const timeMax = new Date(now.getTime() + 180 * 24 * 3600 * 1000); // +180 j

  try {
    const items = await listAppointments(timeMin, timeMax);
    const myName = tokset(s.name);
    const myEmail = s.email.toLowerCase();
    const isCreator = (a: typeof items[number]) => a.owner === s.email;
    const isAssignee = (a: typeof items[number]) =>
      (!!a.commercialEmail && a.commercialEmail.toLowerCase() === myEmail) ||
      (!a.commercialEmail && !!myName && tokset(a.commercial) === myName);
    // Visibilité : super-admin = tout ; responsable = son call center ;
    // sinon : mes RDV créés + affectés + ceux des call centers dont je suis GESTIONNAIRE.
    const { listCallCenters } = await import("@/lib/callcenters");
    const managedCc = new Set(
      (await listCallCenters().catch(() => []))
        .filter((c) => (c.gestionnaire_email ?? "").toLowerCase() === myEmail)
        .map((c) => c.id),
    );
    const visible = s.role === "admin" ? items
      : s.role === "responsable" ? items.filter((a) => a.callCenterId === s.callCenterId || managedCc.has(a.callCenterId ?? 1))
      : items.filter((a) => isCreator(a) || isAssignee(a) || managedCc.has(a.callCenterId ?? 1));
    const annotated = visible.map((a) => {
      const created = isCreator(a);
      const assigned = isAssignee(a);
      const relation: "created" | "assigned" | "both" | "none" =
        created && assigned ? "both" : created ? "created" : assigned ? "assigned" : "none";
      return { ...a, relation };
    });
    return NextResponse.json({ ok: true, appointments: annotated, role: s.role, email: s.email, name: s.name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

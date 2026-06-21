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
    // Annotation de la relation de l'utilisateur connecté (créateur / affecté) : filtres + mentions.
    const norm = (x: string) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
    const myName = norm(s.name);
    const myEmail = s.email.toLowerCase();
    const isCreator = (a: typeof items[number]) => a.owner === s.email;
    // Affecté : lien robuste par e-mail du compte commercial ; fallback nom (anciens RDV).
    const isAssignee = (a: typeof items[number]) =>
      (!!a.commercialEmail && a.commercialEmail.toLowerCase() === myEmail) ||
      (!a.commercialEmail && !!myName && norm(a.commercial) === myName);
    // Collab : ses RDV (créés par lui) + ceux qui lui sont affectés + ceux de son entité.
    const visible = s.role === "admin"
      ? items
      : items.filter((a) => isCreator(a) || isAssignee(a) || a.commercialCc === s.callCenterId);
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

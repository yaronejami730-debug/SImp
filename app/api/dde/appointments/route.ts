import { NextResponse } from "next/server";
import { getDdeAuth, listDdeAppointments, createDdeAppointment, updateDdeAppointment, deleteDdeAppointment } from "@/lib/dde";

export const dynamic = "force-dynamic";

/** GET -> RDV DDE (admin : tous ; téléprospectrice : les siens). */
export async function GET(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, appointments: await listDdeAppointments(s), me: s });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> enregistre un rendez-vous (formulaire). */
export async function POST(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as { nom?: string; prenom?: string; date?: string; heure?: string; telephone?: string; notes?: string };
    if (!b.nom?.trim() || !b.prenom?.trim() || !b.date || !b.heure?.trim() || !b.telephone?.trim()) {
      return NextResponse.json({ error: "Nom, prénom, date, heure et téléphone sont obligatoires." }, { status: 400 });
    }
    const appointment = await createDdeAppointment(s, {
      nom: b.nom, prenom: b.prenom, date: b.date, heure: b.heure, telephone: b.telephone, notes: b.notes,
    });
    return NextResponse.json({ ok: true, appointment });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** PATCH -> statut / notes d'un RDV. */
export async function PATCH(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as { id?: number; statut?: string; notes?: string; whatsappSent?: boolean; invoiced?: boolean; callcenterPaid?: boolean };
    if (!b.id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    // Facturation et paiement du call center : réservés à l'admin.
    if ((b.invoiced !== undefined || b.callcenterPaid !== undefined) && s.role !== "admin") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    await updateDdeAppointment(s, Number(b.id), {
      statut: b.statut, notes: b.notes,
      whatsappSent: b.whatsappSent, invoiced: b.invoiced, callcenterPaid: b.callcenterPaid,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> supprime un RDV (le sien, ou n'importe lequel pour l'admin). */
export async function DELETE(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    await deleteDdeAppointment(s, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

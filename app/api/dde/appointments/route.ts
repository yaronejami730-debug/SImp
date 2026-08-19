import { NextResponse } from "next/server";
import {
  getDdeAuth, listDdeAppointments, createDdeAppointment, updateDdeAppointment, deleteDdeAppointment,
  DDE_STATUTS, DDE_FACTURATION, DDE_CALLCENTER,
  type DdeStatut, type DdeFacturation, type DdeCallcenter,
} from "@/lib/dde";

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
    const b = (await req.json()) as { nom?: string; prenom?: string; date?: string; heure?: string; telephone?: string; notes?: string; teleproEmail?: string };
    if (!b.nom?.trim() || !b.prenom?.trim() || !b.date || !b.heure?.trim() || !b.telephone?.trim()) {
      return NextResponse.json({ error: "Nom, prénom, date, heure et téléphone sont obligatoires." }, { status: 400 });
    }
    const appointment = await createDdeAppointment(s, {
      nom: b.nom, prenom: b.prenom, date: b.date, heure: b.heure, telephone: b.telephone, notes: b.notes,
      teleproEmail: b.teleproEmail,
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
    const b = (await req.json()) as {
      id?: number; statut?: string; notes?: string; whatsappSent?: boolean;
      facturationStatut?: string; callcenterStatut?: string;
    };
    if (!b.id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    if (b.statut !== undefined && !DDE_STATUTS.includes(b.statut as DdeStatut)) {
      return NextResponse.json({ error: "Statut inconnu." }, { status: 400 });
    }
    if (b.facturationStatut !== undefined && !DDE_FACTURATION.includes(b.facturationStatut as DdeFacturation)) {
      return NextResponse.json({ error: "Statut de facturation inconnu." }, { status: 400 });
    }
    if (b.callcenterStatut !== undefined && !DDE_CALLCENTER.includes(b.callcenterStatut as DdeCallcenter)) {
      return NextResponse.json({ error: "Statut call center inconnu." }, { status: 400 });
    }
    // Une téléprospectrice consulte ses RDV en lecture seule : statut, WhatsApp,
    // facturation et rémunération sont pilotés par l'admin seul.
    const reserveAdmin = b.statut !== undefined || b.whatsappSent !== undefined
      || b.facturationStatut !== undefined || b.callcenterStatut !== undefined;
    if (reserveAdmin && s.role !== "admin") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    await updateDdeAppointment(s, Number(b.id), {
      statut: b.statut, notes: b.notes, whatsappSent: b.whatsappSent,
      facturationStatut: b.facturationStatut, callcenterStatut: b.callcenterStatut,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> supprime un RDV. Réservé à l'admin (les téléprospectrices sont en lecture seule). */
export async function DELETE(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    await deleteDdeAppointment(s, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

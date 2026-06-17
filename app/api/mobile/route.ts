import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { createMobileAppt, listMobileAppts, isMobileSlotFree, type MobileStatus } from "@/lib/mobile";
import { toParisISO } from "@/lib/parse";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET ?status= -> liste des RDV déplacement. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const status = new URL(req.url).searchParams.get("status") as MobileStatus | null;
  try {
    const appts = await listMobileAppts(status ? { status } : undefined);
    return NextResponse.json({ ok: true, appointments: appts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> crée un RDV déplacement (+ sync Google bonami). */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as {
      civility?: string; firstName?: string; lastName?: string; email?: string; phone?: string;
      carBrand?: string; carModel?: string; immatriculation?: string; address?: string;
      date?: string; time?: string; notes?: string; commercial?: string; status?: MobileStatus;
    };
    if (!b.firstName?.trim() || !b.date || !b.time) {
      return NextResponse.json({ error: "Prénom, date et heure requis." }, { status: 400 });
    }
    const startDateTime = toParisISO(b.date, b.time);
    if (!(await isMobileSlotFree(startDateTime))) {
      return NextResponse.json({ error: "Ce créneau déplacement est déjà pris." }, { status: 409 });
    }
    const appt = await createMobileAppt({
      teleprospecteur: s.email,
      commercial: b.commercial || "Jeremy Bonamy",
      civility: b.civility, firstName: b.firstName, lastName: b.lastName, email: b.email, phone: b.phone,
      carBrand: b.carBrand, carModel: b.carModel, immatriculation: b.immatriculation, address: b.address,
      startDateTime, notes: b.notes, status: b.status,
    });
    return NextResponse.json({ ok: true, appointment: appt, synced: !!appt.google_event_id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

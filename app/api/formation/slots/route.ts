import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listSlots, createSlot, generateSlotsFromTemplate } from "@/lib/formation";

export const dynamic = "force-dynamic";

/** GET ?from=&to= (YYYY-MM-DD) -> créneaux de la période, avec comptage d'inscriptions. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || today;
  const to = url.searchParams.get("to") || in90;
  return NextResponse.json({ ok: true, slots: await listSlots(from, to) });
}

/** POST { generate: true } -> génère les 4 prochaines semaines depuis le modèle.
 *  POST { date, startTime, endTime, type, partnerId, capacity } -> créneau manuel. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  try {
    const body = (await req.json()) as {
      generate?: boolean;
      date?: string; startTime?: string; endTime?: string;
      type?: "individuel" | "groupe"; partnerId?: number; capacity?: number;
    };
    if (body.generate) {
      const created = await generateSlotsFromTemplate(4);
      return NextResponse.json({ ok: true, created });
    }
    const { date, startTime, endTime, type, partnerId, capacity } = body;
    if (!date || !startTime || !endTime || !type || !partnerId || !capacity) {
      return NextResponse.json({ error: "date, startTime, endTime, type, partnerId, capacity requis." }, { status: 400 });
    }
    await createSlot({ date, startTime, endTime, type, partnerId, capacity });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

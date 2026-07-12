import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getSettings, saveSettings, listTimeOff, addTimeOff, removeTimeOff, listExceptions, addException, removeException, DEFAULT_WEEKLY, type Weekly } from "@/lib/availability";
import { listBookersFor, setBlocked } from "@/lib/bookers";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET -> réglages de disponibilité de l'utilisateur courant (commercial). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const [settings, timeOff, exceptions, bookers] = await Promise.all([getSettings(s.email), listTimeOff(s.email), listExceptions(s.email), listBookersFor(s.email).catch(() => [])]);
  return NextResponse.json({
    ok: true,
    settings: settings ?? { user_email: s.email, slot_duration_min: 40, frequency_min: 40, buffer_min: 0, weekly: DEFAULT_WEEKLY },
    saved: !!settings,
    timeOff, exceptions, bookers,
  });
}

/** POST -> sauvegarde réglages / vacances / exceptions.
 *  { action:"save", slotDurationMin, frequencyMin, bufferMin, weekly }
 *  { action:"addTimeOff", start, end, label } | { action:"removeTimeOff", id }
 *  { action:"addException", date, kind, start?, end? } | { action:"removeException", id } */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as { action?: string; slotDurationMin?: number; frequencyMin?: number; bufferMin?: number; weekly?: Weekly; start?: string; end?: string; label?: string; id?: number; date?: string; kind?: "open" | "closed" };
    if (b.action === "save") {
      await saveSettings(s.email, {
        slotDurationMin: Math.max(5, Number(b.slotDurationMin ?? 40)),
        frequencyMin: Math.max(5, Number(b.frequencyMin ?? 40)),
        bufferMin: Math.max(0, Number(b.bufferMin ?? 0)),
        weekly: b.weekly ?? {},
      });
    } else if (b.action === "addTimeOff" && b.start && b.end) {
      await addTimeOff(s.email, b.start, b.end, b.label ?? "");
    } else if (b.action === "removeTimeOff" && b.id) {
      await removeTimeOff(s.email, b.id);
    } else if (b.action === "addException" && b.date && (b.kind === "open" || b.kind === "closed")) {
      await addException(s.email, { date: b.date, kind: b.kind, start: b.start, end: b.end });
    } else if (b.action === "toggleBooker") {
      const bb = b as unknown as { booker?: string; blocked?: boolean };
      if (!bb.booker) return NextResponse.json({ error: "booker requis." }, { status: 400 });
      await setBlocked(s.email, bb.booker, !!bb.blocked);
    } else if (b.action === "removeException" && b.id) {
      await removeException(s.email, b.id);
    } else {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getEvent, appendHistory } from "@/lib/google";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function ownsOrAdmin(ev: Awaited<ReturnType<typeof getEvent>>, email: string, role: string) {
  const owner = ev.extendedProperties?.private?.owner ?? "";
  return role === "admin" || owner === email;
}

/** POST { text } → ajoute une note manuelle dans la timeline. */
export async function POST(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  try {
    const ev = await getEvent(id);
    if (!ownsOrAdmin(ev, s.email, s.role)) return NextResponse.json({ error: "Interdit." }, { status: 403 });
    const { text } = (await req.json()) as { text?: string };
    if (!text || !text.trim()) return NextResponse.json({ error: "Texte vide." }, { status: 400 });
    await appendHistory(id, "note", `${s.email}: ${text.trim().slice(0, 500)}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

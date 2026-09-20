import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getSettings, updateSettings, type Settings } from "@/lib/formation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  return NextResponse.json({ ok: true, settings: await getSettings() });
}

export async function PATCH(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  try {
    const body = (await req.json()) as Partial<Settings>;
    await updateSettings(body);
    return NextResponse.json({ ok: true, settings: await getSettings() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

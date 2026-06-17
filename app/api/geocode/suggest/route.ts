import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { suggestAddresses } from "@/lib/geocode";

export const dynamic = "force-dynamic";

/** GET ?q= -> suggestions d'adresses (autocomplétion). */
export async function GET(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ ok: true, suggestions: await suggestAddresses(q) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

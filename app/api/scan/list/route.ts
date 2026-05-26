import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listScans } from "@/lib/scan";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const brands = sp.get("brands")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const maxKm = sp.get("maxKm") ? Number(sp.get("maxKm")) : undefined;
  const minYear = sp.get("minYear") ? Number(sp.get("minYear")) : undefined;
  const particulierOnly = sp.get("particulierOnly") === "1";
  const includeDismissed = sp.get("includeDismissed") === "1";
  try {
    const rows = await listScans({ brands, maxKm, minYear, particulierOnly, includeDismissed });
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

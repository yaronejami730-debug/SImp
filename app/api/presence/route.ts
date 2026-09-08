import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { touchLastSeen } from "@/lib/users";

export const dynamic = "force-dynamic";

/** POST -> ping de présence (compte connecté = requête reçue il y a peu). Appelé toutes les ~45s par le CRM ouvert. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    await touchLastSeen(s.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

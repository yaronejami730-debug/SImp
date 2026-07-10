import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { syncUser } from "@/lib/google-sync";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** POST -> synchronise les RDV de l'utilisateur courant avec SON Google Agenda
 *  (push CRM->Google + rapatriement des déplacements d'horaire Google->CRM). */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const r = await syncUser(s.email, s.name);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur sync." }, { status: 500 });
  }
}

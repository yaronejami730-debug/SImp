import { NextResponse } from "next/server";
import { setMandateRemoved } from "@/lib/google";
import { getAuth } from "@/lib/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST { eid, action: "remove" | "restore", reason? }
 *  Retire ou rétablit un mandat signé, en gardant la traçabilité (historique). */
export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const { eid, action, reason } = (await req.json()) as {
      eid?: string; action?: "remove" | "restore"; reason?: string;
    };
    if (!eid) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    if (action !== "remove" && action !== "restore") {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }
    if (action === "remove" && !(reason ?? "").trim()) {
      return NextResponse.json({ error: "Une raison est requise pour retirer le mandat." }, { status: 400 });
    }
    await setMandateRemoved(eid, action === "remove", reason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

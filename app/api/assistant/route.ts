import { NextResponse } from "next/server";
import { baseUrlFrom } from "@/lib/links";
import { answerAssistant } from "@/lib/assistant";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function codeOk(code: string | undefined): boolean {
  const expected = process.env.ASSISTANT_CODE ?? process.env.DASHBOARD_PIN;
  if (!expected) return false; // pas de code configuré -> accès fermé
  return !!code && code === expected;
}

/** POST { code, question }
 *  - sans question -> vérifie juste le code (déverrouillage).
 *  - avec question -> renvoie la réponse sourcée. */
export async function POST(req: Request) {
  try {
    const { code, question } = (await req.json()) as { code?: string; question?: string };
    if (!codeOk(code)) return NextResponse.json({ error: "Code d'accès invalide." }, { status: 401 });

    const q = (question ?? "").trim();
    if (!q) return NextResponse.json({ ok: true }); // simple vérification du code

    const answer = await answerAssistant(q, baseUrlFrom(req));
    return NextResponse.json({ ok: true, answer });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

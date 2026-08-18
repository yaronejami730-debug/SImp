import { NextResponse } from "next/server";
import { ddeLogin, signDdeToken } from "@/lib/dde";

export const dynamic = "force-dynamic";

/** POST -> connexion à l'espace DDE (comptes séparés du CRM auto). */
export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    if (!email?.trim() || !password) return NextResponse.json({ error: "E-mail et mot de passe requis." }, { status: 400 });
    const s = await ddeLogin(email, password);
    if (!s) return NextResponse.json({ error: "Identifiants invalides." }, { status: 401 });
    return NextResponse.json({ ok: true, token: signDdeToken(s), user: s });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

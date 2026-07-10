import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/users";
import { themeForCallCenter } from "@/lib/callcenters";
import { verifyPassword, signToken } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** POST { email, password } -> token de session. */
export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis." }, { status: 400 });
    }
    const u = await getUserByEmail(email);
    if (!u || !verifyPassword(password, u.password_hash)) {
      return NextResponse.json({ error: "Identifiants invalides." }, { status: 401 });
    }
    if (u.active === false) {
      return NextResponse.json({ error: "Compte désactivé. Contacte ton administrateur." }, { status: 403 });
    }
    const session = { email: u.email, name: u.name, role: u.role, callCenterId: u.call_center_id ?? 1, isCommercial: !!u.is_commercial, isTeleprospector: !!u.is_teleprospector };
    // Thème de la franchise (racine de la hiérarchie) -> l'interface prend les couleurs de sa marque.
    const theme = await themeForCallCenter(session.callCenterId).catch(() => null);
    return NextResponse.json({ ok: true, token: signToken(session), ...session, theme });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

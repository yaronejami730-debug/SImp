import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getUserByEmail, listCommercials, listTeleprospectors } from "@/lib/users";
import { teleproRule } from "@/lib/telepro-rules";

export const dynamic = "force-dynamic";

/** GET -> infos de l'utilisateur courant + listes commerciaux / téléprospecteurs (pour les formulaires). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const me = await getUserByEmail(s.email).catch(() => undefined);
    const [commercials, teleprospectors] = await Promise.all([listCommercials(), listTeleprospectors()]);
    return NextResponse.json({
      ok: true,
      email: s.email, name: s.name, role: s.role,
      isCommercial: !!me?.is_commercial,
      isTeleprospector: !!me?.is_teleprospector,
      // Listes (nom + email + tél) pour les menus déroulants du formulaire RDV.
      commercials,          // [{ email, name, phone }]
      teleprospectors,      // [{ email, name, phone }]
      // Rétrocompat : noms seuls.
      commerciaux: commercials.map((c) => c.name),
      allCommerciaux: commercials.map((c) => c.name),
      // Restriction éventuelle du téléprospecteur connecté (commerciaux autorisés + agence only).
      rule: teleproRule(s.email),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

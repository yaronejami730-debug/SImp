import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getUserByEmail, listCommercials, listTeleprospectors, listUsers } from "@/lib/users";
import { callCenterRule, commercialsForCallCenterInherited, commercialsForTelepro } from "@/lib/callcenters";

export const dynamic = "force-dynamic";

/** GET -> infos user courant + listes commerciaux/téléprospecteurs (pour les formulaires),
 *  scopées à son call center + restriction éventuelle (commerciaux autorisés, agence only). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const me = await getUserByEmail(s.email).catch(() => undefined);
    let rule = await callCenterRule(s.callCenterId); // null si CC racine

    // Commerciaux : restreints au call center (avec héritage agence/franchise) si règle, sinon tous.
    let commercials = rule ? await commercialsForCallCenterInherited(s.callCenterId) : await listCommercials();

    // Restriction plus fine : ce téléprospecteur précis n'a que certains commerciaux assignés.
    if (me?.is_teleprospector) {
      const allowedEmails = await commercialsForTelepro(s.email);
      if (allowedEmails.length) {
        const allowedSet = new Set(allowedEmails);
        const pool = rule ? commercials : await listCommercials();
        const filtered = pool.filter((c) => allowedSet.has(c.email.toLowerCase()));
        if (filtered.length) {
          commercials = filtered;
          rule = { commercials: filtered.map((c) => c.name), agenceOnly: rule?.agenceOnly ?? false };
        }
      }
    }
    // Téléprospecteurs : super-admin = tous ; sinon ceux du call center.
    const teleprospectors = s.role === "admin"
      ? await listTeleprospectors()
      : (await listUsers(s.callCenterId)).filter((u) => u.is_teleprospector && u.active).map((u) => ({ email: u.email, name: u.name, phone: u.phone }));

    return NextResponse.json({
      ok: true,
      email: s.email, name: s.name, role: s.role, callCenterId: s.callCenterId,
      isCommercial: !!me?.is_commercial,
      isTeleprospector: !!me?.is_teleprospector,
      commercials,
      teleprospectors,
      commerciaux: commercials.map((c) => c.name),
      allCommerciaux: commercials.map((c) => c.name),
      rule, // { commercials:[], agenceOnly } ou null
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

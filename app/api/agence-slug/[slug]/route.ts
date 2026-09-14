import { NextResponse } from "next/server";
import { getCallCenterBySlug, themeForCallCenter } from "@/lib/callcenters";

export const dynamic = "force-dynamic";

/** Résolution publique d'un slug d'agence (ex: "simplicicar-paris-17e") -> callCenterId + thème.
 *  Appelée par middleware.ts (edge, sans accès direct à Postgres) à chaque navigation sous un
 *  préfixe de slug. Ne renvoie que des infos de branding, rien de confidentiel. */
type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  try {
    const cc = await getCallCenterBySlug(slug);
    if (!cc) return NextResponse.json({ ok: false }, { status: 404 });
    const theme = await themeForCallCenter(cc.id);
    return NextResponse.json({ ok: true, callCenterId: cc.id, name: cc.name, theme });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

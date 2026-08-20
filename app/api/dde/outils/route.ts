import { NextResponse } from "next/server";
import { getDdeAuth, ddeAccesOutils } from "@/lib/dde";

export const dynamic = "force-dynamic";

/**
 * Accès aux outils utilisés pendant les appels.
 * Les identifiants viennent des variables d'environnement et ne sortent que pour une session DDE
 * connectée : rien n'est écrit dans le dépôt ni embarqué dans le JavaScript de la page.
 */
export async function GET(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  // Accès propres au compte ; à défaut, les identifiants partagés définis en environnement.
  const a = await ddeAccesOutils(s.email);

  return NextResponse.json({
    ok: true,
    outils: [
      {
        cle: "ringover",
        nom: "Ringover",
        url: "https://app.ringover.com",
        login: a.ringoverLogin || (process.env.RINGOVER_LOGIN ?? ""),
        password: a.ringoverPassword || (process.env.RINGOVER_PASSWORD ?? ""),
      },
      {
        cle: "asclassicall",
        nom: "AS Classicall",
        url: "https://as.classicall.fr/login",
        login: a.ascLogin || (process.env.ASC_LOGIN ?? ""),
        password: a.ascPassword || (process.env.ASC_PASSWORD ?? ""),
      },
    ],
  });
}

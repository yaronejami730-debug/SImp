import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { uploadPhoto } from "@/lib/storage";
import { markMandateSigned } from "@/lib/google";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15 Mo (PDF mandat + signature)

const slug = (s: string) =>
  (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // retire les accents
    .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")
    .toLowerCase() || "client";

/**
 * POST multipart : { file (PDF signé), eid, clientName, vehicle, commercial }
 * - stocke le PDF signé sur Blob, dans un "dossier" logique par client
 * - force l'état du RDV : présent + mandat signé (via markMandateSigned)
 * Renvoie l'URL publique du mandat signé.
 */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    const eid = (form.get("eid") as string) || "";
    const clientName = (form.get("clientName") as string) || "";
    const vehicle = (form.get("vehicle") as string) || "";
    const commercial = (form.get("commercial") as string) || "";

    if (!eid) return NextResponse.json({ error: "RDV manquant." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Le mandat doit être un PDF." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "PDF trop lourd (max 15 Mo)." }, { status: 400 });

    // Dossier client + nom de fichier parlant : on retrouve tout d'un coup d'œil.
    const date = new Date().toLocaleDateString("fr-CA"); // YYYY-MM-DD
    const folder = `mandats/${slug(clientName)}`;
    const parts = ["mandat-signe", slug(clientName), slug(vehicle), slug(commercial), date].filter(Boolean);
    const filename = `${parts.join("_")}.pdf`;

    const { publicUrl } = await uploadPhoto({
      folder,
      filename,
      body: await file.arrayBuffer(),
      contentType: "application/pdf",
    });

    await markMandateSigned(eid, publicUrl);

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur signature." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { uploadPhoto } from "@/lib/storage";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo

/** POST multipart (champ "file") -> upload une photo (ex: véhicule) et renvoie son URL publique. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo trop lourde (max 8 Mo)." }, { status: 400 });
    const folder = (form.get("folder") as string) || "rdv-vehicules";
    const { publicUrl } = await uploadPhoto({
      folder,
      filename: file.name || "photo.jpg",
      body: await file.arrayBuffer(),
      contentType: file.type || "image/jpeg",
    });
    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur upload." }, { status: 500 });
  }
}

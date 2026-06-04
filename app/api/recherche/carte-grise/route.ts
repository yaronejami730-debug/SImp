import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { readCarteGrise } from "@/lib/cartegrise";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX = 5 * 1024 * 1024;

export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    if (file.size > MAX) return NextResponse.json({ error: "Fichier trop gros (max 5 Mo)." }, { status: 400 });
    const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({
        error: `Format ${file.type || "inconnu"} non supporté. Convertis en JPEG ou PNG (sur iPhone : Réglages → Appareil photo → Formats → Le plus compatible).`,
      }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const data = await readCarteGrise({ name: file.name, type: file.type, buffer: buf });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}

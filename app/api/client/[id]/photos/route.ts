import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getEvent, readPhotos, writePhotos } from "@/lib/google";
import { uploadPhoto, deletePhoto } from "@/lib/storage";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function ownsOrAdmin(ev: Awaited<ReturnType<typeof getEvent>>, email: string, role: string) {
  const owner = ev.extendedProperties?.private?.owner ?? "";
  return role === "admin" || owner === email;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo / photo

/** GET → liste des photos (path + URL publique). */
export async function GET(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  try {
    const ev = await getEvent(id);
    if (!ownsOrAdmin(ev, s.email, s.role)) return NextResponse.json({ error: "Interdit." }, { status: 403 });
    const urls = await readPhotos(id);
    // Path == URL avec Vercel Blob
    return NextResponse.json({ ok: true, photos: urls.map((u) => ({ path: u, url: u })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST multipart (champ "file") → upload une photo. */
export async function POST(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  try {
    const ev = await getEvent(id);
    if (!ownsOrAdmin(ev, s.email, s.role)) return NextResponse.json({ error: "Interdit." }, { status: 403 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Fichier trop gros (max 8 Mo)." }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Seules les images sont acceptées." }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const { publicUrl } = await uploadPhoto({
      folder: id,
      filename: file.name || "photo.jpg",
      body: buf,
      contentType: file.type,
    });
    const existing = await readPhotos(id);
    await writePhotos(id, [...existing, publicUrl]);
    return NextResponse.json({ ok: true, photo: { path: publicUrl, url: publicUrl } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?path=... → supprime une photo. */
export async function DELETE(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { id } = await params;
  try {
    const ev = await getEvent(id);
    if (!ownsOrAdmin(ev, s.email, s.role)) return NextResponse.json({ error: "Interdit." }, { status: 403 });
    const path = new URL(req.url).searchParams.get("path");
    if (!path) return NextResponse.json({ error: "path manquant." }, { status: 400 });
    const existing = await readPhotos(id);
    if (!existing.includes(path)) return NextResponse.json({ error: "Photo inconnue." }, { status: 404 });
    await deletePhoto(path);
    await writePhotos(id, existing.filter((p) => p !== path));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

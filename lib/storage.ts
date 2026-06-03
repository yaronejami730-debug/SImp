/** Upload/list/delete fichiers dans Vercel Blob.
 *  Variable env requise : BLOB_READ_WRITE_TOKEN (auto-provisionnée via `vercel env pull`).
 *  Store : "client-photos" (public, créé via `vercel blob create-store`).
 */
import { put, del } from "@vercel/blob";

/** Upload un fichier. Retourne path + URL publique. */
export async function uploadPhoto(opts: {
  folder: string; // ex: eventId
  filename: string;
  body: ArrayBuffer | Uint8Array | Buffer;
  contentType: string;
}): Promise<{ path: string; publicUrl: string }> {
  const safeName = opts.filename.replace(/[^\w.\-]+/g, "_");
  const path = `${opts.folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const body: Buffer = Buffer.isBuffer(opts.body)
    ? opts.body
    : opts.body instanceof Uint8Array
    ? Buffer.from(opts.body)
    : Buffer.from(new Uint8Array(opts.body));
  const result = await put(path, body, {
    access: "public",
    contentType: opts.contentType,
    addRandomSuffix: false,
  });
  return { path, publicUrl: result.url };
}

/** Supprime une photo (par URL stockée). */
export async function deletePhoto(urlOrPath: string): Promise<void> {
  try { await del(urlOrPath); } catch { /* déjà supprimé */ }
}

/** Avec Vercel Blob, la "publicUrl" est retournée à l'upload — on la stocke directement.
 *  Cette fonction sert juste de fallback : on renvoie l'argument tel quel
 *  (les anciens path "folder/file" Supabase ne fonctionneront pas). */
export function publicUrlFor(urlOrPath: string): string {
  return urlOrPath;
}

/** Upload/list/delete fichiers dans Supabase Storage (REST).
 *  Variables d'env requises :
 *    - SUPABASE_URL : https://<ref>.supabase.co
 *    - SUPABASE_SERVICE_KEY : clé service_role (server-side seulement)
 *  Bucket : "client-photos" (public). À créer une fois dans le dashboard Supabase.
 */

const BUCKET = process.env.SUPABASE_PHOTOS_BUCKET ?? "client-photos";

function env() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY manquants.");
  return { url, key };
}

/** Upload un fichier. Retourne l'URL publique. */
export async function uploadPhoto(opts: {
  folder: string; // ex: eventId
  filename: string; // nom client (servira surtout pour l'extension)
  body: ArrayBuffer | Uint8Array | Buffer;
  contentType: string;
}): Promise<{ path: string; publicUrl: string }> {
  const { url, key } = env();
  const safeName = opts.filename.replace(/[^\w.\-]+/g, "_");
  const path = `${opts.folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": opts.contentType,
      "x-upsert": "false",
    },
    body: Buffer.isBuffer(opts.body) ? new Uint8Array(opts.body) : new Uint8Array(opts.body as ArrayBuffer),
  });
  if (!res.ok) throw new Error(`Supabase upload ${res.status}: ${await res.text()}`);
  return { path, publicUrl: `${url}/storage/v1/object/public/${BUCKET}/${path}` };
}

export async function deletePhoto(path: string): Promise<void> {
  const { url, key } = env();
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Supabase delete ${res.status}: ${await res.text()}`);
  }
}

export function publicUrlFor(path: string): string {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}

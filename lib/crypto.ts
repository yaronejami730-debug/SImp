import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM. Clé = TOKEN_ENC_KEY (32 octets, base64). Format stocké : base64(iv|tag|ciphertext).
function key(): Buffer {
  const k = process.env.TOKEN_ENC_KEY ?? "";
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("TOKEN_ENC_KEY manquante ou invalide (32 octets base64 attendus).");
  return buf;
}

export function encrypt(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decrypt(enc: string): string {
  if (!enc) return "";
  const raw = Buffer.from(enc, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

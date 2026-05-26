import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "crypto";

const SECRET = process.env.AUTH_SECRET ?? "dev-secret-change-me";
const TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30 jours

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, h] = stored.split(":");
  if (!salt || !h) return false;
  const hh = scryptSync(pw, salt, 64).toString("hex");
  const a = Buffer.from(h, "hex");
  const b = Buffer.from(hh, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Session = { email: string; name: string; role: "admin" | "collab" };

export function signToken(s: Session): string {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + TOKEN_TTL })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string): Session | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  if (expected !== sig) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return { email: p.email, name: p.name, role: p.role };
  } catch {
    return null;
  }
}

export type BookingPayload = { email: string; listingUrl: string; owner: string; civility?: string };

/** Lien de réservation client signé (valide ~21 jours). */
export function signBooking(p: BookingPayload): string {
  const body = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + 21 * 24 * 3600 * 1000 })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyBooking(token: string): BookingPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (createHmac("sha256", SECRET).update(body).digest("base64url") !== sig) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return { email: p.email, listingUrl: p.listingUrl, owner: p.owner, civility: p.civility };
  } catch {
    return null;
  }
}

/** Auth d'une requête : token Bearer, ou code PIN (admin maître, rétrocompat). */
export function getAuth(req: Request): Session | null {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const s = verifyToken(bearer.slice(7));
    if (s) return s;
  }
  const pin = process.env.DASHBOARD_PIN;
  if (pin && req.headers.get("x-pin") === pin) {
    return { email: "admin", name: "Admin", role: "admin" };
  }
  return null;
}

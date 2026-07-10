import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createHmac } from "crypto";
import { getAuth } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const SECRET = process.env.AUTH_SECRET ?? "dev-secret-change-me";
/** state signé (email + exp) pour retrouver l'utilisateur au callback (qui n'a pas d'auth header). */
function signState(email: string): string {
  const body = Buffer.from(JSON.stringify({ email, exp: Date.now() + 10 * 60 * 1000 })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar"];

/** GET (auth) -> renvoie l'URL de consentement Google pour connecter l'agenda du commercial. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  // URI FIXE (enregistrée dans Google Console) : ne dépend pas du domaine d'où l'on clique.
  const base = process.env.GOOGLE_REDIRECT_BASE ?? "https://www.simplicicar.store";
  const redirectUri = `${base}/api/google/callback`;
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri);
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: signState(s.email),
  });
  return NextResponse.json({ ok: true, url });
}

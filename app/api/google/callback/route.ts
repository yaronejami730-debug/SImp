import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createHmac } from "crypto";
import { upsertConnection } from "@/lib/google-connections";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const SECRET = process.env.AUTH_SECRET ?? "dev-secret-change-me";
function verifyState(state: string): string | null {
  const [body, sig] = (state ?? "").split(".");
  if (!body || !sig) return null;
  if (createHmac("sha256", SECRET).update(body).digest("base64url") !== sig) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p.email as string;
  } catch { return null; }
}

/** Retour Google : échange le code, récupère l'identité, stocke la connexion (tokens chiffrés). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const base = process.env.GOOGLE_REDIRECT_BASE ?? "https://www.simplicicar.store";
  const back = `${base}/agenda`;
  const email = verifyState(state);
  if (!code || !email) return NextResponse.redirect(`${back}?google=error`);

  try {
    const redirectUri = `${base}/api/google/callback`;
    const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri);
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);
    const info = await google.oauth2({ version: "v2", auth: oauth2 }).userinfo.get();
    await upsertConnection(email, {
      googleUserId: info.data.id ?? "",
      gmail: info.data.email ?? "",
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token ?? "",
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    });
    return NextResponse.redirect(`${back}?google=connected`);
  } catch {
    return NextResponse.redirect(`${back}?google=error`);
  }
}

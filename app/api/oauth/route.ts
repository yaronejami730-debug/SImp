import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** TEMPORAIRE : récupère un refresh token Google OAuth et le STOCKE en base (oauth_stash),
 *  pour qu'il soit récupéré côté serveur sans copier-coller. À supprimer après usage. */
export async function GET(req: Request) {
  const redirectUri = "https://agenda-rdv.vercel.app/api/oauth";
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new NextResponse("GOOGLE_OAUTH_CLIENT_ID / SECRET manquants.", { status: 500 });
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    const authUrl = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/contacts"],
    });
    return NextResponse.redirect(authUrl);
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    const rt = tokens.refresh_token;
    if (!rt) {
      return new NextResponse("Pas de refresh_token. Révoque l'accès (myaccount.google.com/permissions) puis réessaie.", { status: 400 });
    }
    await getPool().query(`insert into oauth_stash (token) values ($1)`, [rt]);
    return new NextResponse("✅ Token enregistré. Reviens sur Claude et dis « ok ».", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    return new NextResponse("Erreur : " + (e instanceof Error ? e.message : "inconnue"), { status: 500 });
  }
}

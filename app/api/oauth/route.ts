import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/contacts",
];

/** Outil admin one-shot pour régénérer le refresh token Google.
 *  Démarrage : /api/oauth?key=<DASHBOARD_PIN>  -> redirige vers le consentement Google.
 *  Retour    : Google rappelle /api/oauth?code=...&state=<key> -> affiche le refresh token. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const pin = process.env.DASHBOARD_PIN ?? "";
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${url.origin}/api/oauth`;

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri,
  );

  // Étape retour : Google renvoie le code.
  if (code) {
    if (!pin || url.searchParams.get("state") !== pin) {
      return new NextResponse("Accès refusé (state invalide).", { status: 403 });
    }
    try {
      const { tokens } = await oauth2.getToken(code);
      const rt = tokens.refresh_token;
      if (!rt) {
        return new NextResponse(
          "Aucun refresh_token renvoyé. Révoque l'accès dans https://myaccount.google.com/permissions puis recommence (prompt=consent force normalement un nouveau token).",
          { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
        );
      }
      const html = `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px">
        <h2>✅ Refresh token Google généré</h2>
        <p>Copie cette valeur dans <code>GOOGLE_OAUTH_REFRESH_TOKEN</code> (Vercel + .env.local), puis redéploie :</p>
        <textarea readonly style="width:100%;height:90px;font-family:monospace;font-size:13px;padding:10px">${rt}</textarea>
        <p style="color:#6b7280;font-size:13px">Scopes : Agenda + Contacts. Ne partage pas ce token.</p>
      </body>`;
      return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    } catch (e) {
      return new NextResponse(`Échec de l'échange du code : ${e instanceof Error ? e.message : String(e)}`, { status: 400 });
    }
  }

  // Étape départ : génère l'URL de consentement (gardée par le PIN).
  if (!pin || url.searchParams.get("key") !== pin) {
    return new NextResponse("Ajoute ?key=<DASHBOARD_PIN> pour démarrer.", { status: 401 });
  }
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: pin,
  });
  return NextResponse.redirect(authUrl);
}

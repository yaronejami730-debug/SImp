import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

/**
 * Route de configuration unique pour obtenir un refresh token Google OAuth.
 *
 * 1. Visite /api/oauth -> redirigé vers l'écran de consentement Google.
 * 2. Après autorisation, Google revient ici avec ?code=... -> on échange
 *    le code et on affiche le refresh token à copier dans Vercel
 *    (variable GOOGLE_OAUTH_REFRESH_TOKEN).
 *
 * À supprimer une fois le token récupéré.
 */
export async function GET(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const redirectUri = `${proto}://${host}/api/oauth`;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return text(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET manquants dans les variables Vercel.",
      500,
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    const authUrl = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/calendar"],
    });
    return NextResponse.redirect(authUrl);
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    const rt = tokens.refresh_token;
    if (!rt) {
      return text(
        "Pas de refresh_token reçu. Révoque l'accès de l'app dans ton compte Google (myaccount.google.com/permissions) puis réessaie.",
        400,
      );
    }
    const html = `<!doctype html><meta charset="utf-8">
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">
  <h1>✅ Refresh token obtenu</h1>
  <p>Copie cette valeur dans <strong>Vercel → Settings → Environment Variables</strong> :</p>
  <p><code>GOOGLE_OAUTH_REFRESH_TOKEN</code></p>
  <textarea style="width:100%;height:90px;font-family:monospace">${rt}</textarea>
  <p>Ajoute aussi <code>GOOGLE_CALENDAR_ID</code> = ton adresse Gmail, puis <strong>Redeploy</strong>.</p>
  <p style="color:#b91c1c">⚠️ Supprime ensuite la route <code>app/api/oauth/route.ts</code>.</p>
</body>`;
    return new NextResponse(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Erreur inconnue";
    return text("Erreur lors de l'échange du code : " + m, 500);
  }
}

function text(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

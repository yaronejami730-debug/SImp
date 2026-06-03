// Récupère un refresh token Google OAuth (une seule fois) et l'écrit dans .env.local.
// Usage : node get-token.mjs  -> ouvre le lien affiché -> autorise -> c'est fini.
import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { google } from "googleapis";

const ENV_PATH = new URL("./.env.local", import.meta.url);

function loadEnv() {
  const out = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = loadEnv();
const PORT = 5555;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;

if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
  console.error("❌ GOOGLE_OAUTH_CLIENT_ID / SECRET manquants dans .env.local");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(
  env.GOOGLE_OAUTH_CLIENT_ID,
  env.GOOGLE_OAUTH_CLIENT_SECRET,
  REDIRECT,
);

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/contacts",
  ],
});

console.log("\n1) Ouvre ce lien dans ton navigateur et autorise :\n");
console.log(url + "\n");

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/oauth2callback")) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const code = new URL(req.url, REDIRECT).searchParams.get("code");
  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error(
        "Pas de refresh_token reçu. Révoque l'accès puis relance (prompt=consent).",
      );
    }
    // Écrit le token dans .env.local
    let content = readFileSync(ENV_PATH, "utf8");
    content = content.replace(
      /GOOGLE_OAUTH_REFRESH_TOKEN=.*/,
      `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`,
    );
    writeFileSync(ENV_PATH, content);
    res.end("OK ! Refresh token enregistre. Tu peux fermer cet onglet.");
    console.log("\n✅ Refresh token écrit dans .env.local. Termine.\n");
  } catch (e) {
    res.end("Erreur : " + e.message);
    console.error("\n❌ " + e.message + "\n");
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT, () =>
  console.log(`2) En attente de l'autorisation sur ${REDIRECT} ...\n`),
);

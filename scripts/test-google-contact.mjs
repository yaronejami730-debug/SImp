import { readFileSync } from "node:fs";
import { google } from "googleapis";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const auth = new google.auth.OAuth2(
  env.GOOGLE_OAUTH_CLIENT_ID,
  env.GOOGLE_OAUTH_CLIENT_SECRET,
);
auth.setCredentials({ refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN });

const people = google.people({ version: "v1", auth });

try {
  const res = await people.people.createContact({
    requestBody: {
      names: [{ givenName: "Test Simplicicar", familyName: "Lead" }],
      phoneNumbers: [{ value: "+33612345678", type: "mobile" }],
      emailAddresses: [{ value: "test-lead@example.com" }],
      biographies: [{ value: "Contact test créé par script", contentType: "TEXT_PLAIN" }],
    },
  });
  console.log("✅ Contact créé :", res.data.resourceName);
  console.log("Nom :", res.data.names?.[0]?.displayName);
} catch (e) {
  console.error("❌ Erreur :", e.message);
  if (e.message?.includes("insufficient") || e.message?.includes("403") || e.message?.includes("scope")) {
    console.error("\n⚠️  Le refresh token n'a PAS le scope `contacts`.");
    console.error("   Redéploie puis visite /api/oauth pour re-consentir.");
  }
}

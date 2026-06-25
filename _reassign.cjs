const fs = require("fs");
const { google } = require("googleapis");
const env = fs.readFileSync("/Users/yarone/Agenda S/.env.local", "utf8");
const get = (k) => (env.match(new RegExp(`${k}="?([^"\\n]+)"?`)) || [])[1];
const SCOPES = ["https://www.googleapis.com/auth/calendar"];
function auth() {
  const ce = get("GOOGLE_CLIENT_EMAIL"); const pk = get("GOOGLE_PRIVATE_KEY") && get("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (ce && pk) return new google.auth.JWT({ email: ce, key: pk, scopes: SCOPES });
  const a = new google.auth.OAuth2(get("GOOGLE_OAUTH_CLIENT_ID"), get("GOOGLE_OAUTH_CLIENT_SECRET"));
  a.setCredentials({ refresh_token: get("GOOGLE_OAUTH_REFRESH_TOKEN") }); return a;
}
const CAL = get("GOOGLE_CALENDAR_ID") || "primary";
const FROM = "bonamy.mimi@gmail.com";
const TO = "yaronejami730@gmail.com";
const TO_NAME = "Yarone";
const DRY = process.argv[2] !== "--write";
(async () => {
  const cal = google.calendar({ version: "v3", auth: auth() });
  let pt, ev = [];
  do { const r = await cal.events.list({ calendarId: CAL, timeMin: new Date(Date.now() - 730 * 864e5).toISOString(), timeMax: new Date(Date.now() + 365 * 864e5).toISOString(), singleEvents: true, maxResults: 2500, pageToken: pt }); ev = ev.concat(r.data.items || []); pt = r.data.nextPageToken; } while (pt);
  const targets = ev.filter((e) => { const p = (e.extendedProperties && e.extendedProperties.private) || {}; return (p.app === "simplici-rdv" || p.clientEmail) && (p.owner || "") === FROM; });
  console.log(`RDV à reassigner: ${targets.length}`);
  for (const e of targets) { const p = e.extendedProperties.private || {}; console.log(` - ${p.ref || e.id} | ${p.clientFirstName || ""} ${p.clientLastName || ""}`); }
  if (DRY) { console.log("\n>>> DRY-RUN. Relancer avec --write."); return; }
  let done = 0;
  for (const e of targets) {
    try { await cal.events.patch({ calendarId: CAL, eventId: e.id, sendUpdates: "none", requestBody: { extendedProperties: { private: { owner: TO, teleprospector: TO_NAME, teleprospectorEmail: TO } } } }); done++; }
    catch (err) { console.error("FAIL", e.id, err.message); }
  }
  console.log(`Reassignés: ${done}/${targets.length}`);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
Object.assign(process.env, env);

const a = await import("../lib/auth.ts");
const signBooking = a.signBooking ?? a.default?.signBooking;
const t = await import("../lib/email-templates.ts");
const fn = (name) => t[name] ?? t.default?.[name];

const TO = "yaronejami730@gmail.com";
const BASE = env.APP_URL || "https://simplicicar.store";
const token = signBooking({ email: TO, listingUrl: "", owner: "", civility: "" });
const BOOK = `${BASE}/book?t=${encodeURIComponent(token)}`;
const UNSUB = `${BASE}/unsubscribe?t=${encodeURIComponent(token)}`;
const AVIS = `${BASE}/avis`;

async function send(subject, html) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: env.BREVO_SENDER_NAME || "Simplicicar", email: env.BREVO_SENDER_EMAIL },
      to: [{ email: TO }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) console.error("ERR:", await res.text());
}

const mails = [
  { label: "PAS SIGNÉ J+14", ...fn("unsignedFollowupEmail")({ stage: 1, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { label: "PAS SIGNÉ J+44", ...fn("unsignedFollowupEmail")({ stage: 2, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { label: "PAS SIGNÉ J+119", ...fn("unsignedFollowupEmail")({ stage: 3, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { label: "ANNULATION J+7", ...fn("cancellationFollowupEmail")({ stage: 1, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { label: "ANNULATION J+21", ...fn("cancellationFollowupEmail")({ stage: 2, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { label: "ANNULATION J+51", ...fn("cancellationFollowupEmail")({ stage: 3, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { label: "SIGNÉ (notation)", ...fn("signedRatingEmail")({ firstName: "Yarone", avisUrl: AVIS }) },
];

console.log(`Sending ${mails.length} emails to ${TO}...\n`);
for (const m of mails) {
  console.log(`→ ${m.label}: ${m.subject}`);
  await send("[TEST] " + m.subject, m.html);
}
console.log("\n✅ Done");

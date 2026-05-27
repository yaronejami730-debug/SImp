import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

Object.assign(process.env, env);

const authMod = await import("../lib/auth.ts");
const signBooking = authMod.signBooking ?? authMod.default?.signBooking;

const templates = await import("../lib/email-templates.ts");
const thinkingFollowupEmail = templates.thinkingFollowupEmail ?? templates.default?.thinkingFollowupEmail;

const BREVO_KEY = env.BREVO_API_KEY;
const SENDER_NAME = env.BREVO_SENDER_NAME || "Simplicicar";
const SENDER_EMAIL = env.BREVO_SENDER_EMAIL;
const TO = "yaronejami730@gmail.com";
const BASE = env.APP_URL || "https://simplicicar.store";

const token = signBooking({ email: TO, listingUrl: "", owner: "", civility: "" });
const BOOK_URL = `${BASE}/book?t=${encodeURIComponent(token)}`;
const UNSUB_URL = `${BASE}/unsubscribe?t=${encodeURIComponent(token)}`;

async function send(subject, html) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: TO, name: "Yarone Test" }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) { console.error("BREVO ERR:", await res.text()); return false; }
  return true;
}

console.log(`Sending 2 "Réfléchit" emails to ${TO}...\n`);

const t1 = thinkingFollowupEmail({ stage: 1, firstName: "Yarone", bookUrl: BOOK_URL, unsubUrl: UNSUB_URL });
console.log("1/2 RÉFLÉCHIT J+3:", t1.subject);
await send("[TEST] " + t1.subject, t1.html);

const t2 = thinkingFollowupEmail({ stage: 2, firstName: "Yarone", bookUrl: BOOK_URL, unsubUrl: UNSUB_URL });
console.log("2/2 RÉFLÉCHIT J+13:", t2.subject);
await send("[TEST] " + t2.subject, t2.html);

console.log("\n✅ Done — check " + TO);

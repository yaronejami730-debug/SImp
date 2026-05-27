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
const signedRatingEmail = templates.signedRatingEmail ?? templates.default?.signedRatingEmail;
const thinkingFollowupEmail = templates.thinkingFollowupEmail ?? templates.default?.thinkingFollowupEmail;
const unsignedFollowupEmail = templates.unsignedFollowupEmail ?? templates.default?.unsignedFollowupEmail;
const cancellationFollowupEmail = templates.cancellationFollowupEmail ?? templates.default?.cancellationFollowupEmail;

const BREVO_KEY = env.BREVO_API_KEY;
const SENDER_NAME = env.BREVO_SENDER_NAME || "Simplicicar";
const SENDER_EMAIL = env.BREVO_SENDER_EMAIL;
const TO = "yaronejami730@gmail.com";
const BASE = env.APP_URL || "https://simplicicar.store";

const token = signBooking({ email: TO, listingUrl: "", owner: "", civility: "" });
const BOOK_URL = `${BASE}/book?t=${encodeURIComponent(token)}`;
const UNSUB_URL = `${BASE}/unsubscribe?t=${encodeURIComponent(token)}`;
const AVIS_URL = `${BASE}/avis`;

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

console.log(`Sending 7 test emails to ${TO}...\n`);

const signed = signedRatingEmail({ firstName: "Yarone", lastName: "Test", avisUrl: AVIS_URL });
console.log("1/7 SIGNÉ:", signed.subject);
await send("[TEST] " + signed.subject, signed.html);

const t1 = thinkingFollowupEmail({ stage: 1, firstName: "Yarone", bookUrl: BOOK_URL, unsubUrl: UNSUB_URL });
console.log("2/7 RÉFLÉCHIT 1:", t1.subject);
await send("[TEST] " + t1.subject, t1.html);

const t2 = thinkingFollowupEmail({ stage: 2, firstName: "Yarone", bookUrl: BOOK_URL, unsubUrl: UNSUB_URL });
console.log("3/7 RÉFLÉCHIT 2:", t2.subject);
await send("[TEST] " + t2.subject, t2.html);

const u1 = unsignedFollowupEmail({ stage: 1, firstName: "Yarone", bookUrl: BOOK_URL, unsubUrl: UNSUB_URL });
console.log("4/7 PAS SIGNÉ 1:", u1.subject);
await send("[TEST] " + u1.subject, u1.html);

const u2 = unsignedFollowupEmail({ stage: 2, firstName: "Yarone", bookUrl: BOOK_URL, unsubUrl: UNSUB_URL });
console.log("5/7 PAS SIGNÉ 2:", u2.subject);
await send("[TEST] " + u2.subject, u2.html);

const u3 = unsignedFollowupEmail({ stage: 3, firstName: "Yarone", bookUrl: BOOK_URL, unsubUrl: UNSUB_URL });
console.log("6/7 PAS SIGNÉ 3:", u3.subject);
await send("[TEST] " + u3.subject, u3.html);

const c1 = cancellationFollowupEmail({ stage: 1, firstName: "Yarone", bookUrl: BOOK_URL, unsubUrl: UNSUB_URL });
console.log("7/7 ANNULATION 1:", c1.subject);
await send("[TEST] " + c1.subject, c1.html);

console.log("\n✅ Done — check " + TO);

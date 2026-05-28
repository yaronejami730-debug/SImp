import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

for (const k of Object.keys(env)) process.env[k] ??= env[k];

const { parkingReservationEmail } = await import("../lib/email-templates.ts");

const to = process.argv[2] ?? "yaronejami730@gmail.com";

const mail = parkingReservationEmail({
  civility: "Monsieur",
  firstName: "Yarone",
  lastName: "Jami",
  startDateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
});

console.log(`→ Sending parking confirmation to ${to}`);
console.log(`Subject: ${mail.subject}`);

const res = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "api-key": env.BREVO_API_KEY,
    "content-type": "application/json",
    accept: "application/json",
  },
  body: JSON.stringify({
    sender: { name: env.BREVO_SENDER_NAME ?? "Simplicicar", email: env.BREVO_SENDER_EMAIL },
    to: [{ email: to, name: "Yarone Jami" }],
    subject: mail.subject,
    htmlContent: mail.html,
  }),
});

const body = await res.text();
console.log(`Status: ${res.status}`);
console.log(`Body: ${body}`);
process.exit(res.ok ? 0 : 1);

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
Object.assign(process.env, env);

const { signReview } = await import("../lib/auth.ts");
const { signedRatingEmail } = await import("../lib/email-templates.ts");
const { sendEmail } = await import("../lib/brevo.ts");

const to = process.argv[2] || "yaronejami730@gmail.com";
const base = (env.APP_URL || "https://www.simplicicar.store").replace(/\/$/, "");

const token = signReview({ firstName: "Yarone", lastName: "Test", email: to, vehicle: "Peugeot 308 GT Line" });
const avisUrl = `${base}/avis?t=${encodeURIComponent(token)}`;

const mail = signedRatingEmail({ civility: "Monsieur", firstName: "Yarone", lastName: "Test", avisUrl });

await sendEmail({ to, toName: "Yarone Test", subject: mail.subject, html: mail.html });
console.log(`Mail notation envoyé à ${to}`);
console.log(`Lien avis: ${avisUrl}`);

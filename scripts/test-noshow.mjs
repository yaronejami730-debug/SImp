import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
Object.assign(process.env, env);
const T = await import("../lib/email-templates.ts");
const { sendEmail } = await import("../lib/brevo.ts");
const to = process.argv[2] || "yaronejami730@gmail.com";
const base = (env.APP_URL || "https://www.simplicicar.store").replace(/\/$/, "");
const who = { civility: "Monsieur", firstName: "Yarone", lastName: "Test" };
const bookUrl = `${base}/book`, unsubUrl = `${base}/unsubscribe`;
const mails = [
  ["No-show #1 (immédiat)", T.noShowFollowupEmail({ stage: 1, ...who, bookUrl, unsubUrl })],
  ["No-show #2 (J+2)", T.noShowFollowupEmail({ stage: 2, ...who, bookUrl, unsubUrl })],
  ["No-show #3 (J+4)", T.noShowFollowupEmail({ stage: 3, ...who, bookUrl, unsubUrl })],
];
console.log(`Envoi ${mails.length} mails no-show a ${to}`);
let n = 0;
for (const [label, mail] of mails) {
  n++;
  try { await sendEmail({ to, toName: "Yarone Test", subject: `[TEST ${label}] ${mail.subject}`, html: mail.html }); console.log(`OK ${n}. ${label}`); }
  catch (e) { console.log(`ERR ${n}. ${label}: ${e instanceof Error ? e.message : e}`); }
  await new Promise((r) => setTimeout(r, 400));
}

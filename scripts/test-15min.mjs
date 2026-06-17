import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
Object.assign(process.env, env);
const T = await import("../lib/email-templates.ts");
const { sendEmail } = await import("../lib/brevo.ts");
const to = process.argv[2] || "yaronejami730@gmail.com";
const mail = T.reminderApproachEmail({ firstName: "Yarone", commercial: "Raphaël Dahan", phone: "06 18 74 73 82" });
await sendEmail({ to, toName: "Yarone Test", subject: `[TEST 15min] ${mail.subject}`, html: mail.html });
console.log("OK envoye a "+to);

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

const to = process.argv[2] ?? "0783259157";
const text = process.argv[3] ?? "Simplicicar: test SMS via AllMySMS. Si tu lis ca, l'integration fonctionne.";

function normalize(raw) {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("33") && d.length === 11) return d;
  if (d.startsWith("0") && d.length === 10) return "33" + d.slice(1);
  if (d.length === 9) return "33" + d;
  return d;
}

const login = env.ALLMYSMS_LOGIN;
const apiKey = env.ALLMYSMS_API_KEY;
const from = (env.ALLMYSMS_SENDER ?? "SIMPLIC17").trim();

if (!login || !apiKey) {
  console.error("Missing ALLMYSMS_LOGIN / ALLMYSMS_API_KEY in .env.local");
  process.exit(1);
}

const auth = Buffer.from(`${login}:${apiKey}`).toString("base64");
const phone = normalize(to);

console.log(`→ Sending SMS from "${from}" to ${phone}: ${text}`);

const res = await fetch("https://api.allmysms.com/sms/send/", {
  method: "POST",
  headers: {
    authorization: `Basic ${auth}`,
    "content-type": "application/json",
    accept: "application/json",
  },
  body: JSON.stringify({ from, to: phone, text }),
});

const body = await res.text();
console.log(`Status: ${res.status}`);
console.log(`Body: ${body}`);
process.exit(res.ok ? 0 : 1);

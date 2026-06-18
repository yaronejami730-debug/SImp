import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
Object.assign(process.env, env);
const { backfillMobileFirstClass } = await import("../lib/mobile.ts");
const r = await backfillMobileFirstClass();
console.log("Backfill:", JSON.stringify(r));

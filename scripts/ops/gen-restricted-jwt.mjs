#!/usr/bin/env node
// สร้าง JWT (HS256) ของ role จำกัดสำหรับ PostgREST แล้ว "ต่อท้าย" ไฟล์ .env โดยไม่พิมพ์ค่าใด ๆ ออกจอ
// ใช้บนเซิร์ฟเวอร์: node scripts/ops/gen-restricted-jwt.mjs <env-file> <VAR_NAME> <role> [--secret-var POSTGREST_JWT_SECRET]
//  - อ่าน secret จาก <env-file> (ค่าไม่ถูกพิมพ์/ไม่ถูก log)
//  - ปฏิเสธถ้า VAR_NAME มีอยู่แล้ว (ไม่ทับ) · backup <env-file> เป็น <env-file>.bak-<ts> (mode 600) ก่อนเขียน
//  - exp 2038-01-01 (เท่ากติกา anon key เดิม) · พิมพ์แค่ role, exp, sha256 8 ตัวแรกของ token ไว้เทียบในคอนเทนเนอร์
//  - ไม่ restart อะไร (ผู้ใช้ต้อง recreate บริการที่ใช้ env_file เอง — restart อย่างเดียวไม่รับค่าใหม่)
import fs from "node:fs";
import crypto from "node:crypto";

const [envFile, varName, role, ...rest] = process.argv.slice(2);
if (!envFile || !varName || !role) { console.error("usage: gen-restricted-jwt.mjs <env-file> <VAR_NAME> <role> [--secret-var NAME] [--dry-run]"); process.exit(2); }
if (!/^[A-Z][A-Z0-9_]*$/.test(varName) || !/^[a-z_][a-z0-9_]*$/.test(role)) { console.error("invalid VAR_NAME or role"); process.exit(2); }
const secretVar = rest.includes("--secret-var") ? rest[rest.indexOf("--secret-var") + 1] : "POSTGREST_JWT_SECRET";
const dryRun = rest.includes("--dry-run");

const raw = fs.readFileSync(envFile, "utf8");
const lines = raw.split("\n");
const get = (k) => { const l = lines.find((x) => x.startsWith(k + "=")); return l ? l.slice(k.length + 1).trim().replace(/^"(.*)"$/, "$1") : ""; };
if (lines.some((x) => x.startsWith(varName + "="))) { console.error(`${varName} already set in ${envFile} — refusing to overwrite`); process.exit(3); }
const secret = get(secretVar);
if (secret.length < 32) { console.error(`${secretVar} missing or too short in ${envFile}`); process.exit(4); }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.UTC(2038, 0, 1) / 1000);
const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, exp })}`;
const token = `${head}.${crypto.createHmac("sha256", secret).update(head).digest("base64url")}`;
const fp = crypto.createHash("sha256").update(token).digest("hex").slice(0, 8);
if (dryRun) { console.log(JSON.stringify({ dryRun: true, varName, role, exp: new Date(exp * 1000).toISOString(), fingerprint: fp })); process.exit(0); }

const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
const bak = `${envFile}.bak-${ts}`;
fs.copyFileSync(envFile, bak); fs.chmodSync(bak, 0o600);
fs.appendFileSync(envFile, `${raw.endsWith("\n") ? "" : "\n"}${varName}=${token}\n`);
console.log(JSON.stringify({ written: varName, role, exp: new Date(exp * 1000).toISOString(), fingerprint: fp, backup: bak, note: "recreate services that use env_file (restart alone does not reload env)" }));

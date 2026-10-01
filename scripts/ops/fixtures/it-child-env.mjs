// สภาพแวดล้อมของ child สำหรับ integration test: ไม่สืบทอด env จริง (กัน secret หลุด) · ใส่เฉพาะค่าทดสอบ + placeholder จาก .env.example
import { readFileSync, existsSync } from "node:fs";
const INHERIT = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TZ", "NODE_EXTRA_CA_CERTS", "DOCKER_HOST"];
export function buildChildEnv(root, testValues) {
  if (existsSync(new URL(".env", root))) {
    throw new Error("พบไฟล์ .env ใน repo root — integration test ต้องรันในระบบแยกที่ไม่มี secret จริง (ย้าย/ลบ .env ก่อน)");
  }
  const env = {};
  for (const k of INHERIT) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, testValues);
  for (const line of readFileSync(new URL(".env.example", root), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && env[m[1]] === undefined) env[m[1]] = "test-placeholder";
  }
  return env;
}

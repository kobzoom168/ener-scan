/**
 * HTTP จริง — owner gate ของคลังย้อนหลัง (แบบ A, กบ 23 ก.ย. 2026)
 *
 * Codex สั่ง: "ทดสอบผ่าน HTTP จริง" ไม่ใช่ค้นคำใน source
 * ครอบ: เจ้าของ / ผู้ชมอื่นที่ถือ report token / ไม่มี proof / cookie ปลอม-หมดอายุ /
 *        รายงานที่ไม่พร้อม (not found) ไม่รั่ว
 *
 * ใช้รายงาน demo ที่อยู่ใน memory ของ reportQuery.service (ไม่แตะ DB เลย)
 * แยกเจ้าของ/ไม่ใช่เจ้าของด้วย log `reason` เพราะทั้งสองกรณีตอบ 302 กลับหน้ารายงานเหมือนกัน
 * (ตั้งใจให้เหมือนกัน — ไม่บอกคนนอกว่ามีคลังอยู่หรือไม่)
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { readFileSync } from "node:fs";

for (const [k, v] of Object.entries({
  SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9",
  LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x",
  OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s",
  GEMINI_API_KEY: "g", REDIS_URL: "", SESSION_SECRET: "owner-proof-test-secret",
})) process.env[k] = v;

const DEMO = "rpt_phase1_demo";
const OWNER = "phase1-mock-line-user";
const OTHER = "U" + "b".repeat(32);

const reportRoutes = (await import("../src/routes/report.routes.js")).default;
const { buildOwnerCookieValue, OWNER_COOKIE, readOwnerCookieValue } =
  await import("../src/services/reports/ownerProof.util.js");

const app = express();
app.use(reportRoutes);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = server.address().port;

/** ยิง HTTP จริง + เก็บ log ที่ระบบพิมพ์ระหว่างคำขอนั้น */
function get(path, cookie = null) {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(" ")); };
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET",
        headers: cookie ? { cookie: `${OWNER_COOKIE}=${encodeURIComponent(cookie)}` } : {} },
      (res) => {
        let text = "";
        res.on("data", (c) => { text += c; });
        res.on("end", () => {
          console.log = orig;
          resolve({ status: res.statusCode, text, location: res.headers.location,
            setCookie: res.headers["set-cookie"] || [], logs });
        });
      },
    );
    req.on("error", (e) => { console.log = orig; reject(e); });
    req.end();
  });
}
const reasonOf = (r) => (r.logs.find((l) => l.includes("owner_proof_required")) ? "owner_proof_required" : null);

test("ไม่มี proof → หน้าคลังไม่เปิด และไม่บอกว่ามีคลังอยู่หรือไม่", async () => {
  const r = await get(`/r/${DEMO}/library`);
  assert.equal(r.status, 302);
  assert.equal(r.location, `/r/${DEMO}`, "พากลับหน้ารายงาน (รายงานยังเปิดได้ตามเดิม)");
  assert.equal(reasonOf(r), "owner_proof_required");
  assert.doesNotMatch(r.text, /alib-pod|mv2r-row|คลังของคุณ/, "ห้ามมีเนื้อคลังหลุดมาใน response");
});

test("ผู้ชมอื่นถือ report token (มี cookie ของคนอื่น) → ยังเปิดคลังเจ้าของไม่ได้", async () => {
  const r = await get(`/r/${DEMO}/library`, buildOwnerCookieValue(OTHER));
  assert.equal(r.status, 302);
  assert.equal(reasonOf(r), "owner_proof_required", "uid ไม่ตรงเจ้าของรายงาน = ไม่ผ่าน");
});

test("เจ้าของ (cookie ตรง uid ของรายงาน) → ผ่าน gate", async () => {
  const r = await get(`/r/${DEMO}/library`, buildOwnerCookieValue(OWNER));
  assert.equal(reasonOf(r), null, "เจ้าของต้องไม่โดน owner_proof_required");
  // demo ไม่ใช่เลนพระ จึง 302 ด้วยเหตุผลอื่น — สิ่งที่พิสูจน์คือ "ผ่าน gate แล้ว"
  assert.ok(r.logs.some((l) => l.includes("not_amulet_lane")), "ไปถึงขั้นตรวจเลนแล้วจริง");
});

test("cookie ปลอม / ลายเซ็นผิด / หมดอายุ → ไม่ผ่าน", async () => {
  const good = buildOwnerCookieValue(OWNER);
  const cases = {
    "ลายเซ็นมั่ว": `${good.slice(0, good.lastIndexOf("."))}.ปลอมลายเซ็น`,
    "สลับ uid แต่ใช้ลายเซ็นเดิม": `${Buffer.from(OTHER).toString("base64url")}.${good.split(".")[1]}.${good.split(".")[2]}`,
    "หมดอายุแล้ว": buildOwnerCookieValue(OWNER, Date.now() - 1000),
    "ค่าขยะ": "ขยะ.ขยะ.ขยะ",
  };
  for (const [name, c] of Object.entries(cases)) {
    assert.equal(readOwnerCookieValue(c), null, `${name}: ต้องอ่านไม่ผ่านตั้งแต่ชั้น util`);
    const r = await get(`/r/${DEMO}/library`, c);
    assert.equal(reasonOf(r), "owner_proof_required", `${name}: ต้องไม่ผ่าน gate`);
  }
});

test("หน้ารายงานที่แชร์ต่อ: เปิดได้ตามขอบเขตเดิม แต่ไม่มีเนื้อคลังของเจ้าของ", async () => {
  const r = await get(`/r/${DEMO}/body`);
  assert.equal(r.status, 200, "รายงานยังเปิดได้ (ลิงก์แชร์ต้องไม่พัง)");
  assert.doesNotMatch(r.text, /alib-pod--locked|เปิดสิทธิ์เพื่อดู/, "ต้องไม่มี paywall เดิมโผล่มา");
});

test("รายงานที่ไม่พร้อม/ไม่มีอยู่ ต้องไม่รั่วอะไรเลย", async () => {
  for (const tok of ["rpt_ไม่มีจริง", "rpt_" + "z".repeat(40), "../../etc/passwd"]) {
    const r = await get(`/r/${encodeURIComponent(tok)}/library`);
    assert.ok([302, 404].includes(r.status), `${tok} → ${r.status}`);
    assert.doesNotMatch(r.text, /phase1-mock-line-user|alib-pod/, "ห้ามมีข้อมูลรายงาน/คลังหลุด");
  }
  const body = await get(`/r/${encodeURIComponent("rpt_ไม่มีจริง")}/body`);
  assert.equal(body.status, 404);
});

test("owner token ไม่โผล่ใน URL — ใช้ cookie httpOnly เท่านั้น", async () => {
  const r = await get(`/r/${DEMO}/library`, buildOwnerCookieValue(OWNER));
  assert.ok(!String(r.location || "").includes(OWNER), "ห้ามมี uid/กุญแจใน Location");
  // และ log ของคำขอนี้ต้องไม่มีค่า cookie
  assert.ok(!r.logs.join("\n").includes(buildOwnerCookieValue(OWNER).split(".")[2]),
    "ห้าม log ลายเซ็น cookie");
});


test("ลิงก์กุญแจส่วนตัวต้องไม่รั่วผ่าน Referer (Codex 23 ก.ย.)", () => {
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const guard = app.slice(app.indexOf("async function myScansGuard"), app.indexOf("app.get(\"/myscans/:token\""));
  assert.match(guard, /Referrer-Policy[\s\S]*no-referrer/, "หน้า myscans ต้องตั้ง no-referrer");
  assert.match(guard, /private, no-store/);
  assert.match(guard, /noindex, nofollow/);
  // แอปต้อง log เฉพาะ prefix ไม่เคย log token เต็ม
  assert.ok(!/tokenPrefixForLog\(\s*\)/.test(app));
  assert.match(app, /tokenPrefix: svc\.tokenPrefixForLog\(token\)|tokenPrefix: g\.svc\.tokenPrefixForLog\(g\.token\)/);
});

test.after(() => new Promise((r) => server.close(r)));

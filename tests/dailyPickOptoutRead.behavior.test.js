/**
 * เส้นอ่าน preference — ต้องตั้ง env ชี้ PostgREST ปลอม **ก่อน** import ใด ๆ
 * (client ของ supabase ผูก URL ตอนสร้าง ถ้า import ไปแล้วจะแก้ไม่ได้ → เทสต์จะผ่านด้วยเหตุผลผิด)
 * Codex 18 ก.ย. 2026: DB ตอบผิดรูปแบบต้องไม่ตีความว่าอนุญาตส่ง
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

let MODE = { get: null, migrate: null };
const CALLS = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    // client ยิงไปที่ /rpc/<name> (ไม่ใช่ /rest/v1/rpc/<name>) — จับด้วยชื่อที่อยู่ใน URL
    const name = req.url.includes("migrate_daily_pick_optout_if_absent")
      ? "migrate_daily_pick_optout_if_absent"
      : "get_daily_pick_optout";
    CALLS.push(name);
    const raw = name === "get_daily_pick_optout" ? MODE.get : MODE.migrate;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(raw === undefined ? "null" : raw);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${server.address().port}`;

for (const [k, v] of Object.entries({
  SUPABASE_URL: URL_, LOCAL_POSTGREST_URL: URL_,
  SUPABASE_SERVICE_ROLE_KEY: "x", LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x",
  OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "",
})) process.env[k] = v;
try {
  for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && !process.env[m[1]]) process.env[m[1]] = "test-placeholder";
  }
} catch { /* ignore */ }

const { isDailyPickOptedOut } = await import("../src/services/dailyLuckyPickPush.service.js");

test("DB ตอบผิดรูปแบบ ต้องไม่ตีความว่าอนุญาตส่ง", async () => {
  for (const bad of ["null", '"yes"', "123", "[]", '{"optedOut":false}', '{"known":"true","optedOut":false}']) {
    MODE = { get: bad, migrate: "null" };
    const r = await isDailyPickOptedOut("Umalformed_test");
    assert.equal(r, true, `คำตอบผิดรูป (${bad}) ต้องถือว่าปิดไว้ ไม่ใช่ส่งได้`);
  }
});

test("รูปแบบถูกต้อง: มีแถวแล้วใช้ค่าจาก DB ตรง ๆ", async () => {
  MODE = { get: '{"known":true,"optedOut":true}', migrate: "null" };
  assert.equal(await isDailyPickOptedOut("Uknown_true"), true);
  MODE = { get: '{"known":true,"optedOut":false}', migrate: "null" };
  assert.equal(await isDailyPickOptedOut("Uknown_false"), false);
});

test("ไม่มีแถวใน DB และไม่มีค่าเก่าใน Redis → ส่งได้ (ไม่เรียก migration)", async () => {
  MODE = { get: '{"known":false,"optedOut":false}', migrate: "null" };
  CALLS.length = 0;
  assert.equal(await isDailyPickOptedOut("Uno_row"), false);
  assert.ok(!CALLS.includes("migrate_daily_pick_optout_if_absent"), "ไม่มีค่าเก่า ไม่ต้องย้าย");
});

test("PostgREST ตอบ error → fail-safe ถือว่าปิดไว้", async () => {
  const saved = server.listening;
  MODE = { get: "not-json-at-all", migrate: "null" };
  assert.equal(await isDailyPickOptedOut("Ubad_json"), true);
  assert.ok(saved);
});

test.after(() => new Promise((r) => server.close(r)));

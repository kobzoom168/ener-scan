/**
 * แจ้งเตือนแอดมิน → Telegram เท่านั้น (กบ/Codex 19 ต.ค. 2026 · รอบ 2 แก้ 4 ข้อ)
 *  - [env][category][severity] นำหน้าเสมอ · ส่งสำเร็จ = marker · ส่งไม่ได้ (network/429/timeout) = outbox ผ่าน RPC role จำกัด (ไม่ fallback LINE ไม่เงียบ)
 *  - ข้อ 1 แหล่ง config เดียว: deps.env ทับเฉพาะ key ที่ให้ — object จาก config module (ไม่มีตัวแปร Telegram) ไม่บังค่าจริงใน process.env
 *  - ข้อ 2 outbox ใช้ ADMIN_ALERT_DB_KEY (role admin_alert_writer) ไม่ใช้ client anon · ไม่มี key → ADMIN_ALERT_LOST ไม่ throw
 *  - ข้อ 3 Telegram รับแล้วแต่ finish ล้ม = sentUnrecorded (ไม่ใช่ sent) + จำ id → รอบหน้า finish(ok) ไม่ส่งซ้ำ
 *  - ข้อ 4 chunkText ทุกก้อน ≤ limit แม้บรรทัดยาวอยู่หลัง buffer · ส่งสำเร็จบางก้อน → outbox เก็บเฉพาะที่เหลือ · sweeper ส่งต่อเฉพาะที่เหลือ
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "" })) process.env[k] = v;
globalThis.fetch = async () => { throw new Error("external network forbidden"); };
const A = await import("../src/services/adminAlerts/adminAlert.service.js");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ENV = { APP_ENV: "staging", ADMIN_ALERT_TELEGRAM_CHAT_ID: "-1001000000000001", TELEGRAM_BOT_TOKEN: "123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" };
const redisFake = () => { const m = new Map(); return { m, getValue: async (k) => m.get(k) ?? null, setValueWithTtl: async (k, v) => { m.set(k, String(v)); } }; };
const fetchFake = (plan) => { const calls = []; let i = 0; const f = async (url, init) => { calls.push({ url: String(url).replace(/bot[^/]+/, "bot<token>"), body: JSON.parse(init.body) }); const step = plan[Math.min(i, plan.length - 1)]; i++; if (step === "net") throw new Error("ECONNRESET"); if (step === 429) return { ok: false, status: 429, json: async () => ({ parameters: { retry_after: 7 } }) }; if (typeof step === "number" && step >= 400) return { ok: false, status: step, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }; f.calls = calls; return f; };
/** DB fake = client role admin_alert_writer: เฉพาะ rpc (ไม่มีสิทธิ์เขียนตารางตรง) */
const dbFake = ({ enqueueError = null, finishError = null, finishFailTimes = 0, claimRows = [] } = {}) => {
  const rows = []; const finishes = []; let ff = 0;
  return { rows, finishes, from: () => { throw new Error("direct table access must not be used"); }, rpc: async (fn, args) => {
    if (fn === "admin_alert_outbox_enqueue") { if (enqueueError) return { error: enqueueError }; const dup = rows.some((r) => r.p_dedupe_key && r.p_dedupe_key === args.p_dedupe_key); if (!dup) rows.push({ id: rows.length + 1, ...args }); return { data: { queued: true, duplicate: dup, id: dup ? null : rows.length } }; }
    if (fn === "admin_alert_outbox_claim") return { data: claimRows };
    if (fn === "admin_alert_outbox_finish") { finishes.push(args); if (finishError && ff < (finishFailTimes || Infinity)) { ff++; return { error: finishError }; } return { data: { status: args.p_ok ? "sent" : "queued", attempts: 1 } }; }
    return { error: { message: "unknown rpc " + fn } }; } };
};

test("config: ต้องมี chat id ชัดเจน (ไม่อนุมานห้อง) · token ใช้ ADMIN_ALERT_TELEGRAM_BOT_TOKEN ก่อน TELEGRAM_BOT_TOKEN · env merge ทับเฉพาะ key ที่ให้", () => {
  assert.equal(A.readAdminAlertConfig({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "123" }), null, "ห้องรายงานเดิมไม่ถูกใช้เป็น alert อัตโนมัติ");
  assert.equal(A.readAdminAlertConfig(ENV).tokenSource, "TELEGRAM_BOT_TOKEN");
  assert.equal(A.readAdminAlertConfig({ ...ENV, ADMIN_ALERT_TELEGRAM_BOT_TOKEN: "987654:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" }).tokenSource, "ADMIN_ALERT_TELEGRAM_BOT_TOKEN");
  assert.equal(A.readAdminAlertConfig({ ...ENV, ADMIN_ALERT_TELEGRAM_CHAT_ID: "test-placeholder" }), null, "placeholder ไม่ใช่การตั้งค่า");
  assert.equal(A.adminAlertEnvLabel({ APP_ENV: "", APP_BASE_URL: "https://scan.my-ener.uk" }), "scan.my-ener.uk");
  assert.match(A.formatAdminAlert({ envLabel: "scan.my-ener.uk", category: "dlq", severity: "high", text: "x" }), /^\[scan\.my-ener\.uk\]\[dlq\]\[high\]\nx$/);
  assert.equal(A.maskUid("U1234567890abcdef"), "U1234567…");
  // ข้อ 1: config module env (ไม่มีตัวแปร Telegram, มี key ค่า undefined) ทับ process.env ที่ตั้งค่าจริง → ยังอ่านค่าจริงได้
  const base = { ...ENV, LOCAL_POSTGREST_URL: "http://127.0.0.1:9" };
  const merged = A.resolveAdminAlertEnv({ APP_ENV: "production", TELEGRAM_BOT_TOKEN: undefined, OPENAI_API_KEY: "sk" }, base);
  assert.equal(merged.APP_ENV, "production"); assert.equal(merged.TELEGRAM_BOT_TOKEN, ENV.TELEGRAM_BOT_TOKEN); assert.equal(merged.ADMIN_ALERT_TELEGRAM_CHAT_ID, ENV.ADMIN_ALERT_TELEGRAM_CHAT_ID);
  assert.equal(A.resolveAdminAlertEnv(null, base), base);
  assert.deepEqual(A.adminAlertDbReadiness({ LOCAL_POSTGREST_URL: "http://x", ADMIN_ALERT_DB_KEY: "a.b.c" }), { ready: true, missing: [] });
  assert.deepEqual(A.adminAlertDbReadiness({ LOCAL_POSTGREST_URL: "http://x", ADMIN_ALERT_DB_KEY: "test-placeholder" }).missing, ["ADMIN_ALERT_DB_KEY"]);
});

test("ข้อ 4 chunkText: ทุกก้อน ≤ limit — header สั้น + บรรทัดยาว 5000 → [6, 3900, 1100] ไม่ใช่ [6, 5000] · บรรทัดปกติรวมก้อน · ว่าง = []", () => {
  const parts = A.chunkText("header\n" + "x".repeat(5000));
  assert.deepEqual(parts.map((p) => p.length), [6, 3900, 1100]);
  assert.ok(parts.every((p) => p.length <= A.CHUNK));
  const many = A.chunkText(Array.from({ length: 300 }, (_, i) => `line ${i} ${"y".repeat(40)}`).join("\n"));
  assert.ok(many.length > 1 && many.every((p) => p.length <= A.CHUNK) && many.join("\n").split("\n").length === 300);
  assert.deepEqual(A.chunkText("a\n" + "b".repeat(10) + "\nc", 10), ["a", "bbbbbbbbbb", "c"]);
  assert.deepEqual(A.chunkText("   "), []); assert.deepEqual(A.chunkText("short"), ["short"]);
});

test("ส่งสำเร็จ → Telegram ครั้งเดียว + marker dedupe · ส่งซ้ำใน window = deduped ไม่ยิง · env จาก process.env เมื่อ deps.env ไม่มีตัวแปร Telegram", async () => {
  const f = fetchFake([200]); const r = redisFake(); const db = dbFake();
  const x = await A.sendAdminAlert({ category: "dlq", severity: "high", text: "dead=1", dedupeKey: "dlq:sig1", dedupeSec: 3600 }, { env: ENV, fetch: f, redis: r, db });
  assert.equal(x.ok, true); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].body.chat_id, ENV.ADMIN_ALERT_TELEGRAM_CHAT_ID); assert.match(f.calls[0].body.text, /^\[staging\]\[dlq\]\[high\]\ndead=1$/);
  assert.equal(r.m.get("admin_alert:sent:staging:dlq:sig1"), "1"); assert.equal(db.rows.length, 0);
  const y = await A.sendAdminAlert({ category: "dlq", severity: "high", text: "dead=1", dedupeKey: "dlq:sig1", dedupeSec: 3600 }, { env: ENV, fetch: f, redis: r, db });
  assert.equal(y.skipped, "deduped"); assert.equal(f.calls.length, 1);
  // ข้อ 1: ตั้งค่าจริงใน process.env · deps.env = object แบบ config module (APP_ENV เท่านั้น) → ต้องส่งได้ ไม่ใช่ not_configured
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { ADMIN_ALERT_TELEGRAM_CHAT_ID: ENV.ADMIN_ALERT_TELEGRAM_CHAT_ID, TELEGRAM_BOT_TOKEN: ENV.TELEGRAM_BOT_TOKEN });
    const f2 = fetchFake([200]);
    const z = await A.sendAdminAlert({ category: "dlq", severity: "high", text: "cfg" }, { env: { APP_ENV: "production", OPENAI_API_KEY: "sk", TELEGRAM_BOT_TOKEN: undefined }, fetch: f2, redis: redisFake(), db: dbFake() });
    assert.equal(z.ok, true); assert.equal(f2.calls.length, 1); assert.match(f2.calls[0].body.text, /^\[production\]/);
  } finally { for (const k of ["ADMIN_ALERT_TELEGRAM_CHAT_ID", "TELEGRAM_BOT_TOKEN"]) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
});

test("ส่งไม่ได้ (network / 429 retry_after / 500) → outbox ผ่าน RPC enqueue (role จำกัด) ไม่ fallback LINE · 429 เลื่อน next_attempt ตาม retry_after · ไม่แตะตารางตรง", async () => {
  for (const [plan, reason] of [[["net"], /network/], [[429], /http_429/], [[500], /http_500/]]) {
    const f = fetchFake(plan); const db = dbFake(); const r = redisFake();
    const x = await A.sendAdminAlert({ category: "critical", severity: "high", text: "boom", dedupeKey: "crit:1", dedupeSec: 600 }, { env: ENV, fetch: f, redis: r, db });
    assert.equal(x.ok, false); assert.equal(x.queued, true); assert.match(x.reason, reason); assert.equal(x.outboxId, 1);
    assert.equal(db.rows.length, 1); assert.equal(db.rows[0].p_dedupe_key, "staging:crit:1"); assert.match(db.rows[0].p_text, /^\[staging\]\[critical\]\[high\]/); assert.equal(db.rows[0].p_category, "critical");
    assert.equal(r.m.get("admin_alert:sent:staging:crit:1"), "1", "เข้า outbox แล้ว = ถือว่าแจ้งแล้ว ไม่ยิงซ้ำ");
    if (plan[0] === 429) assert.ok(Date.parse(db.rows[0].p_next_attempt_at) - Date.now() >= 6000, "retry_after 7s ถูกใช้");
  }
});

test("ข้อ 4 ส่งสำเร็จบางก้อน → outbox เก็บเฉพาะก้อนที่เหลือ (ไม่ส่งก้อนสำเร็จซ้ำ) · sweeper ก็เช่นกัน (finish p_text = ส่วนที่เหลือ)", async () => {
  const long = "H1\n" + "a".repeat(3900) + "\n" + "b".repeat(3900) + "\nTAIL";
  const f = fetchFake([200, 200, "net"]); const db = dbFake();
  const x = await A.sendAdminAlert({ category: "ops", text: long }, { env: ENV, fetch: f, redis: redisFake(), db });
  assert.equal(x.queued, true); assert.equal(f.calls.length, 3, "ก้อน 1,2 สำเร็จ ก้อน 3 ล้ม");
  assert.equal(db.rows.length, 1);
  assert.match(db.rows[0].p_text, /^\(ต่อ — ส่วน 3-4 ของข้อความที่ส่งไปแล้ว 2 ส่วน\)\n/);
  assert.ok(!db.rows[0].p_text.includes("a".repeat(100)) && db.rows[0].p_text.includes("b".repeat(3900)) && db.rows[0].p_text.endsWith("TAIL"));
  // sweeper: แถวที่เหลือ 2 ก้อน (b…, TAIL) ส่งก้อนแรกได้ ก้อนสองล้ม → finish ไม่ ok พร้อม p_text เฉพาะ TAIL
  const db2 = dbFake({ claimRows: [{ id: 5, category: "ops", text: "b".repeat(3900) + "\nTAIL" }] });
  const f2 = fetchFake([200, 500]);
  const s = await A.sweepAdminAlertOutbox({ env: ENV, db: db2, fetch: f2 });
  assert.equal(s.retry, 1); assert.equal(db2.finishes[0].p_ok, false); assert.match(db2.finishes[0].p_text, /ส่วน 2-2 ของข้อความที่ส่งไปแล้ว 1 ส่วน\)\nTAIL$/);
  // ล้มตั้งแต่ก้อนแรก → p_text null (ข้อความเดิมคงอยู่)
  const db3 = dbFake({ claimRows: [{ id: 6, category: "ops", text: "x" }] });
  await A.sweepAdminAlertOutbox({ env: ENV, db: db3, fetch: fetchFake([500]) });
  assert.equal(db3.finishes[0].p_text, null);
});

test("ไม่ตั้งค่า chat (หรือ placeholder/รูปแบบผิด) → ไม่ยิง Telegram ไม่ยิง LINE ไม่แตะ DB · log NOT_CONFIGURED พร้อมข้อความ · enqueue ล้ม / ไม่มี ADMIN_ALERT_DB_KEY → ADMIN_ALERT_LOST (ไม่ throw) · dedupe_key ค้าง = queued", async () => {
  const f = fetchFake([200]); const db = dbFake(); const errs = []; const oe0 = console.error; console.error = (s) => errs.push(String(s));
  try {
    for (const env of [{ APP_ENV: "staging", ADMIN_ALERT_TELEGRAM_CHAT_ID: "", TELEGRAM_BOT_TOKEN: "" }, { APP_ENV: "staging", ADMIN_ALERT_TELEGRAM_CHAT_ID: "test-placeholder", TELEGRAM_BOT_TOKEN: "test-placeholder" }, { ...ENV, ADMIN_ALERT_TELEGRAM_CHAT_ID: "abc" }]) {
      const x = await A.sendAdminAlert({ category: "ops", text: "hi" }, { env, fetch: f, redis: redisFake(), db });
      assert.equal(x.queued, false); assert.equal(x.reason, "not_configured");
    }
    assert.equal(f.calls.length, 0); assert.equal(db.rows.length, 0, "ไม่ตั้งค่า = ไม่แตะ DB");
    assert.ok(errs.some((l) => l.includes("ADMIN_ALERT_NOT_CONFIGURED") && l.includes("[staging][ops][info]")), "log ต้องมีข้อความเต็มให้ตรวจสอบได้");
  } finally { console.error = oe0; }
  const errs2 = []; const oe2 = console.error; console.error = (s) => errs2.push(String(s));
  try {
    const y = await A.sendAdminAlert({ category: "ops", text: "hi" }, { env: ENV, fetch: fetchFake(["net"]), redis: redisFake(), db: dbFake({ enqueueError: { message: "permission denied for function admin_alert_outbox_enqueue", code: "42501" } }) });
    assert.equal(y.ok, false); assert.equal(y.queued, false); assert.ok(errs2.some((l) => l.includes("ADMIN_ALERT_LOST") && l.includes("permission denied")));
    // ไม่มี ADMIN_ALERT_DB_KEY (ไม่ส่ง deps.db) → ไม่ใช้ client anon · LOST พร้อมเหตุผล db_key_missing · ไม่ throw
    const z = await A.sendAdminAlert({ category: "ops", text: "hi" }, { env: { ...ENV, ADMIN_ALERT_DB_KEY: "", LOCAL_POSTGREST_URL: "http://127.0.0.1:9" }, fetch: fetchFake(["net"]), redis: redisFake() });
    assert.equal(z.queued, false); assert.ok(errs2.some((l) => l.includes("db_key_missing")));
  } finally { console.error = oe2; }
  const dupDb = dbFake(); dupDb.rows.push({ id: 1, p_dedupe_key: "staging:k" });
  const z = await A.sendAdminAlert({ category: "ops", text: "hi", dedupeKey: "k" }, { env: ENV, fetch: fetchFake(["net"]), redis: redisFake(), db: dupDb });
  assert.equal(z.queued, true); assert.equal(dupDb.rows.length, 1);
});

test("sweeper: claim → ส่ง → finish(sent) · ล้ม → finish(retry_after) · ไม่ตั้งค่า = ข้าม · ไม่มี DB key = ข้าม + log · ผู้เรียกเดิมแบบ string ได้", async () => {
  A._resetAdminAlertSweepState();
  const db = dbFake({ claimRows: [{ id: 7, category: "dlq", text: "[staging][dlq][high]\nx" }, { id: 8, category: "critical", text: "[staging][critical][high]\ny" }] });
  const f = fetchFake([200, 429]);
  const s = await A.sweepAdminAlertOutbox({ env: ENV, db, fetch: f });
  assert.deepEqual([s.claimed, s.sent, s.retry, s.failed, s.sentUnrecorded, s.finishFailed], [2, 1, 1, 0, 0, 0]);
  assert.equal(db.finishes[0].p_ok, true); assert.equal(db.finishes[1].p_ok, false); assert.equal(db.finishes[1].p_retry_after_sec, 7); assert.match(db.finishes[1].p_error, /http_429/);
  const n = await A.sweepAdminAlertOutbox({ env: { APP_ENV: "staging", ADMIN_ALERT_TELEGRAM_CHAT_ID: "", TELEGRAM_BOT_TOKEN: "" }, db, fetch: f }); assert.equal(n.skipped, "not_configured");
  assert.equal(f.calls.length, 2, "ไม่ตั้งค่า = ไม่ยิง");
  const errs = []; const oe = console.error; console.error = (x) => errs.push(String(x));
  try { const k = await A.sweepAdminAlertOutbox({ env: { ...ENV, ADMIN_ALERT_DB_KEY: "", LOCAL_POSTGREST_URL: "http://127.0.0.1:9" }, fetch: f }); assert.equal(k.skipped, "db_key_missing"); assert.ok(errs.some((l) => l.includes("ADMIN_ALERT_OUTBOX_DB_KEY_MISSING"))); }
  finally { console.error = oe; }
  const f2 = fetchFake([200]); const x = await A.sendAdminAlert("[CRITICAL] legacy string", { env: ENV, fetch: f2, redis: redisFake(), db: dbFake() });
  assert.equal(x.ok, true); assert.match(f2.calls[0].body.text, /^\[staging\]\[critical\]\[high\]\n\[CRITICAL\] legacy string$/);
});

test("ข้อ 3 Telegram รับแล้วแต่ finish ล้ม (retry 3 ครั้ง) → sentUnrecorded ไม่ใช่ sent · log FINISH_FAILED ระบุ id+ทางกู้ · รอบถัดไป claim id เดิม → finish(ok) โดยไม่ส่งซ้ำ · ส่งล้ม+finish ล้ม = finishFailed", async () => {
  A._resetAdminAlertSweepState();
  const db = dbFake({ claimRows: [{ id: 9, category: "dlq", text: "t" }], finishError: { message: "db down" } });
  const f = fetchFake([200]); const errs = []; const oe = console.error; console.error = (x) => errs.push(String(x)); const logs = []; const ol = console.log; console.log = (x) => logs.push(String(x));
  let s;
  try { s = await A.sweepAdminAlertOutbox({ env: ENV, db, fetch: f }); } finally { console.error = oe; console.log = ol; }
  assert.deepEqual([s.claimed, s.sent, s.sentUnrecorded, s.finishFailed], [1, 0, 1, 0]);
  assert.equal(db.finishes.length, 3, "finish ถูกลองซ้ำ 3 ครั้ง");
  assert.ok(!logs.some((l) => l.includes("ADMIN_ALERT_OUTBOX_SENT")), "ห้ามรายงาน SENT เมื่อบันทึกผลไม่ได้");
  assert.ok(errs.some((l) => l.includes("ADMIN_ALERT_OUTBOX_FINISH_FAILED") && l.includes('"id":9') && l.includes('"telegramDelivered":true') && l.includes("at-least-once")), "ทางกู้ต้องระบุ at-least-once ไม่อ้างว่าซ้ำได้ครั้งเดียว");
  assert.deepEqual(A._sentUnrecordedIds(), [9]);
  // รอบถัดไป: DB กลับมา claim id 9 ได้อีก (sending ค้าง) → ไม่ยิง Telegram ซ้ำ แค่ finish(ok)
  const db2 = dbFake({ claimRows: [{ id: 9, category: "dlq", text: "t" }] }); const f2 = fetchFake([200]);
  const s2 = await A.sweepAdminAlertOutbox({ env: ENV, db: db2, fetch: f2 });
  assert.equal(f2.calls.length, 0, "ไม่ส่งซ้ำ"); assert.equal(s2.sent, 1); assert.equal(s2.recovered, 1); assert.equal(db2.finishes[0].p_ok, true); assert.deepEqual(A._sentUnrecordedIds(), []);
  // Codex รอบ 3 ข้อ 3: A สำเร็จ → B ล้ม → finish ล้ม 3 ครั้ง → claim ใหม่ → ต้องส่งเฉพาะ B (ลำดับ A,B,B ไม่ใช่ A,B,A,B)
  A._resetAdminAlertSweepState();
  const twoPart = "A".repeat(3900) + "\n" + "B".repeat(100);
  const dbP = dbFake({ claimRows: [{ id: 11, category: "ops", text: twoPart }], finishError: { message: "db down" } });
  const fP = fetchFake([200, 500]);
  const oeP = console.error; console.error = () => {};
  let sP; try { sP = await A.sweepAdminAlertOutbox({ env: ENV, db: dbP, fetch: fP }); } finally { console.error = oeP; }
  assert.deepEqual([sP.finishFailed, sP.sentUnrecorded], [1, 0]); assert.equal(dbP.finishes.length, 3); assert.match(dbP.finishes[0].p_text, /ส่วน 2-2[^\n]*\n+B{100}$/);
  assert.deepEqual(Object.keys(A._sweepProgress()), ["11"]); assert.equal(A._sweepProgress()[11].delivered, false); assert.match(A._sweepProgress()[11].remainingText, /B{100}$/); assert.ok(!A._sweepProgress()[11].remainingText.includes("AAAA"));
  const dbP2 = dbFake({ claimRows: [{ id: 11, category: "ops", text: twoPart }] }); const fP2 = fetchFake([200]);
  const sP2 = await A.sweepAdminAlertOutbox({ env: ENV, db: dbP2, fetch: fP2 });
  const seq = [...fP.calls, ...fP2.calls].map((c) => c.body.text.slice(-1));
  assert.deepEqual(seq, ["A", "B", "B"], "ไม่ส่ง A ซ้ำ"); assert.match(fP2.calls[0].body.text, /^\(ต่อ — ส่วน 2-2/, "ส่วนต่อมีหัวบอกว่าเป็นส่วนต่อ (ตรงกับ text ใน DB)");
  assert.ok(!fP2.calls[0].body.text.includes("AAAA") && fP2.calls[0].body.text.endsWith("B".repeat(100)));
  assert.equal(sP2.sent, 1); assert.equal(sP2.recovered, 1); assert.equal(dbP2.finishes[0].p_ok, true); assert.deepEqual(Object.keys(A._sweepProgress()), []);
  // partial อีกครั้งตอนกู้ (B ล้มอีก + finish ล้ม) → progress ยังเป็น B เท่านั้น
  A._resetAdminAlertSweepState();
  const dbP3 = dbFake({ claimRows: [{ id: 12, category: "ops", text: twoPart }], finishError: { message: "db down" } });
  const oe4 = console.error; console.error = () => {};
  try { await A.sweepAdminAlertOutbox({ env: ENV, db: dbP3, fetch: fetchFake([200, 500]) }); const dbP4 = dbFake({ claimRows: [{ id: 12, category: "ops", text: twoPart }], finishError: { message: "db down" } }); const f4 = fetchFake([500]); await A.sweepAdminAlertOutbox({ env: ENV, db: dbP4, fetch: f4 }); assert.equal(f4.calls.length, 1); assert.ok(f4.calls[0].body.text.endsWith("B".repeat(100)) && !f4.calls[0].body.text.includes("AAAA")); assert.match(dbP4.finishes[0].p_text, /B{100}$/); assert.match(A._sweepProgress()[12].remainingText, /B{100}$/); } finally { console.error = oe4; }
  // ส่งล้ม + finish ล้ม → finishFailed (แถวคง sending → claim ใหม่หลัง 10 นาที)
  const db3 = dbFake({ claimRows: [{ id: 10, category: "dlq", text: "t" }], finishError: { message: "db down" } });
  const oe3 = console.error; console.error = () => {};
  let s3; try { s3 = await A.sweepAdminAlertOutbox({ env: ENV, db: db3, fetch: fetchFake([500]) }); } finally { console.error = oe3; }
  assert.deepEqual([s3.finishFailed, s3.sentUnrecorded, s3.retry], [1, 0, 0]);
});

test("ผู้ส่งเดิมไม่มีเส้นทาง LINE แอดมิน (static): DLQ · smartRejection · processScanJob · customerAlerts · ban/money → adminAlert · uid mask · sendTelegramText มี env label · maintenance มี sweep · งานอนุมัติสลิปคงเดิม · service ไม่ใช้ client anon", () => {
  for (const p of ["src/services/maintenanceDlqAlert.service.js", "src/services/scanV2/smartRejection.service.js", "src/services/monitor/customerAlerts.service.js"]) {
    const code = read(p).split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    assert.ok(!/pushMessage\(admin|ADMIN_LINE_USER_ID/.test(code), `${p} ยังมี LINE แอดมิน`);
  }
  const psj = read("src/services/scanV2/processScanJob.service.js");
  assert.ok(!/line_user_id: adminId/.test(psj)); assert.match(psj, /notifyAdminRejectionStreak\(null, lineUserId, rejAttempt, rejReason\)/);
  assert.match(read("src/services/scanV2/smartRejection.service.js"), /maskUid\(lineUserId\)/);
  assert.match(read("src/services/ban/banReconcileQueue.js"), /maskUid\(entry\.uid\)/); assert.match(read("src/stores/conversationMessages.db.js"), /user: \$\{maskUid\(uid\)\}/);
  for (const p of ["src/services/ban/bannedUsers.repo.js", "src/services/ban/banReconcileQueue.js", "src/stores/conversationMessages.db.js"]) assert.ok(!read(p).includes("telegramNotify.service.js"), `${p} ต้องผ่าน adminAlert`);
  assert.match(read("src/services/telegramNotify.service.js"), /const labeled = `\[\$\{envLabel\(\)\}\] /);
  assert.match(read("src/workers/maintenanceWorker.js"), /sweepAdminAlertOutbox\(\)/);
  // ยกเว้น: แจ้งสลิปเข้า pending_verify ยังเป็น LINE แอดมินเหมือนเดิม (Codex ข้อ 2)
  assert.match(read("src/services/adminPaymentSlipNotify.service.js"), /ADMIN_LINE_USER_ID/);
  assert.match(read(".env.example"), /ADMIN_ALERT_TELEGRAM_CHAT_ID=/); assert.match(read(".env.example"), /ADMIN_ALERT_DB_KEY=/);
  const svc = read("src/services/adminAlerts/adminAlert.service.js");
  assert.ok(!svc.includes("config/supabase.js"), "ข้อ 2: ไม่ใช้ client anon ของแอป");
  assert.match(svc, /admin_alert_outbox_enqueue/);
  const dlq = read("src/services/maintenanceDlqAlert.service.js");
  assert.match(dlq, /resolveAdminAlertEnv\(deps\.env, resolveAdminAlertEnv\(env\)\)/, "ข้อ 1: env ที่ส่งให้ adminAlert ต้องมี process.env เป็นฐาน");
  const sqlText = read("sql/068_admin_alert_outbox.sql");
  assert.match(sqlText, /REVOKE ALL ON TABLE public\.admin_alert_outbox FROM PUBLIC, web_anon/); assert.match(sqlText, /CREATE ROLE admin_alert_writer NOLOGIN/);
  assert.ok(!/GRANT [^\n]*TO [^\n]*web_anon/.test(sqlText), "068 ต้องไม่ GRANT ให้ web_anon");
});

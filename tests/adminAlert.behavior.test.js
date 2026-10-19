/**
 * แจ้งเตือนแอดมิน → Telegram เท่านั้น (กบ/Codex 19 ต.ค. 2026)
 *  - [env][category][severity] นำหน้าเสมอ · ส่งสำเร็จ = marker · ส่งไม่ได้ (network/429/timeout/ไม่ตั้งค่า) = outbox (ไม่ fallback LINE ไม่เงียบ)
 *  - outbox insert ล้ม = log ADMIN_ALERT_LOST · sweeper: claim → ส่ง → finish (sent / retry+backoff / failed) · 429 ส่ง retry_after
 *  - ผู้ส่งเดิมไม่มีเส้นทาง LINE แอดมินอีก (static) · uid ถูก mask · sendTelegramText เดิมมี env label
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
const dbFake = ({ insertError = null } = {}) => { const rows = []; return { rows, from: (t) => ({ insert: (r) => ({ select: () => ({ maybeSingle: async () => { if (insertError) return { error: insertError }; rows.push({ id: rows.length + 1, ...r }); return { data: { id: rows.length } }; } }) }) }) }; };

test("config: ต้องมี chat id ชัดเจน (ไม่อนุมานห้อง) · token ใช้ ADMIN_ALERT_TELEGRAM_BOT_TOKEN ก่อน TELEGRAM_BOT_TOKEN", () => {
  assert.equal(A.readAdminAlertConfig({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "123" }), null, "ห้องรายงานเดิมไม่ถูกใช้เป็น alert อัตโนมัติ");
  assert.equal(A.readAdminAlertConfig(ENV).tokenSource, "TELEGRAM_BOT_TOKEN");
  assert.equal(A.readAdminAlertConfig({ ...ENV, ADMIN_ALERT_TELEGRAM_BOT_TOKEN: "987654:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" }).tokenSource, "ADMIN_ALERT_TELEGRAM_BOT_TOKEN");
  assert.equal(A.readAdminAlertConfig({ ...ENV, ADMIN_ALERT_TELEGRAM_CHAT_ID: "test-placeholder" }), null, "placeholder ไม่ใช่การตั้งค่า");
  assert.equal(A.adminAlertEnvLabel({ APP_ENV: "", APP_BASE_URL: "https://scan.my-ener.uk" }), "scan.my-ener.uk");
  assert.match(A.formatAdminAlert({ envLabel: "scan.my-ener.uk", category: "dlq", severity: "high", text: "x" }), /^\[scan\.my-ener\.uk\]\[dlq\]\[high\]\nx$/);
  assert.equal(A.maskUid("U1234567890abcdef"), "U1234567…");
});

test("ส่งสำเร็จ → Telegram ครั้งเดียว + marker dedupe · ส่งซ้ำใน window = deduped ไม่ยิง", async () => {
  const f = fetchFake([200]); const r = redisFake(); const db = dbFake();
  const x = await A.sendAdminAlert({ category: "dlq", severity: "high", text: "dead=1", dedupeKey: "dlq:sig1", dedupeSec: 3600 }, { env: ENV, fetch: f, redis: r, db });
  assert.equal(x.ok, true); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].body.chat_id, ENV.ADMIN_ALERT_TELEGRAM_CHAT_ID); assert.match(f.calls[0].body.text, /^\[staging\]\[dlq\]\[high\]\ndead=1$/);
  assert.equal(r.m.get("admin_alert:sent:staging:dlq:sig1"), "1"); assert.equal(db.rows.length, 0);
  const y = await A.sendAdminAlert({ category: "dlq", severity: "high", text: "dead=1", dedupeKey: "dlq:sig1", dedupeSec: 3600 }, { env: ENV, fetch: f, redis: r, db });
  assert.equal(y.skipped, "deduped"); assert.equal(f.calls.length, 1);
});

test("ส่งไม่ได้ (network / 429 retry_after / 500) → outbox queued ไม่ fallback LINE · 429 เลื่อน next_attempt ตาม retry_after", async () => {
  for (const [plan, reason] of [[["net"], /network/], [[429], /http_429/], [[500], /http_500/]]) {
    const f = fetchFake(plan); const db = dbFake(); const r = redisFake();
    const x = await A.sendAdminAlert({ category: "critical", severity: "high", text: "boom", dedupeKey: "crit:1", dedupeSec: 600 }, { env: ENV, fetch: f, redis: r, db });
    assert.equal(x.ok, false); assert.equal(x.queued, true); assert.match(x.reason, reason);
    assert.equal(db.rows.length, 1); assert.equal(db.rows[0].status, "queued"); assert.equal(db.rows[0].dedupe_key, "staging:crit:1"); assert.match(db.rows[0].text, /^\[staging\]\[critical\]\[high\]/);
    assert.equal(r.m.get("admin_alert:sent:staging:crit:1"), "1", "เข้า outbox แล้ว = ถือว่าแจ้งแล้ว ไม่ยิงซ้ำ");
    if (plan[0] === 429) assert.ok(Date.parse(db.rows[0].next_attempt_at) - Date.now() >= 6000, "retry_after 7s ถูกใช้");
  }
});

test("ไม่ตั้งค่า chat (หรือ placeholder/รูปแบบผิด) → ไม่ยิง Telegram ไม่ยิง LINE ไม่แตะ DB · log ADMIN_ALERT_NOT_CONFIGURED พร้อมข้อความ · outbox insert ล้ม → ADMIN_ALERT_LOST (ไม่ throw)", async () => {
  const f = fetchFake([200]); const db = dbFake(); const errs = []; const oe0 = console.error; console.error = (s) => errs.push(String(s));
  try {
    for (const env of [{ APP_ENV: "staging" }, { APP_ENV: "staging", ADMIN_ALERT_TELEGRAM_CHAT_ID: "test-placeholder", TELEGRAM_BOT_TOKEN: "test-placeholder" }, { ...ENV, ADMIN_ALERT_TELEGRAM_CHAT_ID: "abc" }]) {
      const x = await A.sendAdminAlert({ category: "ops", text: "hi" }, { env, fetch: f, redis: redisFake(), db });
      assert.equal(x.queued, false); assert.equal(x.reason, "not_configured");
    }
    assert.equal(f.calls.length, 0); assert.equal(db.rows.length, 0, "ไม่ตั้งค่า = ไม่แตะ DB");
    assert.ok(errs.some((l) => l.includes("ADMIN_ALERT_NOT_CONFIGURED") && l.includes("[staging][ops][info]")), "log ต้องมีข้อความเต็มให้ตรวจสอบได้");
  } finally { console.error = oe0; }
  const errs2 = []; const oe2 = console.error; console.error = (s) => errs2.push(String(s));
  try {
    const y = await A.sendAdminAlert({ category: "ops", text: "hi" }, { env: ENV, fetch: fetchFake(["net"]), redis: redisFake(), db: dbFake({ insertError: { message: "db down" } }) });
    assert.equal(y.ok, false); assert.equal(y.queued, false); assert.ok(errs2.some((l) => l.includes("ADMIN_ALERT_LOST")));
  } finally { console.error = oe2; }
  // แถวซ้ำใน outbox (dedupe_key ค้าง) = queued แล้ว ไม่ถือว่าหาย
  const z = await A.sendAdminAlert({ category: "ops", text: "hi", dedupeKey: "k" }, { env: ENV, fetch: fetchFake(["net"]), redis: redisFake(), db: dbFake({ insertError: { code: "23505", message: "dup" } }) });
  assert.equal(z.queued, true);
});

test("sweeper: claim → ส่ง → finish(sent) · ล้ม → finish(retry_after) · ไม่ตั้งค่า = log แถวค้าง ไม่ส่ง · ผู้เรียกเดิมแบบ string ได้", async () => {
  const claimed = [{ id: 7, category: "dlq", text: "[staging][dlq][high]\nx" }, { id: 8, category: "critical", text: "[staging][critical][high]\ny" }];
  const finishes = [];
  const db = { from: () => ({ select: () => ({ in: async () => ({ count: 2 }) }) }), rpc: async (fn, args) => { if (fn === "admin_alert_outbox_claim") return { data: claimed }; if (fn === "admin_alert_outbox_finish") { finishes.push(args); return { data: { status: args.p_ok ? "sent" : "queued", attempts: 1 } }; } return { error: { message: "unknown" } }; } };
  const f = fetchFake([200, 429]);
  const s = await A.sweepAdminAlertOutbox({ env: ENV, db, fetch: f });
  assert.deepEqual([s.claimed, s.sent, s.retry, s.failed], [2, 1, 1, 0]);
  assert.equal(finishes[0].p_ok, true); assert.equal(finishes[1].p_ok, false); assert.equal(finishes[1].p_retry_after_sec, 7); assert.match(finishes[1].p_error, /http_429/);
  const n = await A.sweepAdminAlertOutbox({ env: { APP_ENV: "staging" }, db, fetch: f }); assert.equal(n.skipped, "not_configured");
  assert.equal(f.calls.length, 2, "ไม่ตั้งค่า = ไม่ยิง");
  const f2 = fetchFake([200]); const x = await A.sendAdminAlert("[CRITICAL] legacy string", { env: ENV, fetch: f2, redis: redisFake(), db: dbFake() });
  assert.equal(x.ok, true); assert.match(f2.calls[0].body.text, /^\[staging\]\[critical\]\[high\]\n\[CRITICAL\] legacy string$/);
});

test("ผู้ส่งเดิมไม่มีเส้นทาง LINE แอดมิน (static): DLQ · smartRejection · processScanJob · customerAlerts · ban/money → adminAlert · uid mask · sendTelegramText มี env label · maintenance มี sweep · งานอนุมัติสลิปคงเดิม", () => {
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
  assert.match(read(".env.example"), /ADMIN_ALERT_TELEGRAM_CHAT_ID=/);
});

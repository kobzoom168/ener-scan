/**
 * Acceptance tests — incident 20 ส.ค. 2026 (cron ener_chat_quality ล้ม provider
 * timeout + failure message ซ้ำ) + Codex C7 (dedupe fail-open):
 * ชั้น 1 resilience: typed fallback ต่อ model · degraded report ห้ามทิ้งทั้งวัน
 * ชั้น 2 idempotency: lease + sent marker ต่อ chunk/channel · notification ต่อ
 *        {reportDateTH, attempt, failureType}
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  curateWithFallback,
  buildDegradedReport,
  classifyLlmFailure,
} from "../src/services/chatQualityCurated.util.js";
import { runReportDeliveryCycle } from "../src/services/chatQualityReportOutbox.util.js";

/** harness ครบชุดสำหรับ cycle — override ได้ทุกจุด */
function makeDeps(overrides = {}) {
  const store = { ob: null };
  const lease = { held: null, seq: 0 };
  const sends = [];
  const notifies = [];
  const deps = {
    reportDateTH: "2026-08-19",
    loadOutbox: async () => (store.ob ? JSON.parse(JSON.stringify(store.ob)) : null),
    saveOutbox: async (ob) => { store.ob = JSON.parse(JSON.stringify(ob)); },
    acquireLease: async () => {
      if (lease.held) return null;
      lease.held = `t${++lease.seq}`;
      return lease.held;
    },
    releaseLease: async (token) => { if (lease.held === token) lease.held = null; },
    buildBase: async () => ({ text: "BASE_REPORT_TEXT", convCount: 8, deterministicIncidents: 3 }),
    curate: async () => ({ ok: true, text: "CURATED_TEXT", attempts: [{ model: "m1", latencyMs: 10, ok: true }] }),
    buildDegraded: buildDegradedReport,
    chunkText: (t) => [t],
    hashChunk: (t) => `h${t.length}`,
    channels: { telegram: { enabled: true, send: async (t) => { sends.push({ ch: "telegram", t }); return { ok: true }; } } },
    notify: async (t) => { notifies.push(t); return { ok: true }; },
    log: () => {},
    nowIso: () => "2026-08-20T00:00:00Z",
  };
  return { deps: { ...deps, ...overrides }, store, lease, sends, notifies };
}

test("curateWithFallback: ตัวแรก timeout → ตัวสอง succeed + typed attempts ครบ (model/latency/failureReason)", async () => {
  const r = await curateWithFallback("base", {
    models: [
      { model: "google/gemini-2.5-flash", timeoutMs: 10 },
      { model: "deepseek/deepseek-chat", timeoutMs: 10 },
    ],
    callModel: async (model) => {
      if (model.includes("gemini")) throw new Error("gemini_timeout");
      return "curated ok";
    },
    log: () => {},
  });
  assert.equal(r.ok, true);
  assert.equal(r.text, "curated ok");
  assert.equal(r.attempts.length, 2);
  assert.equal(r.attempts[0].failureReason, "provider_timeout");
  assert.equal(typeof r.attempts[0].latencyMs, "number");
  assert.equal(r.attempts[1].ok, true);
});

test("classifyLlmFailure: 504/idle/timeout → provider_timeout · 4xx → provider_rejected", () => {
  assert.equal(classifyLlmFailure(new Error("Upstream idle timeout exceeded")), "provider_timeout");
  assert.equal(classifyLlmFailure(new Error("gemini_timeout")), "provider_timeout");
  assert.equal(classifyLlmFailure(new Error("compat_http_429:rate")), "provider_rejected");
  assert.equal(classifyLlmFailure(new Error("compat_http_502:bad")), "provider_error");
});

test("acceptance: provider timeout ทุกตัว → degraded report ถูกส่ง ไม่สูญหาย + ระบุชัดว่า AI ไม่สำเร็จ + ตัวเลข detector", async () => {
  const h = makeDeps({
    curate: async () => ({
      ok: false,
      failureType: "provider_timeout",
      attempts: [
        { model: "google/gemini-2.5-flash", latencyMs: 45000, failureReason: "provider_timeout" },
        { model: "deepseek/deepseek-chat", latencyMs: 45001, failureReason: "provider_timeout" },
      ],
    }),
  });
  const r = await runReportDeliveryCycle(h.deps);
  assert.equal(r.sent, true);
  assert.equal(r.degraded, true);
  assert.equal(h.sends.length, 1);
  const text = h.sends[0].t;
  assert.ok(text.includes("วิเคราะห์เชิง AI"), "ต้องบอกว่าเป็นชั้นวิเคราะห์ AI");
  assert.ok(text.includes("ไม่สำเร็จ"), "ต้องบอกตรง ๆ ว่าไม่สำเร็จ");
  assert.ok(text.includes("BASE_REPORT_TEXT"), "รายงานดิบต้องติดไปด้วย — ห้ามทิ้งทั้งวัน");
  assert.ok(text.includes("8 ราย") && text.includes("3 รายการ"), "ต้องมีจำนวนแชท + incident จาก detector ไม่ใช้ AI");
  assert.ok(text.includes("provider_timeout"), "typed failure ต้องอยู่ในรายงาน");
  assert.equal(h.store.ob.finalized, true);
});

test("acceptance: callback ซ้อน 2 ตัวพร้อมกัน → ส่งครั้งเดียว (lease กัน) · หลัง finalized รันซ้ำไม่ส่งซ้ำ", async () => {
  const h = makeDeps();
  const [r1, r2] = await Promise.all([runReportDeliveryCycle(h.deps), runReportDeliveryCycle(h.deps)]);
  const skipped = [r1, r2].filter((r) => r.skipped === "lease_unavailable").length;
  assert.equal(skipped, 1, "ตัวที่มาช้าต้องโดน lease กัน");
  assert.equal(h.sends.length, 1, "รายงานออกครั้งเดียว");
  // รันซ้ำหลัง finalized (คนละนาที/คนละ instance) → ไม่ส่งซ้ำ
  const r3 = await runReportDeliveryCycle(h.deps);
  assert.equal(r3.skipped, "finalized");
  assert.equal(h.sends.length, 1);
});

test("acceptance: ส่ง telegram ล้ม → sent marker ไม่ถูกตั้ง → รอบถัดไป retry สำเร็จ + ใช้ base/curated เดิม (reportDateTH เดิม ไม่สร้างซ้ำ)", async () => {
  let fail = true;
  let baseBuilds = 0;
  let curates = 0;
  const h = makeDeps({
    buildBase: async () => { baseBuilds += 1; return { text: "BASE", convCount: 1, deterministicIncidents: 0 }; },
    curate: async () => { curates += 1; return { ok: true, text: "CUR", attempts: [] }; },
    channels: { telegram: { enabled: true, send: async () => (fail ? { ok: false, reason: "http_500" } : { ok: true }) } },
  });
  const r1 = await runReportDeliveryCycle(h.deps);
  assert.equal(r1.sent, false);
  assert.equal(h.store.ob.finalized, false);
  assert.equal(h.store.ob.chunks[0].delivery.telegram.sent, false, "marker ต้องตั้งหลังส่งสำเร็จเท่านั้น");
  fail = false;
  const r2 = await runReportDeliveryCycle(h.deps);
  assert.equal(r2.sent, true);
  assert.equal(baseBuilds, 1, "retry ต้องใช้รายงานเดิม ห้ามสร้างใหม่");
  assert.equal(curates, 1, "curated freeze แล้ว ห้ามเรียก LLM ซ้ำ");
});

test("acceptance: partial chunks — ล้มที่ chunk 2 → รอบถัดไปส่งเฉพาะ chunk ที่ขาด (ไม่ส่ง chunk 1 ซ้ำ)", async () => {
  let failSecond = true;
  const sent = [];
  const h = makeDeps({
    curate: async () => ({ ok: true, text: "A|B|C", attempts: [] }),
    chunkText: (t) => t.split("|"),
    channels: {
      telegram: {
        enabled: true,
        send: async (t) => {
          if (t === "B" && failSecond) return { ok: false, reason: "http_500" };
          sent.push(t);
          return { ok: true };
        },
      },
    },
  });
  const r1 = await runReportDeliveryCycle(h.deps);
  assert.equal(r1.sent, false);
  assert.deepEqual(sent, ["A"], "chunk แรกส่งแล้ว chunk สองล้ม chunk สามต้องยังไม่ถูกส่ง (รักษาลำดับ)");
  failSecond = false;
  const r2 = await runReportDeliveryCycle(h.deps);
  assert.equal(r2.sent, true);
  assert.deepEqual(sent, ["A", "B", "C"], "รอบสองส่งเฉพาะ B,C — A ห้ามซ้ำ");
});

test("acceptance: สองช่องแยกสถานะ — telegram สำเร็จ LINE ล้ม → retry เฉพาะ LINE", async () => {
  let lineFail = true;
  const sent = [];
  const h = makeDeps({
    channels: {
      telegram: { enabled: true, send: async (t) => { sent.push("tg"); return { ok: true }; } },
      line: { enabled: true, send: async (t) => { if (lineFail) return { ok: false, reason: "line_500" }; sent.push("line"); return { ok: true }; } },
    },
  });
  const r1 = await runReportDeliveryCycle(h.deps);
  assert.equal(r1.sent, false);
  assert.deepEqual(sent, ["tg"]);
  lineFail = false;
  const r2 = await runReportDeliveryCycle(h.deps);
  assert.equal(r2.sent, true);
  assert.deepEqual(sent, ["tg", "line"], "telegram ห้ามส่งซ้ำ — retry เฉพาะ channel ที่ค้าง");
});

test("acceptance: base build ล้ม → notification ครั้งเดียวต่อ failureType · attempt ใหม่ตาม renotify แจ้งอีกครั้งพร้อมเลข attempt", async () => {
  const h = makeDeps({
    buildBase: async () => { throw new Error("db down"); },
    renotifyEveryAttempts: 2,
  });
  const r1 = await runReportDeliveryCycle(h.deps);
  assert.equal(r1.failed, "base_build_failed");
  assert.equal(h.notifies.length, 1);
  assert.ok(h.notifies[0].includes("attempt 1") && h.notifies[0].includes("base_build_failed"));
  // attempt 2: ยังไม่ถึง renotify ระยะ (1+2=3) → เงียบ
  const r2 = await runReportDeliveryCycle(h.deps);
  assert.equal(r2.failed, "base_build_failed");
  assert.equal(h.notifies.length, 1, "attempt เดิมซ้ำ/ยังไม่ครบระยะ → ห้ามแจ้งซ้ำ");
  // attempt 3: ครบระยะ → แจ้งใหม่พร้อม attempt ใหม่
  await runReportDeliveryCycle(h.deps);
  assert.equal(h.notifies.length, 2);
  assert.ok(h.notifies[1].includes("attempt 3"), "แจ้งรอบใหม่ต้องระบุ attempt ใหม่");
});

test("acceptance: แจ้งเตือนล้ม (delivery fail) → รอบถัดไป retry ข้อความ attempt เดิม · สำเร็จแล้วหยุด", async () => {
  let notifyFail = true;
  const notifies = [];
  const h = makeDeps({
    buildBase: async () => { throw new Error("db down"); },
    renotifyEveryAttempts: 99,
    notify: async (t) => { notifies.push(t); return notifyFail ? { ok: false, reason: "http_500" } : { ok: true }; },
  });
  await runReportDeliveryCycle(h.deps);
  assert.equal(notifies.length, 1);
  assert.equal(h.store.ob.notifications.base_build_failed.sent, false, "delivery ล้ม = ห้าม mark sent");
  notifyFail = false;
  await runReportDeliveryCycle(h.deps);
  assert.equal(notifies.length, 2, "delivery ก่อนหน้าล้ม → retry ได้");
  assert.ok(notifies[1].includes("attempt 1"), "retry ต้องเป็นข้อความ attempt เดิม ไม่ใช่นับใหม่");
  await runReportDeliveryCycle(h.deps);
  assert.equal(notifies.length, 2, "ส่งสำเร็จแล้ว process ซ้ำ → ไม่ส่งซ้ำ (renotify ยังไม่ครบระยะ)");
});

test("lease ไม่ได้ (redis พัง/ถูกถือ) → ข้ามรอบเฉย ๆ ไม่แตะ outbox ไม่ส่งอะไร (fail-closed)", async () => {
  const h = makeDeps({ acquireLease: async () => null });
  const r = await runReportDeliveryCycle(h.deps);
  assert.equal(r.skipped, "lease_unavailable");
  assert.equal(h.sends.length, 0);
  assert.equal(h.store.ob, null, "ห้ามเขียน outbox โดยไม่มี lease");
});

test("source contract: service เลิกใช้ tryDedupeOnce + มี retry window + LINE channel structure", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync("src/services/chatQualityDailyReport.service.js", "utf8");
  assert.ok(!/import\s*\{[^}]*tryDedupeOnce/.test(src) && !src.includes("tryDedupeOnce("), "C7: ห้าม import/เรียก dedupe fail-open อีก");
  assert.ok(src.includes("REPORT_RETRY_UNTIL_HOUR"), "ต้องมีหน้าต่าง retry ไม่ใช่ชั่วโมงเดียว");
  assert.ok(src.includes("chat_quality_outbox:"), "ต้องมี durable outbox ต่อ reportDateTH");
  assert.ok(src.includes("CHAT_QUALITY_REPORT_LINE_ENABLED"), "โครง channel LINE ต้องมี (ปิด default)");
});

/* ---------------- P0-2 รอบสอง (Codex): lease renewal + ownership ---------------- */

/** lease จำลองมี TTL จริง + renew compare-token */
function makeRenewableLease(ttlMs = 80) {
  const st = { holder: null, expiresAt: 0, seq: 0, renews: 0 };
  return {
    st,
    acquire: async () => {
      const now = Date.now();
      if (st.holder && st.expiresAt > now) return null;
      st.holder = `t${++st.seq}`;
      st.expiresAt = now + ttlMs;
      return st.holder;
    },
    renew: async (token) => {
      st.renews += 1;
      if (st.holder !== token) return false;
      st.expiresAt = Date.now() + ttlMs;
      return true;
    },
    release: async (token) => { if (st.holder === token) st.holder = null; },
  };
}

test("lease-1/3: build นานเกิน TTL + renewal ทำงาน → contender/tick ซ้อน acquire ไม่ได้ · transport ครั้งเดียว", async () => {
  const lease = makeRenewableLease(80);
  const sends = [];
  const mk = (buildDelayMs) => makeDeps({
    acquireLease: lease.acquire,
    releaseLease: lease.release,
    renewLease: lease.renew,
    renewIntervalMs: 20,
    buildBase: async () => {
      await new Promise((r) => setTimeout(r, buildDelayMs));
      return { text: "BASE", convCount: 1, deterministicIncidents: 0 };
    },
    channels: { telegram: { enabled: true, send: async (t) => { sends.push(t); return { ok: true }; } } },
  });
  const a = mk(200); // ยาวเกิน TTL 80ms — รอดด้วย renewal
  const p1 = runReportDeliveryCycle(a.deps);
  await new Promise((r) => setTimeout(r, 150)); // เลย TTL เดิมไปแล้ว — tick ซ้อนเข้ามา
  const b = mk(0);
  const r2 = await runReportDeliveryCycle(b.deps);
  const r1 = await p1;
  assert.equal(r2.skipped, "lease_unavailable", "renewal ต้องกันตัวซ้อนแม้เลย TTL เดิม");
  assert.equal(r1.sent, true);
  assert.equal(sends.length, 1, "transport ต้องถูกเรียกครั้งเดียว");
});

test("lease-2/5: renew=false → owner เก่าห้าม save/send/finalize (outbox ไม่ถูกทับ)", async () => {
  const sends = [];
  const h = makeDeps({
    renewLease: async () => false, // เสีย ownership ตั้งแต่ milestone แรก
    renewIntervalMs: 5,
    channels: { telegram: { enabled: true, send: async (t) => { sends.push(t); return { ok: true }; } } },
  });
  const r = await runReportDeliveryCycle(h.deps);
  assert.equal(r.failed, "lease_lost");
  assert.equal(sends.length, 0, "เสีย lease แล้วห้ามส่ง");
  assert.equal(h.store.ob, null, "เสีย lease แล้วห้ามเขียน outbox (กันทับ owner ใหม่)");
});

test("lease-4: renew timer หยุดหลัง cycle จบ (ทั้ง success และ lease_lost)", async () => {
  const lease = makeRenewableLease(500);
  const h = makeDeps({
    acquireLease: lease.acquire,
    releaseLease: lease.release,
    renewLease: lease.renew,
    renewIntervalMs: 10,
  });
  const r = await runReportDeliveryCycle(h.deps);
  assert.equal(r.sent, true);
  const after = lease.st.renews;
  await new Promise((res) => setTimeout(res, 60));
  assert.equal(lease.st.renews, after, "จบแล้ว interval ต้องถูก clear — ห้าม renew ต่อ");
});

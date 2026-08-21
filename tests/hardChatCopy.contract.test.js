/**
 * Hard tone contract — inventory + runtime (กบ 21 ส.ค. 2026 · Codex รอบสอง P0-1/3/4)
 *
 * รอบแรกตรวจแค่ anchor บางตัว = false green — รอบนี้:
 * 1) inventory: สแกน static customer-visible copy "ทุกไฟล์" ที่ส่งข้อความถึงลูกค้า
 *    ผ่าน checkHardTone จริง (ไม่เลือกตรวจ)
 * 2) runtime: gateway ทุก path (reply / flex / push / sequence) ต้องเรียก guard
 * 3) input matchers ต้องไม่ถูกแตะ (ล็อกพฤติกรรมเดิม)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkHardTone, isHardTone, normalizeInvisible } from "../src/core/conversation/hardTone.util.js";

const read = (...p) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");

/* ---------------- 1) contract ตัวเอง ---------------- */

test("contract: token-aware — ห้าม false positive คำปกติ (บังคับ/คับข้อง) แต่จับ particle จริง", () => {
  assert.equal(isHardTone("บังคับใช้กติกา"), true);
  assert.equal(isHardTone("รับรูปแล้ว"), true);
  assert.equal(isHardTone("เปิดสิทธิ์แล้ว ส่งรูปได้"), true);
  assert.equal(isHardTone("รับรูปแล้วครับ"), false);
  assert.equal(isHardTone("ส่งรูปมาได้ คับ"), false);
  assert.equal(isHardTone("โอเคค่ะ"), false);
});

test("contract: จับ policy words / สัญญาเวลา / malformed / emoji-dash-quote", () => {
  const bad = {
    "ขอบคุณ": "banned_phrase:ขอบคุณ",
    "ไม่เป็นไร ส่งใหม่": "banned_phrase:ไม่เป็นไร",
    "ถามเพิ่มนิดเดียว": "banned_phrase:นิดเดียว",
    "จะส่งผลให้ในแชตนี้": "time_promise",
    "เปิดสิทธิ์ให้ทันที": "time_promise",
    "ใช้ประมาณ 1 นาที": "time_promise",
    "ทันที รอ": "malformed_fragment",
    "อีกค่อยส่งเข้ามาใหม่": "malformed_fragment",
    "รับรูปแล้ว 🙏": "emoji",
    "รับรูปแล้ว — รอผล": "ai_dash",
  };
  for (const [text, code] of Object.entries(bad)) {
    const r = checkHardTone(text);
    assert.equal(r.ok, false, `ต้อง fail: ${text}`);
    assert.ok(r.violations.some((v) => v.startsWith(code.split(":")[0])), `${text} → ${r.violations}`);
  }
});

test("contract: เพดานความยาว — reply / step / bundle มีทั้ง chars และ lines", () => {
  const long = "ก".repeat(60);
  assert.equal(checkHardTone(long).ok, false);
  assert.equal(checkHardTone(long, { kind: "step" }).ok, true);
  assert.equal(checkHardTone("ก".repeat(150), { kind: "step" }).ok, false, "step ต้องมีเพดาน chars");
  assert.equal(checkHardTone("a\nb\nc", { kind: "step" }).ok, false, "step ≤2 บรรทัด");
  assert.equal(checkHardTone("ก".repeat(400), { kind: "bundle" }).ok, false, "bundle ต้องมีเพดาน");
  assert.equal(checkHardTone(Array(9).fill("x").join("\n"), { kind: "bundle" }).ok, false, "bundle ต้องมีเพดานบรรทัด");
});

test("contract: normalize อักขระซ่อน (zero-width/NBSP) ก่อนตรวจ", () => {
  assert.equal(normalizeInvisible("ขอบคุณ​ครับ​"), "ขอบคุณ ครับ");
  assert.equal(isHardTone("ขอบคุณ​ครับ​"), false);
});

/* ---------------- 2) inventory: static copy ทุก surface ---------------- */

/** ไฟล์ที่ส่งข้อความถึงลูกค้า (reply/push/outbound/Flex/LIFF/delayed) — ตรวจทุกไฟล์ ไม่เลือก */
const COPY_FILES = [
  "src/utils/webhookText.util.js",
  "src/core/conversation/deterministicFallbacks.js",
  "src/config/scanOffer.templates.th.js",
  "src/config/replyVariants.th.js",
  "src/utils/scanLockReply.util.js",
  "src/utils/birthdateChangeFlow.util.js",
  "src/services/scanV2/resultStatusReply.util.js",
  "src/services/scanV2/webhookImageIngestion.service.js",
  "src/services/scanV2/scanJobFailureNotify.service.js",
  "src/services/lineWebhook/paywallDefer.util.js",
  "src/services/lineWebhook/deterministicInfoCommand.util.js",
  "src/services/lineWebhook/rankingQueryGate.util.js",
  "src/services/lineWebhook/unsupportedObjectReply.service.js",
  "src/services/objectInfoGate/objectInfoGate.service.js",
  "src/services/synergy/synergyIntro.service.js",
  "src/services/welcome/registrationSuccess.service.js",
  "src/handlers/stickerMessage.handler.js",
  "src/core/conversation/stateSafeClarifier/stateSafeClarifier.service.js",
  "src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js",
];

/** ดึง string literal ที่เป็นภาษาไทย (= customer copy) ออกจากไฟล์ */
function thaiLiterals(src) {
  const out = [];
  const push = (s) => {
    const t = s.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    // ข้าม separator/token สั้น ๆ (เช่น " หรือ ") และ prompt บรรทัดสเปก (ขึ้นด้วย "- ")
    if (!/[ก-๙]/.test(t)) return;
    const trimmed = t.trim();
    if (trimmed.length <= 6 || /^-\s/.test(trimmed) || /=/.test(trimmed)) return;
    out.push(t);
  };
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) push(m[1]);
  for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/gs)) {
    // ตัด interpolation ออกก่อนตรวจ (ค่าเป็น runtime)
    push(m[1].replace(/\$\{[^}]*\}/g, "X"));
  }
  return out;
}

/** บรรทัดที่เป็น comment/regex/prompt — ไม่ใช่ copy */
function stripNonCopy(src) {
  // ตัดสิ่งที่ไม่ใช่ customer copy: comment · regex literal · token set ที่ใช้จับ
  // input (CONFIRM_YES/GENERIC_ACK/exact intent) · ข้อความ Telegram แอดมิน
  let s = src;
  for (const name of ["CONFIRM_YES", "CONFIRM_NO", "GENERIC_ACK", "PAY_INTENT_WORDS", "const exact = new Set(["]) {
    const i = s.indexOf(name);
    if (i >= 0) {
      const j = s.indexOf("]);", i);
      if (j > i) s = s.slice(0, i) + s.slice(j);
    }
  }
  return s
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .filter((l) => !/\/[^/\n]*[ก-๙][^/\n]*\/[gimsuy]*/.test(l)) // regex literal ภาษาไทย
    .filter((l) => !/sendTelegram|\[CRITICAL\]|\[RECOVERY\]|console\.(log|error|warn)/.test(l))
    .filter((l) => !/new Set\(\[.*\]\)/.test(l)) // inline token set = input matcher ไม่ใช่ copy
    .join("\n");
}

test("inventory: static customer copy ทุกไฟล์ผ่าน hard tone contract", () => {
  const failures = [];
  for (const f of COPY_FILES) {
    const src = stripNonCopy(read(f));
    for (const lit of thaiLiterals(src)) {
      const kind = lit.includes("\n") ? "bundle" : "step";
      const r = checkHardTone(lit, { kind });
      if (!r.ok) failures.push(`${f}: ${JSON.stringify(lit.slice(0, 50))} → ${r.violations.join(",")}`);
    }
  }
  assert.deepEqual(failures, [], `static copy ยังผิด contract:\n${failures.join("\n")}`);
});

/* ---------------- 3) runtime interception ---------------- */

test("runtime: gateway ทุก path ที่ส่งจริงต้องผ่าน hard tone guard (reply/flex/push/sequence)", () => {
  const src = read("src", "services", "nonScanReply.gateway.js");
  assert.ok(src.includes("assertHardToneOrLog"), "gateway ต้องเรียก guard");
  // guard อยู่ใน recordSent ซึ่งถูกเรียกทุก path ที่ส่งสำเร็จ
  const fn = src.slice(src.indexOf("function recordSent"), src.indexOf("function recordSent") + 500);
  assert.ok(fn.includes("assertHardToneOrLog"), "guard ต้องอยู่ใน recordSent (ทุก path ส่งจริง)");
  const paths = ["replyFlex(", "pushFlex(", "replyText(", "pushText(", "replyTextSequenceOrSingle("];
  for (const p of paths) assert.ok(src.includes(p), `path ${p} ต้องยังอยู่ใน gateway`);
  const recordCalls = (src.match(/recordSent\(uid, dedupeKey/g) || []).length;
  assert.ok(recordCalls >= 4, `ทุก send path ต้อง recordSent (พบ ${recordCalls})`);
});

test("runtime: guard ไม่แก้ข้อความ (ห้าม sanitize ทีหลัง) — log อย่างเดียว", async () => {
  const { assertHardToneOrLog } = await import("../src/core/conversation/hardTone.util.js");
  const logs = [];
  const orig = console.log;
  console.log = (l) => logs.push(String(l));
  let res;
  try {
    res = assertHardToneOrLog("ขอบคุณครับ", { surface: "test", replyType: "x" });
  } finally { console.log = orig; }
  assert.equal(res.ok, false);
  const ev = logs.map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .find((o) => o && o.event === "HARD_TONE_VIOLATION");
  assert.ok(ev, "ต้อง log violation");
  assert.ok(ev.violations.length >= 1);
  const src = read("src", "core", "conversation", "hardTone.util.js");
  assert.ok(!/function assertHardToneOrLog[\s\S]{0,600}return\s+\w*sanitiz/i.test(src), "ห้ามคืนข้อความที่ถูกแก้");
});

/* ---------------- 4) input matchers ต้องไม่เปลี่ยน ---------------- */

test("input matchers ยังทำงานเดิม (การแก้ copy ห้ามแตะ parser/matcher)", async () => {
  const bd = await import("../src/utils/birthdateChangeFlow.util.js");
  assert.equal(bd.isBirthdateFlowConfirmYes("ครับ"), true);
  assert.equal(bd.isBirthdateFlowConfirmYes("ค่ะ"), true);
  assert.equal(bd.isBirthdateFlowConfirmYes("ใช่ครับ"), true);
  assert.equal(bd.isBirthdateFlowConfirmYes("ไม่ใช่ครับ"), false);

  const mi = await import("../src/utils/stateMicroIntent.util.js");
  const src = read("src", "utils", "stateMicroIntent.util.js");
  assert.ok(src.includes('"ครับ",') && src.includes('"คับ",'), "GENERIC_ACK ต้องคงคำสุภาพไว้จับ input");
  void mi;

  const wt = await import("../src/utils/webhookText.util.js");
  assert.equal(wt.matchesDeterministicPaywallPurchaseIntent("แนวครับ", "แนวครับ"), true);
  assert.equal(wt.matchesDeterministicPaywallPurchaseIntent("แนว", "แนว"), true);

  const cp = await import("../src/core/conversation/closingPleasantry.util.js");
  assert.equal(cp.classifyClosingPleasantry("ขอบคุณครับ"), "unconditional");
  assert.equal(cp.classifyClosingPleasantry("สาธุๆๆคับผมท่านอาจารย์"), "unconditional");
  assert.equal(cp.isPureGreeting("สวัสดีครับ"), true);
});

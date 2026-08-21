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
// hermetic (Codex P1-3): ตั้ง env ที่โมดูล config ต้องการเองในไฟล์นี้ ก่อน dynamic import
for (const [k, v] of Object.entries({
  OPENAI_API_KEY: "sk-test",
  CHANNEL_ACCESS_TOKEN: "test-token",
  CHANNEL_SECRET: "test-secret",
  LOCAL_POSTGREST_URL: "http://127.0.0.1:9",
  LOCAL_POSTGREST_ANON_KEY: "x",
  LOCAL_POSTGREST_SERVICE_KEY: "x",
  SUPABASE_URL: "http://127.0.0.1:9",
  SUPABASE_SERVICE_ROLE_KEY: "x",
  HUMAN_REPLY_DELAY_MS_MAX: "0",
})) if (!process.env[k]) process.env[k] = v;
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

/* ---------------- 2) inventory: derive จาก send-path จริง ---------------- */

/**
 * Codex Blocker 2: ห้าม hardcode ลิสต์ไฟล์ — derive จาก "ไฟล์ที่เรียก send path จริง"
 * (sendNonScanReply / sendNonScanPushMessage / sendNonScanSequenceReply /
 *  pushToCustomer / pushText / pushFlex / replyMessage / insertOutboundMessage)
 * แล้วบวกไฟล์ copy pool ที่ถูก import เข้าไปในนั้น
 */
const SEND_PATH_RE =
  /sendNonScanReply|sendNonScanPushMessage|sendNonScanSequenceReply|sendNonScanPaymentQrInstructions|pushToCustomer|pushText\(|pushFlex\(|replyMessage\(|replyText\(|insertOutboundMessage/;

/** surface ที่ยกเว้นได้ — ต้องมีเหตุผล typed (ห้ามข้ามเงียบ) */
const EXEMPT_FILES = {
  "src/routes/liff.routes.js": "liff_page_html — หน้าเว็บ ไม่ใช่ข้อความแชท",
  "src/app.js": "liff_page_html — error page HTML",
  "src/services/fbShowcase/showcasePhotoCard.service.js": "card_graphic — ข้อความบนการ์ดภาพ ไม่ใช่ข้อความแชท",
  "src/services/reports/reportPayload.builder.js": "scan_report_body",
  "src/templates/reports/mobileReport.template.js": "scan_report_body",
  "src/services/monitor/customerAlerts.service.js": "admin_telegram",
  "src/workers/maintenanceWorker.js": "admin_telegram",
  "src/services/telegramNotify.service.js": "admin_telegram",
  "src/services/chatQualityDailyReport.service.js": "admin_telegram",
  "src/core/conversation/geminiFront/geminiConsultPrompt.js": "llm_prompt — เฟส 2",
  "src/core/conversation/geminiFront/geminiPhrasingPrompt.js": "llm_prompt — เฟส 2",
  "src/config/personaEner.th.js": "llm_prompt — เฟส 2",
  "src/chat/hybridPersona.prompt.js": "llm_prompt — เฟส 2",
  "src/core/conversation/geminiFront/customerFactsContext.util.js": "llm_prompt — context ที่ป้อนโมเดล ไม่ใช่ข้อความลูกค้า",
  "src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js": "llm_prompt+directive — เฟส 2 (ข้อความ safeText ตรวจผ่าน gateway อยู่แล้ว)",
};

function walkSrc(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkSrc(full, acc);
    else if (e.name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

function discoverCopyFiles() {
  const root = path.join(process.cwd(), "src");
  const files = walkSrc(root).map((f) => path.relative(process.cwd(), f));
  return files.filter((f) => {
    if (EXEMPT_FILES[f]) return false;
    const src = fs.readFileSync(f, "utf8");
    if (!/[ก-๙]/.test(src)) return false;
    // ไฟล์ที่ "ส่งเอง" หรือเป็น copy builder/pool ที่ถูกใช้ในเส้นส่ง
    return (
      SEND_PATH_RE.test(src) ||
      /Variants|TEXTS|templates\.th|replyVariants|Fallbacks|WordingPools/.test(f) ||
      /export function build[A-Z]\w*Text|export const [A-Z_]+_TEXTS?|export async function render|buildSynergy/.test(src)
    );
  });
}

/** kind ที่ถูกต้องต่อ literal — bundle เฉพาะ payload รายการ/เงิน (typed ไม่เดาจาก \n) */
function kindForLiteral(file, lit) {
  if (/payment|paywall|scanOffer|quota|slip|qr|synergy|myscans/i.test(file)) return "bundle";
  if (lit.includes("\n")) return "step";
  return lit.trim().length <= 40 ? "reply" : "step";
}

/** ดึง string literal ที่เป็นภาษาไทย (= customer copy) — ห้าม skip เพราะสั้น */
function thaiLiterals(src) {
  const out = [];
  const push = (s) => {
    const t = s.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    if (!/[ก-๙]/.test(t)) return;
    const trimmed = t.trim();
    if (!trimmed) return;
    if (/^-\s/.test(trimmed) || /=/.test(trimmed)) return; // prompt spec line
    // เศษ code fragment จากการ parse (เช่น '", size: ') — ต้องมีคำไทยจริงอย่างน้อย 2 ตัวติดกัน
    if (!/[ก-๙]{2,}/.test(trimmed)) return;
    // fragment จาก parser (มี escaped quote หรือ code separator ปน) — ไม่ใช่ literal เดี่ยว
    if (/\\"|",\s|\s:\s"/.test(t)) return;
    out.push(t);
  };
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) push(m[1]);
  for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/gs)) push(m[1].replace(/\$\{[^}]*\}/g, "X"));
  return out;
}

/** บรรทัดที่ไม่ใช่ customer copy: comment · regex · token set · admin/telegram/log */
/** เหตุผลที่ยกเว้นได้ระดับบรรทัด — นอกลิสต์ = ไม่นับเป็น exemption (test จะ fail) */
const ALLOWED_EXEMPT_REASONS = [
  "admin_command", "admin_telegram", "llm_prompt", "liff_page_html",
  "scan_report_body", "social_caption", "card_graphic", "regex_source", "separator_token",
  "media_only",
];
const LINE_EXEMPT_RE = new RegExp(`tone-exempt:\\s*(${ALLOWED_EXEMPT_REASONS.join("|")})\\b`);

function stripNonCopy(src) {
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
    .filter((l) => !/\/[^/\n]*[ก-๙][^/\n]*\/[gimsuy]*/.test(l))
    .filter((l) => !/sendTelegram|\[CRITICAL\]|\[RECOVERY\]|console\.(log|error|warn)/.test(l))
    .filter((l) => !/new Set\(\[.*\]\)/.test(l))
    // typed exemption ระดับบรรทัด — reason ต้องอยู่ใน allowlist (P1: unknown = fail)
    .filter((l) => !LINE_EXEMPT_RE.test(l))
    .join("\n");
}

test("inventory: ครอบคลุมจาก send-path จริง — ต้องเจอไฟล์หลักครบและมี exemption ที่ระบุเหตุผล", () => {
  const files = discoverCopyFiles();
  assert.ok(files.length >= 25, `inventory ต้อง derive ได้กว้างจริง (ได้ ${files.length})`);
  for (const must of [
    "src/routes/lineWebhook.js",
    "src/utils/webhookText.util.js",
    "src/services/referral/referral.service.js",
    "src/services/objectInfoGate/objectInfoGate.service.js",
  ]) assert.ok(files.includes(must), `ต้องอยู่ใน inventory: ${must}`);
  for (const [f, reason] of Object.entries(EXEMPT_FILES)) {
    assert.ok(reason && reason.length > 5, `exemption ต้องมีเหตุผล: ${f}`);
  }
});

test("inventory: static customer copy ทุกไฟล์ (send-path derived) ผ่าน hard tone contract", () => {
  const failures = [];
  for (const f of discoverCopyFiles()) {
    const src = stripNonCopy(fs.readFileSync(f, "utf8"));
    for (const lit of thaiLiterals(src)) {
      const r = checkHardTone(lit, { kind: kindForLiteral(f, lit) });
      if (!r.ok) failures.push(`${f}: ${JSON.stringify(lit.slice(0, 45))} → ${r.violations.join(",")}`);
    }
  }
  assert.deepEqual(failures, [], `static copy ยังผิด contract (${failures.length}):\n${failures.slice(0, 25).join("\n")}`);
});

test("P1: typed exemption — reason ต้องอยู่ใน allowlist เท่านั้น (unknown ไม่นับ)", () => {
  const files = walkSrc(path.join(process.cwd(), "src")).map((f) => path.relative(process.cwd(), f));
  const bad = [];
  for (const f of files) {
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = /tone-exempt:\s*([\w-]+)/.exec(line);
      if (m && !ALLOWED_EXEMPT_REASONS.includes(m[1])) bad.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, [], `exemption reason นอก allowlist:\n${bad.join("\n")}`);
  assert.ok(ALLOWED_EXEMPT_REASONS.length >= 5);
});

/* ---------------- 3) runtime: behavior ด้วย fake transport ---------------- */

/** fake LINE client — นับ transport จริง (Codex Blocker 4: ห้าม source assertion) */
function fakeClient() {
  const calls = { reply: 0, push: 0, payloads: [] };
  return {
    calls,
    replyMessage: async (_t, m) => { calls.reply += 1; calls.payloads.push(m); },
    pushMessage: async (_u, m) => { calls.push += 1; calls.payloads.push(m); },
  };
}
const uid = () => `u_tone_${Date.now()}_${Math.random().toString(16).slice(2)}`;

test("behavior 1: text reply ผิด contract → transport 0", async () => {
  const { sendNonScanReply } = await import("../src/services/nonScanReply.gateway.js");
  const c = fakeClient();
  const r = await sendNonScanReply({
    client: c, userId: uid(), replyToken: "t", replyType: "x_test",
    text: "ขอบคุณครับ", alternateTexts: [],
  });
  assert.equal(c.calls.reply + c.calls.push, 0, "ข้อความผิดต้องไม่ถูกส่ง");
  assert.equal(r.sent, false);
  assert.equal(r.reason, "hard_tone_rejected");
  assert.ok(r.toneViolations.length >= 1);
});

test("behavior 2: push ผิด contract → transport 0", async () => {
  const { sendNonScanPushMessage } = await import("../src/services/nonScanReply.gateway.js");
  const c = fakeClient();
  const r = await sendNonScanPushMessage({
    client: c, userId: uid(), replyType: "x_test", text: "รอแป๊บนะครับ", alternateTexts: [],
  });
  assert.equal(c.calls.push, 0);
  assert.equal(r.reason, "hard_tone_rejected");
});

test("behavior 3: sequence — bubble ใดผิด ทั้งชุดไม่ส่ง", async () => {
  const { sendNonScanSequenceReply } = await import("../src/services/nonScanReply.gateway.js");
  const c = fakeClient();
  const r = await sendNonScanSequenceReply({
    client: c, userId: uid(), replyToken: "t", replyType: "x_seq",
    messages: ["รับรูปแล้ว", "ขอบคุณครับ"],
  });
  assert.equal(c.calls.reply + c.calls.push, 0, "bubble ผิดหนึ่งตัว = ทั้งชุดห้ามส่ง");
  assert.equal(r.reason, "hard_tone_rejected");
});

test("behavior 4: Flex — altText ผ่านแต่ nested text ผิด → transport 0", async () => {
  const { sendNonScanReply } = await import("../src/services/nonScanReply.gateway.js");
  const c = fakeClient();
  const r = await sendNonScanReply({
    client: c, userId: uid(), replyToken: "t", replyType: "x_flex",
    text: "เปิดรายงาน",
    flexMessage: {
      type: "flex", altText: "เปิดรายงาน",
      contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [
        { type: "text", text: "ขอบคุณครับ ที่ใช้บริการ" },
      ] } },
    },
  });
  assert.equal(c.calls.reply + c.calls.push, 0, "nested text ผิด = ห้ามส่ง");
  assert.equal(r.reason, "hard_tone_rejected");
});

test("behavior 5: candidate แรกผิด → ต้องข้ามไปตัวถัดไปที่ผ่าน ไม่ใช่ส่งตัวผิด", async () => {
  const { sendNonScanReply } = await import("../src/services/nonScanReply.gateway.js");
  const c = fakeClient();
  const r = await sendNonScanReply({
    client: c, userId: uid(), replyToken: "t", replyType: "x_alt",
    text: "ขอบคุณครับ", alternateTexts: ["รับรูปแล้ว"],
  });
  assert.equal(r.sent, true);
  assert.equal(c.calls.reply, 1);
  assert.equal(c.calls.payloads[0].text, "รับรูปแล้ว", "ต้องส่งตัวที่ผ่าน contract เท่านั้น");
});

test("behavior 6: valid reply → transport 1", async () => {
  const { sendNonScanReply } = await import("../src/services/nonScanReply.gateway.js");
  const c = fakeClient();
  const r = await sendNonScanReply({
    client: c, userId: uid(), replyToken: "t", replyType: "x_ok", text: "รับรูปแล้ว",
  });
  assert.equal(r.sent, true);
  assert.equal(c.calls.reply, 1);
});

test("behavior 7: direct customer push ผิด → transport 0", async () => {
  const { pushToCustomer } = await import("../src/services/lineOutbound/customerPush.gateway.js");
  const c = fakeClient();
  const r = await pushToCustomer(c, "U" + "1".repeat(32), [{ type: "text", text: "ขอบคุณครับ" }], {
    source: "test_direct_push",
    isBanned: async () => false, // ผ่าน ban gate จริง → ต้องถูกบล็อกด้วย tone เท่านั้น
  });
  assert.equal(c.calls.push, 0, "transport ต้องเป็น 0");
  assert.equal(r.reason, "hard_tone_rejected");
});

test("behavior 8: typed exemption ใช้ได้เฉพาะ surface ที่อนุมัติ", async () => {
  const { TONE_EXEMPT_SURFACES } = await import("../src/core/conversation/hardTone.util.js");
  assert.ok(TONE_EXEMPT_SURFACES.scan_report_body);
  assert.ok(TONE_EXEMPT_SURFACES.admin_telegram);
  assert.equal(TONE_EXEMPT_SURFACES.random_surface, undefined, "surface นอกลิสต์ยกเว้นไม่ได้");
  for (const [k, v] of Object.entries(TONE_EXEMPT_SURFACES)) {
    assert.ok(String(v).length > 5, `exemption ${k} ต้องมีเหตุผล`);
  }
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

/* ---------------- 5) transport invariant (Codex P1: acceptance 6 ข้อ) ---------------- */

/** ไฟล์ที่ได้รับอนุญาตให้แตะ transport ระดับล่าง */
const APPROVED_TRANSPORT_FILES = new Set([
  "src/services/lineReply.service.js",
  "src/services/lineSequenceReply.service.js",
  "src/services/nonScanReply.gateway.js",
  "src/services/lineOutbound/customerPush.gateway.js",
  "src/utils/lineClientTransport.util.js",
  "src/utils/linePush429Retry.util.js",
  "src/utils/lineNotify429Retry.util.js",
]);

const RAW_ENDPOINT_RE = /api\.line\.me\/v2\/bot\/message\/(push|reply)/;
const DIRECT_CALL_RE = /\bclient\.(replyMessage|pushMessage)\(|\.replyMessage\(|\.pushMessage\(/;

function scanTransportViolations(extraFiles = {}) {
  const files = walkSrc(path.join(process.cwd(), "src")).map((f) => path.relative(process.cwd(), f));
  const out = [];
  const check = (f, src) => {
    if (APPROVED_TRANSPORT_FILES.has(f)) return;
    for (const [i, line] of src.split("\n").entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (/tone-exempt:\s*(admin_command|admin_telegram|media_only)/.test(line)) continue;
      if (RAW_ENDPOINT_RE.test(line)) out.push(`${f}:${i + 1} raw LINE endpoint`);
      else if (DIRECT_CALL_RE.test(line) && !/target\.pushMessage|__reply(Customer|Admin)|replyToCustomer|pushRawToCustomer/.test(line)) {
        out.push(`${f}:${i + 1} direct transport`);
      }
    }
  };
  for (const f of files) check(f, fs.readFileSync(f, "utf8"));
  for (const [f, src] of Object.entries(extraFiles)) check(f, src);
  return out;
}

test("invariant 1-2: ไม่มี direct transport / raw LINE endpoint นอก approved boundary", () => {
  assert.deepEqual(scanTransportViolations(), [], "ต้องผ่าน boundary เท่านั้น");
});

test("invariant 1: fixture ที่มี customer direct transport ใหม่ → ต้อง fail", () => {
  const bad = scanTransportViolations({
    "src/services/__fixture_bad.js": 'await client.replyMessage(token, { type: "text", text: "x" });',
  });
  assert.ok(bad.some((v) => v.includes("__fixture_bad")), "fixture direct transport ต้องถูกจับ");
});

test("invariant 2: fixture ที่มี raw LINE endpoint ใหม่ → ต้อง fail", () => {
  const bad = scanTransportViolations({
    "src/services/__fixture_raw.js": 'await fetch("https://api.line.me/v2/bot/message/push", {});',
  });
  assert.ok(bad.some((v) => v.includes("__fixture_raw")), "raw endpoint ต้องถูกจับ");
});

test("invariant 3: admin transport ที่ประกาศ typed exemption → ผ่าน", () => {
  const ok = scanTransportViolations({
    "src/services/__fixture_admin.js": 'await client.pushMessage(uid, msg); /* tone-exempt: admin_telegram */',
  });
  assert.ok(!ok.some((v) => v.includes("__fixture_admin")), "admin ที่ประกาศชัดต้องผ่าน");
});

test("invariant 4: ไฟล์ที่ exempt ทั้งไฟล์ ห้ามมี customer transport (mixed surface)", () => {
  const mixed = [];
  for (const f of Object.keys(EXEMPT_FILES)) {
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (/tone-exempt:\s*(admin_command|admin_telegram|media_only)/.test(line)) continue;
      if (RAW_ENDPOINT_RE.test(line) || (DIRECT_CALL_RE.test(line) && !/target\.pushMessage|replyToCustomer|pushRawToCustomer/.test(line))) {
        mixed.push(`${f}:${i + 1}`);
      }
    }
  }
  assert.deepEqual(mixed, [], "ไฟล์ exempt ต้องไม่มี customer transport — ต้องแยกไฟล์หรือใช้ line-level");
});

test("invariant 6: reply default — caller ไม่ส่ง toneKind + ข้อความ 41 ตัว → transport 0", async () => {
  const { replyToCustomer } = await import("../src/services/lineOutbound/customerPush.gateway.js");
  const c = fakeClient();
  const text = "ก".repeat(41);
  const r = await replyToCustomer(c, "tok", { type: "text", text }, { source: "unknown_surface" });
  assert.equal(c.calls.reply, 0, "default ต้องเป็น reply (≤40) — ยาวกว่านั้นห้ามส่ง");
  assert.equal(r.reason, "hard_tone_rejected");
});

test("P1: Flex displayText ผิด → transport 0", async () => {
  const { sendNonScanReply } = await import("../src/services/nonScanReply.gateway.js");
  const c = fakeClient();
  const r = await sendNonScanReply({
    client: c, userId: uid(), replyToken: "t", replyType: "x_disp", text: "เปิดรายงาน",
    flexMessage: {
      type: "flex", altText: "เปิดรายงาน",
      contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [
        { type: "button", action: { type: "message", label: "ดู", displayText: "ขอบคุณครับ", text: "x" } },
      ] } },
    },
  });
  assert.equal(c.calls.reply + c.calls.push, 0);
  assert.equal(r.reason, "hard_tone_rejected");
});

test("invariant: raw push boundary ตรวจ payload ก่อนยิง HTTP", async () => {
  const gw = await import("../src/services/lineOutbound/customerPush.gateway.js");
  let fetched = false;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetched = true; return { ok: true }; };
  try {
    const r = await gw.pushRawToCustomer("U" + "2".repeat(32), [{ type: "text", text: "ขอบคุณครับ" }], {
      source: "test_raw", isBanned: async () => false,
    });
    assert.equal(fetched, false, "payload ผิดห้ามยิง HTTP");
    assert.equal(r.reason, "hard_tone_rejected");
  } finally { globalThis.fetch = origFetch; }
});

/* ---------------- 6) typed exemption enforcement (Codex P0-2 acceptance) ---------------- */

const AUDIO_MSG = { type: "audio", originalContentUrl: "https://x/a.m4a", duration: 1000 };

test("exemption 1-3: media_only ตรวจโครงสร้าง payload จริง (audio ผ่าน · text/quickReply ไม่ผ่าน)", async () => {
  const gw = await import("../src/services/lineOutbound/customerPush.gateway.js");
  const mk = () => { const c = fakeClient(); return c; };
  const uidS = "U" + "3".repeat(32);
  let c = mk();
  const ok = await gw.pushToCustomer(c, uidS, [AUDIO_MSG], { toneExemptSurface: "media_only", isBanned: async () => false });
  assert.equal(ok.sent, true);
  assert.equal(c.calls.push, 1);

  c = mk();
  const bad = await gw.pushToCustomer(c, uidS, [{ type: "text", text: "ขอบคุณครับ" }], { toneExemptSurface: "media_only", isBanned: async () => false });
  assert.equal(c.calls.push, 0, "media_only + text ต้องไม่ส่ง");
  assert.equal(bad.exemptionRejected, "not_media_only");

  c = mk();
  const withQr = { ...AUDIO_MSG, quickReply: { items: [{ type: "action", action: { type: "message", label: "ขอบคุณครับ", text: "x" } }] } };
  const bad2 = await gw.pushToCustomer(c, uidS, [withQr], { toneExemptSurface: "media_only", isBanned: async () => false });
  assert.equal(c.calls.push, 0, "audio + quickReply label ผิด ต้องไม่ส่ง");
  assert.equal(bad2.exemptionRejected, "not_media_only");
});

test("exemption 4-5: admin_command ใช้ผ่าน customer boundary ไม่ได้ · verified admin boundary ส่งได้", async () => {
  const gw = await import("../src/services/lineOutbound/customerPush.gateway.js");
  let c = fakeClient();
  const bad = await gw.replyToCustomer(c, "tok", { type: "text", text: "ขอบคุณครับ" }, { toneExemptSurface: "admin_command" });
  assert.equal(c.calls.reply, 0, "customer boundary ห้ามใช้ admin exemption");
  assert.equal(bad.exemptionRejected, "admin_context_required");

  c = fakeClient();
  const okAdmin = await gw.replyToAdmin(c, "tok", { type: "text", text: "ขอบคุณครับ รายงานยาว ๆ ของแอดมิน" }, { verifiedAdmin: true });
  assert.equal(okAdmin.sent, true);
  assert.equal(c.calls.reply, 1);

  c = fakeClient();
  const noCtx = await gw.replyToAdmin(c, "tok", { type: "text", text: "x" }, {});
  assert.equal(c.calls.reply, 0, "ไม่มี verified admin = ห้ามส่ง");
  assert.equal(noCtx.reason, "admin_context_required");
});

test("exemption 6: scan_report_body ใช้ได้เฉพาะ caller ที่อนุมัติ", async () => {
  const gw = await import("../src/services/lineOutbound/customerPush.gateway.js");
  const c = fakeClient();
  const bad = await gw.replyToCustomer(c, "tok", { type: "text", text: "ขอบคุณครับ" }, {
    toneExemptSurface: "scan_report_body", callerId: "random_caller",
  });
  assert.equal(c.calls.reply, 0);
  assert.equal(bad.exemptionRejected, "caller_not_approved");
});

test("exemption: unknown surface → reject (ไม่ใช่ผ่านเงียบ)", async () => {
  const gw = await import("../src/services/lineOutbound/customerPush.gateway.js");
  const c = fakeClient();
  const r = await gw.replyToCustomer(c, "tok", { type: "text", text: "ขอบคุณครับ" }, { toneExemptSurface: "made_up_surface" });
  assert.equal(c.calls.reply, 0);
  assert.equal(r.exemptionRejected, "unknown_exemption");
});

test("P0-3: __replyCustomer ใน lineWebhook ห้ามเติม toneKind เอง (default = reply)", () => {
  const src = read("src", "routes", "lineWebhook.js");
  const fn = src.slice(src.indexOf("async function __replyCustomer"), src.indexOf("async function __replyCustomer") + 700);
  assert.ok(!/toneKind:\s*opts\.toneKind\s*\|\|\s*"step"/.test(fn), "ห้าม default step");
  assert.ok(/\.\.\.\(opts\.toneKind \? \{ toneKind: opts\.toneKind \} : \{\}\)/.test(fn), "ไม่ระบุ = ปล่อยให้ boundary default reply");
  // admin-assist ต้องผ่าน admin boundary
  const aStart = src.indexOf("async function maybeHandleAdminAssist");
  const aEnd = src.indexOf("\nasync function ", aStart + 10);
  const assist = src.slice(aStart, aEnd > aStart ? aEnd : aStart + 4000);
  assert.ok(!assist.includes("__replyCustomer("), "admin-assist ต้องใช้ __replyAdmin");
});

test("P1: synergyIntro — guard reject → ต้องล้าง dedupe ให้ retry ได้ (ไม่ค้าง 365 วัน)", () => {
  const src = read("src", "services", "synergy", "synergyIntro.service.js");
  assert.ok(src.includes("clearDedupeKey"), "ต้อง import/เรียก clearDedupeKey");
  const blocked = src.slice(src.indexOf("if (sent.sent !== true)"), src.indexOf("if (sent.sent !== true)") + 500);
  assert.ok(blocked.includes("clearDedupeKey(`synergy:intro:"), "ส่งไม่สำเร็จต้องคืนสิทธิ์ dedupe");
  assert.ok(blocked.includes("dedupeCleared: true"), "log ต้องบอกตามจริง");
});

test("P1: caller ที่ย้าย boundary ต้องจัดการ sent:false (ไม่เงียบ/ไม่ claim สำเร็จ)", () => {
  for (const [f, marker] of [
    ["src/services/objectInfoGate/objectInfoGate.service.js", "OBJECT_INFO_GATE_ASK_BLOCKED"],
    ["src/services/precheck/precheck.service.js", "PRECHECK_DELAYED_BLOCKED"],
    ["src/services/lineWebhook/multiImageRejectionReply.service.js", "MULTI_IMAGE_VOICE_BLOCKED"],
    ["src/services/welcome/registrationSuccess.service.js", "registration_success_push_blocked"],
    ["src/services/fbShowcase/scanYoutubeShort.service.js", "YT_CLIP_NOTIFY_BLOCKED"],
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    assert.ok(src.includes(marker), `${f} ต้อง log/จัดการเมื่อ transport ถูกบล็อก (${marker})`);
    assert.ok(/sent\s*!==\s*true|pushed\.sent\s*!==\s*true|res\.sent/.test(src), `${f} ต้องตรวจ sent`);
  }
});

test("EXEMPT_FILES ต้องไม่มีไฟล์ mixed surface ที่มี customer boundary calls", () => {
  const CUSTOMER_BOUNDARY_RE = /replyToCustomer\(|pushToCustomer\(|pushRawToCustomer\(|sendNonScanReply\(|sendNonScanPushMessage\(|sendNonScanSequenceReply\(|insertOutboundMessage\(/;
  const bad = [];
  for (const f of Object.keys(EXEMPT_FILES)) {
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (CUSTOMER_BOUNDARY_RE.test(line)) bad.push(`${f}:${i + 1}`);
    }
  }
  assert.deepEqual(bad, [], "ไฟล์ที่ exempt ทั้งไฟล์ห้ามมี customer boundary — ต้องใช้ line-level แทน");
  assert.ok(!EXEMPT_FILES["src/services/welcome/identityQuestion.service.js"], "identityQuestion ห้าม exempt ทั้งไฟล์");
  assert.ok(!EXEMPT_FILES["src/services/fbShowcase/scanYoutubeShort.service.js"], "scanYoutubeShort ห้าม exempt ทั้งไฟล์");
});

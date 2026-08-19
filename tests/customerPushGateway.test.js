/**
 * Codex P0-5: direct push ทุกเส้นต้องเช็คแบน ณ send-time
 * - unit: banned → transport = 0 call · not banned → ส่งปกติ · เช็คพัง → fail-open
 * - inventory: source-scan ทุกไฟล์ใน src ที่ยิง push ต้องผ่าน gateway
 *   หรืออยู่ใน allowlist ที่มีเหตุผลกำกับ (admin-only / in-turn fallback)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { allowCustomerPush, pushToCustomer } from "../src/services/lineOutbound/customerPush.gateway.js";

const bannedCheck = (v) => async () => v;

test("banned → pushToCustomer ไม่แตะ transport เลย (transport=0)", async () => {
  let calls = 0;
  const client = { pushMessage: async () => { calls += 1; } };
  const r = await pushToCustomer(client, "U" + "a".repeat(32), { type: "text", text: "x" }, {
    source: "test", isBanned: bannedCheck(true),
  });
  assert.equal(r.sent, false);
  assert.equal(r.suppressedBanned, true);
  assert.equal(calls, 0);
});

test("ไม่แบน → ส่งปกติ 1 ครั้ง", async () => {
  let calls = 0;
  const client = { pushMessage: async () => { calls += 1; } };
  const r = await pushToCustomer(client, "U" + "b".repeat(32), [{ type: "text", text: "x" }], {
    source: "test", isBanned: bannedCheck(false),
  });
  assert.equal(r.sent, true);
  assert.equal(calls, 1);
});

test("เช็คแบน throw → fail-open ส่งตามปกติ", async () => {
  let calls = 0;
  const client = { pushMessage: async () => { calls += 1; } };
  const r = await pushToCustomer(client, "U" + "c".repeat(32), { type: "text", text: "x" }, {
    source: "test", isBanned: async () => { throw new Error("redis down"); },
  });
  assert.equal(r.sent, true);
  assert.equal(calls, 1);
});

test("uid ว่าง → ไม่ส่ง ไม่เช็ค", async () => {
  let calls = 0;
  const client = { pushMessage: async () => { calls += 1; } };
  const r = await pushToCustomer(client, "", { type: "text", text: "x" }, { isBanned: bannedCheck(false) });
  assert.equal(r.sent, false);
  assert.equal(calls, 0);
});

test("allowCustomerPush: banned → not allowed + suppressedBanned", async () => {
  const r = await allowCustomerPush("U" + "d".repeat(32), { isBanned: bannedCheck(true) });
  assert.equal(r.allowed, false);
  assert.equal(r.suppressedBanned, true);
  const r2 = await allowCustomerPush("U" + "d".repeat(32), { isBanned: bannedCheck(false) });
  assert.equal(r2.allowed, true);
});

/* ---------------- inventory source-scan ---------------- */

// ไฟล์ที่มี push แต่ยกเว้นได้ — ต้องมีเหตุผลชัดเจนต่อไฟล์ (Codex: exempt แบบ explicit)
const EXEMPT = new Map([
  // ส่งหา ADMIN_LINE_USER_ID เท่านั้น
  ["src/services/scanV2/smartRejection.service.js", "admin-only"],
  ["src/services/maintenanceDlqAlert.service.js", "admin-only"],
  ["src/services/monitor/customerAlerts.service.js", "admin-only (LINE alert สั้นถึงแอดมิน)"],
  // gateway เอง
  ["src/services/lineOutbound/customerPush.gateway.js", "gateway"],
  // reply-first gateway: ทำงานเฉพาะใน event turn ซึ่งผ่าน pre-dispatch ban gate แล้ว
  ["src/services/lineWebhook/nonScanReply.gateway.js", "in-turn (pre-dispatch gate ครอบ)"],
  // delivery หลักมี ban gate ของตัวเองใน deliverOutbound (P0-1)
  ["src/services/scanV2/deliverOutbound.service.js", "own ban gate (suppressed_banned)"],
  // transport ชั้นล่าง — ไม่ใช่จุดตัดสินใจ
  ["src/utils/lineClientTransport.util.js", "transport layer"],
  // push fallback ของ reply ใน turn เดียวกับ event (ผ่าน pre-dispatch gate แล้ว) + referral ผ่าน gateway แล้ว
  ["src/routes/lineWebhook.js", "in-turn fallback (pre-dispatch gate ครอบ) + referral ใช้ gateway"],
]);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".js")) acc.push(p);
  }
  return acc;
}

test("inventory: ทุกไฟล์ที่ push ต้องใช้ gateway หรืออยู่ใน allowlist พร้อมเหตุผล", () => {
  const offenders = [];
  for (const f of walk("src")) {
    const rel = f.split(path.sep).join("/");
    const s = fs.readFileSync(f, "utf8");
    const hasPush = /\.pushMessage\(|v2\/bot\/message\/push/.test(s);
    if (!hasPush) continue;
    if (EXEMPT.has(rel)) continue;
    if (s.includes("customerPush.gateway.js")) continue;
    offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `push site ไม่ผ่าน gateway และไม่มีเหตุผลยกเว้น: ${offenders.join(", ")}`);
});

test("inventory: ไฟล์ที่ route ผ่าน gateway แล้วต้องไม่เหลือ raw push นอก gateway call", () => {
  // ไฟล์ที่แก้แล้ว: raw fetch ต้องมี allowCustomerPush นำหน้าเสมอ (เช็คหยาบ: มี import gateway)
  for (const rel of [
    "src/services/welcome/registrationSuccess.service.js",
    "src/services/objectInfoGate/objectInfoGate.service.js",
    "src/services/precheck/precheck.service.js",
    "src/services/lineWebhook/multiImageRejectionReply.service.js",
    "src/services/synergy/synergyIntro.service.js",
    "src/services/fbShowcase/scanYoutubeShort.service.js",
    "src/services/upgradeCredit.service.js",
  ]) {
    const s = fs.readFileSync(rel, "utf8");
    assert.ok(s.includes("customerPush.gateway.js"), `${rel} ไม่ได้ import gateway`);
  }
});

/* ---------------- Codex 18d5d3a: LIFF coverage (P0-4) ---------------- */

test("rejectIfBannedLiff: แบน → 403 generic ก่อนแตะ AI/DB ใด ๆ · ไม่แบน → ผ่าน · เช็คพัง → fail-open", async () => {
  const { rejectIfBannedLiff } = await import("../src/services/ban/liffBanGuard.util.js");
  const makeRes = () => {
    const r = { code: null, body: null };
    r.status = (c) => { r.code = c; return { json: (b) => { r.body = b; } }; };
    return r;
  };
  const uid = "U" + "a".repeat(32);
  const res1 = makeRes();
  assert.equal(await rejectIfBannedLiff(uid, res1, "pay_slip", { isBanned: async () => true }), true);
  assert.equal(res1.code, 403);
  assert.equal(res1.body.error, "unavailable", "ห้ามเฉลยว่าโดนแบน");
  const res2 = makeRes();
  assert.equal(await rejectIfBannedLiff(uid, res2, "pay_slip", { isBanned: async () => false }), false);
  assert.equal(res2.code, null);
  const res3 = makeRes();
  assert.equal(await rejectIfBannedLiff(uid, res3, "pay_slip", { isBanned: async () => { throw new Error("x"); } }), false);
});

test("LIFF: slip/create endpoint เช็คแบนก่อน AI/mutation (source-order)", () => {
  const s = fs.readFileSync("src/routes/liff.routes.js", "utf8");
  // pay/slip: guard ต้องมาก่อน slip vision/upload/mutation ทุกตัว
  const slipStart = s.indexOf('"/api/liff/pay/slip"');
  assert.ok(slipStart > 0);
  const slipGuard = s.indexOf('rejectIfBannedLiff(userId, res, "pay_slip")', slipStart);
  assert.ok(slipGuard > 0, "slip endpoint ต้องมี ban guard");
  for (const aiCall of ["evaluateAwaitingPaymentSlipImage", "uploadSlipImageToStorage", "setPaymentSlipPendingVerify", "runSlipAutoApprovalAfterGateAccept"]) {
    const idx = s.indexOf(aiCall, slipStart);
    assert.ok(idx < 0 || slipGuard < idx, `${aiCall} ต้องอยู่หลัง ban guard`);
  }
  // pay/create: guard ก่อนสร้าง payment
  const createStart = s.indexOf('"/api/liff/pay/create"');
  const createGuard = s.indexOf('rejectIfBannedLiff(userId, res, "pay_create")', createStart);
  assert.ok(createGuard > 0 && createGuard - createStart < 400, "create endpoint ต้องมี guard ต้นทาง");
  // pushText 2 จุด (approved/pending) ต้องผ่าน gateway
  const approvedIdx = s.indexOf('source: "liff_slip_approved"');
  const pendingIdx = s.indexOf('source: "liff_slip_pending"');
  assert.ok(approvedIdx > 0 && pendingIdx > 0, "pushText ทั้งสองจุดต้องผ่าน allowCustomerPush");
});

/* wrapper-level inventory (Codex: จับ pushText/pushFlex/invokeLinePushMessage ด้วย ไม่ใช่แค่ raw transport) */
const WRAPPER_RE = /\bpushText\(|\bpushFlex\(|\bpushTextWithTrailingSticker\(|\binvokeLinePushMessage\(/;
const WRAPPER_EXEMPT = new Map([
  ["src/services/lineSequenceReply.service.js", "wrapper definitions (transport layer)"],
  ["src/utils/linePush429Retry.util.js", "transport retry layer"],
  ["src/utils/lineNotify429Retry.util.js", "transport retry layer"],
  ["src/utils/lineClientTransport.util.js", "transport layer"],
  ["src/services/lineReply.service.js", "reply-first in-turn wrapper"],
  ["src/services/nonScanReply.gateway.js", "in-turn (pre-dispatch gate ครอบ)"],
  ["src/services/adminPaymentSlipNotify.service.js", "admin-only"],
  ["src/services/scanV2/deliverOutbound.service.js", "own ban gate (suppressed_banned)"],
]);

test("inventory (wrapper): ทุกไฟล์ที่เรียก push wrapper ต้องผ่าน gateway หรือ allowlist มีเหตุผล", () => {
  const offenders = [];
  for (const f of walk("src")) {
    const rel = f.split(path.sep).join("/");
    const src = fs.readFileSync(f, "utf8");
    if (!WRAPPER_RE.test(src)) continue;
    if (WRAPPER_EXEMPT.has(rel)) continue;
    if (src.includes("customerPush.gateway.js")) continue;
    offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `wrapper push ไม่ผ่าน gateway: ${offenders.join(", ")}`);
});

/**
 * งาน 3 (กบ 23 ก.ย. 2026) — อนุมัติสลิปผ่าน Telegram
 *
 * ทดสอบ: unauthorized callback · token หมดอายุ/ใช้ซ้ำ · concurrent approval ข้ามช่องทาง ·
 * stale data · DB ล้ม · Telegram/LINE ส่งล้มแล้วไม่เติมสิทธิ์ซ้ำ ·
 * ปิดอยู่โดยค่าเริ่มต้น · ไม่มี AI ตีความ · ไม่มี GET ที่เปลี่ยนสถานะ · ไม่รั่ว token/PII
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const EXTERNAL = { ai: 0 };
globalThis.fetch = async (url) => {
  if (/openai|openrouter|generativelanguage|anthropic|deepseek/i.test(String(url))) EXTERNAL.ai += 1;
  throw new Error("HERMETIC: network blocked");
};

const svc = await import("../src/services/payments/telegramSlipApproval.service.js");

const CFG = {
  token: "bot-token-not-real", chatId: "-1001234567890",
  approvers: new Set(["555000111"]), webhookSecret: "hook-secret",
};
const PAY = {
  paymentId: "11111111-1111-4111-8111-111111111111",
  status: "pending_verify", packageCode: "p49", packageName: "ค่าครูเหมาชุด 49",
  expectedAmount: 49, paymentRef: "PAY-ABC123", lineUserId: "U" + "a".repeat(32),
};
const cb = (data, over = {}) => ({
  id: "cbq1", data,
  from: { id: over.fromId ?? 555000111, username: "someone" },
  message: { message_id: 9, chat: { id: over.chatId ?? -1001234567890 } },
});

/** db ปลอม: เก็บ token ในหน่วยความจำ + จำลอง consume แบบ atomic ครั้งเดียว */
function fakeDb({ expireAll = false, failAudit = false } = {}) {
  const tokens = new Map();
  const audit = [];
  return {
    audit, tokens,
    async rpc(name, args) {
      if (name === "issue_telegram_approval_token") {
        tokens.set(args.p_token, {
          paymentId: args.p_payment_id, snapshotAmount: args.p_amount,
          snapshotPackageCode: args.p_package_code, snapshotStatus: args.p_status,
          used: false, expired: expireAll,
        });
        return { data: true, error: null };
      }
      if (name === "consume_telegram_approval_token") {
        const t = tokens.get(args.p_token);
        if (!t) return { data: { ok: false, reason: "unknown_token" }, error: null };
        if (t.used || t.expired) return { data: { ok: false, reason: "used_or_expired" }, error: null };
        t.used = true;
        return { data: { ok: true, paymentId: t.paymentId, kind: "confirm",
          snapshotAmount: t.snapshotAmount, snapshotPackageCode: t.snapshotPackageCode,
          snapshotStatus: t.snapshotStatus }, error: null };
      }
      if (name === "record_payment_approval_audit") {
        if (failAudit) throw new Error("audit db down");
        audit.push(args);
        return { data: true, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

function mkDeps(over = {}) {
  const db = over.db ?? fakeDb();
  const grants = [];
  const notifies = [];
  return {
    db, grants, notifies,
    config: CFG,
    loadPayment: over.loadPayment ?? (async () => ({ ...PAY })),
    approvePayment: over.approvePayment ?? (async (a) => {
      grants.push(a);
      return { lineUserId: PAY.lineUserId, paidRemainingScans: 4, paidUntil: "2026-09-24T00:00:00Z", paidPlanCode: "p49" };
    }),
    notifyCustomer: over.notifyCustomer ?? (async (a) => { notifies.push(a); return { deduped: false }; }),
  };
}

/* ───────────────────────── config / ปิดอยู่ ───────────────────────── */

test("ปิดอยู่โดยค่าเริ่มต้น และ config ไม่ครบ = ไม่เปิดครึ่ง ๆ", () => {
  const saved = { ...process.env };
  for (const k of ["TELEGRAM_SLIP_APPROVAL_ENABLED","TELEGRAM_BOT_TOKEN","TELEGRAM_CHAT_ID",
                   "TELEGRAM_WEBHOOK_SECRET","TELEGRAM_APPROVER_USER_IDS"]) delete process.env[k];
  assert.equal(svc.readTelegramApprovalConfig(), null, "ไม่ตั้งอะไรเลย = ปิด");
  assert.equal(svc.isTelegramSlipApprovalEnabled(), false);

  process.env.TELEGRAM_SLIP_APPROVAL_ENABLED = "true";
  process.env.TELEGRAM_BOT_TOKEN = "t"; process.env.TELEGRAM_CHAT_ID = "-100";
  process.env.TELEGRAM_WEBHOOK_SECRET = "s";
  assert.equal(svc.readTelegramApprovalConfig(), null, "ไม่มีรายชื่อผู้อนุมัติ = ปิด");
  process.env.TELEGRAM_APPROVER_USER_IDS = "notanumber,  ";
  assert.equal(svc.readTelegramApprovalConfig(), null, "id ไม่ใช่ตัวเลข = ไม่นับ");
  process.env.TELEGRAM_APPROVER_USER_IDS = "555000111";
  assert.ok(svc.readTelegramApprovalConfig(), "ครบแล้วจึงเปิด");
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

/* ───────────────────────── authorization ───────────────────────── */

test("unauthorized: user id ไม่อยู่ในรายชื่อ → ปฏิเสธ ไม่แตะรายการ", async () => {
  const d = mkDeps();
  const out = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`, { fromId: 999999999 }), d);
  assert.equal(out.result, "denied");
  assert.equal(d.grants.length, 0);
  assert.equal(d.db.audit.at(-1).p_result, "denied");
  assert.equal(d.db.audit.at(-1).p_detail.reason, "actor_not_allowed");
});

test("unauthorized: chat id ไม่ตรงห้องที่ตั้งไว้ → ปฏิเสธ (อยู่ในกลุ่มไม่ใช่สิทธิ์)", async () => {
  const d = mkDeps();
  const out = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`, { chatId: -1009999999 }), d);
  assert.equal(out.result, "denied");
  assert.equal(d.db.audit.at(-1).p_detail.reason, "chat_not_allowed");
  assert.equal(d.grants.length, 0);
});

test("สิทธิ์ยึดที่ user id ไม่ใช่ username", () => {
  const src = read("src/services/payments/telegramSlipApproval.service.js");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n");
  assert.ok(!code.includes("username"), "ห้ามใช้ username เป็นสิทธิ์");
  assert.match(code, /cfg\.approvers\.has\(fromId\)/);
  assert.match(code, /chatId !== cfg\.chatId/);
});

/* ───────────────────────── ขั้นยืนยันสองชั้น ───────────────────────── */

test("ขั้น 1 ขอยืนยัน: ยังไม่เปลี่ยนสถานะ และแสดงยอด/แพ็กให้ยืนยันอีกครั้ง", async () => {
  const d = mkDeps();
  const out = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  assert.equal(out.result, "ok");
  assert.equal(d.grants.length, 0, "ขั้นนี้ห้ามเติมสิทธิ์");
  assert.match(out.text, /49 บาท/);
  assert.match(out.text, /ค่าครูเหมาชุด 49/);
  assert.match(out.text, /PAY-ABC123/);
  assert.equal(out.replyMarkup.inline_keyboard[0][0].callback_data.startsWith("cf:"), true);
  assert.equal(d.db.tokens.size, 1, "ต้องออก token ฝั่ง server");
});

test("ขั้น 2 ยืนยัน: เติมสิทธิ์ผ่าน approval service เดิม + แจ้งลูกค้า", async () => {
  const d = mkDeps();
  const step1 = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  const tok = step1.replyMarkup.inline_keyboard[0][0].callback_data;
  const out = await svc.handleApprovalCallback(cb(tok), d);
  assert.equal(out.result, "ok");
  assert.equal(d.grants.length, 1);
  assert.equal(d.grants[0].approvedBy, "telegram:555000111", "audit ต้องรู้ว่าใครอนุมัติ");
  assert.equal(d.notifies.length, 1);
  const a = d.db.audit.at(-1);
  assert.equal(a.p_action, "approve_confirmed");
  assert.equal(a.p_result, "ok");
  assert.equal(a.p_channel, "telegram");
  assert.equal(a.p_actor, "555000111");
});

/* ───────────────────────── token ───────────────────────── */

test("token ใช้ซ้ำไม่ได้ (กดปุ่มเดิมสองครั้ง = เติมสิทธิ์ครั้งเดียว)", async () => {
  const d = mkDeps();
  const step1 = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  const tok = step1.replyMarkup.inline_keyboard[0][0].callback_data;
  const first = await svc.handleApprovalCallback(cb(tok), d);
  const second = await svc.handleApprovalCallback(cb(tok), d);
  assert.equal(first.result, "ok");
  assert.equal(second.result, "denied");
  assert.equal(d.grants.length, 1, "ห้ามเติมสิทธิ์ซ้ำ");
});

test("token หมดอายุ → ปฏิเสธ ไม่เติมสิทธิ์", async () => {
  const d = mkDeps({ db: fakeDb({ expireAll: true }) });
  const step1 = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  const out = await svc.handleApprovalCallback(cb(step1.replyMarkup.inline_keyboard[0][0].callback_data), d);
  assert.equal(out.result, "denied");
  assert.equal(d.grants.length, 0);
});

test("token ที่ไม่รู้จัก (ปลอม callback_data) → ปฏิเสธ", async () => {
  const d = mkDeps();
  const out = await svc.handleApprovalCallback(cb("cf:ปลอมมาเอง"), d);
  assert.equal(out.result, "denied");
  assert.equal(d.grants.length, 0);
});

/* ───────────────────────── stale / concurrent ───────────────────────── */

test("stale: ยอดหรือแพ็กเปลี่ยนหลังออกปุ่ม → ปฏิเสธปุ่มเก่า แสดงข้อมูลใหม่", async () => {
  for (const change of [{ expectedAmount: 99 }, { packageCode: "p399", packageName: "ค่าครูดูแลคลังพลัง" }]) {
    let cur = { ...PAY };
    const d = mkDeps({ loadPayment: async () => ({ ...cur }) });
    const step1 = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
    cur = { ...cur, ...change };                       // ข้อมูลเปลี่ยนระหว่างรอกดยืนยัน
    const out = await svc.handleApprovalCallback(cb(step1.replyMarkup.inline_keyboard[0][0].callback_data), d);
    assert.equal(out.result, "stale", JSON.stringify(change));
    assert.equal(d.grants.length, 0, "ข้อมูลเปลี่ยนแล้วห้ามอนุมัติ");
    assert.match(out.text, /ข้อมูลรายการเปลี่ยนไป/);
  }
});

test("stale: รายการถูกยกเลิก/อนุมัติไปแล้ว → ปุ่มเก่าใช้ไม่ได้", async () => {
  for (const status of ["cancelled", "paid", "expired"]) {
    let cur = { ...PAY };
    const d = mkDeps({ loadPayment: async () => ({ ...cur }) });
    const step1 = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
    cur = { ...cur, status };
    const out = await svc.handleApprovalCallback(cb(step1.replyMarkup.inline_keyboard[0][0].callback_data), d);
    assert.equal(out.result, "stale", status);
    assert.equal(d.grants.length, 0);
  }
});

test("ขั้น 1 กับรายการที่ไม่ได้รอตรวจ → ไม่ออกปุ่มยืนยันให้เลย", async () => {
  const d = mkDeps({ loadPayment: async () => ({ ...PAY, status: "paid" }) });
  const out = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  assert.equal(out.result, "stale");
  assert.equal(d.db.tokens.size, 0);
});

test("concurrent ข้ามช่องทาง: เว็บอนุมัติไปก่อน → Telegram ไม่เติมสิทธิ์ซ้ำ", async () => {
  // approval service เดิมคืนค่าแบบ idempotent (ไม่มี paidUntil/paidRemainingScans)
  const d = mkDeps({
    approvePayment: async (a) => { d.grants.push(a); return { lineUserId: PAY.lineUserId, paidUntil: null, paidRemainingScans: null }; },
  });
  const step1 = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  const out = await svc.handleApprovalCallback(cb(step1.replyMarkup.inline_keyboard[0][0].callback_data), d);
  assert.equal(out.result, "ok");
  assert.match(out.text, /อนุมัติไปแล้ว/);
  assert.equal(d.notifies.length, 0, "อนุมัติไปแล้วต้องไม่แจ้งลูกค้าซ้ำ");
  assert.equal(d.db.audit.at(-1).p_detail.alreadyPaid, true);
});

/* ───────────────────────── ล้มเหลว ───────────────────────── */

test("DB ล้มตอนเติมสิทธิ์ → ตอบว่าไม่สำเร็จ ห้ามบอกว่าอนุมัติแล้ว", async () => {
  const d = mkDeps({ approvePayment: async () => { throw new Error("db connection reset"); } });
  const step1 = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  const out = await svc.handleApprovalCallback(cb(step1.replyMarkup.inline_keyboard[0][0].callback_data), d);
  assert.equal(out.result, "error");
  assert.match(out.text, /ยังไม่เติมสิทธิ์/);
  assert.doesNotMatch(out.text, /อนุมัติแล้ว เติมสิทธิ์/);
  assert.equal(d.db.audit.at(-1).p_result, "error");
});

test("แจ้งลูกค้าล้ม → สิทธิ์ยังอยู่ ไม่เติมซ้ำ และบอกตรง ๆ ว่าจะลองส่งใหม่", async () => {
  const d = mkDeps({ notifyCustomer: async () => { throw new Error("outbound enqueue failed"); } });
  const step1 = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  const out = await svc.handleApprovalCallback(cb(step1.replyMarkup.inline_keyboard[0][0].callback_data), d);
  assert.equal(out.result, "ok");
  assert.equal(d.grants.length, 1, "เติมสิทธิ์ครั้งเดียว");
  assert.match(out.text, /ส่งข้อความแจ้งลูกค้าไม่สำเร็จ/);
  assert.match(out.text, /ไม่เติมสิทธิ์ซ้ำ/);
  assert.equal(d.db.audit.at(-1).p_detail.customerNotified, false);
});

test("audit เขียนไม่ได้ ต้องไม่ทำให้การอนุมัติพัง", async () => {
  const d = mkDeps({ db: fakeDb({ failAudit: true }) });
  const step1 = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  const out = await svc.handleApprovalCallback(cb(step1.replyMarkup.inline_keyboard[0][0].callback_data), d);
  assert.equal(out.result, "ok");
  assert.equal(d.grants.length, 1);
});

test("แจ้งเตือนล้ม (Telegram ส่งไม่ออก) ต้องไม่ throw และไม่อนุมัติอะไร", async () => {
  const out = await svc.notifyTelegramSlipPendingVerify(
    { paymentId: PAY.paymentId, expectedAmount: 49, slipAmount: 49 },
    { config: CFG, db: fakeDb(), loadSlipBytes: async () => null,
      sendSlip: async () => { throw new Error("telegram down"); } },
  );
  assert.equal(out.ok, false);
  assert.equal(out.reason, "send_failed");
});

/* ───────────────────────── ข้อความ / ความปลอดภัย ───────────────────────── */

test("ข้อความแยกข้อเท็จจริงจากข้อมูลที่ยังไม่ยืนยัน และไม่อัปเกรดแพ็กเองเมื่อยอดไม่ตรง", () => {
  const ok = svc.buildPendingSlipMessage({ ...PAY, slipAmount: 49, reasons: ["ocr_low_confidence"] });
  assert.match(ok, /ข้อเท็จจริงจากระบบ/);
  assert.match(ok, /ข้อมูลที่ยังไม่ยืนยัน/);
  assert.match(ok, /ยอดตรงกับแพ็ก/);
  assert.match(ok, /ocr_low_confidence/);
  assert.match(ok, /ยังไม่เปลี่ยนสถานะ/);

  const mismatch = svc.buildPendingSlipMessage({ ...PAY, slipAmount: 20, reasons: [] });
  assert.match(mismatch, /ยอดไม่ตรงกับแพ็ก/);
  assert.match(mismatch, /ระบบจะไม่เปลี่ยนแพ็กให้/);
  const unreadable = svc.buildPendingSlipMessage({ ...PAY, slipAmount: null, reasons: [] });
  assert.match(unreadable, /อ่านไม่ได้/);
  assert.match(unreadable, /ต้องตรวจด้วยตา/);
});

test("ไม่ใช้ AI ตีความคำว่าอนุมัติ และไม่มี GET ที่เปลี่ยนสถานะ", async () => {
  const before = EXTERNAL.ai;
  const d = mkDeps();
  await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  await svc.handleApprovalCallback(cb("cf:bogus"), d);
  assert.equal(EXTERNAL.ai, before, "เส้นอนุมัติต้องไม่เรียก AI");

  const route = read("src/routes/telegramWebhook.routes.js");
  assert.match(route, /router\.post\("\/telegram\/webhook"/);
  assert.ok(!/router\.get\(/.test(route), "ห้ามมี GET ในเส้นนี้");
  assert.match(route, /x-telegram-bot-api-secret-token/);
  assert.match(route, /crypto\.timingSafeEqual/);
  assert.match(route, /if \(!cb\) return res\.status\(200\)/, "อัปเดตที่ไม่ใช่ปุ่มต้องไม่ทำอะไร");
  const svcSrc = read("src/services/payments/telegramSlipApproval.service.js");
  for (const ai of ["openai", "gemini", "deepseek", "openrouter", "llm"])
    assert.ok(!new RegExp(ai, "i").test(svcSrc.replace(/llm\\./g, "")), `ห้ามมี ${ai} ในเส้นอนุมัติ`);
});

test("ไม่รั่ว token/ข้อมูลส่วนตัว และไม่เปิด URL สลิปสาธารณะ", () => {
  const src = read("src/services/payments/telegramSlipApproval.service.js");
  // log ทุกจุดต้องไม่พก token ของ bot หรือ callback token
  for (const m of src.match(/console\.(log|error|warn)\([\s\S]{0,400}?\)\);/g) || []) {
    assert.ok(!/cfg\.token|p_token|\btoken\b\s*[,:]/.test(m), `log รั่ว token: ${m.slice(0, 80)}`);
  }
  assert.match(src, /form\.append\("photo"/, "ต้องส่งรูปเป็นไบต์");
  assert.ok(!/photo:\s*`?\$\{?url/.test(src), "ห้ามส่ง URL สลิปให้ Telegram ดึงเอง");
  // ข้อความแจ้งเตือนต้องไม่มี UID เต็ม
  const msg = svc.buildPendingSlipMessage({ ...PAY, slipAmount: 49, reasons: [] });
  assert.ok(!msg.includes(PAY.lineUserId), "ห้ามใส่ UID เต็มในข้อความ");
  assert.match(msg, /ผู้ใช้ LINE: U{0,1}a{0,8}…|ผู้ใช้ LINE: .{1,10}…/);
});

test("ช่องทาง LINE เดิมไม่ถูกแตะ และ Telegram ล้มไม่กระทบ", () => {
  const notify = read("src/services/adminPaymentSlipNotify.service.js");
  assert.match(notify, /invokeLinePushMessage/, "LINE push เดิมต้องยังอยู่");
  assert.match(notify, /ADMIN_SLIP_PENDING_VERIFY_PUSH_OK/);
  assert.match(notify, /notifyTelegramSlipPendingVerify/);
  assert.match(notify, /ADMIN_SLIP_TELEGRAM_NOTIFY_FAIL/, "Telegram ล้มต้องถูกจับ ไม่ throw ออกไป");
  // Telegram ถูกเรียกก่อนเงื่อนไขของ LINE → ปิด LINE ไว้ Telegram ยังทำงาน
  assert.ok(notify.indexOf("notifyTelegramSlipPendingVerify")
    < notify.indexOf("ADMIN_PAYMENT_SLIP_NOTIFY) return"), "สองช่องทางต้องไม่ผูกเงื่อนไขกัน");
});

test("ไม่เขียนทางลัดเติมโควตา — ต้องผ่าน approval service เดิมเท่านั้น", () => {
  const src = read("src/services/payments/telegramSlipApproval.service.js");
  for (const shortcut of ["paid_until", "bonus_scans", "grantEntitlement", "from(\"payments\")", "update("])
    assert.ok(!src.includes(shortcut), `ห้ามแตะสิทธิ์ตรง ๆ: ${shortcut}`);
  const route = read("src/routes/telegramWebhook.routes.js");
  assert.match(route, /payments\.markPaymentApprovedAndUnlock\(/,
    "ต้องเรียก approval service เดิม ไม่เขียนเส้นเติมสิทธิ์เอง");
  assert.match(route, /channel: "telegram"/, "ต้องระบุช่องทางลง audit");
  assert.match(route, /expect,/, "ต้องส่ง snapshot ไปตรวจในทรานแซกชันเดียวกับการอนุมัติ");
  assert.match(route, /enqueueApproveNotify/, "แจ้งลูกค้าต้องผ่านคิวเดิมที่มี retry");
  // เส้นเติมสิทธิ์ต้องเป็น transaction เดียวใน DB ไม่ใช่สองสเต็ปในโค้ด
  const store = read("src/stores/payments.db.js");
  assert.match(store, /approve_payment_and_grant/, "ต้องผ่าน RPC ที่เป็นทรานแซกชันเดียว");
  assert.ok(!store.includes("grantEntitlementForPackage"), "ต้องไม่เหลือเส้นเติมสิทธิ์แบบสองสเต็ป");
});

/**
 * ปุ่ม "ไม่อนุมัติ" ใน Telegram (กบ/Codex 20 ต.ค. 2026): 3 ขั้น rj → rr(เหตุผล) → rc(ยืนยัน) · token ครั้งเดียว/ชนิดสลับไม่ได้ · ปฏิเสธแบบ atomic ใน DB
 *  - ไม่เติมสิทธิ์ ไม่หักสิทธิ์เดิม · paid แล้วไม่เปลี่ยน · กดซ้ำไม่ซ้ำ · แจ้งลูกค้า 1 ครั้ง ไม่อ้างคืนเงิน · เงินที่อาจเข้าแล้ว = money_pending ไม่ปิดเรื่องเงิน
 *  - ข้อความสลิปรอตรวจต้องมียอด/แพ็กจริง (เติมจาก DB เมื่อผู้เรียกไม่ส่ง — บั๊ก PAY-AB51E942)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "" })) process.env[k] ??= v;
globalThis.fetch = async () => { throw new Error("external network forbidden"); };
const svc = await import("../src/services/payments/telegramSlipApproval.service.js");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const CFG = { token: "123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", chatId: "-5564579265", approvers: new Set(["7486743496"]), webhookSecret: "s".repeat(40), source: "db" };
const PAY = { paymentId: "c9d2b025-e7a6-49c3-aef2-41122ebb73f8", status: "pending_verify", packageCode: "29baht_1scan_24h", packageName: "29 บาท 1 ครั้ง", expectedAmount: 29, slipAmount: 10, paymentRef: "PAY-AB51E942", lineUserId: "U3e463f4aaaaaaaaaaaaaaaaaaaaaaaaa" };
const cb = (data, from = "7486743496", chat = CFG.chatId) => ({ id: "cbq1", data, from: { id: Number(from) }, message: { chat: { id: Number(chat) }, message_id: 10 } });

function fakeDb() {
  const tokens = new Map(); const audit = [];
  return { tokens, audit,
    async rpc(name, args) {
      if (name === "issue_telegram_approval_token") { tokens.set(args.p_token, { paymentId: args.p_payment_id, kind: "confirm", snapshotAmount: args.p_amount, snapshotPackageCode: args.p_package_code, snapshotStatus: args.p_status, used: false }); return { data: true, error: null }; }
      if (name === "issue_telegram_reject_token") { if (!/^[a-z_]{2,32}$/.test(args.p_reason_code || "")) return { data: null, error: { message: "reason_code_required" } }; tokens.set(args.p_token, { paymentId: args.p_payment_id, kind: "reject_confirm", rejectReasonCode: args.p_reason_code, snapshotStatus: args.p_status, used: false }); return { data: true, error: null }; }
      if (name === "consume_telegram_approval_token") { const t = tokens.get(args.p_token); if (!t) return { data: { ok: false, reason: "unknown_token" }, error: null }; if (t.used) return { data: { ok: false, reason: "used_or_expired" }, error: null }; t.used = true; return { data: { ok: true, paymentId: t.paymentId, kind: t.kind, snapshotAmount: t.snapshotAmount ?? null, snapshotPackageCode: t.snapshotPackageCode ?? null, snapshotStatus: t.snapshotStatus, rejectReasonCode: t.rejectReasonCode ?? null }, error: null }; }
      if (name === "record_payment_approval_audit") { audit.push(args); return { data: true, error: null }; }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}
function mkDeps(over = {}) {
  const db = over.db ?? fakeDb(); const rejects = []; const notifies = []; const grants = [];
  let status = over.status ?? "pending_verify";
  return { db, rejects, notifies, grants, config: CFG,
    loadPayment: over.loadPayment ?? (async () => ({ ...PAY, status })),
    approvePayment: async (a) => { grants.push(a); return { lineUserId: PAY.lineUserId, paidRemainingScans: 1, paidUntil: "x", paidPlanCode: "p" }; },
    notifyCustomer: async () => ({ deduped: false }),
    rejectPayment: over.rejectPayment ?? (async (a) => { rejects.push(a); status = "rejected"; return { ok: true, already: false, lineUserId: PAY.lineUserId, paymentRef: PAY.paymentRef, slipAmount: PAY.slipAmount, expectedAmount: PAY.expectedAmount, settlementStatus: a.moneyPending ? "money_pending" : "none" }; }),
    notifyCustomerReject: over.notifyCustomerReject ?? (async (a) => { notifies.push(a); return { deduped: false }; }),
  };
}
const acts = (db, action) => db.audit.filter((a) => a.p_action === action).map((a) => a.p_result);

test("ข้อความสลิปรอตรวจ: ปุ่ม 2 ปุ่ม (อนุมัติ/ไม่อนุมัติ) และเติมยอด/แพ็กจาก DB เมื่อผู้เรียกไม่ส่ง (ไม่ขึ้น '-' / 'อ่านไม่ได้' ทั้งที่ reason=amount_mismatch)", async () => {
  const sent = []; const db = fakeDb();
  const r = await svc.notifyTelegramSlipPendingVerify({ paymentId: PAY.paymentId, paymentRef: PAY.paymentRef, packageCode: PAY.packageCode, reasons: ["amount_mismatch"] }, { config: CFG, db, loadSlipBytes: async () => null, sendSlip: async (_cfg, m) => { sent.push(m); return {}; }, loadPaymentSummary: async () => ({ expected_amount: 29, slip_amount: 10, package_name: "29 บาท 1 ครั้ง", package_code: "29baht_1scan_24h", payment_ref: "PAY-AB51E942" }) });
  assert.equal(r.ok, true);
  const kb = sent[0].replyMarkup.inline_keyboard[0];
  assert.deepEqual(kb.map((b) => b.text), ["อนุมัติรายการนี้", "ไม่อนุมัติ"]); assert.equal(kb[1].callback_data, `rj:${PAY.paymentId}`);
  assert.match(sent[0].caption, /ยอดที่ต้องชำระ: 29 บาท/); assert.match(sent[0].caption, /ยอดที่อ่านได้จากสลิป: 10 บาท/); assert.match(sent[0].caption, /ยอดไม่ตรงกับแพ็ก/); assert.match(sent[0].caption, /29 บาท 1 ครั้ง/);
  assert.doesNotMatch(sent[0].caption, /ยอดที่ต้องชำระ: -/); assert.doesNotMatch(sent[0].caption, /อ่านไม่ได้/);
});

test("rj ขั้น 1: ผู้ไม่มีสิทธิ์ถูกปฏิเสธ · รายการรอตรวจ → คีย์บอร์ดเหตุผล 6 แบบ ไม่เปลี่ยนสถานะ · ไม่รอตรวจ → stale", async () => {
  const d = mkDeps();
  const denied = await svc.handleApprovalCallback(cb(`rj:${PAY.paymentId}`, "999"), d);
  assert.equal(denied.result, "denied"); assert.equal(d.rejects.length, 0);
  const r = await svc.handleApprovalCallback(cb(`rj:${PAY.paymentId}`), d);
  assert.equal(r.action, "request"); assert.equal(r.result, "ok"); assert.match(r.text, /ยังไม่เปลี่ยนสถานะ/);
  const btns = r.replyMarkup.inline_keyboard.flat();
  assert.equal(btns.length, 6); assert.ok(btns.every((b) => b.callback_data.startsWith(`rr:${PAY.paymentId}:`)));
  assert.deepEqual(btns.map((b) => b.callback_data.split(":")[2]), svc.REJECT_REASONS.map((x) => x.code));
  assert.equal(d.rejects.length, 0); assert.equal(d.grants.length, 0); assert.deepEqual(acts(d.db, "reject_requested"), ["ok"]);
  const stale = await svc.handleApprovalCallback(cb(`rj:${PAY.paymentId}`), mkDeps({ status: "paid" }));
  assert.equal(stale.result, "stale"); assert.match(stale.text, /paid/);
});

test("rr ขั้น 2: ออก token ชนิด reject_confirm พร้อมเหตุผล · ข้อความบอกผลที่จะเกิดครบ (ไม่เติม/ไม่หัก/ลูกค้าได้ข้อความ 1 ครั้ง) · ยอดไม่ตรง = เงินรอดำเนินการ · สลิปไม่ชัด+อ่านยอดไม่ได้ = ไม่บันทึกเรื่องเงิน", async () => {
  const d = mkDeps();
  const r = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), d);
  assert.equal(r.result, "ok"); const tok = r.replyMarkup.inline_keyboard[0][0].callback_data; assert.match(tok, /^rc:/);
  const t = d.db.tokens.get(tok.slice(3)); assert.equal(t.kind, "reject_confirm"); assert.equal(t.rejectReasonCode, "amount");
  for (const s of ["ยืนยันการไม่อนุมัติ", "ไม่เติมสิทธิ์ และไม่หักสิทธิ์เดิม", "อนุมัติไปแล้วจะไม่ถูกเปลี่ยน", "ทาง LINE 1 ครั้ง (ไม่อ้างว่าคืนเงินแล้ว)", "เงินรอดำเนินการ", "ยอดที่ต้องชำระ: 29 บาท · ยอดที่อ่านได้จากสลิป: 10 บาท", "เหตุผล: ยอดเงินไม่ตรง"]) assert.ok(r.text.includes(s), s);
  assert.equal(d.rejects.length, 0, "ขั้น 2 ยังไม่ปฏิเสธจริง");
  const d2 = mkDeps({ loadPayment: async () => ({ ...PAY, slipAmount: null }) });
  const r2 = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:blur`), d2);
  assert.match(r2.text, /ไม่มีการบันทึกเรื่องเงิน/); assert.doesNotMatch(r2.text, /เงินรอดำเนินการ/);
  const bad = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:hack`), mkDeps());
  assert.equal(bad.result, "error"); assert.match(bad.text, /เหตุผลไม่ถูกต้อง/);
  const stale = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), mkDeps({ status: "rejected" }));
  assert.equal(stale.result, "stale");
});

test("rc ขั้น 3: ปฏิเสธครั้งเดียว (actor/เหตุผล/moneyPending ถูกส่งเข้า DB atomic) · ไม่เรียก approve · แจ้งลูกค้า 1 ครั้ง · กดซ้ำ = token ใช้แล้ว ไม่ปฏิเสธ/ไม่แจ้งซ้ำ", async () => {
  const d = mkDeps();
  const r2 = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), d);
  const data = r2.replyMarkup.inline_keyboard[0][0].callback_data;
  const r3 = await svc.handleApprovalCallback(cb(data), d);
  assert.equal(r3.action, "confirm"); assert.equal(r3.result, "ok"); assert.match(r3.text, /ไม่อนุมัติแล้ว ไม่เติมสิทธิ์ ไม่หักสิทธิ์เดิม/); assert.match(r3.text, /เงินรอดำเนินการ: ยอดที่อ่านได้ 10 บาท/); assert.match(r3.text, /แจ้งลูกค้าทาง LINE แล้ว/);
  assert.equal(d.rejects.length, 1); assert.deepEqual(d.rejects[0], { paymentId: PAY.paymentId, actor: "telegram:7486743496", reasonCode: "amount", reasonText: "ยอดเงินไม่ตรง", moneyPending: true });
  assert.equal(d.grants.length, 0, "ห้ามแตะเส้นเติมสิทธิ์"); assert.equal(d.notifies.length, 1); assert.equal(d.notifies[0].moneyPending, true);
  assert.deepEqual(acts(d.db, "reject_confirmed"), ["ok"]);
  const again = await svc.handleApprovalCallback(cb(data), d);
  assert.equal(again.result, "denied"); assert.match(again.text, /ใช้ไม่ได้แล้ว/); assert.equal(d.rejects.length, 1); assert.equal(d.notifies.length, 1);
  // หลังปฏิเสธ: กดอนุมัติ (ap) → stale เพราะสถานะเป็น rejected
  const ap = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d);
  assert.equal(ap.result, "stale"); assert.equal(d.grants.length, 0);
});

test("ชนิด token สลับกันไม่ได้: token อนุมัติใช้กับ rc ไม่ได้ · token ไม่อนุมัติใช้กับ cf ไม่ได้ (ไม่เติม ไม่ปฏิเสธ)", async () => {
  const d = mkDeps();
  const ap = await svc.handleApprovalCallback(cb(`ap:${PAY.paymentId}`), d); const cfTok = ap.replyMarkup.inline_keyboard[0][0].callback_data.slice(3);
  const rr = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:blur`), d); const rcTok = rr.replyMarkup.inline_keyboard[0][0].callback_data.slice(3);
  const x = await svc.handleApprovalCallback(cb(`rc:${cfTok}`), d); assert.equal(x.result, "denied"); assert.match(x.text, /ไม่ใช่ปุ่มยืนยันไม่อนุมัติ/);
  const y = await svc.handleApprovalCallback(cb(`cf:${rcTok}`), d); assert.equal(y.result, "denied"); assert.match(y.text, /ไม่ใช่ปุ่มยืนยันอนุมัติ/);
  assert.equal(d.rejects.length, 0); assert.equal(d.grants.length, 0); assert.equal(d.notifies.length, 0);
});

test("ชนกับอนุมัติ/ปฏิเสธไปแล้ว: DB ตอบ already_paid → ไม่เปลี่ยน ไม่แจ้ง · already rejected → ไม่แจ้งซ้ำ · DB ล้ม → บอกว่าไม่สำเร็จ ไม่แจ้ง", async () => {
  const run = async (rejectPayment) => { const d = mkDeps({ rejectPayment }); const rr = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), d); const r = await svc.handleApprovalCallback(cb(rr.replyMarkup.inline_keyboard[0][0].callback_data), d); return { r, d }; };
  let { r, d } = await run(async () => ({ ok: false, reason: "already_paid", status: "paid" }));
  assert.equal(r.result, "stale"); assert.match(r.text, /อนุมัติไปแล้ว/); assert.equal(d.notifies.length, 0); assert.deepEqual(acts(d.db, "reject_confirmed"), ["stale"]);
  ({ r, d } = await run(async () => ({ ok: true, already: true, lineUserId: PAY.lineUserId })));
  assert.equal(r.result, "ok"); assert.match(r.text, /ถูกปฏิเสธไปแล้ว/); assert.equal(d.notifies.length, 0);
  ({ r, d } = await run(async () => { throw new Error("db down"); }));
  assert.equal(r.result, "error"); assert.match(r.text, /ยังไม่เปลี่ยนสถานะ/); assert.equal(d.notifies.length, 0); assert.deepEqual(acts(d.db, "reject_confirmed"), ["error"]);
});

test("static: webhook deps ครบ · markPaymentRejected ใช้ RPC atomic · ข้อความลูกค้าไม่อ้างคืนเงิน/รวมสลิป · admin ส่ง moneyPending + มี route settlement · 069/md5/preflight", () => {
  const route = read("src/routes/telegramWebhook.routes.js");
  assert.ok(!read("src/services/payments/telegramSlipApproval.service.js").includes('from("payments")'), "service ห้ามอ่านตาราง payments ตรง (ผ่าน store)");
  assert.match(route, /async rejectPayment\(\{ paymentId, actor, reasonCode, reasonText, moneyPending \}\)/); assert.match(route, /async notifyCustomerReject\(/); assert.match(route, /slipAmount: data\.slip_amount/);
  const store = read("src/stores/payments.db.js");
  assert.match(store, /supabase\.rpc\("reject_payment_atomic"/); assert.doesNotMatch(store.split("export async function markPaymentRejected")[1].split("\n}\n")[0], /\.update\(\{\s*status: "rejected"/, "ห้าม update ตรงแบบไม่ล็อก");
  const util = read("src/utils/webhookText.util.js");
  assert.match(util, /moneyPending = false/); assert.match(util, /ทางร้านจะติดต่อเรื่องยอดนั้นในแชตนี้ครับ ยังไม่ต้องโอนเพิ่ม/);
  const fnBody = util.split("export function buildPaymentRejectedText")[1].split("\nexport ")[0];
  assert.doesNotMatch(fnBody, /คืนเงินแล้ว|รวมสลิป|รวมยอด/);
  const admin = read("src/routes/adminPaymentsDashboard.routes.js");
  assert.match(admin, /moneyPending: \["amount", "expired", "other"\]\.includes\(preset\)/); assert.match(admin, /router\.post\("\/admin\/payments\/:id\/settlement"/); assert.match(admin, /payment_settlement_resolve/); assert.match(admin, /function settlementBlockHtml/);
  const sql = read("sql/069_telegram_reject_and_settlement.sql");
  for (const s of ["kind IN ('confirm','reject_confirm')", "FUNCTION public.reject_payment_atomic", "FOR UPDATE", "IF pay.status = 'paid' THEN", "settlement_status IN ('none','money_pending','refunded','topped_up','written_off')", "FUNCTION public.payment_settlement_resolve", "settlement_note_required"]) assert.ok(sql.includes(s), s);
  assert.doesNotMatch(sql, /app_users|paid_remaining_scans|paid_until/, "069 ต้องไม่แตะสิทธิ์ผู้ใช้");
  const md5 = read("scripts/ops/migration-function-md5.reference.txt");
  for (const f of ["issue_telegram_reject_token", "reject_payment_atomic", "payment_settlement_resolve"]) assert.match(md5, new RegExp(`^${f} [0-9a-f]{32}$`, "m"));
  assert.match(read("scripts/ops/preflight-three-tasks-migrations.sql"), /069 RPCs present \(3/);
  assert.match(read("package.json"), /tests\/telegramSlipReject\.behavior\.test\.js/);
});

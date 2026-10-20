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
  const db = over.db ?? fakeDb(); const rejects = []; const notifies = []; const grants = []; const marks = [];
  let status = over.status ?? "pending_verify";
  return { db, rejects, notifies, grants, marks, config: CFG,
    loadPayment: over.loadPayment ?? (async () => ({ ...PAY, status })),
    approvePayment: async (a) => { grants.push(a); return { lineUserId: PAY.lineUserId, paidRemainingScans: 1, paidUntil: "x", paidPlanCode: "p" }; },
    notifyCustomer: async () => ({ deduped: false }),
    // เหมือน DB (sql/069): money_pending ตัดสินจาก flag ผู้เรียก OR slip_amount>0 ของแถวที่ล็อก · notifyPending=true จนแอป mark
    rejectPayment: over.rejectPayment ?? (async (a) => { rejects.push(a); status = "rejected"; const slip = over.slipAmount === undefined ? PAY.slipAmount : over.slipAmount; const money = Boolean(a.moneyPending) || Number(slip) > 0; return { ok: true, already: false, lineUserId: PAY.lineUserId, paymentRef: PAY.paymentRef, slipAmount: slip, expectedAmount: PAY.expectedAmount, settlementStatus: money ? "money_pending" : "none", notifyPending: true }; }),
    notifyCustomerReject: over.notifyCustomerReject ?? (async (a) => { notifies.push(a); return { id: "ob-1", status: "queued", deduped: false }; }),
    markRejectNotifyQueued: over.markRejectNotifyQueued ?? (async (id) => { marks.push(id); return true; }),
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
  const d2 = mkDeps({ loadPayment: async () => ({ ...PAY, slipAmount: null }), slipAmount: null });
  const r2 = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:blur`), d2);
  assert.match(r2.text, /ไม่มีการบันทึกเรื่องเงิน/); assert.doesNotMatch(r2.text, /เงินรอดำเนินการ/);
  // Admin/Telegram ได้ผลเหมือนกัน: "สลิปไม่ชัด" แต่สลิปอ่านยอดได้ → DB ตัดสินเป็น money_pending แม้ผู้กดไม่ได้บอก
  const d3 = mkDeps(); const rr3 = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:blur`), d3); const r3b = await svc.handleApprovalCallback(cb(rr3.replyMarkup.inline_keyboard[0][0].callback_data), d3);
  assert.equal(d3.rejects[0].moneyPending, true, "slipAmount 10 > 0 → คำใบ้ = เงินอาจเข้า"); assert.match(r3b.text, /เงินรอดำเนินการ/); assert.equal(d3.notifies[0].moneyPending, true, "ข้อความลูกค้าใช้ค่าจาก DB");
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
  assert.equal(r3.action, "confirm"); assert.equal(r3.result, "ok"); assert.match(r3.text, /ไม่อนุมัติแล้ว ไม่เติมสิทธิ์ ไม่หักสิทธิ์เดิม/); assert.match(r3.text, /เงินรอดำเนินการ: ยอดที่อ่านได้ 10 บาท/);
  assert.match(r3.text, /เข้าคิวแจ้งลูกค้าทาง LINE แล้ว \(ยังไม่ยืนยันว่าส่งถึง\)/, "ต้องแยก 'เข้าคิว' จาก 'ส่งถึง'"); assert.doesNotMatch(r3.text, /แจ้งลูกค้าทาง LINE แล้ว$/m);
  assert.equal(d.rejects.length, 1); assert.deepEqual(d.rejects[0], { paymentId: PAY.paymentId, actor: "telegram:7486743496", channel: "telegram", reasonCode: "amount", reasonText: "ยอดเงินไม่ตรง", moneyPending: true });
  assert.equal(d.grants.length, 0, "ห้ามแตะเส้นเติมสิทธิ์"); assert.equal(d.notifies.length, 1); assert.equal(d.notifies[0].moneyPending, true); assert.deepEqual(d.marks, [PAY.paymentId], "mark queued หลัง enqueue สำเร็จครั้งเดียว");
  assert.deepEqual(acts(d.db, "reject_confirmed"), ["ok"]);
  const again = await svc.handleApprovalCallback(cb(data), d);
  assert.equal(again.result, "denied"); assert.match(again.text, /ใช้ไม่ได้แล้ว/); assert.equal(d.rejects.length, 1); assert.equal(d.notifies.length, 1); assert.equal(d.marks.length, 1);
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

test("enqueue แจ้งลูกค้าล้ม: ปฏิเสธสำเร็จแล้ว ไม่ mark queued (pending คงใน DB ให้ sweep กู้) · ข้อความบอกว่าเข้าคิวไม่สำเร็จ ระบบจะลองใหม่ · กดซ้ำได้ already + เข้าคิวที่ค้าง", async () => {
  let fail = true;
  const d = mkDeps({ notifyCustomerReject: async (a) => { if (fail) throw new Error("outbound insert failed"); d.notifies.push(a); return { id: "ob-1", deduped: false }; } });
  const rr = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), d);
  const oe = console.error; console.error = () => {};
  let r; try { r = await svc.handleApprovalCallback(cb(rr.replyMarkup.inline_keyboard[0][0].callback_data), d); } finally { console.error = oe; }
  assert.equal(r.result, "ok"); assert.match(r.text, /เข้าคิวแจ้งลูกค้าไม่สำเร็จ — ระบบจะลองเข้าคิวใหม่เอง/); assert.equal(d.marks.length, 0, "ห้าม mark ว่าเข้าคิวแล้วเมื่อ enqueue ล้ม"); assert.equal(d.rejects.length, 1);
  // รอบถัดไป (เช่นกดจากปุ่มใหม่): DB ตอบ already + notifyPending=true → ลองเข้าคิวอีกครั้ง แล้ว mark
  fail = false;
  // รอบ 3: DB ปิดเรื่องเงินไปแล้ว (refunded) และผู้กดครั้งใหม่เลือกเหตุผล "amount" — ข้อความลูกค้าต้องมาจาก snapshot ตอนปฏิเสธจริง (blur + moneyPending=true) ไม่ใช่ค่าใหม่/ค่าปัจจุบัน
  const snapshot = { reasonText: "สลิปไม่ชัด", reasonCode: "blur", moneyPending: true, rejectedAt: "2026-10-20T05:00:00Z" };
  const d2 = mkDeps({ rejectPayment: async () => ({ ok: true, already: true, lineUserId: PAY.lineUserId, slipAmount: 10, settlementStatus: "refunded", notifyPending: true, notifySnapshot: snapshot }), notifyCustomerReject: async (a) => { d2.notifies.push(a); return { id: "ob-9", status: "queued", deduped: false }; } });
  const rr2 = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), d2);
  const r2 = await svc.handleApprovalCallback(cb(rr2.replyMarkup.inline_keyboard[0][0].callback_data), d2);
  assert.match(r2.text, /ถูกปฏิเสธไปแล้วก่อนหน้านี้ — เข้าคิวแจ้งลูกค้าที่ค้างอยู่ให้แล้ว/); assert.equal(d2.notifies.length, 1); assert.deepEqual(d2.marks, [PAY.paymentId]);
  assert.equal(d2.notifies[0].reasonText, "สลิปไม่ชัด", "ใช้เหตุผลจาก snapshot ไม่ใช่คำขอครั้งใหม่ (amount)"); assert.equal(d2.notifies[0].moneyPending, true, "moneyPending จาก snapshot ไม่ใช่ settlement ปัจจุบัน (refunded)");
  // enqueue ตอบกลับโดยไม่มี id (ยืนยันแถว outbound ไม่ได้) → ถือว่าเข้าคิวไม่สำเร็จ ไม่ mark
  const d4 = mkDeps({ notifyCustomerReject: async () => ({ deduped: false }) });
  const rr4 = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), d4);
  const oe4 = console.error; console.error = () => {};
  let r4; try { r4 = await svc.handleApprovalCallback(cb(rr4.replyMarkup.inline_keyboard[0][0].callback_data), d4); } finally { console.error = oe4; }
  assert.match(r4.text, /เข้าคิวแจ้งลูกค้าไม่สำเร็จ/); assert.equal(d4.marks.length, 0, "ไม่มีแถว outbound ยืนยัน = ห้าม mark");
  // รอบ 4 (Codex): แถวเดิม failed/dead (stuck) — หยุดวน (mark) ได้เฉพาะเมื่อส่งต่อแอดมินสำเร็จ (sent) หรือเข้าคิวแจ้งเตือนถาวร (queued) · lost = คง pending · ข้อความ/audit แยกสถานะชัด
  const stuckRun = async (adminAlert, already = false) => {
    const d = mkDeps({ notifyCustomerReject: async () => ({ id: "ob-dead", status: "dead", deduped: true, stuck: true, adminAlert }), ...(already ? { rejectPayment: async () => ({ ok: true, already: true, lineUserId: PAY.lineUserId, settlementStatus: "money_pending", notifyPending: true, notifySnapshot: { reasonText: "x", moneyPending: true } }) } : {}) });
    const rr = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), d);
    const oe = console.error; console.error = () => {};
    let r; try { r = await svc.handleApprovalCallback(cb(rr.replyMarkup.inline_keyboard[0][0].callback_data), d); } finally { console.error = oe; }
    const audit = d.db.audit.filter((a) => a.p_action === "reject_confirmed").map((a) => a.p_detail)[0];
    return { r, d, audit };
  };
  let s5 = await stuckRun("sent");
  assert.match(s5.r.text, /ข้อความแจ้งลูกค้าค้าง \(outbound dead ก่อนหน้า\) ระบบไม่สร้างซ้ำ — แจ้งแอดมินสำเร็จแล้ว/); assert.doesNotMatch(s5.r.text, /เข้าคิวแจ้งลูกค้าทาง LINE แล้ว/); assert.deepEqual(s5.d.marks, [PAY.paymentId], "ส่งต่อแอดมินสำเร็จ → หยุดวนได้");
  assert.deepEqual([s5.audit.notify.state, s5.audit.notify.marked, s5.audit.notify.customerQueued, s5.audit.notify.adminAlert], ["stuck_alert_sent", true, false, "sent"], "audit ต้องไม่บอกว่า queued ลูกค้า");
  s5 = await stuckRun("queued");
  assert.match(s5.r.text, /เข้าคิวแจ้งแอดมินแล้ว \(ยังไม่ยืนยันว่าแอดมินได้รับ\)/); assert.deepEqual(s5.d.marks, [PAY.paymentId]); assert.equal(s5.audit.notify.state, "stuck_alert_queued");
  s5 = await stuckRun("lost");
  assert.match(s5.r.text, /แจ้งแอดมินไม่สำเร็จ ระบบจะลองแจ้งแอดมินใหม่เอง \(ไม่สร้างข้อความลูกค้าใหม่/); assert.equal(s5.d.marks.length, 0, "alert สูญหาย → ห้ามล้าง pending"); assert.deepEqual([s5.audit.notify.state, s5.audit.notify.marked], ["stuck_alert_lost", false]);
  s5 = await stuckRun(undefined); assert.equal(s5.d.marks.length, 0, "ไม่รู้ผล alert = lost"); assert.equal(s5.audit.notify.state, "stuck_alert_lost");
  // already + stuck → ห้ามตอบว่า "เข้าคิวแจ้งลูกค้าที่ค้างอยู่ให้แล้ว"
  s5 = await stuckRun("sent", true);
  assert.match(s5.r.text, /ถูกปฏิเสธไปแล้วก่อนหน้านี้ — ข้อความแจ้งลูกค้าค้าง/); assert.doesNotMatch(s5.r.text, /เข้าคิวแจ้งลูกค้าที่ค้างอยู่ให้แล้ว/); assert.deepEqual(s5.d.marks, [PAY.paymentId]); assert.equal(s5.audit.already, true); assert.equal(s5.audit.notify.state, "stuck_alert_sent");
  s5 = await stuckRun("lost", true);
  assert.match(s5.r.text, /ถูกปฏิเสธไปแล้วก่อนหน้านี้ — ข้อความแจ้งลูกค้าค้าง.*แจ้งแอดมินไม่สำเร็จ/); assert.equal(s5.d.marks.length, 0);
  // deduped แถวมีชีวิต (sent แล้ว) → ไม่สร้างซ้ำ แต่ mark ได้ · already + deduped_live ไม่พูดว่า "เข้าคิวให้แล้ว"
  const d6 = mkDeps({ notifyCustomerReject: async () => ({ id: "ob-s", status: "sent", deduped: true, stuck: false }) });
  const rr6 = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), d6); const r6 = await svc.handleApprovalCallback(cb(rr6.replyMarkup.inline_keyboard[0][0].callback_data), d6);
  assert.match(r6.text, /มีในคิว\/ส่งแล้วอยู่ก่อน \(sent\) ไม่สร้างซ้ำ/); assert.deepEqual(d6.marks, [PAY.paymentId]);
  // already + notifyPending=false (เข้าคิวไปแล้ว) → ไม่แจ้งซ้ำ
  const d3 = mkDeps({ rejectPayment: async () => ({ ok: true, already: true, lineUserId: PAY.lineUserId, settlementStatus: "money_pending", notifyPending: false }) });
  const rr3 = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), d3);
  const r3 = await svc.handleApprovalCallback(cb(rr3.replyMarkup.inline_keyboard[0][0].callback_data), d3);
  assert.match(r3.text, /ไม่เปลี่ยนอะไร/); assert.equal(d3.notifies.length, 0);
});

test("ชนกับอนุมัติ/ปฏิเสธไปแล้ว: DB ตอบ already_paid → ไม่เปลี่ยน ไม่แจ้ง · already rejected (เข้าคิวแล้ว) → ไม่แจ้งซ้ำ · DB ล้ม → บอกว่าไม่สำเร็จ ไม่แจ้ง", async () => {
  const run = async (rejectPayment) => { const d = mkDeps({ rejectPayment }); const rr = await svc.handleApprovalCallback(cb(`rr:${PAY.paymentId}:amount`), d); const r = await svc.handleApprovalCallback(cb(rr.replyMarkup.inline_keyboard[0][0].callback_data), d); return { r, d }; };
  let { r, d } = await run(async () => ({ ok: false, reason: "already_paid", status: "paid" }));
  assert.equal(r.result, "stale"); assert.match(r.text, /อนุมัติไปแล้ว/); assert.equal(d.notifies.length, 0); assert.deepEqual(acts(d.db, "reject_confirmed"), ["stale"]);
  ({ r, d } = await run(async () => ({ ok: true, already: true, lineUserId: PAY.lineUserId, notifyPending: false })));
  assert.equal(r.result, "ok"); assert.match(r.text, /ถูกปฏิเสธไปแล้ว/); assert.equal(d.notifies.length, 0);
  ({ r, d } = await run(async () => { throw new Error("db down"); }));
  assert.equal(r.result, "error"); assert.match(r.text, /ยังไม่เปลี่ยนสถานะ/); assert.equal(d.notifies.length, 0); assert.deepEqual(acts(d.db, "reject_confirmed"), ["error"]);
});

test("static: role จำกัด payment_ops_writer (ไม่ใช่ anon) · webhook/admin ผ่าน store · ข้อความลูกค้าเส้นเงินรอดำเนินการไม่ชวนชำระใหม่ · admin CSRF+คอลัมน์ settlement+detail · sweep ใน maintenance · 069/md5/preflight", () => {
  assert.ok(!read("src/services/payments/telegramSlipApproval.service.js").includes('from("payments")'), "service ห้ามอ่านตาราง payments ตรง (ผ่าน store)");
  const route = read("src/routes/telegramWebhook.routes.js");
  assert.match(route, /async rejectPayment\(\{ paymentId, actor, channel, reasonCode, reasonText, moneyPending \}\)/); assert.match(route, /channel: channel \|\| "telegram"/); assert.match(route, /async markRejectNotifyQueued\(paymentId\)/); assert.match(route, /paymentOps\.store\.js/);
  const store = read("src/stores/payments.db.js");
  assert.match(store, /import\("\.\/paymentOps\.store\.js"\)/); assert.doesNotMatch(store, /supabase\.rpc\("reject_payment_atomic"/, "ห้ามใช้ client anon เรียก reject");
  for (const q of ["payment_ref,settlement_status,settlement_note,settlement_by", "slip_ref,settlement_status,settlement_note,settlement_by"]) assert.ok(store.includes(q), "list query ต้องเลือกคอลัมน์ settlement: " + q);
  const ops = read("src/stores/paymentOps.store.js");
  assert.match(ops, /PAYMENT_OPS_DB_KEY/); assert.doesNotMatch(ops, /LOCAL_POSTGREST_ANON_KEY|config\/supabase/, "store จำกัดต้องไม่ใช้ anon key");
  const util = read("src/utils/webhookText.util.js");
  const fnBody = util.split("export function buildPaymentRejectedText")[1].split("\nexport ")[0];
  assert.match(fnBody, /ยังไม่ต้องโอนเพิ่มหรือส่งสลิปใหม่/); assert.match(fnBody, /if \(moneyPending\) \{[\s\S]*?return lines\.join/, "เส้น moneyPending ต้อง return ก่อนบรรทัดชวนเริ่มชำระใหม่");
  const admin = read("src/routes/adminPaymentsDashboard.routes.js");
  assert.match(admin, /moneyPending: moneyPendingNow, notifyPending, notifySnapshot \} = await markPaymentRejected/); assert.match(admin, /channel: "web"/); assert.match(admin, /if \(lineUserId && notifyPending\)/);
  assert.match(admin, /rejectNotifyTextFromSnapshot\(notifySnapshot/, "Admin ใช้ snapshot ทำข้อความลูกค้า"); assert.match(admin, /const oc = rejectNotifyOutcome\(rejectEnq\);\s*\n\s*if \(!oc\.markable\) throw/, "Admin mark queued เฉพาะ markable (เกณฑ์เดียวกับ Telegram/sweep)");
  assert.match(read("src/services/payments/telegramSlipApproval.service.js"), /if \(oc\.markable && typeof deps\.markRejectNotifyQueued/); assert.match(read("src/services/payments/rejectNotifySweep.service.js"), /const oc = rejectNotifyOutcome\(q\);\s*\n\s*if \(!oc\.markable\)/);
  assert.match(admin, /router\.post\("\/admin\/payments\/:id\/settlement", requireAdminSessionOnly/, "settlement ต้อง session-only (ไม่รับ legacy token)");
  assert.doesNotMatch(admin, /settlement", requireAdminSession,/); assert.match(admin, /req\.session\?\.admin\?\.loginAt/, "actor จาก session.admin.loginAt");
  assert.match(read("src/routes/adminAuth.routes.js"), /req\.session\.admin = \{ authenticated: true, loginAt: new Date\(\)\.toISOString\(\) \}/, "login ต้องตั้ง loginAt");
  const enq = read("src/services/scanV2/outboundAdminEnqueue.service.js");
  assert.match(enq, /findOutboundByPaymentAndKindAnyStatus/, "dedupe ต้องดูทุกสถานะ"); assert.match(enq, /"23505"/, "unique violation = dedupe"); assert.doesNotMatch(enq.split("export async function enqueueRejectNotify")[1].split("\nasync function")[0], /findActiveOutboundByPaymentAndKind\(/);
  const sweep = read("src/services/payments/rejectNotifySweep.service.js");
  assert.match(sweep, /rejectNotifyTextFromSnapshot\(r\.reject_notify_snapshot/); assert.match(sweep, /if \(!oc\.markable\)/); assert.doesNotMatch(sweep, /if \(!q\?\.id\)/, "sweep ต้องตัดสินด้วย rejectNotifyOutcome ไม่ใช่แค่ id");
  const sel = store.split("const ADMIN_PAYMENT_LIST_SELECT")[1].split("`;")[0]; for (const c of ["settlement_status", "settlement_note", "settlement_by"]) assert.ok(sel.includes(c), "ADMIN_PAYMENT_LIST_SELECT ต้องมี " + c); assert.match(admin, /timingSafeEqual\(Buffer\.from\(csrf\), Buffer\.from\(expected\)\)/); assert.match(admin, /ops\.resolveSettlement\(/); assert.doesNotMatch(admin, /supabase\.rpc\("payment_settlement_resolve"/);
  assert.match(admin, /export function settlementBlockHtml\(p, postBase, csrf = ""\)/); assert.match(admin, /<div>settlement<\/div><div>\$\{settlementBlockHtml\(p, `\/admin\/payments\/\$\{encodeURIComponent\(String\(p\.id\)\)\}`, csrf\)\}<\/div>/, "หน้ารายละเอียดต้องเรียก block พร้อม csrf");
  assert.match(admin, /csrf: \(req\.session\.paymentOpsCsrf \|\|= randomBytes\(24\)\.toString\("hex"\)\)/);
  assert.match(read("src/workers/maintenanceWorker.js"), /sweepRejectNotifyPending\(\)/);
  assert.match(read(".env.example"), /PAYMENT_OPS_DB_KEY=/);
  const sql = read("sql/069_telegram_reject_and_settlement.sql");
  for (const t of ["reject_notify_snapshot jsonb", "'notifySnapshot', snap", "'notifySnapshot', pay.reject_notify_snapshot", "CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_reject_notify_per_payment", "WHERE kind = 'reject_notify' AND related_payment_id IS NOT NULL", "rejected_at timestamptz, reject_notify_snapshot jsonb)", "CREATE ROLE payment_ops_writer NOLOGIN", "FROM PUBLIC, web_anon, service_role;", "TO payment_ops_writer;", "reject_notify_pending", "mark_reject_notify_queued", "list_reject_notify_pending", "COALESCE(pay.slip_amount, 0) > 0", "INSERT INTO public.payment_approval_audit", "kind IN ('confirm','reject_confirm')", "settlement_note_required"]) assert.ok(sql.includes(t), t);
  assert.ok(!/GRANT EXECUTE ON FUNCTION public\.(reject_payment_atomic|payment_settlement_resolve|mark_reject_notify_queued|list_reject_notify_pending)[^\n]*TO [^\n]*(web_anon|service_role)/.test(sql), "RPC เขียนห้ามให้ anon/service_role");
  assert.doesNotMatch(sql, /app_users|paid_remaining_scans|paid_until/, "069 ต้องไม่แตะสิทธิ์ผู้ใช้");
  const md5 = read("scripts/ops/migration-function-md5.reference.txt");
  for (const f of ["issue_telegram_reject_token", "reject_payment_atomic", "payment_settlement_resolve", "mark_reject_notify_queued", "list_reject_notify_pending"]) assert.match(md5, new RegExp(`^${f} [0-9a-f]{32}$`, "m"));
  assert.match(read("scripts/ops/preflight-three-tasks-migrations.sql"), /069 RPCs present \(5/); assert.match(read("scripts/ops/preflight-three-tasks-migrations.sql"), /069r3 payments\.reject_notify_snapshot \+ unique index/); assert.match(read("scripts/ops/preflight-three-tasks-migrations.sql"), /069 write RPCs only for payment_ops_writer/);
  assert.match(read("package.json"), /tests\/telegramSlipReject\.behavior\.test\.js/); assert.match(read("package.json"), /tests\/rejectNotifyEnqueue\.test\.js/); assert.match(read("package.json"), /tests\/adminSettlementRoute\.behavior\.test\.js/); assert.match(read("package.json"), /tests\/rejectNotifySweep\.test\.js/); assert.match(read("package.json"), /tests\/adminSettlementRender\.test\.js/);
});

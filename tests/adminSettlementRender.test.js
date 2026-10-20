// render บล็อก "เงินรอดำเนินการ" จากแถวรูปแบบเดียวกับ store (snake_case) — ไม่ใช่แค่ตรวจชื่อฟังก์ชัน
import test from "node:test";
import assert from "node:assert/strict";
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "" })) process.env[k] ??= v;
const { settlementBlockHtml, settlementBadgeHtml } = await import("../src/routes/adminPaymentsDashboard.routes.js");
const base = (o) => ({ id: "c9d2b025-e7a6-49c3-aef2-41122ebb73f8", status: "rejected", reject_reason: "ยอดเงินไม่ตรง", settlement_status: "none", settlement_note: null, settlement_by: null, settlement_updated_at: null, ...o });
test("settlementBlockHtml: none = ว่าง · money_pending = ฟอร์ม 3 ทางเลือก + csrf + หมายเหตุจำเป็น · refunded = แสดงสถานะ/ผู้ทำ ไม่มีฟอร์ม · escape HTML", () => {
  assert.equal(settlementBlockHtml(base({}), "/admin/payments/x", "tok"), "");
  const mp = settlementBlockHtml(base({ settlement_status: "money_pending", settlement_note: "ปฏิเสธสิทธิ์ (amount) แต่มียอดโอนที่อ่านได้ 10 บาท <b>x</b>" }), "/admin/payments/c9d2", "csrf-123");
  assert.match(mp, /data-settlement="money_pending"/); assert.match(mp, /เงินรอดำเนินการ/); assert.match(mp, /action="\/admin\/payments\/c9d2\/settlement"/); assert.match(mp, /name="csrf" value="csrf-123"/);
  for (const v of ["refunded", "topped_up", "written_off"]) assert.match(mp, new RegExp(`option value="${v}"`));
  assert.match(mp, /name="settlement_note" required minlength="4"/); assert.match(mp, /&lt;b&gt;x&lt;\/b&gt;/, "escape"); assert.doesNotMatch(mp, /<b>x<\/b>/);
  const done = settlementBlockHtml(base({ settlement_status: "refunded", settlement_note: "โอนคืน 10 บาท", settlement_by: "admin_dashboard:2026-10-20T05" }), "/admin/payments/c9d2", "csrf-123");
  assert.match(done, /คืนเงินแล้ว/); assert.match(done, /admin_dashboard/); assert.doesNotMatch(done, /<form/);
  assert.equal(settlementBadgeHtml(base({})), ""); assert.match(settlementBadgeHtml(base({ settlement_status: "money_pending" })), /เงินรอดำเนินการ/); assert.doesNotMatch(settlementBadgeHtml(base({ settlement_status: "money_pending" })), /<form/);
  assert.equal(settlementBadgeHtml(base({}), "inline"), ""); assert.match(settlementBadgeHtml(base({ settlement_status: "money_pending" }), "inline"), /^<span class="settlement-badge" data-settlement="money_pending"[^>]*>⚠ เงินรอดำเนินการ<\/span>$/); assert.match(settlementBadgeHtml(base({ settlement_status: "refunded" }), "inline"), /คืนเงินแล้ว/);
});

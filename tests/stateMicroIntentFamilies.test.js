import test from "node:test";
import assert from "node:assert/strict";
import { resolveStateMicroIntent } from "../src/core/conversation/stateMicroIntentRouter.js";
import { resolveReplyType } from "../src/core/conversation/replyTypeResolver.js";

test("waiting_birthdate: ใช่ครับ → confirm_yes; ไม่ใช่ → confirm_no", () => {
  const a = resolveStateMicroIntent("waiting_birthdate", "ใช่ครับ", {});
  assert.equal(a.microIntent, "confirm_yes");
  const b = resolveStateMicroIntent("waiting_birthdate", "ไม่ใช่ครับ", {});
  assert.equal(b.microIntent, "confirm_no");
  const r = resolveReplyType("waiting_birthdate", "confirm_yes", { noProgressStreak: 1 });
  assert.equal(r.replyType, "wb_ack_remind_birthdate");
});

test("paywall_selecting_package: ask_price_again", () => {
  const m = resolveStateMicroIntent("paywall_selecting_package", "ราคาเท่าไหร่ครับ", {});
  assert.equal(m.microIntent, "ask_price_again");
  const r = resolveReplyType("paywall_selecting_package", "ask_price_again", {
    noProgressStreak: 2,
  });
  assert.equal(r.replyType, "pw_guidance");
});

test("payment_package_selected: resend_qr maps to payment flow reply", () => {
  const m = resolveStateMicroIntent("payment_package_selected", "ขอคิวอาร์อีกที", {});
  assert.equal(m.microIntent, "resend_qr");
  const r = resolveReplyType("payment_package_selected", "resend_qr", {});
  assert.equal(r.replyType, "pp_show_payment_flow");
});

test("awaiting_slip: slip_claim_but_no_image", () => {
  const m = resolveStateMicroIntent("awaiting_slip", "โอนแล้วนะครับ", {});
  assert.equal(m.microIntent, "slip_claim_but_no_image");
});

test("pending_verify: reassurance_needed vs status_check", () => {
  const st = resolveStateMicroIntent("pending_verify", "สถานะเป็นยังไงบ้าง", {});
  assert.equal(st.microIntent, "status_check");
  const re = resolveStateMicroIntent("pending_verify", "กังวลจัง จะได้ไหม", {});
  assert.equal(re.microIntent, "reassurance_needed");
  const rr = resolveReplyType("pending_verify", "reassurance_needed", {});
  assert.equal(rr.replyType, "pv_reassure");
});

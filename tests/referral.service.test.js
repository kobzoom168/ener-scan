import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseReferralCodeText,
  buildInviteForwardText,
  buildInviteCardFlex,
  REDEEM_REPLY_TEXTS,
  MONTHLY_CAP,
} from "../src/services/referral/referral.service.js";

test("parseReferralCodeText: รับหลายรูปแบบ → normalize เป็น ENER-XXXX", () => {
  assert.equal(parseReferralCodeText("ENER-K7P2"), "ENER-K7P2");
  assert.equal(parseReferralCodeText("ener k7p2"), "ENER-K7P2");
  assert.equal(parseReferralCodeText("  enerK7P2  "), "ENER-K7P2");
});

test("parseReferralCodeText: ข้อความทั่วไปไม่โดนดัก", () => {
  assert.equal(parseReferralCodeText("สวัสดีครับ"), null);
  assert.equal(parseReferralCodeText("energy วันนี้เป็นไง"), null);
  assert.equal(parseReferralCodeText("ener"), null);
  assert.equal(parseReferralCodeText("ENER-K7P2 ใช้ยังไง"), null); // มีคำต่อท้าย = ไปสมองแชท
});

test("buildInviteForwardText: มีโค้ด + ลิงก์ OA + ไม่มีเครื่องหมายต้องห้าม", () => {
  const t = buildInviteForwardText("ENER-K7P2");
  assert.ok(t.includes("ENER-K7P2"));
  assert.ok(t.includes("https://lin.ee/"));
  assert.ok(!t.includes("—"));
  assert.ok(!t.includes('"'));
});

test("buildInviteCardFlex: การ์ดมีโค้ดและสิทธิ์คงเหลือ", () => {
  const f = buildInviteCardFlex("ENER-K7P2", 3);
  assert.equal(f.type, "flex");
  const json = JSON.stringify(f);
  assert.ok(json.includes("ENER-K7P2"));
  assert.ok(json.includes("ชวนได้อีก 3 สิทธิ์"));
});

test("ข้อความตอบผลครบทุก reason + เพดานเดือน default 5", () => {
  for (const k of ["ok", "not_found", "self", "not_new", "already_redeemed", "cap_reached", "error"]) {
    assert.ok(REDEEM_REPLY_TEXTS[k]?.length > 10, k);
  }
  assert.equal(MONTHLY_CAP, 5);
});

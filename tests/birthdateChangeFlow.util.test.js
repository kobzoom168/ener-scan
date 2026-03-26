import test from "node:test";
import assert from "node:assert/strict";
import {
  isBirthdateChangeCandidateText,
  isBirthdateFlowConfirmYes,
  isBirthdateFlowConfirmNo,
  pickBirthdateFinalConfirmText,
  buildBirthdateEchoForUser,
  BIRTHDATE_CHANGE_FLOW,
} from "../src/utils/birthdateChangeFlow.util.js";
import { parseBirthdateInput } from "../src/utils/birthdateParse.util.js";

test("BIRTHDATE_CHANGE_FLOW labels", () => {
  assert.equal(BIRTHDATE_CHANGE_FLOW.CANDIDATE, "birthdate_change_candidate");
  assert.equal(BIRTHDATE_CHANGE_FLOW.WAITING_DATE, "waiting_birthdate_change");
  assert.equal(
    BIRTHDATE_CHANGE_FLOW.WAITING_FINAL_CONFIRM,
    "waiting_birthdate_change_confirm",
  );
});

test("soft-detect: phrases around เกิด / วันเกิด / ปีเกิด / เปลี่ยน / แก้", () => {
  assert.equal(isBirthdateChangeCandidateText("เกิด"), true);
  assert.equal(isBirthdateChangeCandidateText("วันเกิด"), true);
  assert.equal(isBirthdateChangeCandidateText("ปีเกิด"), true);
  assert.equal(isBirthdateChangeCandidateText("เปลี่ยนวันเกิด"), true);
  assert.equal(isBirthdateChangeCandidateText("แก้วันเกิด"), true);
  assert.equal(isBirthdateChangeCandidateText("ขอแก้ปีเกิดหน่อย"), true);
});

test("soft-detect: pure date is not a candidate (avoid accidental profile routing)", () => {
  assert.equal(isBirthdateChangeCandidateText("19/08/1985"), false);
  assert.equal(isBirthdateChangeCandidateText("19/08/2528"), false);
});

test("pickBirthdateFinalConfirmText is light confirm with echo", () => {
  const a = pickBirthdateFinalConfirmText("u_a", "19/08/2528");
  assert.ok(a.includes("19/08/2528"));
  assert.ok(a.startsWith("ได้ครับ ผมอ่านเป็น"));
});

test("buildBirthdateEchoForUser uses echoForConfirm for compact", () => {
  const p = parseBirthdateInput("19082528");
  assert.equal(buildBirthdateEchoForUser(p), "19/08/2528");
});

test("buildBirthdateEchoForUser keeps delimiter style when present", () => {
  const p = parseBirthdateInput("19-8-2528");
  assert.equal(buildBirthdateEchoForUser(p), "19-8-2528");
});

test("isBirthdateFlowConfirmYes: ใช่ครับ matches ใช่ (final-confirm regression)", () => {
  assert.equal(isBirthdateFlowConfirmYes("ใช่"), true);
  assert.equal(isBirthdateFlowConfirmYes("ใช่ครับ"), true);
  assert.equal(isBirthdateFlowConfirmYes("ใช่ค่ะ"), true);
  assert.equal(isBirthdateFlowConfirmYes("ใช่ ครับ"), true);
  assert.equal(isBirthdateFlowConfirmYes("ครับ ใช่"), true);
});

test("isBirthdateFlowConfirmYes: โอเคครับ and ถูก* polite forms confirm", () => {
  assert.equal(isBirthdateFlowConfirmYes("โอเค"), true);
  assert.equal(isBirthdateFlowConfirmYes("โอเคครับ"), true);
  assert.equal(isBirthdateFlowConfirmYes("ถูก"), true);
  assert.equal(isBirthdateFlowConfirmYes("ถูกต้อง"), true);
  assert.equal(isBirthdateFlowConfirmYes("ถูกครับ"), true);
  assert.equal(isBirthdateFlowConfirmYes("ถูกต้องครับ"), true);
});

test("isBirthdateFlowConfirmYes: standalone polite particles can confirm", () => {
  assert.equal(isBirthdateFlowConfirmYes("ครับ"), true);
  assert.equal(isBirthdateFlowConfirmYes("ค่ะ"), true);
});

test("isBirthdateFlowConfirmYes: negatives are not yes", () => {
  assert.equal(isBirthdateFlowConfirmYes("ไม่ใช่"), false);
  assert.equal(isBirthdateFlowConfirmYes("ไม่ใช่ครับ"), false);
  assert.equal(isBirthdateFlowConfirmYes("ผิด"), false);
  assert.equal(isBirthdateFlowConfirmYes("ผิดครับ"), false);
  assert.equal(isBirthdateFlowConfirmYes("เปลี่ยน"), false);
  assert.equal(isBirthdateFlowConfirmYes("แก้วันเกิด"), false);
});

test("isBirthdateFlowConfirmNo: เปลี่ยน is no but เปลี่ยนเลย stays available for yes", () => {
  assert.equal(isBirthdateFlowConfirmNo("เปลี่ยน"), true);
  assert.equal(isBirthdateFlowConfirmNo("เปลี่ยนเลย"), false);
  assert.equal(isBirthdateFlowConfirmYes("เปลี่ยนเลย"), true);
});

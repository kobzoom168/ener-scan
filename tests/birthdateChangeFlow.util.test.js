import test from "node:test";
import assert from "node:assert/strict";
import {
  isBirthdateChangeCandidateText,
  pickBirthdateFinalConfirmText,
  buildBirthdateEchoForUser,
  BIRTHDATE_CHANGE_FLOW,
} from "../src/utils/birthdateChangeFlow.util.js";

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

test("pickBirthdateFinalConfirmText echoes user style; two deterministic variants", () => {
  const a = pickBirthdateFinalConfirmText("u_a", "19/08/2528");
  const b = pickBirthdateFinalConfirmText("u_b", "19/08/1985");
  assert.ok(a.includes("19/08/2528"));
  assert.ok(b.includes("19/08/1985"));
  assert.ok(
    a.startsWith("ขอทวน") || a.startsWith("เดี๋ยวผมใช้วันเกิด"),
    a,
  );
});

test("buildBirthdateEchoForUser uses parser originalInput", () => {
  assert.equal(
    buildBirthdateEchoForUser({
      ok: true,
      originalInput: "19-8-2528",
    }),
    "19-8-2528",
  );
});

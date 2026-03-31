import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  groupImageEventCountByUser,
  buildMultiImageInRequestText,
  getMultiImageInRequestReplyCandidates,
} from "../src/utils/webhookText.util.js";
import {
  registerImageCandidateEvent,
  clearPendingImageCandidate,
} from "../src/stores/runtime.store.js";

const servicePath = fileURLToPath(
  new URL("../src/services/lineWebhook/multiImageRejectionReply.service.js", import.meta.url),
);

test("groupImageEventCountByUser: two image events same user => 2", () => {
  const uid = "U_multi_1";
  const events = [
    { type: "message", source: { userId: uid }, message: { type: "image", id: "a" } },
    { type: "message", source: { userId: uid }, message: { type: "image", id: "b" } },
  ];
  const m = groupImageEventCountByUser(events);
  assert.equal(m.get(uid), 2);
});

test("groupImageEventCountByUser: single image => 1", () => {
  const uid = "U_single";
  const events = [
    { type: "message", source: { userId: uid }, message: { type: "image", id: "only" } },
  ];
  const m = groupImageEventCountByUser(events);
  assert.equal(m.get(uid), 1);
});

test("registerImageCandidateEvent: two events in window => count 2", () => {
  const uid = "U_candidate_pair";
  clearPendingImageCandidate(uid);
  registerImageCandidateEvent(uid, {
    eventTimestamp: 1_000_000,
    messageId: "first-id",
    replyToken: "rt1",
    flowVersion: 3,
  });
  const second = registerImageCandidateEvent(uid, {
    eventTimestamp: 1_000_100,
    messageId: "second-id",
    replyToken: "rt2",
    flowVersion: 3,
  });
  assert.equal(second?.count, 2);
  assert.equal(second?.firstMessageId, "first-id");
  assert.equal(second?.latestMessageId, "second-id");
  clearPendingImageCandidate(uid);
});

test("buildMultiImageInRequestText: deterministic single-line copy", () => {
  const t = buildMultiImageInRequestText();
  assert.equal(
    t,
    "ตอนนี้ระบบรองรับการสแกนทีละ 1 รูปเท่านั้นครับ กรุณาส่งใหม่ทีละ 1 รูป เพื่อให้วิเคราะห์ได้แม่นที่สุด",
  );
  const c = getMultiImageInRequestReplyCandidates();
  assert.equal(c[0], t);
  assert.ok(c.length >= 2);
});

test("multi-image rejection service: no scan billing side effects in module", () => {
  const src = readFileSync(servicePath, "utf8");
  assert.ok(!src.includes("decrementUserPaidRemainingScans"));
  assert.ok(!src.includes("createScanResult"));
  assert.ok(!src.includes("paidRemainingScans"));
});

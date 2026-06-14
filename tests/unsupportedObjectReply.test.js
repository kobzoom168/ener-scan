import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildUnsupportedObjectText,
  getUnsupportedObjectReplyCandidates,
} from "../src/utils/webhookText.util.js";

const servicePath = fileURLToPath(
  new URL("../src/services/lineWebhook/unsupportedObjectReply.service.js", import.meta.url),
);

test("buildUnsupportedObjectText: warm อาจารย์ copy keeps supported-type bullets", () => {
  const t = buildUnsupportedObjectText();
  assert.ok(t.includes("อาจารย์"));
  assert.ok(t.includes("• พระเครื่อง"));
  assert.ok(t.includes("• เครื่องราง"));
  assert.ok(t.includes("คริสตัล / หิน"));
  assert.ok(t.includes("วัตถุสายพลังแบบชิ้นเดี่ยว"));
  assert.ok(t.includes("ส่งรูป"));
});

test("getUnsupportedObjectReplyCandidates: primary is buildUnsupportedObjectText", () => {
  const c = getUnsupportedObjectReplyCandidates();
  assert.equal(c[0], buildUnsupportedObjectText());
  assert.ok(c.length >= 2);
});

test("single_supported would not use unsupported primary text (sanity: strings differ)", () => {
  const unsupported = buildUnsupportedObjectText();
  assert.ok(!unsupported.includes("SCAN_V2_OBJECT_CHECK_OK"));
});

test("unsupportedObjectReply.service: no billing / scan result side effects", () => {
  const src = readFileSync(servicePath, "utf8");
  assert.ok(!src.includes("decrementUserPaidRemainingScans"));
  assert.ok(!src.includes("createScanResult"));
  assert.ok(!src.includes("paidRemainingScans"));
});

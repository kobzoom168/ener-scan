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

// Codex P1-3 (20 ส.ค. 2026): copy เปลี่ยนจาก warm bullets → โทนแข็งบรรทัดเดียว
test("buildUnsupportedObjectText: hard copy สั้น ตรง — ไม่มี ครับ/emoji/คำปลอบ", () => {
  const t = buildUnsupportedObjectText();
  assert.ok(t.includes("ชิ้นนี้ยังอ่านไม่ได้"));
  assert.ok(t.includes("เต็มกรอบ"));
  for (const w of ["ครับ", "นะ", "🙏", "อาจารย์"]) assert.ok(!t.includes(w), `ห้ามมี "${w}"`);
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

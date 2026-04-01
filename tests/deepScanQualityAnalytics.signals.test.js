import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractSignals,
  enrichQualityAnalyticsForPersist,
} from "../src/services/deepScanQualityAnalytics.service.js";

test("extractSignals: broader signature than legacy ไม่ได้/แต่", () => {
  const s = extractSignals("อย่างไรก็ตาม ชิ้นนี้ยังช่วยเรื่องจังหวะชีวิตได้");
  assert.equal(s.has_signature_phrase, true);
});

test("enrichQualityAnalyticsForPersist: no false poor tier when score_after missing", () => {
  const out = enrichQualityAnalyticsForPersist(
    { score_after: null, score_before: null, delta: null },
    { resultText: "ภาพรวม\nแต่ถ้าดูจากพลังหลักยังพอใช้ได้" },
  );
  assert.equal(out.quality_tier, null);
  assert.equal(out.signals?.has_signature_phrase, true);
});

test("enrichQualityAnalyticsForPersist: tier when score present", () => {
  const out = enrichQualityAnalyticsForPersist(
    { score_after: 42, score_before: 30, delta: 12 },
    { resultText: "x" },
  );
  assert.equal(out.quality_tier, "good");
});

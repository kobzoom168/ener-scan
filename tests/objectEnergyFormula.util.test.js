import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEnergyStars,
  computeObjectEnergyV1,
  scoreToStars,
  scanDimensionsFromObjectEnergyStars,
} from "../src/utils/objectEnergyFormula.util.js";
import { buildObjectEnergyPayload } from "../src/services/reportPayload/buildObjectEnergyPayload.js";
import { buildReportPayloadFromScan } from "../src/services/reports/reportPayload.builder.js";
import { normalizeReportPayloadForRender } from "../src/utils/reports/reportPayloadNormalize.util.js";

const FULL_SIGNAL = {
  objectFamily: "somdej",
  materialFamily: "powder",
  dominantColor: "gold",
  conditionClass: "good",
  shapeFamily: "rectangular",
  energyScore: 8.5,
  mainEnergy: "สมดุล",
};

test("scoreToStars: band boundaries", () => {
  assert.equal(scoreToStars(0), 1);
  assert.equal(scoreToStars(29), 1);
  assert.equal(scoreToStars(30), 2);
  assert.equal(scoreToStars(44), 2);
  assert.equal(scoreToStars(45), 3);
  assert.equal(scoreToStars(64), 3);
  assert.equal(scoreToStars(65), 4);
  assert.equal(scoreToStars(84), 4);
  assert.equal(scoreToStars(85), 5);
  assert.equal(scoreToStars(100), 5);
});

test("computeObjectEnergyV1: same input -> same profile and stars", () => {
  const a = computeObjectEnergyV1(FULL_SIGNAL);
  const b = computeObjectEnergyV1(FULL_SIGNAL);
  assert.deepEqual(a.profile, b.profile);
  assert.deepEqual(a.stars, b.stars);
});

test("buildEnergyStars: aligns with scoreToStars per dimension", () => {
  const p = {
    balance: 20,
    protection: 40,
    authority: 50,
    compassion: 70,
    attraction: 90,
  };
  const s = buildEnergyStars(p);
  assert.equal(s.balance, scoreToStars(20));
  assert.equal(s.attraction, scoreToStars(90));
});

test("neutral fallback: missing fields do not throw", () => {
  const r = computeObjectEnergyV1({});
  assert.ok(r.profile.balance >= 0 && r.profile.balance <= 100);
  assert.ok(r.confidence < 0.9);
  assert.equal(typeof r.stars.balance, "number");
});

test("missing color/material/shape: deterministic and lower confidence than full signal", () => {
  const sparse = computeObjectEnergyV1({
    objectFamily: "somdej",
    energyScore: 7,
  });
  const full = computeObjectEnergyV1({
    ...FULL_SIGNAL,
    energyScore: 7,
  });
  assert.ok(sparse.confidence < full.confidence);
});

test("objectCheckConfidence low reduces overall confidence", () => {
  const hi = computeObjectEnergyV1({
    objectFamily: "somdej",
    objectCheckConfidence: 0.95,
  });
  const lo = computeObjectEnergyV1({
    objectFamily: "somdej",
    objectCheckConfidence: 0.08,
  });
  assert.ok(lo.confidence < hi.confidence);
});

test("scanDimensionsFromObjectEnergyStars: Thai keys", () => {
  const sd = scanDimensionsFromObjectEnergyStars({
    balance: 3,
    protection: 4,
    authority: 2,
    compassion: 5,
    attraction: 1,
  });
  assert.equal(sd["สมดุล"], 3);
  assert.equal(sd["คุ้มกัน"], 4);
});

test("buildObjectEnergyPayload: explain length", () => {
  const p = buildObjectEnergyPayload(FULL_SIGNAL);
  assert.ok(p.explain.length >= 2 && p.explain.length <= 4);
  assert.equal(p.formulaVersion, "object_energy_v1");
});

test("buildReportPayloadFromScan: wires objectEnergy and summary.scanDimensions", () => {
  const payload = buildReportPayloadFromScan({
    resultText: `ระดับพลัง: 8\nพลังหลัก: สมดุล\nความสอดคล้อง: 50%\nภาพรวม\nทดสอบ\nเหตุผลที่เข้ากับเจ้าของ\nทดสอบ`,
    scanResultId: "00000000-0000-4000-8000-000000000099",
    scanRequestId: "req-1",
    lineUserId: "U1",
    publicToken: "tok",
    objectFamily: "somdej",
    materialFamily: "powder",
    dominantColor: "gold",
    conditionClass: "good",
    shapeFamily: "rectangular",
  });
  assert.ok(payload.objectEnergy?.stars);
  assert.equal(typeof payload.summary.scanDimensions?.["สมดุล"], "number");
});

test("buildReportPayloadFromScan: threads objectCheckResult into objectEnergy inputs (no fabricated confidence)", () => {
  const payload = buildReportPayloadFromScan({
    resultText: `ระดับพลัง: 8\nพลังหลัก: สมดุล\nความสอดคล้อง: 50%\nภาพรวม\nx\nเหตุผลที่เข้ากับเจ้าของ\ny`,
    scanResultId: "00000000-0000-4000-8000-000000000099",
    scanRequestId: "req-1",
    lineUserId: "U1",
    publicToken: "tok",
    objectFamily: "crystal",
    materialFamily: "crystal",
    objectCheckResult: "single_supported",
    pipelineObjectCategory: "คริสตัล/หิน",
    pipelineObjectCategorySource: "deep_scan",
  });
  assert.equal(payload.objectEnergy?.inputs?.objectCheckResult, "single_supported");
  assert.equal(payload.objectEnergy?.inputs?.objectCheckConfidence, null);
});

test("buildReportPayloadFromScan: dominantColor vision_v1 threads to objectEnergy inputs", () => {
  const payload = buildReportPayloadFromScan({
    resultText: `ระดับพลัง: 8\nพลังหลัก: สมดุล\nความสอดคล้อง: 50%\nภาพรวม\nx\nเหตุผลที่เข้ากับเจ้าของ\ny`,
    scanResultId: "00000000-0000-4000-8000-000000000200",
    scanRequestId: "req-1",
    lineUserId: "U1",
    publicToken: "tok",
    objectFamily: "generic",
    dominantColor: "blue",
    pipelineDominantColorSource: "vision_v1",
  });
  assert.equal(payload.objectEnergy?.inputs?.dominantColor, "blue");
});

test("buildReportPayloadFromScan: preserves numeric objectCheckConfidence when provided (not fabricated)", () => {
  const payload = buildReportPayloadFromScan({
    resultText: `ระดับพลัง: 8\nพลังหลัก: สมดุล\nความสอดคล้อง: 50%\nภาพรวม\nx\nเหตุผลที่เข้ากับเจ้าของ\ny`,
    scanResultId: "00000000-0000-4000-8000-000000000100",
    scanRequestId: "req-1",
    lineUserId: "U1",
    publicToken: "tok",
    objectFamily: "generic",
    objectCheckResult: "single_supported",
    objectCheckConfidence: 0.82,
    pipelineObjectCategory: "พระเครื่อง",
    pipelineObjectCategorySource: "cache_classify",
  });
  assert.equal(payload.objectEnergy?.inputs?.objectCheckConfidence, 0.82);
});

test("buildReportPayloadFromScan: missing dominantColor/conditionClass still builds objectEnergy", () => {
  const payload = buildReportPayloadFromScan({
    resultText: `ระดับพลัง: 8\nพลังหลัก: สมดุล\nความสอดคล้อง: 50%\nภาพรวม\nx\nเหตุผลที่เข้ากับเจ้าของ\ny`,
    scanResultId: "00000000-0000-4000-8000-000000000101",
    scanRequestId: "req-1",
    lineUserId: "U1",
    publicToken: "tok",
    objectFamily: "generic",
    dominantColor: "",
    conditionClass: "",
    pipelineObjectCategorySource: "missing",
  });
  assert.ok(payload.objectEnergy?.profile);
  assert.equal(payload.objectEnergy?.inputs?.dominantColor, null);
  assert.equal(payload.objectEnergy?.inputs?.conditionClass, null);
});

test("normalizeReportPayloadForRender: preserves objectEnergy", () => {
  const { payload } = normalizeReportPayloadForRender({
    reportId: "r",
    publicToken: "p",
    scanId: "s",
    userId: "u",
    generatedAt: new Date().toISOString(),
    summary: {
      summaryLine: "ok",
      scanDimensions: { สมดุล: 3 },
    },
    sections: {},
    trust: {},
    actions: {},
    object: {},
    objectEnergy: {
      formulaVersion: "object_energy_v1",
      profile: {
        balance: 61,
        protection: 55,
        authority: 50,
        compassion: 58,
        attraction: 48,
      },
      stars: {
        balance: 3,
        protection: 3,
        authority: 3,
        compassion: 3,
        attraction: 2,
      },
      mainEnergyResolved: { key: "balance", labelThai: "สมดุล" },
      confidence: 0.82,
      inputs: { objectFamily: "somdej" },
      explain: ["a", "b"],
    },
  });
  assert.equal(payload.objectEnergy?.profile?.balance, 61);
  assert.equal(payload.objectEnergy?.stars?.compassion, 3);
  assert.equal(payload.summary.scanDimensions?.["สมดุล"], 3);
});

test("normalizeReportPayloadForRender: partial objectEnergy does not throw", () => {
  const { payload, warnings } = normalizeReportPayloadForRender({
    reportId: "r",
    publicToken: "p",
    scanId: "s",
    userId: "u",
    generatedAt: new Date().toISOString(),
    summary: { summaryLine: "ok" },
    sections: {},
    trust: {},
    actions: {},
    object: {},
    objectEnergy: {
      formulaVersion: "object_energy_v1",
      explain: [],
    },
  });
  assert.ok(Array.isArray(warnings));
  assert.ok(payload.objectEnergy);
});

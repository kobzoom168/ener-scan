import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCompatibilityV1,
  normalizeBirthdateIso,
} from "../src/utils/compatibilityFormula.util.js";
import { buildCompatibilityPayload } from "../src/services/reportPayload/buildCompatibilityPayload.js";
import { buildReportPayloadFromScan } from "../src/services/reports/reportPayload.builder.js";
import { normalizeReportPayloadForRender } from "../src/utils/reports/reportPayloadNormalize.util.js";

const FIXED = {
  birthdate: "1985-08-19",
  scannedAt: "2026-03-31T15:14:00+07:00",
  objectFamily: "somdej",
  materialFamily: "powder",
  mainEnergy: "balance",
  shapeFamily: "rectangular",
  energyScore: 8.5,
};

test("computeCompatibilityV1: fixed reference case (element/number/symbol/context)", () => {
  const r = computeCompatibilityV1(FIXED);
  assert.equal(r.score, 81);
  assert.equal(r.band, "เข้ากันดี");
  assert.equal(r.factors.elementScore, 78);
  assert.equal(r.factors.numberScore, 75);
  assert.equal(r.factors.objectSymbolScore, 100);
  assert.equal(r.factors.contextScore, 74);
  assert.equal(r.inputs.ownerElement, "earth");
  assert.equal(r.inputs.objectElement, "earth");
});

test("normalizeBirthdateIso: DD/MM/YYYY matches ISO life path", () => {
  assert.equal(normalizeBirthdateIso("19/08/1985"), "1985-08-19");
  const a = computeCompatibilityV1({ ...FIXED, birthdate: "1985-08-19" });
  const b = computeCompatibilityV1({ ...FIXED, birthdate: "19/08/1985" });
  assert.equal(a.score, b.score);
});

test("computeCompatibilityV1: missing materialFamily falls back to objectFamily element", () => {
  const withMat = computeCompatibilityV1({
    ...FIXED,
    materialFamily: "powder",
    objectFamily: "hanuman",
  });
  const noMat = computeCompatibilityV1({
    ...FIXED,
    materialFamily: "",
    objectFamily: "hanuman",
  });
  assert.equal(withMat.inputs.objectElement, "earth");
  assert.equal(noMat.inputs.objectElement, "fire");
  assert.notEqual(withMat.score, noMat.score);
});

test("computeCompatibilityV1: missing shapeFamily uses unknown (no shape bonus)", () => {
  const withShape = computeCompatibilityV1({
    ...FIXED,
    shapeFamily: "rectangular",
  });
  const unknownShape = computeCompatibilityV1({
    ...FIXED,
    shapeFamily: "unknown",
  });
  assert.equal(withShape.inputs.shapeFamily, "rectangular");
  assert.equal(unknownShape.inputs.shapeFamily, "unknown");
  assert.equal(withShape.factors.objectSymbolScore, 100);
  assert.equal(unknownShape.factors.objectSymbolScore, 100);
});

test("buildCompatibilityPayload: explain array length", () => {
  const p = buildCompatibilityPayload(FIXED);
  assert.equal(p.explain.length, 4);
  assert.ok(p.inputs.ownerElement);
});

test("buildReportPayloadFromScan: overrides AI compatibility with deterministic score when birthdate set", () => {
  const text = `
ระดับพลัง: 8.5
พลังหลัก: สมดุล
ความสอดคล้อง: 12%

ภาพรวม
ทดสอบ

เหตุผลที่เข้ากับเจ้าของ
ทดสอบ
`;
  const payload = buildReportPayloadFromScan({
    resultText: text,
    scanResultId: "00000000-0000-4000-8000-000000000099",
    scanRequestId: "req-1",
    lineUserId: "U1",
    publicToken: "tok",
    birthdateUsed: "1985-08-19",
    scannedAt: FIXED.scannedAt,
    objectFamily: "somdej",
    materialFamily: "powder",
    shapeFamily: "rectangular",
  });
  assert.equal(payload.summary.compatibilityPercent, 81);
  assert.equal(payload.compatibility?.score, 81);
  assert.equal(payload.compatibility?.band, "เข้ากันดี");
});

test("normalizeReportPayloadForRender: preserves compatibilityBand and compatibility block", () => {
  const { payload } = normalizeReportPayloadForRender({
    reportId: "r",
    publicToken: "p",
    scanId: "s",
    userId: "u",
    generatedAt: new Date().toISOString(),
    summary: {
      summaryLine: "x",
      compatibilityPercent: 81,
      compatibilityBand: "เข้ากันดี",
    },
    sections: {},
    trust: {},
    actions: {},
    object: {},
    compatibility: {
      score: 81,
      band: "เข้ากันดี",
      formulaVersion: "compatibility_v1",
      factors: { elementScore: 78, numberScore: 75, objectSymbolScore: 100, contextScore: 74 },
      inputs: { ownerElement: "earth" },
      explain: ["a", "b", "c", "d"],
    },
  });
  assert.equal(payload.summary.compatibilityBand, "เข้ากันดี");
  assert.equal(payload.compatibility?.score, 81);
  assert.equal(payload.compatibility?.explain?.length, 4);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fnv1a32,
  computeAmuletPowerScoresFromFeaturesV3,
  computeAmuletPowerScoresDeterministicV1,
  computeAmuletPowerScoresFromFeaturesV4,
  deriveEvidenceOverallShadowV4,
} from "../src/amulet/amuletScores.util.js";
import {
  listInvalidFeatureSlugs,
  computeAmuletAxisEvidenceV4,
} from "../src/amulet/amuletFeatureProfile.util.js";

const F1 = {
  primaryColor: "gold",
  materialType: "thai_amulet",
  formFactor: "amulet_figure",
  textureHint: "carved",
  shapeOutline: "triangular",
  mainMotif: "seated_figure",
};

test("v4 hash level: สมมาตร -3..+3 mean≈0 (10k seeds) — เทียบ v3 ที่เบ้ +3", () => {
  const N = 10000;
  let v4sum = 0, v4min = 99, v4max = -99;
  let v3sum = 0, v3min = 99, v3max = -99;
  for (let i = 0; i < N; i++) {
    const seed = `seed_${i}`;
    const lv4 = (fnv1a32(`${seed}|v4|lvl`) % 7) - 3;
    const lv3 = (fnv1a32(`${seed}|v3|lvl`) % 25) - 9;
    v4sum += lv4; v4min = Math.min(v4min, lv4); v4max = Math.max(v4max, lv4);
    v3sum += lv3; v3min = Math.min(v3min, lv3); v3max = Math.max(v3max, lv3);
  }
  assert.equal(v4min, -3);
  assert.equal(v4max, 3);
  assert.ok(Math.abs(v4sum / N) < 0.1, `v4 mean ${v4sum / N} ต้องใกล้ 0`);
  // ยืนยันข้อกล่าวหา v3 (ไว้เป็นหลักฐาน calibration): -9..+15 mean ~+3
  assert.equal(v3min, -9);
  assert.equal(v3max, 15);
  assert.ok(v3sum / N > 2.5 && v3sum / N < 3.5, `v3 mean ${v3sum / N} เบ้บวกจริง`);
});

test("v4 ตัด circular: mainEnergyLabel ไม่มีผลใด ๆ / v3 ยังมีผล (พฤติกรรมเดิมคงไว้)", () => {
  const a = computeAmuletPowerScoresFromFeaturesV4(F1, { seedKey: "s1" });
  const b = computeAmuletPowerScoresFromFeaturesV4(F1, { seedKey: "s1", mainEnergyLabel: "โชคลาภ" });
  assert.deepEqual(a.powerCategories, b.powerCategories);
  assert.equal(a.primaryPower, b.primaryPower);

  const v3plain = computeAmuletPowerScoresFromFeaturesV3(F1, { seedKey: "s1" });
  const v3nudged = computeAmuletPowerScoresFromFeaturesV3(F1, { seedKey: "s1", mainEnergyLabel: "โชคลาภ" });
  assert.ok(v3nudged.powerCategories.luck.score >= v3plain.powerCategories.luck.score);
});

test("v4 breakdown ตรวจสอบได้: base + evidence + collisionNudge + leadAdjust = final ทุกแกน", () => {
  const r = computeAmuletPowerScoresFromFeaturesV4(F1, { seedKey: "s2" });
  for (const row of r.breakdown) {
    const evidenceSum = row.evidence.reduce((a, e) => a + e.delta, 0);
    const expected = row.base + evidenceSum + row.collisionNudge + row.leadAdjust;
    // clamp 34..99 อาจตัดปลาย — ค่า final ต้องเท่าค่า clamp ของผลรวม
    assert.equal(row.final, Math.min(99, Math.max(34, expected)), `แกน ${row.axis}`);
  }
  assert.equal(r.scoringMode, "evidence_score_v4");
});

test("v4: slug นอก whitelist = unknown (คะแนนเท่ากรณีไม่รู้ค่า) + validator รายงานช่องผิด", () => {
  const bad = { ...F1, materialType: "kryptonite", mainMotif: "alien_face" };
  const invalid = listInvalidFeatureSlugs(bad);
  assert.deepEqual(invalid.map((x) => x.field).sort(), ["mainMotif", "materialType"]);

  const cleaned = { ...F1, materialType: "unknown", mainMotif: "unknown" };
  const a = computeAmuletAxisEvidenceV4(bad);
  const b = computeAmuletAxisEvidenceV4(cleaned);
  assert.deepEqual(a.axes, b.axes);
  assert.equal(a.knownLayers, b.knownLayers);
});

test("v4 readingConfidence แยกจากพลัง: หลักฐานครบ=สูง หลักฐานหาย=ต่ำ", () => {
  const full = computeAmuletPowerScoresFromFeaturesV4(F1, { seedKey: "s3" });
  assert.equal(full.readingConfidence.level, "สูง");
  const sparse = computeAmuletPowerScoresFromFeaturesV4(
    { primaryColor: "gold", materialType: "unknown", formFactor: "unknown" },
    { seedKey: "s3" },
  );
  assert.equal(sparse.readingConfidence.level, "ต่ำ");
});

test("shadow overall: อยู่ช่วง 0-10 และ coherence มาจาก evidence ไม่ใช่ hash", () => {
  const r = computeAmuletPowerScoresFromFeaturesV4(F1, { seedKey: "s4" });
  const s = deriveEvidenceOverallShadowV4(r.powerCategories, r.breakdown, r.primaryPower);
  assert.ok(s.score10 >= 0 && s.score10 <= 10);
  assert.ok(s.coherenceFrac >= 0 && s.coherenceFrac <= 1);
  // ไม่มี evidence เลย → coherence 0
  const empty = deriveEvidenceOverallShadowV4(r.powerCategories, [], r.primaryPower);
  assert.equal(empty.coherenceFrac, 0);
});

test("invariant: v3/v1 เดิมต้องได้เลขเดิมเป๊ะ (fixture ล็อกก่อนแก้ 11 ส.ค. 2026)", () => {
  const F2 = {
    primaryColor: "black", materialType: "clay", formFactor: "amulet_coin",
    textureHint: "rough", shapeOutline: "round", mainMotif: "yantra_or_text",
  };
  const a = computeAmuletPowerScoresFromFeaturesV3(F1, { seedKey: "seedA", mainEnergyLabel: "เมตตา" });
  const b = computeAmuletPowerScoresFromFeaturesV3(F2, { seedKey: "seedB" });
  const c = computeAmuletPowerScoresDeterministicV1("legacySeed1", { mainEnergyLabel: "คุ้มครอง" });
  const flat = (x) => Object.fromEntries(Object.entries(x.powerCategories).map(([k, v]) => [k, v.score]));
  assert.deepEqual(flat(a), { protection: 83, metta: 74, baramee: 94, luck: 69, fortune_anchor: 71, specialty: 57 });
  assert.equal(a.primaryPower, "baramee");
  assert.deepEqual(flat(b), { protection: 68, metta: 57, baramee: 58, luck: 54, fortune_anchor: 62, specialty: 59 });
  assert.deepEqual(flat(c), { protection: 53, metta: 63, baramee: 60, luck: 71, fortune_anchor: 48, specialty: 65 });
});

test("v4 deterministic: ชิ้นเดิม seed เดิม = เลขเดิมทุกครั้ง / seed ต่าง = แยกกันได้", () => {
  const a1 = computeAmuletPowerScoresFromFeaturesV4(F1, { seedKey: "same" });
  const a2 = computeAmuletPowerScoresFromFeaturesV4(F1, { seedKey: "same" });
  assert.deepEqual(a1.powerCategories, a2.powerCategories);
  const b = computeAmuletPowerScoresFromFeaturesV4(F1, { seedKey: "diff" });
  const changed = Object.keys(a1.powerCategories).some(
    (k) => a1.powerCategories[k].score !== b.powerCategories[k].score,
  );
  assert.ok(changed, "คนละ seed ควรได้เลขต่างกัน (collision separation)");
});

test("overall ตาม mode: v4 ใช้ band ใหม่ / v3 ใช้สูตรเดิมเป๊ะ", async () => {
  const { deriveSacredAmuletOverallByMode, deriveSacredAmuletEnergyScore10FromPowerCategories, deriveSacredAmuletEnergyScore10V4 } =
    await import("../src/amulet/amuletScores.util.js");
  const r = computeAmuletPowerScoresFromFeaturesV4(F1, { seedKey: "s9" });
  assert.equal(
    deriveSacredAmuletOverallByMode("evidence_score_v4", r.powerCategories),
    deriveSacredAmuletEnergyScore10V4(r.powerCategories),
  );
  assert.equal(
    deriveSacredAmuletOverallByMode("feature_blend_v3", r.powerCategories),
    deriveSacredAmuletEnergyScore10FromPowerCategories(r.powerCategories),
  );
});

test("flag ปิด (default) = เส้นทาง v3 เดิม ไม่มี breakdown", async () => {
  delete process.env.AMULET_SCORE_V4_ENABLED;
  const { buildAmuletV1Slice } = await import("../src/amulet/amuletPayload.build.js");
  const off = buildAmuletV1Slice({ scanResultId: "r1", seedKey: "s10", stableFeatureFields: F1, mainEnergyLabel: "เมตตา" });
  assert.equal(off.scoringMode, "feature_blend_v3");
  assert.equal(off.scoreBreakdown, undefined);
  process.env.AMULET_SCORE_V4_ENABLED = "true";
  const on = buildAmuletV1Slice({ scanResultId: "r1", seedKey: "s10", stableFeatureFields: F1, mainEnergyLabel: "เมตตา" });
  assert.equal(on.scoringMode, "evidence_score_v4");
  assert.ok(Array.isArray(on.scoreBreakdown));
  assert.ok(on.readingConfidence?.level);
  delete process.env.AMULET_SCORE_V4_ENABLED;
});

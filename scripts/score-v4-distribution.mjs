/**
 * Distribution comparison v3 vs evidence_score_v4 (แผน ener-scoring-v4.md)
 * โหมด synthetic: 10k ชิ้นสุ่มจาก slug whitelist จริง — ใช้ก่อนเปิด flag
 * (โหมด real-data ต่อ DB ค่อยเพิ่มตอน shadow รันบน staging แล้ว)
 * รัน: node scripts/score-v4-distribution.mjs
 */
import {
  computeAmuletPowerScoresFromFeaturesV3,
  computeAmuletPowerScoresFromFeaturesV4,
  deriveSacredAmuletEnergyScore10FromPowerCategories,
  deriveSacredAmuletEnergyScore10V4,
  deriveEvidenceOverallShadowV4,
  fnv1a32,
} from "../src/amulet/amuletScores.util.js";
import { score10ToEnergyGrade } from "../src/utils/reports/energyLevelGrade.util.js";

const MATERIALS = ["thai_amulet", "brass", "bronze", "clay", "unknown"];
const FORMS = ["amulet_coin", "amulet_figure", "pendant", "unknown"];
const COLORS = ["gold", "yellow", "brown", "black", "silver", "red", "green", "mixed", "unknown"];
const SHAPES = ["rectangular", "triangular", "oval", "round", "arch", "shield", "irregular", "unknown"];
const MOTIFS = ["seated_figure", "standing_figure", "multi_figure", "face_only", "animal", "yantra_or_text", "pattern_only", "plain", "unknown"];
const pick = (arr, h) => arr[h % arr.length];

const N = 10000;
const rows = [];
for (let i = 0; i < N; i++) {
  const h = fnv1a32(`sample|${i}`);
  const f = {
    primaryColor: pick(COLORS, h >>> 3),
    materialType: pick(MATERIALS, h >>> 7),
    formFactor: pick(FORMS, h >>> 11),
    textureHint: "smooth",
    shapeOutline: pick(SHAPES, h >>> 15),
    mainMotif: pick(MOTIFS, h >>> 19),
  };
  const seedKey = `piece_${i}`;
  const v3 = computeAmuletPowerScoresFromFeaturesV3(f, { seedKey });
  const v4 = computeAmuletPowerScoresFromFeaturesV4(f, { seedKey });
  const v3overall = deriveSacredAmuletEnergyScore10FromPowerCategories(v3.powerCategories);
  const v4overall = deriveSacredAmuletEnergyScore10V4(v4.powerCategories);
  const v4shadow = deriveEvidenceOverallShadowV4(v4.powerCategories, v4.breakdown, v4.primaryPower).score10;
  rows.push({ v3overall, v4overall, v4shadow });
}

function stats(vals) {
  const s = [...vals].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  const grades = {};
  for (const v of s) {
    const g = score10ToEnergyGrade(v);
    grades[g] = (grades[g] || 0) + 1;
  }
  const pct = (n) => `${((n / s.length) * 100).toFixed(1)}%`;
  return {
    median: q(50), p10: q(10), p25: q(25), p75: q(75), p90: q(90), p95: q(95), p99: q(99),
    "under6": pct(s.filter((v) => v < 6).length),
    "under7": pct(s.filter((v) => v < 7).length),
    "8plus": pct(s.filter((v) => v >= 8).length),
    "9plus": pct(s.filter((v) => v >= 9).length),
    grades: Object.fromEntries(Object.entries(grades).map(([g, n]) => [g, pct(n)])),
  };
}

console.log("=== v3 (สูตรปัจจุบัน: hash -9..+15 + nudge) ===");
console.log(JSON.stringify(stats(rows.map((r) => r.v3overall)), null, 1));
console.log("=== v4 แกนใหม่ + v4 transform band 46-70 (สิ่งที่จะเห็นถ้าเปิด flag — PRELIM) ===");
console.log(JSON.stringify(stats(rows.map((r) => r.v4overall)), null, 1));
console.log("=== v4 shadow overall (55/25/20 coherence — ยังไม่แสดงลูกค้า) ===");
console.log(JSON.stringify(stats(rows.map((r) => r.v4shadow)), null, 1));

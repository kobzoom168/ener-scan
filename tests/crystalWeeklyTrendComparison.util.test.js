import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCrystalWeeklyDriftSignals,
  buildCrystalWeeklyTrendComparison,
  renderCrystalWeeklyTrendComparisonMarkdown,
} from "../src/utils/crystalWeeklyTrendComparison.util.js";
import {
  TREND_SUMMARY_CURR_CRYSTAL_SPECIFIC_DROP,
  TREND_SUMMARY_CURR_FALLBACK_HEAVY,
  TREND_SUMMARY_CURR_HARD_MISMATCH,
  TREND_SUMMARY_CURR_HEALTHY,
  TREND_SUMMARY_CURR_SOFT_DRIFT,
  TREND_SUMMARY_CURR_THAI_HEAVY,
  TREND_SUMMARY_CURR_WEAK_PROTECT,
  TREND_SUMMARY_PREV_HEALTHY,
  TREND_SUMMARY_PREV_THAI_HEAVY,
} from "./fixtures/crystalWeeklyTrendComparison.fixture.js";

const GEN = "2026-03-31T12:00:00.000Z";

test("buildCrystalWeeklyTrendComparison: table-driven trendStatus", () => {
  const cases = [
    {
      name: "stable week-over-week (same crystal mix)",
      prev: TREND_SUMMARY_PREV_HEALTHY,
      curr: TREND_SUMMARY_CURR_HEALTHY,
      expect: "stable",
    },
    {
      name: "soft mismatch increase",
      prev: TREND_SUMMARY_PREV_HEALTHY,
      curr: TREND_SUMMARY_CURR_SOFT_DRIFT,
      expect: "watch",
    },
    {
      name: "fallback-heavy increase",
      prev: TREND_SUMMARY_PREV_HEALTHY,
      curr: TREND_SUMMARY_CURR_FALLBACK_HEAVY,
      expect: "investigate",
    },
    {
      name: "hard mismatch spike",
      prev: TREND_SUMMARY_PREV_HEALTHY,
      curr: TREND_SUMMARY_CURR_HARD_MISMATCH,
      expect: "escalate",
    },
    {
      name: "crystal-specific rate drop",
      prev: TREND_SUMMARY_PREV_HEALTHY,
      curr: TREND_SUMMARY_CURR_CRYSTAL_SPECIFIC_DROP,
      expect: "investigate",
    },
    {
      name: "weak-protect-default drift",
      prev: TREND_SUMMARY_PREV_HEALTHY,
      curr: TREND_SUMMARY_CURR_WEAK_PROTECT,
      expect: "investigate",
    },
    {
      name: "thai-heavy but crystal-stable (no crystal pollution)",
      prev: TREND_SUMMARY_PREV_THAI_HEAVY,
      curr: TREND_SUMMARY_CURR_THAI_HEAVY,
      expect: "stable",
    },
  ];

  for (const c of cases) {
    const cmp = buildCrystalWeeklyTrendComparison(c.curr, c.prev, { generatedAt: GEN });
    assert.equal(
      cmp.trendStatus,
      c.expect,
      `${c.name}: expected ${c.expect}, got ${cmp.trendStatus}`,
    );
  }
});

test("buildCrystalWeeklyTrendComparison: distribution shift ordering stable", () => {
  const cmp = buildCrystalWeeklyTrendComparison(
    TREND_SUMMARY_CURR_HARD_MISMATCH,
    TREND_SUMMARY_PREV_HEALTHY,
    { generatedAt: GEN },
  );
  const tr = cmp.topRuleShifts;
  for (let i = 1; i < tr.length; i++) {
    assert.ok(Math.abs(tr[i - 1].deltaShare) >= Math.abs(tr[i].deltaShare));
  }
});

test("renderCrystalWeeklyTrendComparisonMarkdown: required sections", () => {
  const cmp = buildCrystalWeeklyTrendComparison(
    TREND_SUMMARY_CURR_HEALTHY,
    TREND_SUMMARY_PREV_HEALTHY,
    { generatedAt: GEN },
  );
  const md = renderCrystalWeeklyTrendComparisonMarkdown(cmp);
  for (const h of [
    "## A. Header",
    "## B. Executive delta summary",
    "## C. Top drifts",
    "## D. Risk calls",
    "## E. Suggested next actions",
    "## F. Appendix",
  ]) {
    assert.ok(md.includes(h), `missing ${h}`);
  }
});

test("buildCrystalWeeklyDriftSignals: shape", () => {
  const cmp = buildCrystalWeeklyTrendComparison(
    TREND_SUMMARY_CURR_SOFT_DRIFT,
    TREND_SUMMARY_PREV_HEALTHY,
    { generatedAt: GEN },
  );
  const s = buildCrystalWeeklyDriftSignals(cmp);
  assert.ok(Array.isArray(s.codes));
  assert.equal(typeof s.trendStatus, "string");
});

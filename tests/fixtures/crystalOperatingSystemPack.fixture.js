/**
 * Operating system pack fixtures (Phase 16) — reuse annual + capability builders.
 */

import { buildCrystalAnnualOperatingReviewPack } from "../../src/utils/crystalAnnualOperatingReviewPack.util.js";
import { buildCrystalCapabilityMaturityRoadmapPack } from "../../src/utils/crystalCapabilityMaturityRoadmapPack.util.js";
import {
  CRYSTAL_ANNUAL_INPUT_EXCELLENT,
  CRYSTAL_ANNUAL_INPUT_GOOD_SOFT_DRIFT,
  CRYSTAL_ANNUAL_INPUT_THAI_HEAVY_STABLE,
} from "./crystalAnnualOperatingReviewPack.fixture.js";
import { MATURITY_INPUT_SNAPSHOT_WORDING_FRAGILE } from "./crystalCapabilityMaturityRoadmapPack.fixture.js";

const AT = { generatedAt: "2027-01-05T12:00:00.000Z" };

/** Strong stack: annual + release signals + capability from same annual; optional lower refs. */
export function OS_INPUT_STRONG_STACK() {
  const annual = buildCrystalAnnualOperatingReviewPack({
    ...CRYSTAL_ANNUAL_INPUT_EXCELLENT,
    releaseSignals: [{ windowLabel: "2026-06-15", note: "crystal copy" }],
    ...AT,
  });
  const capability = buildCrystalCapabilityMaturityRoadmapPack({
    annualOperatingReviewPack: annual,
    assessmentWindowStart: annual.yearWindowStart,
    assessmentWindowEnd: annual.yearWindowEnd,
    ...AT,
  });
  return {
    ...AT,
    annualOperatingReviewPack: annual,
    capabilityMaturityRoadmapPack: capability,
    monthlyScorecardSummaryRefs: ["fixtures/monthly-2026-summary.json"],
    quarterlyReviewSummaryRefs: ["fixtures/quarterly-2026-Q3.json"],
  };
}

/** Weak evidence continuity: snapshot-only capability path (no annual). */
export const OS_INPUT_WEAK_CONTINUITY = { ...MATURITY_INPUT_SNAPSHOT_WORDING_FRAGILE };

/** Release linkage not strong: annual without releaseSignals. */
export function OS_INPUT_WEAK_RELEASE_LINKAGE() {
  const annual = buildCrystalAnnualOperatingReviewPack({
    ...CRYSTAL_ANNUAL_INPUT_GOOD_SOFT_DRIFT,
    ...AT,
  });
  const capability = buildCrystalCapabilityMaturityRoadmapPack({
    annualOperatingReviewPack: annual,
    ...AT,
  });
  return {
    ...AT,
    annualOperatingReviewPack: annual,
    capabilityMaturityRoadmapPack: capability,
  };
}

/** Thai-heavy annual — should not break OS pack. */
export function OS_INPUT_THAI_HEAVY() {
  const annual = buildCrystalAnnualOperatingReviewPack({
    ...CRYSTAL_ANNUAL_INPUT_THAI_HEAVY_STABLE,
    ...AT,
  });
  const capability = buildCrystalCapabilityMaturityRoadmapPack({
    annualOperatingReviewPack: annual,
    ...AT,
  });
  return { ...AT, annualOperatingReviewPack: annual, capabilityMaturityRoadmapPack: capability };
}

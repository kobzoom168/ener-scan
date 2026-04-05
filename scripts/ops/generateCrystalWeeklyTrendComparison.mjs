#!/usr/bin/env node
/**
 * Week-over-week crystal trend comparison (offline).
 *
 * Each input file may be either:
 * - Phase 7 weekly summary JSON (`buildCrystalWeeklyQualityReview` output), or
 * - `{ rows, windowStart, windowEnd, generatedAt?, ... }` to aggregate first.
 *
 * Usage:
 *   node scripts/ops/generateCrystalWeeklyTrendComparison.mjs --previous ./week1.json --current ./week2.json --format markdown
 *   node scripts/ops/generateCrystalWeeklyTrendComparison.mjs --previous ./week1.json --current ./week2.json --format json
 */
import fs from "fs";
import path from "path";
import { buildCrystalWeeklyQualityReview } from "../../src/utils/crystalWeeklyQualityReview.util.js";
import {
  buildCrystalWeeklyTrendComparison,
  renderCrystalWeeklyTrendComparisonMarkdown,
} from "../../src/utils/crystalWeeklyTrendComparison.util.js";

/**
 * @param {unknown} parsed
 */
function loadWeeklySummary(parsed) {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (
      parsed.weeklyReviewVersion != null ||
      (parsed.totalCrystalCases != null &&
        parsed.alignedRate != null &&
        parsed.softMismatchRate != null)
    ) {
      return parsed;
    }
    if (Array.isArray(parsed.rows)) {
      return buildCrystalWeeklyQualityReview(parsed.rows, {
        windowStart: parsed.windowStart ?? "unknown",
        windowEnd: parsed.windowEnd ?? "unknown",
        generatedAt: parsed.generatedAt,
        baselineAggregate: parsed.baselineAggregate ?? null,
        heuristicThresholds: parsed.heuristicThresholds,
      });
    }
  }
  if (Array.isArray(parsed)) {
    return buildCrystalWeeklyQualityReview(parsed, {
      windowStart: "unknown",
      windowEnd: "unknown",
    });
  }
  throw new Error(
    "Unrecognized export: expected Phase 7 weekly summary JSON or an object with `rows` array.",
  );
}

function parseArgs(argv) {
  const a = argv.slice(2);
  let previousPath;
  let currentPath;
  let format = "markdown";
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--previous" && a[i + 1]) {
      previousPath = a[++i];
      continue;
    }
    if (a[i] === "--current" && a[i + 1]) {
      currentPath = a[++i];
      continue;
    }
    if (a[i] === "--format" && a[i + 1]) {
      format = a[++i];
      continue;
    }
  }
  return { previousPath, currentPath, format };
}

const { previousPath, currentPath, format } = parseArgs(process.argv);
if (!previousPath || !currentPath) {
  console.error(
    "Usage: node scripts/ops/generateCrystalWeeklyTrendComparison.mjs --previous <file.json> --current <file.json> --format markdown|json",
  );
  process.exit(1);
}

function readJson(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

const previous = loadWeeklySummary(readJson(previousPath));
const current = loadWeeklySummary(readJson(currentPath));

const comparison = buildCrystalWeeklyTrendComparison(current, previous, {
  generatedAt: new Date().toISOString(),
});

if (format === "json") {
  process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
} else if (format === "markdown") {
  process.stdout.write(renderCrystalWeeklyTrendComparisonMarkdown(comparison));
} else {
  console.error('--format must be "json" or "markdown"');
  process.exit(1);
}

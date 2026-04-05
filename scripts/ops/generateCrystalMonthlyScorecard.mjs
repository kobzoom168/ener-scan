#!/usr/bin/env node
/**
 * Monthly crystal quality scorecard generator (offline).
 * Reads a **monthly rollup** JSON object (see `docs/ops/crystal-monthly-scorecard.md`).
 *
 * Usage:
 *   node scripts/ops/generateCrystalMonthlyScorecard.mjs --input ./tmp/crystal-month-rollup.json --format markdown
 *   node scripts/ops/generateCrystalMonthlyScorecard.mjs --input ./tmp/crystal-month-rollup.json --format json
 */
import fs from "fs";
import path from "path";
import {
  buildCrystalMonthlyScorecard,
  renderCrystalMonthlyScorecardMarkdown,
} from "../../src/utils/crystalMonthlyScorecard.util.js";

function parseArgs(argv) {
  const a = argv.slice(2);
  let input;
  let format = "markdown";
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--input" && a[i + 1]) {
      input = a[++i];
      continue;
    }
    if (a[i] === "--format" && a[i + 1]) {
      format = a[++i];
      continue;
    }
  }
  return { input, format };
}

const { input, format } = parseArgs(process.argv);
if (!input) {
  console.error(
    "Usage: node scripts/ops/generateCrystalMonthlyScorecard.mjs --input <rollup.json> --format markdown|json",
  );
  process.exit(1);
}

const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
const rollup = Array.isArray(raw) ? raw[0] : raw;
if (!rollup || typeof rollup !== "object") {
  console.error("Input must be a JSON object (monthly rollup), or a single-element array wrapping that object.");
  process.exit(1);
}

const scorecard = buildCrystalMonthlyScorecard(rollup, {
  generatedAt: rollup.generatedAt,
});

if (format === "json") {
  process.stdout.write(`${JSON.stringify(scorecard, null, 2)}\n`);
} else if (format === "markdown") {
  process.stdout.write(renderCrystalMonthlyScorecardMarkdown(scorecard));
} else {
  console.error('--format must be "json" or "markdown"');
  process.exit(1);
}

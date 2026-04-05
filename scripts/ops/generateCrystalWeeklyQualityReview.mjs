#!/usr/bin/env node
/**
 * Weekly crystal quality review generator (offline).
 * Reads JSON export: either `[...rows]` or `{ rows, windowStart, windowEnd, generatedAt?, baselineAggregate? }`.
 *
 * Usage:
 *   node scripts/ops/generateCrystalWeeklyQualityReview.mjs --input ./tmp/crystal-week.json --format markdown
 *   node scripts/ops/generateCrystalWeeklyQualityReview.mjs --input ./tmp/crystal-week.json --format json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildCrystalWeeklyQualityReview,
  renderCrystalWeeklyQualityReviewMarkdown,
} from "../../src/utils/crystalWeeklyQualityReview.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    "Usage: node scripts/ops/generateCrystalWeeklyQualityReview.mjs --input <file.json> --format markdown|json",
  );
  process.exit(1);
}

const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
const rows = Array.isArray(raw) ? raw : raw.rows;
if (!Array.isArray(rows)) {
  console.error("Input must be a JSON array or an object with a `rows` array.");
  process.exit(1);
}

const summary = buildCrystalWeeklyQualityReview(rows, {
  windowStart: raw.windowStart ?? "unknown",
  windowEnd: raw.windowEnd ?? "unknown",
  generatedAt: raw.generatedAt,
  baselineAggregate: raw.baselineAggregate ?? null,
});

if (format === "json") {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} else if (format === "markdown") {
  process.stdout.write(renderCrystalWeeklyQualityReviewMarkdown(summary));
} else {
  console.error('--format must be "json" or "markdown"');
  process.exit(1);
}

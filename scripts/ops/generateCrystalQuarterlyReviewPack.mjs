#!/usr/bin/env node
/**
 * Quarterly crystal quality review pack generator (offline).
 * Reads a **quarterly input** JSON object (see `docs/ops/crystal-quarterly-review-pack.md`).
 *
 * Usage:
 *   node scripts/ops/generateCrystalQuarterlyReviewPack.mjs --input ./tmp/crystal-quarter.json --format markdown
 *   node scripts/ops/generateCrystalQuarterlyReviewPack.mjs --input ./tmp/crystal-quarter.json --format json
 */
import fs from "fs";
import path from "path";
import {
  buildCrystalQuarterlyReviewPack,
  renderCrystalQuarterlyReviewPackMarkdown,
} from "../../src/utils/crystalQuarterlyReviewPack.util.js";

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
    "Usage: node scripts/ops/generateCrystalQuarterlyReviewPack.mjs --input <quarter.json> --format markdown|json",
  );
  process.exit(1);
}

const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
const payload = Array.isArray(raw) ? raw[0] : raw;
if (!payload || typeof payload !== "object") {
  console.error("Input must be a JSON object (quarterly review input), or a single-element array wrapping that object.");
  process.exit(1);
}

const pack = buildCrystalQuarterlyReviewPack(payload, {
  generatedAt: payload.generatedAt,
});

if (format === "json") {
  process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
} else if (format === "markdown") {
  process.stdout.write(renderCrystalQuarterlyReviewPackMarkdown(pack));
} else {
  console.error('--format must be "json" or "markdown"');
  process.exit(1);
}

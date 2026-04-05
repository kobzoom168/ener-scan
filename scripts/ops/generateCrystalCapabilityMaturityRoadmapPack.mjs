#!/usr/bin/env node
/**
 * Crystal capability maturity + operating roadmap pack generator (offline).
 * See `docs/ops/crystal-capability-maturity-roadmap-pack.md`.
 *
 * Usage:
 *   node scripts/ops/generateCrystalCapabilityMaturityRoadmapPack.mjs --input ./tmp/crystal-capability.json --format markdown
 *   node scripts/ops/generateCrystalCapabilityMaturityRoadmapPack.mjs --input ./tmp/crystal-capability.json --format json
 */
import fs from "fs";
import path from "path";
import {
  buildCrystalCapabilityMaturityRoadmapPack,
  renderCrystalCapabilityMaturityRoadmapPackMarkdown,
} from "../../src/utils/crystalCapabilityMaturityRoadmapPack.util.js";

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
    "Usage: node scripts/ops/generateCrystalCapabilityMaturityRoadmapPack.mjs --input <capability.json> --format markdown|json",
  );
  process.exit(1);
}

const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
const payload = Array.isArray(raw) ? raw[0] : raw;
if (!payload || typeof payload !== "object") {
  console.error("Input must be a JSON object, or a single-element array wrapping that object.");
  process.exit(1);
}

const pack = buildCrystalCapabilityMaturityRoadmapPack(payload, {
  generatedAt: payload.generatedAt,
});

if (format === "json") {
  process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
} else if (format === "markdown") {
  process.stdout.write(renderCrystalCapabilityMaturityRoadmapPackMarkdown(pack));
} else {
  console.error('--format must be "json" or "markdown"');
  process.exit(1);
}

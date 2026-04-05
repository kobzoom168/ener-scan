#!/usr/bin/env node
/**
 * Run crystal artifact contract linter (shape + version anchors).
 * See `docs/ops/crystal-artifact-contract-linter.md`.
 *
 * Usage:
 *   node scripts/ops/runCrystalArtifactContractLinter.mjs --input ./tmp/linter-input.json --format json
 *   node scripts/ops/runCrystalArtifactContractLinter.mjs --format json --write-contract-map
 */
import fs from "fs";
import path from "path";
import {
  buildCrystalArtifactContractLinter,
  buildCrystalArtifactContractMap,
  renderCrystalArtifactContractLinterMarkdown,
} from "../../src/utils/crystalArtifactContractLinter.util.js";

function parseArgs(argv) {
  const a = argv.slice(2);
  let input;
  let format = "json";
  let writeContractMap = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--input" && a[i + 1]) {
      input = a[++i];
      continue;
    }
    if (a[i] === "--format" && a[i + 1]) {
      format = a[++i];
      continue;
    }
    if (a[i] === "--write-contract-map") {
      writeContractMap = true;
      continue;
    }
  }
  return { input, format, writeContractMap };
}

const { input, format, writeContractMap } = parseArgs(process.argv);

const payload = (() => {
  if (!input) return {};
  const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  return Array.isArray(raw) ? raw[0] : raw;
})();

const report = buildCrystalArtifactContractLinter(payload, {
  generatedAt: payload.generatedAt,
});

if (writeContractMap) {
  const mapPath = path.resolve(process.cwd(), "docs/ops/tables/crystal-artifact-contract-map.json");
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  const map = buildCrystalArtifactContractMap();
  fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  process.stderr.write(`Wrote ${mapPath}\n`);
}

if (format === "json") {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else if (format === "markdown") {
  process.stdout.write(renderCrystalArtifactContractLinterMarkdown(report));
} else {
  console.error('--format must be "json" or "markdown"');
  process.exit(1);
}

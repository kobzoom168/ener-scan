#!/usr/bin/env node
/**
 * Crystal artifact lifecycle policy + deprecation rules.
 * See `docs/ops/crystal-artifact-lifecycle-policy.md`.
 */
import fs from "fs";
import path from "path";
import {
  buildCrystalArtifactLifecyclePolicy,
  buildCrystalArtifactLifecyclePolicyTable,
  renderCrystalArtifactLifecyclePolicyMarkdown,
} from "../../src/utils/crystalArtifactLifecyclePolicy.util.js";

function parseArgs(argv) {
  const a = argv.slice(2);
  let input;
  let format = "json";
  let writeTable = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--input" && a[i + 1]) {
      input = a[++i];
      continue;
    }
    if (a[i] === "--format" && a[i + 1]) {
      format = a[++i];
      continue;
    }
    if (a[i] === "--write-table") {
      writeTable = true;
      continue;
    }
  }
  return { input, format, writeTable };
}

const { input, format, writeTable } = parseArgs(process.argv);

const payload = (() => {
  if (!input) return {};
  const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  return Array.isArray(raw) ? raw[0] : raw;
})();

const policy = buildCrystalArtifactLifecyclePolicy(payload, {
  generatedAt: payload.generatedAt,
});

if (writeTable) {
  const tablePath = path.resolve(process.cwd(), "docs/ops/tables/crystal-artifact-lifecycle-policy.json");
  fs.mkdirSync(path.dirname(tablePath), { recursive: true });
  const table = buildCrystalArtifactLifecyclePolicyTable();
  fs.writeFileSync(tablePath, `${JSON.stringify(table, null, 2)}\n`, "utf8");
  process.stderr.write(`Wrote ${tablePath}\n`);
}

if (format === "json") {
  process.stdout.write(`${JSON.stringify(policy, null, 2)}\n`);
} else if (format === "markdown") {
  process.stdout.write(renderCrystalArtifactLifecyclePolicyMarkdown(policy));
} else {
  console.error('--format must be "json" or "markdown"');
  process.exit(1);
}

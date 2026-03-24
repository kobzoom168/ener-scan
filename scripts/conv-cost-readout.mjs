#!/usr/bin/env node
/**
 * Aggregate CONV_COST JSON lines from a log file or stdin (grep / export / Railway logs).
 *
 * Usage:
 *   node scripts/conv-cost-readout.mjs [path/to.log]
 *   grep CONV_COST app.log | node scripts/conv-cost-readout.mjs
 *   npm run conv-cost:readout -- path/to.log
 *
 * Options:
 *   --json     Print aggregation as JSON (for dashboards / jq)
 *
 * Lines may be pure JSON, or log lines with a prefix before the JSON object
 * (e.g. timestamps, level tags). The first balanced {...} slice is parsed.
 */

import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function inc(map, key) {
  const k = key == null || key === "" ? "(empty)" : String(key);
  map.set(k, (map.get(k) || 0) + 1);
}

function sortEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function printSection(title, rows, maxRows = 25) {
  console.log(`\n--- ${title} ---`);
  if (!rows.length) {
    console.log("  (none)");
    return;
  }
  const w = Math.min(rows.length, maxRows);
  const pad = String(Math.max(...rows.slice(0, w).map(([, n]) => n))).length;
  for (let i = 0; i < w; i++) {
    const [k, n] = rows[i];
    console.log(`  ${String(n).padStart(pad)}  ${k}`);
  }
  if (rows.length > maxRows) {
    console.log(`  ... ${rows.length - maxRows} more rows omitted`);
  }
}

/** First balanced {...} on the line (handles strings/escapes) or null. */
function extractFirstJsonObject(line) {
  const start = line.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
    } else if (c === '"') {
      inString = true;
    } else if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return line.slice(start, i + 1);
      }
    }
  }
  return null;
}

function tryParseConvCost(line) {
  const s = line.trim();
  if (!s) return null;
  const parseConvCost = (jsonStr) => {
    try {
      const o = JSON.parse(jsonStr);
      if (o && o.event === "CONV_COST") return o;
    } catch {
      /* ignore */
    }
    return null;
  };
  let o = parseConvCost(s);
  if (o) return o;
  const slice = extractFirstJsonObject(s);
  if (slice && slice !== s) {
    o = parseConvCost(slice);
    if (o) return o;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  const jsonOut = process.argv.includes("--json");
  const filePath = args[0];

  let total = 0;
  const byLayer = new Map();
  const byAiPath = new Map();
  const usedAiTrue = new Map(); // replyType
  const usedAiFalse = new Map();
  const fallbackByReason = new Map();
  const fallbackByLayer = new Map();
  const suppressedByAction = new Map();
  const stateOwnerNoise = new Map();
  const replyTypeAll = new Map();
  const modelUsed = new Map();
  let suppressedCount = 0;
  let usedAiTrueCount = 0;
  let fallbackCount = 0;

  const input = filePath
    ? fs.createReadStream(path.resolve(process.cwd(), filePath), {
        encoding: "utf8",
      })
    : process.stdin;

  if (filePath && !fs.existsSync(path.resolve(process.cwd(), filePath))) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    const o = tryParseConvCost(line);
    if (!o) continue;
    total += 1;

    inc(byLayer, o.layer ?? "(none)");
    inc(byAiPath, o.aiPath ?? "(none)");

    if (o.replyType) inc(replyTypeAll, o.replyType);

    if (o.stateOwner) inc(stateOwnerNoise, o.stateOwner);

    if (o.modelUsed) inc(modelUsed, o.modelUsed);

    if (o.usedAi === true) {
      usedAiTrueCount += 1;
      inc(usedAiTrue, o.replyType ?? "(no replyType)");
    } else if (o.usedAi === false) {
      inc(usedAiFalse, o.replyType ?? o.edgeGateAction ?? "(unlabeled)");
    }

    if (o.fallbackToDeterministic === true) {
      fallbackCount += 1;
      inc(fallbackByReason, o.fallbackReason ?? "(no reason)");
      inc(fallbackByLayer, o.layer ?? "(none)");
    }

    if (o.suppressedDuplicate === true) {
      suppressedCount += 1;
      inc(suppressedByAction, o.edgeGateAction ?? o.aiPath ?? "(unknown)");
    }
  }

  const summary = {
    totalConvCostLines: total,
    usedAiTrue: usedAiTrueCount,
    usedAiFalse: total - usedAiTrueCount,
    fallbackToDeterministic: fallbackCount,
    suppressedDuplicate: suppressedCount,
  };

  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          summary,
          byLayer: Object.fromEntries(sortEntries(byLayer)),
          byAiPath: Object.fromEntries(sortEntries(byAiPath)),
          usedAiByReplyType: Object.fromEntries(sortEntries(usedAiTrue)),
          fallbackByReason: Object.fromEntries(sortEntries(fallbackByReason)),
          fallbackByLayer: Object.fromEntries(sortEntries(fallbackByLayer)),
          suppressedByEdgeOrPath: Object.fromEntries(sortEntries(suppressedByAction)),
          stateOwnerHistogram: Object.fromEntries(sortEntries(stateOwnerNoise)),
          replyTypeHistogram: Object.fromEntries(sortEntries(replyTypeAll)),
          modelUsed: Object.fromEntries(sortEntries(modelUsed)),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("CONV_COST readout (production visibility baseline)");
  console.log("Source:", filePath ? path.resolve(process.cwd(), filePath) : "stdin");
  console.log("\nSummary");
  console.log(`  Total CONV_COST lines:     ${total}`);
  console.log(`  usedAi === true:           ${usedAiTrueCount}`);
  console.log(`  usedAi !== true:           ${total - usedAiTrueCount}`);
  console.log(`  fallbackToDeterministic:   ${fallbackCount}`);
  console.log(`  suppressedDuplicate:       ${suppressedCount}`);

  printSection("Where AI is used (usedAi=true) by replyType", sortEntries(usedAiTrue));
  printSection("Model used (when set)", sortEntries(modelUsed));
  printSection("Fallback reasons (fallbackToDeterministic=true)", sortEntries(fallbackByReason));
  printSection("Fallback by layer", sortEntries(fallbackByLayer));
  printSection("Duplicate / suppression (suppressedDuplicate=true) by edgeGateAction or path", sortEntries(suppressedByAction));
  printSection("Traffic by aiPath", sortEntries(byAiPath));
  printSection("Traffic by layer", sortEntries(byLayer));
  printSection("State owners (noise proxy — event counts)", sortEntries(stateOwnerNoise), 30);
  printSection("replyType (all events with replyType)", sortEntries(replyTypeAll), 30);

  console.log("\n--- Notes ---");
  console.log("  CONV_COST rows: full-line JSON, or prefixed logs where {...} is the payload.");
  console.log("  Use --json for machine-readable aggregation.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

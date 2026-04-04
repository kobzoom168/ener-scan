#!/usr/bin/env node
/**
 * Staging: fresh uncached crystal verification (prompt + parser on new LLM output).
 *
 * Sets SCAN_CACHE_BYPASS before dynamic import of runDeepScan.
 *
 * Usage:
 *   node scripts/staging-crystal-fresh-verify.mjs path/to/c1.jpg path/to/c2.jpg ...
 *
 * Optional env: VERIFY_BIRTHDATE, VERIFY_LINE_USER_ID
 * Requires: .env with OPENAI_API_KEY, SUPABASE_*, CHANNEL_* (see src/config/env.js).
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { mirrorMainEnergyInferenceLikeBuilder } from "./lib/crystalMainEnergyInferenceMirror.mjs";

async function main() {
  process.env.SCAN_CACHE_BYPASS = "1";

  const imagePaths = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (imagePaths.length === 0) {
    console.error(
      "Usage: node scripts/staging-crystal-fresh-verify.mjs <image1.jpg> [image2.jpg ...]\n" +
        "Forces SCAN_CACHE_BYPASS=1 before loading runDeepScan.",
    );
    process.exit(1);
  }

  const { runDeepScan } = await import("../src/services/scan.service.js");
  const { mapObjectCategoryToPipelineSignals } = await import(
    "../src/utils/reports/scanPipelineReportSignals.util.js"
  );

  const birthdate =
    String(process.env.VERIFY_BIRTHDATE || "1990-01-15").trim() || "1990-01-15";
  const userId = String(process.env.VERIFY_LINE_USER_ID || "staging-crystal-verify").trim();

  /** @type {object[]} */
  const rows = [];

  for (let i = 0; i < imagePaths.length; i += 1) {
    const p = path.resolve(imagePaths[i]);
    const label = path.basename(p);
    if (!fs.existsSync(p)) {
      console.log(JSON.stringify({ case: i + 1, label, error: "file_not_found", path: p }));
      continue;
    }
    const imageBuffer = fs.readFileSync(p);

    const started = Date.now();
    const scanOut = await runDeepScan({
      imageBuffer,
      birthdate,
      userId,
    });
    const elapsedMs = Date.now() - started;

    const fromCache = Boolean(scanOut?.fromCache);
    const objectCategory = scanOut?.objectCategory ?? null;
    const catSig = mapObjectCategoryToPipelineSignals(objectCategory);
    const isCrystal = catSig.objectFamily === "crystal";

    if (fromCache) {
      console.log(
        JSON.stringify({
          event: "STAGING_VERIFY_WARN",
          case: i + 1,
          label,
          message:
            "Expected fromCache=false with bypass — check env or duplicate cache row.",
        }),
      );
    }

    if (!isCrystal) {
      console.log(
        JSON.stringify({
          event: "STAGING_VERIFY_SKIP_NOT_CRYSTAL",
          case: i + 1,
          label,
          objectCategory,
          objectFamily: catSig.objectFamily,
          fromCache,
          elapsedMs,
        }),
      );
      continue;
    }

    const inference = mirrorMainEnergyInferenceLikeBuilder(scanOut.resultText, "crystal");

    const row = {
      case: i + 1,
      label,
      fromCache,
      objectCategory,
      objectCategorySource: scanOut.objectCategorySource ?? null,
      energyCategoryCode: inference.energyCategoryCode,
      REPORT_PAYLOAD_MAIN_ENERGY_INFERENCE: inference,
      elapsedMs,
    };
    rows.push(row);
    console.log(JSON.stringify({ event: "STAGING_VERIFY_CASE", ...row }));
  }

  const protectionHits = rows.filter((r) => r.energyCategoryCode === "protection");
  console.log(
    JSON.stringify({
      event: "STAGING_VERIFY_SUMMARY",
      casesCrystal: rows.length,
      protectionCount: protectionHits.length,
      protectionRatio: rows.length ? protectionHits.length / rows.length : 0,
      note: "Explicit พลังปกป้อง in fresh LLM text should still yield protection.",
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

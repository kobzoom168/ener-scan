/**
 * Learn from top-performing scan outputs (offline).
 *
 * Loads excellent-tier rows (score_after >= 45), summarizes signals / gain ratios / wording traits,
 * writes data/style-reference-pack.json (5–10 best examples for future few-shot / style engine).
 *
 * Usage:
 *   node scripts/analyze-top-quality.mjs
 *   node scripts/analyze-top-quality.mjs --delta   # only rows with delta > 0
 *
 * Requires: .env with SUPABASE_* (same as app).
 * Does not change live scan flow.
 */
import "../src/config/env.js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { runStyleLearningPipeline } from "../src/services/scanStyleAnalysis.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "data");
const outFile = path.join(outDir, "style-reference-pack.json");

const requireDeltaPositive = process.argv.includes("--delta");

try {
  const { pack, summary } = await runStyleLearningPipeline({
    requireDeltaPositive,
    exampleCount: 8,
  });

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(pack, null, 2), "utf8");

  console.log("[STYLE_ANALYSIS] wrote:", outFile);
  console.log(
    "[STYLE_ANALYSIS] summary:",
    JSON.stringify(
      {
        sample_size_excellent: summary.sample_size_excellent,
        sample_size_tier_stats: summary.sample_size_tier_stats,
        signal_histogram: summary.signal_histogram,
        gain_ratio_by_tier_keys: Object.keys(summary.gain_ratio_by_tier || {}),
        wording_traits: summary.wording_traits_high_score,
      },
      null,
      2,
    ),
  );
  console.log("[STYLE_ANALYSIS] examples in pack:", pack.examples?.length ?? 0);
} catch (err) {
  console.error("[STYLE_ANALYSIS] failed:", err?.message || err);
  process.exit(1);
}

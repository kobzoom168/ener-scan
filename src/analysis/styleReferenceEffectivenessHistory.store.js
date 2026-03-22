/**
 * Local JSON history for style-effectiveness report runs (operational, not DB).
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const STYLE_EFFECTIVENESS_RUNS_FILE = path.join(
  ROOT,
  "data",
  "style-effectiveness-runs.json",
);

const MAX_RUNS = 100;

/**
 * @returns {Promise<{ version: number, runs: object[] }>}
 */
export async function loadStyleEffectivenessRunHistory() {
  try {
    const raw = await fs.readFile(STYLE_EFFECTIVENESS_RUNS_FILE, "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || !Array.isArray(j.runs)) {
      return { version: 1, runs: [] };
    }
    return j;
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e)?.code;
    if (code === "ENOENT") return { version: 1, runs: [] };
    throw e;
  }
}

/**
 * @param {object} runRecord
 * @returns {Promise<{ version: number, runs: object[] }>}
 */
export async function appendStyleEffectivenessRun(runRecord) {
  const hist = await loadStyleEffectivenessRunHistory();
  hist.runs = hist.runs || [];
  hist.runs.push(runRecord);
  if (hist.runs.length > MAX_RUNS) {
    hist.runs = hist.runs.slice(-MAX_RUNS);
  }
  await fs.mkdir(path.dirname(STYLE_EFFECTIVENESS_RUNS_FILE), { recursive: true });
  await fs.writeFile(
    STYLE_EFFECTIVENESS_RUNS_FILE,
    JSON.stringify(hist, null, 2),
    "utf8",
  );
  return hist;
}

/**
 * @returns {Promise<[object | null, object | null]>}
 */
export async function getLatestTwoRuns() {
  const hist = await loadStyleEffectivenessRunHistory();
  const runs = hist.runs || [];
  if (runs.length === 0) return [null, null];
  if (runs.length === 1) return [runs[runs.length - 1], null];
  return [runs[runs.length - 1], runs[runs.length - 2]];
}

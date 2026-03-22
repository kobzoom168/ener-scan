/**
 * Offline analysis + style reference pack generation from persisted `quality_analytics`.
 * Does not affect runtime scan flow.
 */

import {
  fetchRecentScanResultsWithQuality,
  listScanResultsForQualityReview,
} from "../stores/scanQualityInsights.db.js";

const SECTION_MARKERS = [
  "ภาพรวม",
  "เหมาะใช้เมื่อ",
  "ลักษณะพลัง",
  "เหตุผลที่เข้ากับเจ้าของ",
  "ชิ้นนี้หนุนเรื่อง",
  "ปิดท้าย",
];

/**
 * @param {string} text
 */
export function extractWordingTraits(text) {
  const t = String(text || "");
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bulletish = lines.filter(
    (l) => /^\s*[•\-*]/.test(l) || /•/.test(l),
  ).length;

  const section_hits = {};
  for (const s of SECTION_MARKERS) {
    section_hits[s] = t.includes(s) ? 1 : 0;
  }

  return {
    char_length: t.length,
    line_count: lines.length,
    bulletish_line_count: bulletish,
    section_hits,
  };
}

/**
 * @param {Array<{ result_text?: string }>} rows
 */
export function aggregateWordingTraits(rows) {
  if (!rows.length) {
    return {
      avg_char_length: null,
      avg_line_count: null,
      avg_bulletish_lines: null,
      section_presence_rate: {},
    };
  }

  const all = rows.map((r) => extractWordingTraits(r.result_text));
  const n = all.length;
  const sum = (fn) => all.reduce((a, x) => a + fn(x), 0);

  const section_presence_rate = {};
  for (const s of SECTION_MARKERS) {
    const hits = sum((x) => x.section_hits[s] || 0);
    section_presence_rate[s] = Math.round((hits / n) * 1000) / 1000;
  }

  return {
    avg_char_length: Math.round((sum((x) => x.char_length) / n) * 10) / 10,
    avg_line_count: Math.round((sum((x) => x.line_count) / n) * 10) / 10,
    avg_bulletish_lines: Math.round((sum((x) => x.bulletish_line_count) / n) * 10) / 10,
    section_presence_rate,
  };
}

/**
 * @param {Array<{ quality_analytics?: object }>} rows
 */
export function summarizeSignalHistogram(rows) {
  const keys = [
    "has_signature_phrase",
    "has_life_scenario",
    "has_emotional_hook",
  ];
  const out = {};
  const n = rows.length || 1;

  for (const k of keys) {
    const count = rows.filter((r) => {
      const s = r.quality_analytics?.signals;
      return s && typeof s === "object" && s[k] === true;
    }).length;
    out[k] = {
      count,
      rate: Math.round((count / n) * 1000) / 1000,
    };
  }

  return { row_count: rows.length, signals: out };
}

/**
 * @param {Array<{ quality_analytics?: object }>} rows
 */
export function averageImproveGainRatioByTier(rows) {
  /** @type {Record<string, { sum: number, n: number }>} */
  const buckets = {};

  for (const row of rows) {
    const qa = row.quality_analytics;
    if (!qa || typeof qa !== "object") continue;
    const tier = String(qa.quality_tier || "unknown").toLowerCase();
    const ratio = qa.improve_gain_ratio;
    if (ratio === null || ratio === undefined) continue;
    const r = Number(ratio);
    if (!Number.isFinite(r)) continue;
    if (!buckets[tier]) buckets[tier] = { sum: 0, n: 0 };
    buckets[tier].sum += r;
    buckets[tier].n += 1;
  }

  const by_tier = {};
  for (const [tier, { sum, n }] of Object.entries(buckets)) {
    by_tier[tier] = {
      count: n,
      avg_improve_gain_ratio: n ? Math.round((sum / n) * 10000) / 10000 : null,
    };
  }

  return by_tier;
}

/**
 * Sort by score_after desc, then delta desc.
 * @param {Array<{ quality_analytics?: object }>} rows
 */
export function sortRowsByScoreThenDelta(rows) {
  return [...rows].sort((a, b) => {
    const qa = a.quality_analytics || {};
    const qb = b.quality_analytics || {};
    const sa = Number(qa.score_after) || 0;
    const sb = Number(qb.score_after) || 0;
    if (sb !== sa) return sb - sa;
    const da = Number(qa.delta) || 0;
    const db = Number(qb.delta) || 0;
    return db - da;
  });
}

/**
 * @param {{
 *   requireDeltaPositive?: boolean,
 *   exampleCount?: number,
 *   tierSampleLimit?: number,
 * }} [opts]
 */
export async function runStyleLearningPipeline(opts = {}) {
  const requireDeltaPositive = opts.requireDeltaPositive ?? false;
  const exampleCount = Math.min(
    10,
    Math.max(5, Number(opts.exampleCount) || 8),
  );
  const tierSampleLimit = opts.tierSampleLimit ?? 500;

  const excellentRows = await listScanResultsForQualityReview({
    qualityTier: "excellent",
    minScoreAfter: 45,
    requireDeltaPositive,
    limit: 250,
  });

  const tierSampleRows = await fetchRecentScanResultsWithQuality({
    limit: tierSampleLimit,
  });

  const signal_histogram = summarizeSignalHistogram(excellentRows);
  const gain_ratio_by_tier = averageImproveGainRatioByTier(tierSampleRows);
  const wording_traits_high_score = aggregateWordingTraits(excellentRows);

  const summary = {
    criteria: {
      quality_tier: "excellent",
      min_score_after: 45,
      require_delta_positive: requireDeltaPositive,
    },
    sample_size_excellent: excellentRows.length,
    sample_size_tier_stats: tierSampleRows.length,
    signal_histogram,
    gain_ratio_by_tier,
    wording_traits_high_score,
  };

  const sorted = sortRowsByScoreThenDelta(excellentRows);
  const examples = sorted.slice(0, exampleCount);

  const pack = buildStyleReferencePackDocument({
    summary,
    examples,
  });

  return { summary, examples, pack };
}

/**
 * @param {{ summary: object, examples: object[] }} args
 */
export function buildStyleReferencePackDocument({ summary, examples }) {
  return {
    version: 1,
    kind: "ener_scan_style_reference_pack",
    generated_at: new Date().toISOString(),
    purpose:
      "Internal few-shot / style reference candidates — not wired into live prompts yet.",
    summary,
    examples: examples.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      score_after: row.quality_analytics?.score_after ?? null,
      score_before: row.quality_analytics?.score_before ?? null,
      delta: row.quality_analytics?.delta ?? null,
      quality_tier: row.quality_analytics?.quality_tier ?? null,
      signals: row.quality_analytics?.signals ?? null,
      improve_applied: row.quality_analytics?.improve_applied ?? null,
      improve_gain_ratio: row.quality_analytics?.improve_gain_ratio ?? null,
      wording_traits: extractWordingTraits(row.result_text),
      result_text: row.result_text,
    })),
  };
}

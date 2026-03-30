/**
 * Phase 2.4 — structured console logs for legacy vs summary-first Flex rollout comparison.
 * Never log full public tokens or LINE user ids (prefixes only).
 */

/**
 * Bump when adding/removing log fields (for log pipeline contracts).
 * v2: env snapshot on rollout + text fallback; httpStatus on REPORT_PAGE_OPEN.
 * v3: execution context — nodeEnv + optional rolloutWindowLabel (Phase 2.6).
 * v4: soft rollout — FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT + bucket0to99 + selected flag.
 */
export const REPORT_ROLLOUT_SCHEMA_VERSION = 4;

const ROLLOUT_WINDOW_LABEL_MAX = 64;

/**
 * Cross-cutting fields for staging/prod log separation and manual comparison windows.
 * Set `ROLLOUT_WINDOW_LABEL` or `REPORT_ROLLOUT_WINDOW_LABEL` (optional, ≤64 chars).
 *
 * @returns {{ nodeEnv: string, rolloutWindowLabel: string | null }}
 */
export function getRolloutExecutionContext() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim() || "unknown";
  const raw = String(
    process.env.ROLLOUT_WINDOW_LABEL ||
      process.env.REPORT_ROLLOUT_WINDOW_LABEL ||
      "",
  ).trim();
  const rolloutWindowLabel =
    raw.length > 0 ? raw.slice(0, ROLLOUT_WINDOW_LABEL_MAX) : null;
  return { nodeEnv, rolloutWindowLabel };
}

/**
 * @param {unknown} token
 * @param {number} [len=8]
 * @returns {string}
 */
export function safeTokenPrefix(token, len = 8) {
  const s = String(token || "").trim();
  if (!s) return "";
  const n = Math.min(Math.max(1, len), 16);
  return s.length > n ? `${s.slice(0, n)}…` : s.slice(0, n);
}

/**
 * @param {unknown} lineUserId
 * @param {number} [len=8]
 * @returns {string}
 */
export function safeLineUserIdPrefix(lineUserId, len = 8) {
  return safeTokenPrefix(lineUserId, len);
}

/**
 * Stable 0–99 bucket for LINE user id (FNV-1a style). Used for %-rollout of summary-first Flex.
 * @param {unknown} lineUserId
 * @returns {number}
 */
export function flexRolloutBucket0to99(lineUserId) {
  const s = String(lineUserId || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}

/**
 * Whether this user is in the summary-first Flex cohort (master on + rollout %).
 * @param {unknown} lineUserId
 * @param {boolean} masterEnabled `FLEX_SCAN_SUMMARY_FIRST`
 * @param {number} rolloutPct100 `FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT` (0–100)
 */
export function isSummaryFirstFlexSelectedForUser(
  lineUserId,
  masterEnabled,
  rolloutPct100,
) {
  if (!masterEnabled) return false;
  const pct = Number.isFinite(rolloutPct100)
    ? Math.min(100, Math.max(0, Math.floor(rolloutPct100)))
    : 100;
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  return flexRolloutBucket0to99(lineUserId) < pct;
}

/**
 * @param {{ flexSummaryFirstEnabled: boolean, summaryFirstBuildFailed: boolean, appendReportBubble: boolean }} p
 * @returns {"legacy" | "summary_first_footer" | "summary_first_append" | "summary_first_fallback_legacy"}
 */
export function deriveFlexPresentationMode(p) {
  const { flexSummaryFirstEnabled, summaryFirstBuildFailed, appendReportBubble } =
    p;
  if (!flexSummaryFirstEnabled) return "legacy";
  if (summaryFirstBuildFailed) return "summary_first_fallback_legacy";
  if (appendReportBubble) return "summary_first_append";
  return "summary_first_footer";
}

/**
 * @param {"legacy" | "summary_first_footer" | "summary_first_append" | "summary_first_fallback_legacy"} mode
 * @param {boolean} hasReportLink
 * @returns {"none" | "footer_uri" | "carousel_bubble"}
 */
export function deriveReportLinkPlacement(mode, hasReportLink) {
  if (!hasReportLink) return "none";
  if (mode === "summary_first_footer") return "footer_uri";
  return "carousel_bubble";
}

/**
 * @param {object} p
 * @param {string} [p.lineUserIdPrefix]
 * @param {"legacy" | "summary_first_footer" | "summary_first_append" | "summary_first_fallback_legacy"} p.flexPresentationMode
 * @param {number} p.scanResultBubbleCount — scan bubbles only (before birthdate settings)
 * @param {number} p.totalCarouselBubbles — includes settings bubble when appended
 * @param {boolean} p.settingsBubbleAppended
 * @param {boolean} p.hasReportLink
 * @param {"none" | "footer_uri" | "carousel_bubble"} p.reportLinkPlacement
 * @param {boolean} p.hasObjectImage — from ReportPayload when available
 * @param {string|null|undefined} p.scanAccessSource — e.g. free | paid
 * @param {boolean} p.summaryFirstBuildFailed
 * @param {boolean} p.envFlexScanSummaryFirst — process env at send time (self-describing logs)
 * @param {boolean} p.envFlexSummaryAppendReportBubble
 * @param {number} [p.flexScanSummaryFirstRolloutPct] 0–100
 * @param {boolean} [p.flexScanSummaryFirstSelected] effective cohort (rollout applied)
 * @param {number|null} [p.flexRolloutBucket0to99] 0–99 for this user
 */
export function logScanResultFlexRollout(p) {
  const ctx = getRolloutExecutionContext();
  console.log(
    JSON.stringify({
      event: "SCAN_RESULT_FLEX_ROLLOUT",
      schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
      ts: new Date().toISOString(),
      nodeEnv: ctx.nodeEnv,
      rolloutWindowLabel: ctx.rolloutWindowLabel,
      lineUserIdPrefix: p.lineUserIdPrefix || "",
      flexPresentationMode: p.flexPresentationMode,
      scanResultBubbleCount: p.scanResultBubbleCount,
      totalCarouselBubbles: p.totalCarouselBubbles,
      settingsBubbleAppended: p.settingsBubbleAppended,
      hasReportLink: p.hasReportLink,
      reportLinkPlacement: p.reportLinkPlacement,
      hasObjectImage: p.hasObjectImage,
      scanAccessSource: p.scanAccessSource ?? null,
      summaryFirstBuildFailed: p.summaryFirstBuildFailed,
      envFlexScanSummaryFirst: Boolean(p.envFlexScanSummaryFirst),
      envFlexSummaryAppendReportBubble: Boolean(p.envFlexSummaryAppendReportBubble),
      flexScanSummaryFirstRolloutPct:
        p.flexScanSummaryFirstRolloutPct ?? null,
      flexScanSummaryFirstSelected: Boolean(p.flexScanSummaryFirstSelected),
      flexRolloutBucket0to99:
        p.flexRolloutBucket0to99 === undefined
          ? null
          : p.flexRolloutBucket0to99,
    }),
  );
}

/**
 * @param {object} p
 * @param {string} [p.lineUserIdPrefix]
 * @param {boolean} [p.envFlexScanSummaryFirst]
 * @param {boolean} [p.envFlexSummaryAppendReportBubble]
 */
export function logScanResultTextFallback(p) {
  const ctx = getRolloutExecutionContext();
  console.log(
    JSON.stringify({
      event: "SCAN_RESULT_TEXT_FALLBACK",
      schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
      ts: new Date().toISOString(),
      nodeEnv: ctx.nodeEnv,
      rolloutWindowLabel: ctx.rolloutWindowLabel,
      lineUserIdPrefix: p.lineUserIdPrefix || "",
      envFlexScanSummaryFirst: Boolean(p.envFlexScanSummaryFirst),
      envFlexSummaryAppendReportBubble: Boolean(p.envFlexSummaryAppendReportBubble),
      flexScanSummaryFirstRolloutPct:
        p.flexScanSummaryFirstRolloutPct ?? null,
      flexScanSummaryFirstSelected: Boolean(p.flexScanSummaryFirstSelected),
      flexRolloutBucket0to99:
        p.flexRolloutBucket0to99 === undefined
          ? null
          : p.flexRolloutBucket0to99,
    }),
  );
}

/**
 * @param {object} p
 * @param {string} p.tokenPrefix
 * @param {"ok" | "not_found" | "expired" | "unavailable"} p.outcome
 * @param {"memory" | "db" | "publication" | null} p.loadSource
 * @param {boolean} p.hasObjectImage
 * @param {string|null|undefined} p.reportVersion
 * @param {boolean} [p.isDemoToken]
 * @param {number} p.httpStatus — 200 or 404 (unambiguous vs outcome string alone)
 */
export function logReportPageOpen(p) {
  const ctx = getRolloutExecutionContext();
  console.log(
    JSON.stringify({
      event: "REPORT_PAGE_OPEN",
      schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
      ts: new Date().toISOString(),
      nodeEnv: ctx.nodeEnv,
      rolloutWindowLabel: ctx.rolloutWindowLabel,
      tokenPrefix: p.tokenPrefix || "",
      outcome: p.outcome,
      httpStatus: p.httpStatus,
      loadSource: p.loadSource,
      hasObjectImage: p.hasObjectImage,
      reportVersion: p.reportVersion ?? null,
      isDemoToken: Boolean(p.isDemoToken),
    }),
  );
}

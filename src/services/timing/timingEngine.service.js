/**
 * Timing Engine v1.1 — deterministic timing truth (separate from templates / LLM).
 */

import {
  TIMING_CALIBRATION_TOTAL_CAP,
  TIMING_ENGINE_VERSION,
  TIMING_WEIGHTS,
} from "../../config/timing/timingEngine.config.js";
import { TIMING_HOUR_WINDOWS, TIMING_WINDOW_OWNER_ANCHOR } from "../../config/timing/timingWindows.config.js";
import { resolveRitualMode } from "../../config/timing/timingRitualMode.config.js";
import {
  TIMING_WEEKDAY_LABEL_TH,
  weekdayAffinityScore,
} from "../../config/timing/timingWeekdayAffinity.config.js";
import {
  SACRED_AMULET_HOUR_POWER_WEIGHT,
  SACRED_AMULET_HOUR_BIRTH_SYNERGY,
  SACRED_AMULET_DATE_ROOT_WEIGHT,
} from "../../config/timing/timingLaneRules.sacredAmulet.js";
import {
  MOLDAVITE_HOUR_POWER_WEIGHT,
  MOLDAVITE_HOUR_BIRTH_SYNERGY,
  MOLDAVITE_DATE_ROOT_WEIGHT,
} from "../../config/timing/timingLaneRules.moldavite.js";
import {
  applyCompatibilityCalibration,
  applyOwnerFitCalibration,
  applyPrimaryAxisStrengthCalibration,
} from "./timingCalibration.util.js";
import {
  birthDayRootFromBirthdate,
  lifePathFromBirthdate,
  normalizeBirthdateIso,
  parseIsoYmd,
} from "../../utils/compatibilityFormula.util.js";
import {
  SACRED_AXIS_HINT_TH,
  MOLDAVITE_AXIS_HINT_TH,
  buildPracticalHintTh,
  reasonTextFromCode,
  TIMING_INVALID_BIRTH_PRACTICAL,
} from "./timingEngine.copy.th.js";


const [W_OWNER, W_LANE, W_WD, W_COMPAT, W_FIT] = TIMING_WEIGHTS;

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * @param {number} a — 1–9
 * @param {number} b — 1–9
 */
function ringDist9(a, b) {
  const x = clamp(Math.round(a), 1, 9);
  const y = clamp(Math.round(b), 1, 9);
  let d = Math.abs(x - y);
  d = Math.min(d, 9 - d);
  return d;
}

/**
 * @param {number} lp
 */
function lifePathRing9(lp) {
  const n = Math.round(Number(lp) || 0);
  if (n === 11) return 2;
  if (n === 22) return 4;
  if (n >= 1 && n <= 9) return n;
  return clamp(((n - 1) % 9) + 1, 1, 9);
}

/**
 * @param {number} birthWd
 * @param {number} wd
 */
function ringDistWeek(birthWd, wd) {
  const a = ((birthWd % 7) + 7) % 7;
  const b = ((wd % 7) + 7) % 7;
  let d = Math.abs(a - b);
  d = Math.min(d, 7 - d);
  return d;
}

/**
 * @param {string} s
 */
function timingFingerprintV11(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `t${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * @param {number} base
 * @param {number} compat01
 * @param {number} fit01
 * @param {number} primaryWeight01
 * @returns {{ final: number, dCompat: number, dFit: number, dAxis: number }}
 */
function calibrationBreakdown(base, compat01, fit01, primaryWeight01) {
  const b = clamp(Math.round(base), 0, 100);
  const afterC = applyCompatibilityCalibration(b, compat01, 6);
  const dCompat = afterC - b;
  const afterF = applyOwnerFitCalibration(afterC, fit01, 6);
  const dFit = afterF - afterC;
  const afterP = applyPrimaryAxisStrengthCalibration(afterF, primaryWeight01, 6);
  const dAxis = afterP - afterF;
  let final = afterP;
  const total = final - b;
  if (total > TIMING_CALIBRATION_TOTAL_CAP) final = b + TIMING_CALIBRATION_TOTAL_CAP;
  else if (total < -TIMING_CALIBRATION_TOTAL_CAP) final = b - TIMING_CALIBRATION_TOTAL_CAP;
  return { final: clamp(Math.round(final), 0, 100), dCompat, dFit, dAxis };
}

/**
 * @param {number} ownerAff
 * @param {number} laneAff
 * @param {number} weekdayAff
 * @param {number} compat01
 * @param {number} fit01
 */
function combineTimingScore(ownerAff, laneAff, weekdayAff, compat01, fit01) {
  const c = clamp(compat01, 0, 1);
  const f = clamp(fit01, 0, 1);
  return Math.round(
    W_OWNER * ownerAff +
      W_LANE * laneAff +
      W_WD * weekdayAff +
      W_COMPAT * c * 100 +
      W_FIT * f * 100,
  );
}

/**
 * @param {"sacred_amulet"|"moldavite"} lane
 * @param {string} primaryKey
 */
function hourPowerTable(lane, primaryKey) {
  const pk = String(primaryKey || "").trim();
  if (lane === "moldavite") {
    const t = MOLDAVITE_HOUR_POWER_WEIGHT[pk];
    return t || MOLDAVITE_HOUR_POWER_WEIGHT.work;
  }
  const t = SACRED_AMULET_HOUR_POWER_WEIGHT[pk];
  return t || SACRED_AMULET_HOUR_POWER_WEIGHT.protection;
}

/**
 * @param {"sacred_amulet"|"moldavite"} lane
 * @param {string} primaryKey
 * @param {string|undefined} secondaryKey
 */
function blendedHourPower(lane, primaryKey, secondaryKey) {
  const primary = hourPowerTable(lane, primaryKey);
  const sk = String(secondaryKey || "").trim();
  const pk = String(primaryKey || "").trim();
  if (!sk || sk === pk) return { blend: primary, secondary: null, secondaryWeightFor: null };
  const sec = hourPowerTable(lane, sk);
  /** @type {Record<string, number>} */
  const out = {};
  for (const w of TIMING_HOUR_WINDOWS) {
    const k = w.key;
    out[k] = primary[k] * 0.74 + sec[k] * 0.26;
  }
  return { blend: out, secondary: sec, secondaryWeightFor: sk };
}

/**
 * @param {"sacred_amulet"|"moldavite"} lane
 */
function hourBirthTable(lane) {
  return lane === "moldavite" ? MOLDAVITE_HOUR_BIRTH_SYNERGY : SACRED_AMULET_HOUR_BIRTH_SYNERGY;
}

/**
 * @param {"sacred_amulet"|"moldavite"} lane
 * @param {string} primaryKey
 * @param {number} root1to9
 */
function dateRootLaneWeight(lane, primaryKey, root1to9) {
  const pk = String(primaryKey || "").trim();
  const idx = clamp(Math.round(root1to9), 1, 9) - 1;
  let arr;
  if (lane === "moldavite") {
    arr = MOLDAVITE_DATE_ROOT_WEIGHT[pk] || MOLDAVITE_DATE_ROOT_WEIGHT.work;
  } else {
    arr = SACRED_AMULET_DATE_ROOT_WEIGHT[pk] || SACRED_AMULET_DATE_ROOT_WEIGHT.protection;
  }
  const v = arr[idx];
  return Number.isFinite(v) ? v : 0.65;
}

/**
 * @param {object} p
 * @param {"hour"|"weekday"|"root"} p.kind
 * @param {number} p.ownerAff
 * @param {number} p.laneAff
 * @param {number} p.weekdayAff
 * @param {number} p.score
 * @param {number} p.baseScore
 * @param {number} p.dCompat
 * @param {number} p.dFit
 * @param {number} p.compat01
 * @param {number} p.fit01
 * @param {boolean} p.laneSecondaryLean
 * @param {boolean} p.isAvoid
 * @param {string} [p.slotLabelTh]
 */
function deriveReasonCode(p) {
  if (p.isAvoid || p.score < 48) {
    return {
      code: "LOW_RESONANCE",
      text: reasonTextFor("LOW_RESONANCE", p),
    };
  }

  const wo = W_OWNER * p.ownerAff;
  const wl = W_LANE * p.laneAff;
  const ww = W_WD * p.weekdayAff;
  const spread = Math.max(wo, wl, ww) - Math.min(wo, wl, ww);

  const calibStory =
    p.dCompat >= 4 && p.compat01 >= 0.62 && p.dCompat >= p.dFit
      ? "COMPATIBILITY_BOOST"
      : p.dFit >= 4 && p.fit01 >= 0.62 && p.dFit > p.dCompat
        ? "OWNER_FIT_BOOST"
        : null;

  if (calibStory && spread < 8 && (p.compat01 >= 0.58 || p.fit01 >= 0.58)) {
    return { code: calibStory, text: reasonTextFor(calibStory, p) };
  }

  if (p.laneSecondaryLean && p.kind === "hour") {
    return { code: "LANE_SECONDARY_SUPPORT", text: reasonTextFor("LANE_SECONDARY_SUPPORT", p) };
  }

  if (p.kind === "root" && wl >= wo - 0.5 && p.laneAff >= 72) {
    return { code: "DATE_ROOT_RESONANCE", text: reasonTextFor("DATE_ROOT_RESONANCE", p) };
  }

  const max = Math.max(wo, wl, ww);
  if (spread < 2.2) {
    return { code: "STABILITY_ANCHOR", text: reasonTextFor("STABILITY_ANCHOR", p) };
  }

  if (max === wo) {
    if (p.ownerAff >= 88) {
      return { code: "OWNER_ROOT_MATCH", text: reasonTextFor("OWNER_ROOT_MATCH", p) };
    }
    if (p.ownerAff >= 74) {
      return { code: "OWNER_ROOT_NEAR_MATCH", text: reasonTextFor("OWNER_ROOT_NEAR_MATCH", p) };
    }
  }
  if (max === wl) {
    return { code: "LANE_PRIMARY_SUPPORT", text: reasonTextFor("LANE_PRIMARY_SUPPORT", p) };
  }
  if (max === ww) {
    return { code: "WEEKDAY_AFFINITY", text: reasonTextFor("WEEKDAY_AFFINITY", p) };
  }

  return { code: "STABILITY_ANCHOR", text: reasonTextFor("STABILITY_ANCHOR", p) };
}

/**
 * @param {string} code
 * @param {object} ctx
 */
function reasonTextFor(code, ctx) {
  const slot = ctx.slotLabelTh ? String(ctx.slotLabelTh) : "";
  const pre = slot ? `${slot}: ` : "";
  return reasonTextFromCode(code, pre);
}

/**
 * @param {string} birthdateIso
 */
function birthWeekdayFromIso(birthdateIso) {
  const p = parseIsoYmd(birthdateIso);
  if (!p) return 0;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return d.getUTCDay();
}

/**
 * @param {TimingRequest} input
 * @returns {TimingResponse}
 */
export function computeTimingV1(input) {
  const lane = input.lane === "moldavite" ? "moldavite" : "sacred_amulet";
  const primaryKey =
    String(input.primaryKey || "").trim() || (lane === "moldavite" ? "work" : "protection");
  const secondaryKeyRaw = input.secondaryKey != null ? String(input.secondaryKey).trim() : "";
  const secondaryKey = secondaryKeyRaw || undefined;
  const iso = normalizeBirthdateIso(String(input.birthdateIso || ""));
  const parsed = parseIsoYmd(iso);

  const compat01 =
    input.compatibilityScore != null && Number.isFinite(Number(input.compatibilityScore))
      ? clamp(Number(input.compatibilityScore) / 100, 0, 1)
      : 0.5;
  const fit01 =
    input.ownerFitScore != null && Number.isFinite(Number(input.ownerFitScore))
      ? clamp(Number(input.ownerFitScore) / 100, 0, 1)
      : compat01;

  const ritualMode = resolveRitualMode(lane, primaryKey);
  const primaryOnlyPow = hourPowerTable(lane, primaryKey);
  const { blend: powerHour, secondary: powerSecondary } = blendedHourPower(
    lane,
    primaryKey,
    secondaryKey,
  );

  if (!parsed) {
    return {
      engineVersion: TIMING_ENGINE_VERSION,
      lane,
      ritualMode,
      confidence: "low",
      ownerProfile: { lifePath: 0, birthDayRoot: 0, weekday: 0 },
      bestHours: [],
      bestWeekdays: [],
      bestDateRoots: [],
      avoidHours: [],
      allWeekdayScores: [],
      allHourScores: [],
      summary: {
        topWindowLabel: "",
        topWeekdayLabel: "",
        practicalHint: TIMING_INVALID_BIRTH_PRACTICAL,
      },
      debug: {
        ownerRoot: 0,
        lifePath: 0,
        lanePrimaryWeight: null,
        laneSecondaryWeight: null,
        compatibilityBoostApplied: 0,
        ownerFitBoostApplied: 0,
        primaryAxisDeltaApplied: 0,
        timingFingerprint: null,
        timingStableKey: "",
        version: TIMING_ENGINE_VERSION,
      },
    };
  }

  const lifePath = lifePathFromBirthdate(iso);
  const birthDayRoot = birthDayRootFromBirthdate(iso);
  const birthWeekday = birthWeekdayFromIso(iso);
  const lp9 = lifePathRing9(lifePath);

  const birthSyn = hourBirthTable(lane);

  const stableKey = [
    iso,
    lane,
    primaryKey,
    secondaryKey || "",
    Math.round(compat01 * 100),
    Math.round(fit01 * 100),
    lifePath,
    birthDayRoot,
    birthWeekday,
  ].join("|");

  const timingFingerprint = timingFingerprintV11(stableKey);

  /** @type {TimingSlot[]} */
  const hourScores = [];
  TIMING_HOUR_WINDOWS.forEach((win, colIdx) => {
    const anchor = TIMING_WINDOW_OWNER_ANCHOR[win.key] ?? 5;
    const d1 = ringDist9(birthDayRoot, anchor);
    const d2 = ringDist9(lp9, anchor);
    const ownerAff = clamp(100 - d1 * 11 - d2 * 7, 35, 98);
    const laneAff = Math.round((powerHour[win.key] ?? 0.65) * 100);
    const syn = birthSyn[birthWeekday]?.[colIdx] ?? 0.65;
    const weekdayAff = Math.round(clamp(syn, 0.35, 1) * 100);
    const baseScore = combineTimingScore(ownerAff, laneAff, weekdayAff, compat01, fit01);
    const pw = powerHour[win.key] ?? 0.65;
    const { final: score, dCompat, dFit } = calibrationBreakdown(baseScore, compat01, fit01, pw);
    let laneSecondaryLean = false;
    if (powerSecondary) {
      const prim = primaryOnlyPow[win.key] ?? 0.65;
      const sec = powerSecondary[win.key] ?? 0.65;
      const blendV = powerHour[win.key] ?? 0.65;
      laneSecondaryLean = sec > prim + 0.04 && blendV > prim + 0.01;
    }
    const winLabel = win.labelTh;
    const r = deriveReasonCode({
      kind: "hour",
      ownerAff,
      laneAff,
      weekdayAff,
      score,
      baseScore,
      dCompat,
      dFit,
      compat01,
      fit01,
      laneSecondaryLean,
      isAvoid: false,
      slotLabelTh: winLabel,
    });
    hourScores.push({
      key: win.key,
      score,
      reasonCode: r.code,
      reasonText: r.text,
    });
  });

  /** Full list in `TIMING_HOUR_WINDOWS` order (before ranking) — public explain page */
  const allHourScores = hourScores.map((s) => ({ ...s }));

  hourScores.sort((a, b) => b.score - a.score);
  const bestHours = hourScores.slice(0, 3);
  const bestKeys = new Set(bestHours.map((h) => h.key));
  const avoidHours = [...hourScores]
    .sort((a, b) => a.score - b.score)
    .filter((s) => s.score < 48 && !bestKeys.has(s.key))
    .slice(0, 2)
    .map((s) => {
      const win = TIMING_HOUR_WINDOWS.find((w) => w.key === s.key);
      const r = deriveReasonCode({
        kind: "hour",
        ownerAff: 50,
        laneAff: 50,
        weekdayAff: 50,
        score: s.score,
        baseScore: s.score,
        dCompat: 0,
        dFit: 0,
        compat01,
        fit01,
        laneSecondaryLean: false,
        isAvoid: true,
        slotLabelTh: win?.labelTh,
      });
      return { ...s, reasonCode: r.code, reasonText: r.text };
    });

  /** @type {TimingSlot[]} */
  const wdScores = [];
  for (let wd = 0; wd < 7; wd += 1) {
    const ownerAff = clamp(100 - ringDistWeek(birthWeekday, wd) * 10, 40, 98);
    const laneAff = weekdayAffinityScore(lane, primaryKey, wd);
    const weekdayAff = 68 + ((wd * 5 + birthDayRoot * 3) % 28);
    const baseScore = combineTimingScore(ownerAff, laneAff, weekdayAff, compat01, fit01);
    const pw = dateRootLaneWeight(lane, primaryKey, birthDayRoot);
    const { final: score, dCompat, dFit } = calibrationBreakdown(baseScore, compat01, fit01, pw);
    const wdLabel = TIMING_WEEKDAY_LABEL_TH[((wd % 7) + 7) % 7];
    const r = deriveReasonCode({
      kind: "weekday",
      ownerAff,
      laneAff,
      weekdayAff,
      score,
      baseScore,
      dCompat,
      dFit,
      compat01,
      fit01,
      laneSecondaryLean: false,
      isAvoid: false,
      slotLabelTh: wdLabel,
    });
    wdScores.push({
      key: `weekday_${wd}`,
      score,
      reasonCode: r.code,
      reasonText: r.text,
    });
  }
  /** Sunday-first weekday_0 … weekday_6 (before ranking) — public explain page */
  const allWeekdayScores = wdScores.map((s) => ({ ...s }));

  wdScores.sort((a, b) => b.score - a.score);
  const bestWeekdays = wdScores.slice(0, 2);

  /** @type {TimingSlot[]} */
  const rootScores = [];
  for (let r = 1; r <= 9; r += 1) {
    const ownerAff = clamp(100 - ringDist9(birthDayRoot, r) * 9 - ringDist9(lp9, r) * 6, 38, 98);
    const laneAff = Math.round(dateRootLaneWeight(lane, primaryKey, r) * 100);
    const weekdayAff = weekdayAffinityScore(lane, primaryKey, birthWeekday);
    const baseScore = combineTimingScore(ownerAff, laneAff, weekdayAff, compat01, fit01);
    const pw = dateRootLaneWeight(lane, primaryKey, r);
    const { final: score, dCompat, dFit } = calibrationBreakdown(baseScore, compat01, fit01, pw);
    const rs = deriveReasonCode({
      kind: "root",
      ownerAff,
      laneAff,
      weekdayAff,
      score,
      baseScore,
      dCompat,
      dFit,
      compat01,
      fit01,
      laneSecondaryLean: false,
      isAvoid: false,
      slotLabelTh: `ราก ${r}`,
    });
    rootScores.push({
      key: String(r),
      score,
      reasonCode: rs.code,
      reasonText: rs.text,
    });
  }
  rootScores.sort((a, b) => b.score - a.score);
  const bestDateRoots = rootScores.slice(0, 3);

  const topWin = TIMING_HOUR_WINDOWS.find((w) => w.key === bestHours[0]?.key);
  const topWindowLabel = topWin?.labelTh ?? "";
  const topWdKey = bestWeekdays[0]?.key ?? "";
  const topWdNum = Number(String(topWdKey).replace("weekday_", ""));
  const topWeekdayLabel = Number.isFinite(topWdNum)
    ? TIMING_WEEKDAY_LABEL_TH[((topWdNum % 7) + 7) % 7] ?? ""
    : "";

  const spread = (bestHours[0]?.score ?? 0) - (hourScores[hourScores.length - 1]?.score ?? 0);
  let confidence = "medium";
  if (spread >= 28 && compat01 >= 0.68) confidence = "high";
  if (!bestHours.length || spread < 12) confidence = "low";
  if (fit01 >= 0.72 && spread >= 22) confidence = confidence === "low" ? "medium" : confidence;

  const axisHintSacred = SACRED_AXIS_HINT_TH[primaryKey] || SACRED_AXIS_HINT_TH.protection;
  const axisHintMold = MOLDAVITE_AXIS_HINT_TH[primaryKey] || MOLDAVITE_AXIS_HINT_TH.work;

  const practicalHint = buildPracticalHintTh(
    lane,
    ritualMode,
    topWindowLabel,
    topWeekdayLabel,
    lane === "moldavite" ? axisHintMold : axisHintSacred,
  );

  const topHourKey = bestHours[0]?.key;
  const topPw = topHourKey ? powerHour[topHourKey] ?? null : null;
  const topSecW =
    topHourKey && powerSecondary ? powerSecondary[topHourKey] ?? null : null;

  let topHourBase = 0;
  if (topHourKey) {
    const win = TIMING_HOUR_WINDOWS.find((w) => w.key === topHourKey);
    const colIdx = TIMING_HOUR_WINDOWS.findIndex((w) => w.key === topHourKey);
    if (win && colIdx >= 0) {
      const anchor = TIMING_WINDOW_OWNER_ANCHOR[win.key] ?? 5;
      const d1 = ringDist9(birthDayRoot, anchor);
      const d2 = ringDist9(lp9, anchor);
      const ownerAff = clamp(100 - d1 * 11 - d2 * 7, 35, 98);
      const laneAff = Math.round((powerHour[win.key] ?? 0.65) * 100);
      const syn = birthSyn[birthWeekday]?.[colIdx] ?? 0.65;
      const weekdayAff = Math.round(clamp(syn, 0.35, 1) * 100);
      topHourBase = combineTimingScore(ownerAff, laneAff, weekdayAff, compat01, fit01);
    }
  }
  const topCalib = topHourKey
    ? calibrationBreakdown(topHourBase, compat01, fit01, powerHour[topHourKey] ?? 0.65)
    : { dCompat: 0, dFit: 0, dAxis: 0 };

  return {
    engineVersion: TIMING_ENGINE_VERSION,
    lane,
    ritualMode,
    confidence,
    ownerProfile: {
      lifePath,
      birthDayRoot,
      weekday: birthWeekday,
    },
    bestHours,
    bestWeekdays,
    bestDateRoots,
    avoidHours,
    allWeekdayScores,
    allHourScores,
    summary: {
      topWindowLabel,
      topWeekdayLabel,
      practicalHint,
    },
    debug: {
      ownerRoot: birthDayRoot,
      lifePath,
      lanePrimaryWeight: topPw != null ? Math.round(topPw * 1000) / 1000 : null,
      laneSecondaryWeight: topSecW != null ? Math.round(topSecW * 1000) / 1000 : null,
      lanePrimaryKey: primaryKey,
      laneSecondaryKey: secondaryKey || null,
      compatibilityBoostApplied: topCalib.dCompat,
      ownerFitBoostApplied: topCalib.dFit,
      primaryAxisDeltaApplied: topCalib.dAxis,
      timingFingerprint,
      timingStableKey: stableKey,
      version: TIMING_ENGINE_VERSION,
    },
  };
}

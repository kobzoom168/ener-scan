/**
 * Timing Engine v1 — deterministic timing truth (separate from templates / LLM).
 */

import { TIMING_ENGINE_VERSION, TIMING_WEIGHTS } from "../../config/timing/timingEngine.config.js";
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
  birthDayRootFromBirthdate,
  lifePathFromBirthdate,
  normalizeBirthdateIso,
  parseIsoYmd,
} from "../../utils/compatibilityFormula.util.js";

const [W_OWNER, W_LANE, W_WD, W_COMPAT, W_FIT] = TIMING_WEIGHTS;

const REASON_TEXT = {
  OWNER_ROOT_MATCH: "ช่วงนี้สอดคล้องกับจังหวะตัวเลขวันเกิดของคุณมากกว่าช่วงอื่น",
  LANE_POWER_SUPPORT: "ช่วงนี้ส่งกับพลังเด่นของวัตถุในมุมนี้ได้ดี",
  POWER_AXIS_RESONANCE: "จังหวะนี้หนุนแกนพลังที่อ่านจากรายงานได้พอดี",
  LOW_RESONANCE: "ช่วงนี้จังหวะตอบกับเจ้าของได้น้อยกว่าเมื่อเทียบกับช่วงอื่น",
  BALANCED: "สมดุลระหว่างจังหวะเจ้าของกับแกนพลังของวัตถุ",
};

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
 * @param {number} score
 * @param {"hour"|"weekday"|"root"} kind
 */
function reasonForScore(score, kind) {
  if (score >= 86) return { code: "OWNER_ROOT_MATCH", text: REASON_TEXT.OWNER_ROOT_MATCH };
  if (score >= 80) return { code: "LANE_POWER_SUPPORT", text: REASON_TEXT.LANE_POWER_SUPPORT };
  if (score < 42) return { code: "LOW_RESONANCE", text: REASON_TEXT.LOW_RESONANCE };
  if (score >= 72) return { code: "POWER_AXIS_RESONANCE", text: REASON_TEXT.POWER_AXIS_RESONANCE };
  return { code: "BALANCED", text: REASON_TEXT.BALANCED };
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
 */
function hourBirthTable(lane) {
  return lane === "moldavite"
    ? MOLDAVITE_HOUR_BIRTH_SYNERGY
    : SACRED_AMULET_HOUR_BIRTH_SYNERGY;
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
 * @param {TimingRequest} input
 * @returns {TimingResponse}
 */
export function computeTimingV1(input) {
  const lane = input.lane === "moldavite" ? "moldavite" : "sacred_amulet";
  const primaryKey = String(input.primaryKey || "").trim() || "protection";
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
      summary: {
        topWindowLabel: "—",
        topWeekdayLabel: "—",
        practicalHint:
          "ระบุวันเดือนปีเกิดให้ครบเพื่อคำนวณจังหวะที่เหมาะแบบเฉพาะบุคคล — ผลลัพธ์เป็นกรอบอ่าน ไม่การันตีฤกษ์",
      },
    };
  }

  const lifePath = lifePathFromBirthdate(iso);
  const birthDayRoot = birthDayRootFromBirthdate(iso);
  const birthWeekday = birthWeekdayFromIso(iso);
  const lp9 = lifePathRing9(lifePath);

  const powerHour = hourPowerTable(lane, primaryKey);
  const birthSyn = hourBirthTable(lane);

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
    const score = combineTimingScore(
      ownerAff,
      laneAff,
      weekdayAff,
      compat01,
      fit01,
    );
    const r = reasonForScore(score, "hour");
    hourScores.push({
      key: win.key,
      score,
      reasonCode: r.code,
      reasonText: r.text,
    });
  });

  hourScores.sort((a, b) => b.score - a.score);
  const bestHours = hourScores.slice(0, 3);
  const avoidHours = [...hourScores]
    .sort((a, b) => a.score - b.score)
    .filter((s) => s.score < 48)
    .slice(0, 2);

  /** @type {TimingSlot[]} */
  const wdScores = [];
  for (let wd = 0; wd < 7; wd += 1) {
    const ownerAff = clamp(100 - ringDistWeek(birthWeekday, wd) * 10, 40, 98);
    const laneAff = weekdayAffinityScore(lane, primaryKey, wd);
    const weekdayAff = 68 + ((wd * 5 + birthDayRoot * 3) % 28);
    const score = combineTimingScore(
      ownerAff,
      laneAff,
      weekdayAff,
      compat01,
      fit01,
    );
    const r = reasonForScore(score, "weekday");
    wdScores.push({
      key: `weekday_${wd}`,
      score,
      reasonCode: r.code,
      reasonText: r.text,
    });
  }
  wdScores.sort((a, b) => b.score - a.score);
  const bestWeekdays = wdScores.slice(0, 2);

  /** @type {TimingSlot[]} */
  const rootScores = [];
  for (let r = 1; r <= 9; r += 1) {
    const ownerAff = clamp(100 - ringDist9(birthDayRoot, r) * 9 - ringDist9(lp9, r) * 6, 38, 98);
    const laneAff = Math.round(dateRootLaneWeight(lane, primaryKey, r) * 100);
    const weekdayAff = weekdayAffinityScore(lane, primaryKey, birthWeekday);
    const score = combineTimingScore(
      ownerAff,
      laneAff,
      weekdayAff,
      compat01,
      fit01,
    );
    const rs = reasonForScore(score, "root");
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
  const topWindowLabel = topWin?.labelTh ?? "—";
  const topWdKey = bestWeekdays[0]?.key ?? "";
  const topWdNum = Number(String(topWdKey).replace("weekday_", ""));
  const topWeekdayLabel = Number.isFinite(topWdNum)
    ? TIMING_WEEKDAY_LABEL_TH[((topWdNum % 7) + 7) % 7] ?? "—"
    : "—";

  const spread = (bestHours[0]?.score ?? 0) - (hourScores[hourScores.length - 1]?.score ?? 0);
  let confidence = "medium";
  if (spread >= 28 && compat01 >= 0.68) confidence = "high";
  if (!bestHours.length || spread < 12) confidence = "low";

  const practicalHint = `${ritualMode}: เน้น${topWindowLabel} และ${topWeekdayLabel} เมื่อต้องการหนุนด้านที่เด่นของวัตถุ — เป็นกรอบอ่าน ไม่การันตีฤกษ์`;

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
    summary: {
      topWindowLabel,
      topWeekdayLabel,
      practicalHint,
    },
  };
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

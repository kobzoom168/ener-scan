/**
 * Coarse Bangkok-local time windows (v1: hour buckets, explainable).
 * Keys are stable identifiers for payload + tests.
 */

/** @typedef {{ key: string, startHour: number, endHour: number, labelTh: string }} TimingWindowDef */

/** @type {readonly TimingWindowDef[]} */
export const TIMING_HOUR_WINDOWS = Object.freeze([
  { key: "dawn_05_06", startHour: 5, endHour: 6, labelTh: "รุ่งอรุณ 05:00–06:59" },
  { key: "morning_07_10", startHour: 7, endHour: 10, labelTh: "ช่วงเช้า 07:00–10:59" },
  { key: "noon_11_13", startHour: 11, endHour: 13, labelTh: "กลางวัน 11:00–13:59" },
  { key: "afternoon_14_16", startHour: 14, endHour: 16, labelTh: "บ่าย 14:00–16:59" },
  { key: "evening_17_19", startHour: 17, endHour: 19, labelTh: "เย็น 17:00–19:59" },
  { key: "night_20_22", startHour: 20, endHour: 22, labelTh: "กลางคืน 20:00–22:59" },
  { key: "late_night_23_04", startHour: 23, endHour: 4, labelTh: "ดึก 23:00–04:59" },
]);

/** Symbolic anchor 1–9 per window for owner-root resonance (config, not computed in template). */
export const TIMING_WINDOW_OWNER_ANCHOR = Object.freeze(
  /** @type {Record<string, number>} */ ({
    dawn_05_06: 1,
    morning_07_10: 3,
    noon_11_13: 5,
    afternoon_14_16: 7,
    evening_17_19: 8,
    night_20_22: 4,
    late_night_23_04: 2,
  }),
);

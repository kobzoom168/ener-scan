/**
 * Sacred amulet lane — hour window weights by primary power + birth-weekday synergy.
 * Rows: Sunday=0 … Saturday=6. Columns: same order as TIMING_HOUR_WINDOWS.
 */

import { TIMING_HOUR_WINDOWS } from "./timingWindows.config.js";

const W = TIMING_HOUR_WINDOWS.map((w) => w.key);

/** @type {Record<string, Record<string, number>>} */
export const SACRED_AMULET_HOUR_POWER_WEIGHT = Object.freeze({
  protection: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.62, 0.9, 0.72, 0.68, 0.75, 0.7, 0.48][i];
        return [k, v];
      }),
    ),
  ),
  metta: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.58, 0.88, 0.78, 0.72, 0.85, 0.68, 0.52][i];
        return [k, v];
      }),
    ),
  ),
  baramee: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.75, 0.82, 0.88, 0.8, 0.78, 0.72, 0.55][i];
        return [k, v];
      }),
    ),
  ),
  luck: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.55, 0.92, 0.7, 0.68, 0.88, 0.65, 0.5][i];
        return [k, v];
      }),
    ),
  ),
  fortune_anchor: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.65, 0.88, 0.75, 0.72, 0.8, 0.74, 0.52][i];
        return [k, v];
      }),
    ),
  ),
  specialty: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.62, 0.85, 0.74, 0.72, 0.76, 0.7, 0.54][i];
        return [k, v];
      }),
    ),
  ),
});

/** birth weekday 0–6 × window column index 0–6 → 0.35–1 */
export const SACRED_AMULET_HOUR_BIRTH_SYNERGY = Object.freeze([
  [0.62, 0.78, 0.72, 0.68, 0.74, 0.7, 0.45],
  [0.7, 0.88, 0.75, 0.72, 0.7, 0.65, 0.48],
  [0.68, 0.85, 0.7, 0.74, 0.72, 0.68, 0.52],
  [0.65, 0.9, 0.72, 0.76, 0.78, 0.66, 0.5],
  [0.64, 0.92, 0.74, 0.7, 0.88, 0.64, 0.48],
  [0.66, 0.86, 0.76, 0.72, 0.82, 0.7, 0.55],
  [0.63, 0.8, 0.73, 0.7, 0.76, 0.72, 0.58],
]);

/** primary power × date root 1–9 → 0.4–1 */
export const SACRED_AMULET_DATE_ROOT_WEIGHT = Object.freeze({
  protection: [0.55, 0.62, 0.88, 0.7, 0.75, 0.72, 0.68, 0.65, 0.78],
  metta: [0.72, 0.68, 0.55, 0.78, 0.92, 0.74, 0.66, 0.7, 0.62],
  baramee: [0.88, 0.72, 0.65, 0.92, 0.78, 0.7, 0.68, 0.74, 0.8],
  luck: [0.62, 0.55, 0.7, 0.68, 0.92, 0.72, 0.65, 0.88, 0.74],
  fortune_anchor: [0.7, 0.72, 0.68, 0.75, 0.78, 0.55, 0.88, 0.74, 0.7],
  specialty: [0.68, 0.7, 0.72, 0.74, 0.7, 0.68, 0.72, 0.7, 0.68],
});

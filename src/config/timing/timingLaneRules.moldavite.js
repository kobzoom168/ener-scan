/**
 * Moldavite lane — hour window weights (v1 baseline; Phase 2 tuning).
 */

import { TIMING_HOUR_WINDOWS } from "./timingWindows.config.js";

const W = TIMING_HOUR_WINDOWS.map((w) => w.key);

/** @type {Record<string, Record<string, number>>} */
export const MOLDAVITE_HOUR_POWER_WEIGHT = Object.freeze({
  work: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.5, 0.95, 0.9, 0.76, 0.64, 0.55, 0.42][i];
        return [k, v];
      }),
    ),
  ),
  money: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.48, 0.86, 0.8, 0.92, 0.88, 0.65, 0.45][i];
        return [k, v];
      }),
    ),
  ),
  relationship: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.52, 0.58, 0.55, 0.62, 0.9, 0.92, 0.72][i];
        return [k, v];
      }),
    ),
  ),
  life_rhythm: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.64, 0.78, 0.72, 0.74, 0.76, 0.78, 0.62][i];
        return [k, v];
      }),
    ),
  ),
  owner_fit: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.58, 0.82, 0.72, 0.74, 0.78, 0.8, 0.58][i];
        return [k, v];
      }),
    ),
  ),
});

export const MOLDAVITE_HOUR_BIRTH_SYNERGY = Object.freeze([
  [0.6, 0.8, 0.74, 0.7, 0.72, 0.68, 0.46],
  [0.68, 0.9, 0.78, 0.74, 0.7, 0.64, 0.5],
  [0.66, 0.88, 0.72, 0.76, 0.74, 0.66, 0.52],
  [0.64, 0.9, 0.74, 0.78, 0.76, 0.65, 0.48],
  [0.63, 0.92, 0.76, 0.72, 0.85, 0.63, 0.47],
  [0.65, 0.87, 0.75, 0.73, 0.8, 0.69, 0.54],
  [0.62, 0.82, 0.74, 0.71, 0.75, 0.71, 0.56],
]);

/** @type {Record<string, number[]>} */
export const MOLDAVITE_DATE_ROOT_WEIGHT = Object.freeze({
  work: [0.78, 0.9, 0.62, 0.74, 0.68, 0.66, 0.58, 0.8, 0.72],
  money: [0.62, 0.7, 0.65, 0.9, 0.94, 0.72, 0.64, 0.76, 0.82],
  relationship: [0.68, 0.58, 0.55, 0.66, 0.72, 0.9, 0.78, 0.64, 0.7],
  life_rhythm: [0.72, 0.74, 0.7, 0.73, 0.71, 0.72, 0.73, 0.7, 0.72],
  owner_fit: [0.7, 0.73, 0.69, 0.74, 0.76, 0.72, 0.71, 0.74, 0.7],
});

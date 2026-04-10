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
        const v = [0.55, 0.92, 0.85, 0.82, 0.72, 0.62, 0.5][i];
        return [k, v];
      }),
    ),
  ),
  money: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.52, 0.88, 0.78, 0.9, 0.85, 0.68, 0.48][i];
        return [k, v];
      }),
    ),
  ),
  relationship: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.58, 0.82, 0.72, 0.7, 0.88, 0.75, 0.55][i];
        return [k, v];
      }),
    ),
  ),
  life_rhythm: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.62, 0.84, 0.76, 0.74, 0.78, 0.72, 0.56][i];
        return [k, v];
      }),
    ),
  ),
  owner_fit: Object.freeze(
    Object.fromEntries(
      W.map((k, i) => {
        const v = [0.6, 0.86, 0.74, 0.72, 0.8, 0.74, 0.54][i];
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
  work: [0.72, 0.88, 0.65, 0.78, 0.7, 0.68, 0.62, 0.75, 0.7],
  money: [0.65, 0.72, 0.68, 0.88, 0.92, 0.7, 0.66, 0.74, 0.78],
  relationship: [0.7, 0.65, 0.62, 0.7, 0.78, 0.88, 0.72, 0.68, 0.74],
  life_rhythm: [0.7, 0.72, 0.71, 0.73, 0.72, 0.7, 0.71, 0.72, 0.71],
  owner_fit: [0.71, 0.72, 0.7, 0.72, 0.74, 0.71, 0.7, 0.73, 0.71],
});

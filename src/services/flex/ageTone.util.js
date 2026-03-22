/**
 * Deterministic age-band → tone preset (no user-facing age; internal only).
 * Birthdate format: DD/MM/YYYY (same as `normalizeBirthdateForScan`).
 */

import { isValidBirthdate } from "../../utils/webhookText.util.js";

/** @typedef {'18-24'|'25-34'|'35-44'|'45+'|'unknown'} AgeBand */
/** @typedef {'youthful'|'warm'|'mystic'} TonePreset */

/**
 * @param {string|undefined|null} birthdateStr
 * @returns {number|null} Age in full years, or null if invalid.
 */
export function parseBirthdateToAge(birthdateStr) {
  const raw = String(birthdateStr ?? "").trim();
  if (!raw || !isValidBirthdate(raw)) return null;

  const normalized = raw
    .replace(/\s+/g, "")
    .replace(/[.]/g, "/")
    .replace(/-/g, "/");
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  if (!Number.isFinite(age)) return null;
  return age;
}

/**
 * @param {number|null} age
 * @returns {AgeBand}
 */
export function deriveAgeBand(age) {
  if (age == null || !Number.isFinite(age)) return "unknown";
  if (age < 18) return "unknown";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  return "45+";
}

/**
 * @param {AgeBand} ageBand
 * @returns {TonePreset}
 */
export function resolveTonePreset(ageBand) {
  switch (ageBand) {
    case "18-24":
      return "youthful";
    case "25-34":
    case "35-44":
      return "warm";
    case "45+":
      return "mystic";
    default:
      return "warm";
  }
}

/**
 * @param {string|undefined|null} birthdateStr
 * @returns {{ tonePreset: TonePreset, ageBand: AgeBand }}
 */
export function getAgeTonePresetFromBirthdate(birthdateStr) {
  const age = parseBirthdateToAge(birthdateStr);
  const ageBand = deriveAgeBand(age);
  const tonePreset = resolveTonePreset(ageBand);
  return { tonePreset, ageBand };
}

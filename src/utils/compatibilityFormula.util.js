/**
 * Deterministic compatibility score v1 (element / number / symbol / context).
 */

import {
  COMPATIBILITY_FORMULA_VERSION,
  COMPATIBILITY_FORMULA_VERSION_STABLE,
  CONTEXT_MATRIX,
  ELEMENT_MATRIX,
  LIFE_PATH_TO_ELEMENT,
  MAIN_ENERGY_BONUS,
  MAIN_ENERGY_TO_NUMBER_GROUP,
  MATERIAL_TO_ELEMENT,
  OBJECT_FAMILY_BASE,
  OBJECT_FAMILY_TO_ELEMENT,
  SHAPE_BONUS,
} from "../config/compatibilityFormula.config.js";
import { parseBirthdateInput } from "./birthdateParse.util.js";
import { BANGKOK_TIME_ZONE } from "./dateTime.util.js";

/**
 * Prefer ISO `YYYY-MM-DD`; accept LINE-style dates via {@link parseBirthdateInput}.
 * @param {string} birthdate
 * @returns {string}
 */
export function normalizeBirthdateIso(birthdate) {
  const s = String(birthdate || "").trim();
  if (!s) return "";
  const iso = parseIsoYmd(s);
  if (iso) {
    return `${iso.y}-${String(iso.m).padStart(2, "0")}-${String(iso.d).padStart(2, "0")}`;
  }
  const parsed = parseBirthdateInput(s);
  if (parsed?.ok && parsed.isoDate) return String(parsed.isoDate);
  return s;
}

/**
 * @param {number} n
 * @returns {number}
 */
export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Reduce to 1–9, preserving 11 and 22 as master numbers.
 * @param {number} n
 * @returns {number}
 */
export function reduceWithMaster(n) {
  let x = Math.floor(Math.abs(n));
  if (x === 0) return 0;
  while (x > 9) {
    if (x === 11 || x === 22) return x;
    const s = String(x)
      .split("")
      .reduce((a, c) => a + Number(c), 0);
    x = s;
  }
  return x;
}

/**
 * @param {string} isoDate — `YYYY-MM-DD`
 * @returns {{ y: number, m: number, d: number } | null}
 */
export function parseIsoYmd(isoDate) {
  const s = String(isoDate || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (![y, mo, d].every((x) => Number.isFinite(x))) return null;
  return { y, m: mo, d };
}

/**
 * Life path: digital root of DDMMYYYY digits (as one string).
 * @param {string} birthdateIso
 * @returns {number}
 */
export function lifePathFromBirthdate(birthdateIso) {
  const p = parseIsoYmd(birthdateIso);
  if (!p) return 5;
  const dd = String(p.d).padStart(2, "0");
  const mm = String(p.m).padStart(2, "0");
  const yyyy = String(p.y);
  const digitStr = `${dd}${mm}${yyyy}`.replace(/\D/g, "");
  const sum = digitStr.split("").reduce((a, c) => a + Number(c), 0);
  return reduceWithMaster(sum);
}

/**
 * @param {string} birthdateIso
 * @returns {number}
 */
export function birthDayRootFromBirthdate(birthdateIso) {
  const p = parseIsoYmd(birthdateIso);
  if (!p) return 1;
  return reduceWithMaster(p.d);
}

/**
 * Bangkok wall-clock hour/minute from ISO instant.
 * @param {string} scannedAtIso
 * @returns {{ hour: number, minute: number }}
 */
export function bangkokHourMinute(scannedAtIso) {
  const d = new Date(scannedAtIso);
  if (!Number.isFinite(d.getTime())) {
    return { hour: 12, minute: 0 };
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BANGKOK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((x) => x.type === "hour")?.value ?? "12");
  const minute = Number(parts.find((x) => x.type === "minute")?.value ?? "0");
  return {
    hour: Number.isFinite(hour) ? hour : 12,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

/**
 * Sum of digits of HH and MM (24h Bangkok), then reduce with master.
 * e.g. 15:14 → 1+5+1+4 = 11 → 11
 * @param {string} scannedAtIso
 * @returns {number}
 */
export function sendTimeRootFromScannedAt(scannedAtIso) {
  const { hour, minute } = bangkokHourMinute(scannedAtIso);
  const hs = String(hour).padStart(2, "0");
  const ms = String(minute).padStart(2, "0");
  const sum = `${hs}${ms}`
    .split("")
    .reduce((a, c) => a + Number(c), 0);
  return reduceWithMaster(sum);
}

/**
 * @param {number} hour — Bangkok hour 0–23
 * @returns {string}
 */
export function hourBucket(hour) {
  if (hour >= 0 && hour <= 5) return "deep_night";
  if (hour <= 10) return "morning";
  if (hour <= 15) return "active_day";
  if (hour <= 18) return "settling";
  return "quiet_evening";
}

/**
 * @param {number} birthDayRoot
 * @param {number} sendTimeRoot
 * @returns {number}
 */
export function extraBirthTimeAffinity(birthDayRoot, sendTimeRoot) {
  if (birthDayRoot === sendTimeRoot) return 10;
  if (birthDayRoot === 1 && (sendTimeRoot === 11 || sendTimeRoot === 22)) {
    return 15;
  }
  return 0;
}

/**
 * @param {number} energyScore — 0–10 typical
 * @returns {number}
 */
export function energyScoreAdjustment(energyScore) {
  const e = Number(energyScore);
  if (!Number.isFinite(e)) return 0;
  if (e >= 9) return 6;
  if (e >= 8) return 4;
  if (e >= 7) return 2;
  if (e >= 6) return 0;
  return -4;
}

/**
 * Map Thai / free text main energy to formula keys.
 * @param {string} label
 * @param {string} [fallback]
 * @returns {keyof MAIN_ENERGY_TO_NUMBER_GROUP}
 */
export function normalizeMainEnergyKey(label, fallback = "balance") {
  const t = String(label || "")
    .trim()
    .toLowerCase();
  if (!t) return /** @type {any} */ (fallback);

  const thaiMap = {
    สมดุล: "balance",
    เมตตา: "compassion",
    อำนาจ: "authority",
    ปกป้อง: "protection",
    คุ้มกัน: "protection",
    โชค: "wealth",
    โชคลาภ: "wealth",
    ดึงดูด: "wealth",
    ปัญญา: "wisdom",
    balance: "balance",
    compassion: "compassion",
    authority: "authority",
    protection: "protection",
    wealth: "wealth",
    wisdom: "wisdom",
  };

  for (const [k, v] of Object.entries(thaiMap)) {
    if (t.includes(k.toLowerCase())) return /** @type {any} */ (v);
  }

  if (t.includes("protect") || t.includes("guard")) return "protection";
  if (t.includes("balance") || t.includes("สมดุล")) return "balance";
  if (t.includes("authority") || t.includes("power")) return "authority";

  return /** @type {any} */ (fallback);
}

/**
 * @typedef {Object} CompatibilityV1Input
 * @property {string} birthdate — `YYYY-MM-DD`
 * @property {string} scannedAt — ISO 8601
 * @property {string} [objectFamily] — slug e.g. somdej
 * @property {string} [materialFamily] — powder | clay | …
 * @property {string} [mainEnergy] — Thai or English label
 * @property {string} [shapeFamily] — rectangular | … | unknown
 * @property {number} [energyScore] — 0–10
 * @property {string} [dominantColor] — pipeline color slug (optional; stable path only)
 * @property {string} [objectCategory] — pipeline Thai/slug label (optional)
 * @property {string} [conditionClass] — pipeline condition slug (optional)
 */

/**
 * @param {CompatibilityV1Input} input
 * @returns {import("./compatibilityExplain.util.js").CompatibilityComputed}
 */
export function computeCompatibilityV1(input) {
  const birthdate = normalizeBirthdateIso(String(input.birthdate || "").trim());
  const scannedAt = String(input.scannedAt || "").trim();
  const objectFamily = String(input.objectFamily || "generic")
    .trim()
    .toLowerCase();
  const materialFamily = String(input.materialFamily || "")
    .trim()
    .toLowerCase();
  const shapeFamily = String(input.shapeFamily || "unknown")
    .trim()
    .toLowerCase();
  const mainKey = normalizeMainEnergyKey(input.mainEnergy, "balance");

  const lifePath = lifePathFromBirthdate(birthdate);
  const birthDayRoot = birthDayRootFromBirthdate(birthdate);
  const sendTimeRoot = sendTimeRootFromScannedAt(scannedAt);
  const { hour } = bangkokHourMinute(scannedAt);
  const bucket = hourBucket(hour);

  const ownerElement = LIFE_PATH_TO_ELEMENT[lifePath] || "earth";
  const objectElement =
    (materialFamily && MATERIAL_TO_ELEMENT[materialFamily]) ||
    OBJECT_FAMILY_TO_ELEMENT[objectFamily] ||
    "earth";

  const elementScore =
    ELEMENT_MATRIX[ownerElement]?.[objectElement] ?? 60;

  const numberGroup = MAIN_ENERGY_TO_NUMBER_GROUP[mainKey] || [];
  let numberScore = 50;
  if (numberGroup.includes(birthDayRoot)) numberScore += 15;
  if (numberGroup.includes(sendTimeRoot)) numberScore += 15;
  if (sendTimeRoot === 11 || sendTimeRoot === 22) numberScore += 10;
  numberScore += extraBirthTimeAffinity(birthDayRoot, sendTimeRoot);
  numberScore = clamp(numberScore, 0, 100);

  const baseFam =
    OBJECT_FAMILY_BASE[objectFamily] ?? OBJECT_FAMILY_BASE.generic;
  const shapeBonus = SHAPE_BONUS[shapeFamily] ?? 0;
  const energyBonus = MAIN_ENERGY_BONUS[mainKey] ?? 0;
  let objectSymbolScore =
    baseFam +
    shapeBonus +
    energyBonus +
    energyScoreAdjustment(input.energyScore ?? 0);
  objectSymbolScore = clamp(objectSymbolScore, 0, 100);

  const contextScore = CONTEXT_MATRIX[mainKey]?.[bucket] ?? 70;

  const raw =
    elementScore * 0.4 +
    numberScore * 0.2 +
    objectSymbolScore * 0.2 +
    contextScore * 0.2;
  const score = clamp(Math.round(raw), 35, 98);

  return {
    score,
    band: compatibilityBand(score),
    formulaVersion: COMPATIBILITY_FORMULA_VERSION,
    factors: {
      elementScore,
      numberScore,
      objectSymbolScore,
      contextScore,
    },
    inputs: {
      lifePath,
      birthDayRoot,
      sendTimeRoot,
      ownerElement,
      objectElement,
      objectFamily,
      materialFamily: materialFamily || null,
      shapeFamily,
      mainEnergyKey: mainKey,
      hourBucket: bucket,
      scannedAt,
      birthdate,
    },
  };
}

/**
 * @param {number} score
 * @returns {string}
 */
export function compatibilityBand(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "ยังไม่ค่อยเข้ากัน";
  if (s >= 85) return "เข้ากันมาก";
  if (s >= 70) return "เข้ากันดี";
  if (s >= 55) return "ค่อนข้างเข้ากัน";
  return "ยังไม่ค่อยเข้ากัน";
}

/**
 * Deterministic hash for stable compatibility anchoring (same owner+object signals → same pseudo time).
 * @param {string[]} parts
 * @returns {number}
 */
export function stableFingerprintHash(parts) {
  const s = parts.join("|");
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return Math.abs(h >>> 0);
}

/**
 * Coarse color bucket so lighting jitter does not swing compatibility on same amulet;
 * still separates clearly different pieces when combined with category/family.
 * @param {string} slug
 * @returns {string}
 */
export function coarseDominantColorBucketForCompatibility(slug) {
  const s = String(slug || "")
    .trim()
    .toLowerCase();
  if (!s || s === "unknown") return "";
  if (/(gold|yellow|amber|bronze|copper|orange|ทอง|เหลือง)/.test(s)) {
    return "warm_metal";
  }
  if (/(silver|gray|grey|white|chrome|เงิน|ขาว)/.test(s)) {
    return "cool_metal";
  }
  if (/(black|dark|brown|ดำ|น้ำตาล)/.test(s)) return "dark";
  if (/(green|blue|red|pink|purple|เขียว|น้ำเงิน|แดง)/.test(s)) {
    return "chromatic";
  }
  return "other";
}

/**
 * ISO instant with hour/minute from fingerprint — replaces wall-clock `scannedAt` for formula layers
 * so same-object rescans do not drift from minute/hour noise.
 *
 * When at least one pipeline distinct signal is present (coarse color, object category, condition),
 * those are mixed into the hash so different physical objects diverge without Flex-side math.
 * When all are empty, the hash matches the legacy 5-tuple (backward compatible).
 *
 * @param {string} birthdateIso
 * @param {string} objectFamily
 * @param {string} materialFamily
 * @param {string} shapeFamily
 * @param {string} mainEnergyKey
 * @param {{ dominantColor?: string, objectCategory?: string, conditionClass?: string }} [distinct]
 */
export function stableScannedAtIsoFromFingerprint(
  birthdateIso,
  objectFamily,
  materialFamily,
  shapeFamily,
  mainEnergyKey,
  distinct,
) {
  const parts = [
    String(birthdateIso || ""),
    String(objectFamily || ""),
    String(materialFamily || ""),
    String(shapeFamily || ""),
    String(mainEnergyKey || ""),
  ];
  const dc = coarseDominantColorBucketForCompatibility(
    distinct?.dominantColor != null ? String(distinct.dominantColor) : "",
  );
  const oc = String(distinct?.objectCategory || "")
    .trim()
    .toLowerCase();
  const cc = String(distinct?.conditionClass || "")
    .trim()
    .toLowerCase();
  if (dc || oc || cc) {
    parts.push(dc || "_", oc || "_", cc || "_");
  }
  const h = stableFingerprintHash(parts);
  const hour = h % 24;
  const minute = (h >> 8) % 60;
  return `2000-01-01T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`;
}

/**
 * Quantize model energy score so small LLM jitter does not move compatibility bands.
 * @param {unknown} n
 * @returns {number}
 */
export function quantizeEnergyForCompatibility(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const c = Math.min(10, Math.max(0, x));
  return Math.round(c * 2) / 2;
}

/**
 * Same weights as {@link computeCompatibilityV1}, but:
 * - uses fingerprint-derived pseudo `scannedAt` (not wall-clock) for number/context layers
 * - quantizes energy score before symbol adjustment
 *
 * @param {CompatibilityV1Input} input
 * @returns {import("./compatibilityExplain.util.js").CompatibilityComputed}
 */
export function computeCompatibilityV1Stable(input) {
  const birthdate = normalizeBirthdateIso(String(input.birthdate || "").trim());
  const objectFamily = String(input.objectFamily || "generic")
    .trim()
    .toLowerCase();
  const materialFamily = String(input.materialFamily || "").trim().toLowerCase();
  const shapeFamily = String(input.shapeFamily || "unknown").trim().toLowerCase();
  const mainKey = normalizeMainEnergyKey(input.mainEnergy, "balance");
  const energyQ = quantizeEnergyForCompatibility(input.energyScore ?? 0);
  const stableScannedAt = stableScannedAtIsoFromFingerprint(
    birthdate,
    objectFamily,
    materialFamily,
    shapeFamily,
    mainKey,
    {
      dominantColor: input.dominantColor,
      objectCategory: input.objectCategory,
      conditionClass: input.conditionClass,
    },
  );
  const base = computeCompatibilityV1({
    ...input,
    birthdate: input.birthdate,
    scannedAt: stableScannedAt,
    energyScore: energyQ,
  });
  const distinctUsed =
    Boolean(
      coarseDominantColorBucketForCompatibility(input.dominantColor || "") ||
        String(input.objectCategory || "").trim() ||
        String(input.conditionClass || "").trim(),
    );
  return {
    ...base,
    formulaVersion: COMPATIBILITY_FORMULA_VERSION_STABLE,
    inputs: {
      ...base.inputs,
      stableAnchors: true,
      distinctSignalsInFingerprint: distinctUsed,
      scannedAtActual: String(input.scannedAt || "").trim() || null,
      scannedAtForFormula: stableScannedAt,
    },
  };
}

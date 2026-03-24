import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Safe fallback when file missing or invalid — matches `scanOffer.default.json` intent. */
export const SCAN_OFFER_SAFE_DEFAULT = Object.freeze({
  active: true,
  label: "default_fallback",
  freeQuotaPerDay: 2,
  paidPriceThb: 49,
  paidScanCount: 5,
  paidWindowHours: 24,
  startAt: null,
  endAt: null,
  configVersion: "fallback",
});

/**
 * @typedef {Object} NormalizedScanOffer
 * @property {boolean} active
 * @property {string} label
 * @property {number} freeQuotaPerDay
 * @property {number} paidPriceThb
 * @property {number} paidScanCount
 * @property {number} paidWindowHours
 * @property {string|null} startAt
 * @property {string|null} endAt
 * @property {string} configVersion
 */

/**
 * @param {unknown} raw
 * @returns {NormalizedScanOffer}
 */
export function normalizeScanOffer(raw) {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? /** @type {Record<string, unknown>} */ (raw)
      : {};

  const bool = (v, d) => (typeof v === "boolean" ? v : d);
  const str = (v, d) => {
    if (v == null || v === "") return d;
    return String(v);
  };
  const intPos = (v, d) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 1 ? n : d;
  };

  return {
    active: bool(o.active, SCAN_OFFER_SAFE_DEFAULT.active),
    label: str(o.label, SCAN_OFFER_SAFE_DEFAULT.label),
    freeQuotaPerDay: intPos(o.freeQuotaPerDay, SCAN_OFFER_SAFE_DEFAULT.freeQuotaPerDay),
    paidPriceThb: intPos(o.paidPriceThb, SCAN_OFFER_SAFE_DEFAULT.paidPriceThb),
    paidScanCount: intPos(o.paidScanCount, SCAN_OFFER_SAFE_DEFAULT.paidScanCount),
    paidWindowHours: intPos(o.paidWindowHours, SCAN_OFFER_SAFE_DEFAULT.paidWindowHours),
    startAt: o.startAt == null || o.startAt === "" ? null : String(o.startAt),
    endAt: o.endAt == null || o.endAt === "" ? null : String(o.endAt),
    configVersion: str(o.configVersion, SCAN_OFFER_SAFE_DEFAULT.configVersion),
  };
}

/**
 * @param {NormalizedScanOffer} offer
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isOfferActive(offer, now = new Date()) {
  if (!offer || !offer.active) return false;
  const t = now.getTime();
  if (offer.startAt) {
    const s = Date.parse(offer.startAt);
    if (Number.isFinite(s) && t < s) return false;
  }
  if (offer.endAt) {
    const e = Date.parse(offer.endAt);
    if (Number.isFinite(e) && t > e) return false;
  }
  return true;
}

function defaultConfigPath() {
  return join(__dirname, "../config/scanOffer.default.json");
}

function readRawConfigFromDisk() {
  const envPath = String(process.env.SCAN_OFFER_CONFIG_PATH || "").trim();
  const primary = envPath && existsSync(envPath) ? envPath : null;
  const path = primary || defaultConfigPath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    const txt = readFileSync(path, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/**
 * Pure resolution for tests + shared logic (no disk I/O, no logging).
 *
 * @param {unknown} raw
 * @param {Date} [now]
 * @returns {{ offer: NormalizedScanOffer, usedFallback: boolean, reason: string|null, fileMeta?: { label: string, configVersion: string } }}
 */
export function resolveEffectiveScanOfferFromRaw(raw, now = new Date()) {
  if (raw == null) {
    return {
      offer: normalizeScanOffer(SCAN_OFFER_SAFE_DEFAULT),
      usedFallback: true,
      reason: "missing_or_invalid_file",
    };
  }

  const normalized = normalizeScanOffer(raw);
  const calendarActive = isOfferActive(normalized, now);

  if (!calendarActive || !normalized.active) {
    return {
      offer: normalizeScanOffer(SCAN_OFFER_SAFE_DEFAULT),
      usedFallback: true,
      reason: !normalized.active ? "inactive" : "outside_window",
      fileMeta: { label: normalized.label, configVersion: normalized.configVersion },
    };
  }

  return {
    offer: normalized,
    usedFallback: false,
    reason: null,
  };
}

/**
 * Single entry: load file → normalize → validate calendar window.
 * If file missing, invalid JSON, inactive flag, or outside start/end window →
 * returns normalized {@link SCAN_OFFER_SAFE_DEFAULT} (numeric safe defaults).
 *
 * @param {Date} [now]
 * @returns {NormalizedScanOffer}
 */
export function loadActiveScanOffer(now = new Date()) {
  const raw = readRawConfigFromDisk();
  const resolved = resolveEffectiveScanOfferFromRaw(raw, now);
  const offer = resolved.offer;

  if (resolved.usedFallback) {
    console.log(
      JSON.stringify({
        event: "SCAN_OFFER_CONFIG_LOADED",
        offerLabel: offer.label,
        configVersion: offer.configVersion,
        freeQuotaPerDay: offer.freeQuotaPerDay,
        paidPriceThb: offer.paidPriceThb,
        paidScanCount: offer.paidScanCount,
        paidWindowHours: offer.paidWindowHours,
        usedFallback: true,
        reason: resolved.reason,
        ...(resolved.fileMeta
          ? {
              fileLabel: resolved.fileMeta.label,
              fileConfigVersion: resolved.fileMeta.configVersion,
            }
          : {}),
      }),
    );
    return offer;
  }

  console.log(
    JSON.stringify({
      event: "SCAN_OFFER_CONFIG_LOADED",
      offerLabel: offer.label,
      configVersion: offer.configVersion,
      freeQuotaPerDay: offer.freeQuotaPerDay,
      paidPriceThb: offer.paidPriceThb,
      paidScanCount: offer.paidScanCount,
      paidWindowHours: offer.paidWindowHours,
      usedFallback: false,
    }),
  );

  return offer;
}

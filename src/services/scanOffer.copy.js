import { SCAN_OFFER_TEMPLATES_TH } from "../config/scanOffer.templates.th.js";
import { chooseScanOfferReplyType } from "./scanOffer.replyType.js";
import { listActivePackages } from "./scanOffer.packages.js";

/**
 * @param {string} template
 * @param {Record<string, string|number>} vars
 */
export function fillPlaceholders(template, vars) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    if (v == null) return "";
    return String(v);
  });
}

/**
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} offer
 * @param {import("./scanOfferAccess.resolver.js").ScanOfferAccessContext} accessContext
 */
export function buildPlaceholderVars(offer, accessContext) {
  const pkgs = listActivePackages(offer);
  const pkgPaywallLines = pkgs
    .map(
      (p) =>
        `${p.priceThb} บาท ใช้ได้ ${p.scanCount} ครั้ง ภายใน ${p.windowHours} ชั่วโมงหลังอนุมัติ`,
    )
    .join("\n");
  const pkgNumberedList = pkgs
    .map(
      (p, i) =>
        `${i + 1}) ${p.priceThb} บาท ใช้ได้ ${p.scanCount} ครั้ง ภายใน ${p.windowHours} ชั่วโมง`,
    )
    .join("\n\n");
  const priceTokens = pkgs.map((p) => String(p.priceThb)).join(" หรือ ");
  return {
    price: offer.paidPriceThb,
    count: offer.paidScanCount,
    hours: offer.paidWindowHours,
    nextResetLabel: accessContext.nextResetLabel || "",
    freeRemaining: accessContext.freeRemainingToday,
    offerLabel: offer.label || "มาตรฐาน",
    freeQuotaPerDay: offer.freeQuotaPerDay,
    pkgPaywallLines,
    pkgNumberedList,
    priceTokens,
  };
}

function renderVariant(paragraphs, vars) {
  const joined = (Array.isArray(paragraphs) ? paragraphs : [])
    .map((p) => fillPlaceholders(String(p || ""), vars))
    .filter(Boolean)
    .join("\n\n");
  return joined.trim();
}

function stableVariantIndex(userId, len) {
  if (!len || len <= 0) return 0;
  const s = String(userId || "anon");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % len;
}

/**
 * @param {object} opts
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} opts.offer
 * @param {import("./scanOfferAccess.resolver.js").ScanOfferAccessContext} opts.accessContext
 * @param {{ allowed: boolean, reason: string }} opts.gate
 * @param {string|null} [opts.userId]
 * @returns {{
 *   primaryText: string,
 *   alternateTexts: string[],
 *   replyType: string,
 *   semanticKey: string,
 *   scanOfferMeta: { replyType: string, semanticKey: string, alternateCount: number, offerConfigVersion: string, variantIndex: number },
 * }}
 */
export function buildScanOfferReply({
  offer,
  accessContext,
  gate,
  userId = null,
}) {
  const vars = buildPlaceholderVars(offer, accessContext);
  let replyType = chooseScanOfferReplyType(accessContext, gate);

  if (!replyType) {
    replyType = gate?.allowed ? "free_quota_low" : "free_quota_exhausted";
  }

  const templatePoolKey =
    replyType === "free_quota_exhausted" ? "offer_intro" : replyType;

  const pool = SCAN_OFFER_TEMPLATES_TH[templatePoolKey] || [];
  const primaryPool =
    pool.length > 0
      ? pool
      : SCAN_OFFER_TEMPLATES_TH.offer_intro || [];

  const idx = stableVariantIndex(userId, primaryPool.length);
  const primaryRendered = renderVariant(primaryPool[idx] || [], vars);

  const alternates = [];
  const seen = new Set();
  const addAlt = (text) => {
    const t = String(text || "").trim();
    if (!t) return;
    const key = t.replace(/\s+/g, " ");
    if (seen.has(key)) return;
    seen.add(key);
    alternates.push(t);
  };

  primaryPool.forEach((variant, i) => {
    if (i === idx) return;
    addAlt(renderVariant(variant, vars));
  });

  if (replyType === "free_quota_exhausted") {
    const ex = SCAN_OFFER_TEMPLATES_TH.free_quota_exhausted || [];
    ex.forEach((variant) => addAlt(renderVariant(variant, vars)));
  }

  const primaryText =
    primaryRendered ||
    renderVariant(
      (SCAN_OFFER_TEMPLATES_TH.offer_intro || [])[0] || [],
      vars,
    );

  const semanticKey = `scan_offer:${replyType}:v${offer.configVersion}`;

  const scanOfferMeta = {
    replyType,
    semanticKey,
    alternateCount: alternates.length,
    offerConfigVersion: offer.configVersion,
    variantIndex: idx,
  };

  return {
    primaryText,
    alternateTexts: alternates,
    replyType,
    semanticKey,
    scanOfferMeta,
  };
}

/**
 * First line(s) after slip approval — template pool `approved_intro`.
 *
 * @param {object} opts
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} opts.offer
 * @param {string|null} [opts.userId]
 */
/**
 * @param {object} opts
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} opts.offer
 * @param {string|null} [opts.userId]
 * @param {{ priceThb: number, scanCount: number, windowHours: number }|null} [opts.introPackage] entitlement package (overrides offer defaults)
 */
export function buildApprovedIntroReply({
  offer,
  userId = null,
  introPackage = null,
}) {
  const pool = SCAN_OFFER_TEMPLATES_TH.approved_intro || [];
  const idx = stableVariantIndex(userId, pool.length || 1);
  const pkg = introPackage;
  const vars = {
    price: pkg ? pkg.priceThb : offer.paidPriceThb,
    count: pkg ? pkg.scanCount : offer.paidScanCount,
    hours: pkg ? pkg.windowHours : offer.paidWindowHours,
    nextResetLabel: "",
    freeRemaining: 0,
    offerLabel: offer.label || "มาตรฐาน",
    freeQuotaPerDay: offer.freeQuotaPerDay,
    pkgPaywallLines: "",
    pkgNumberedList: "",
    priceTokens: "",
  };
  const primaryText = renderVariant(pool[idx] || [], vars);
  const alternates = pool
    .map((v, i) => (i === idx ? null : renderVariant(v, vars)))
    .filter(Boolean);

  const replyType = "approved_intro";
  const semanticKey = `scan_offer:${replyType}:v${offer.configVersion}`;

  const scanOfferMeta = {
    replyType,
    semanticKey,
    alternateCount: alternates.length,
    offerConfigVersion: offer.configVersion,
    variantIndex: idx,
  };

  return {
    primaryText,
    alternateTexts: alternates,
    replyType,
    semanticKey,
    scanOfferMeta,
  };
}

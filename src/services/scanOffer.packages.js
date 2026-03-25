/**
 * Paid scan packages from scan-offer config (source of truth).
 */

/**
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} offer
 */
export function listActivePackages(offer) {
  const pkgs = Array.isArray(offer?.packages) ? offer.packages : [];
  return pkgs.filter((p) => p && p.active !== false);
}

/**
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} offer
 */
export function getDefaultPackage(offer) {
  const active = listActivePackages(offer);
  if (!active.length) return null;
  const key = String(offer?.defaultPackageKey || "").trim();
  if (key) {
    const hit = active.find((p) => p.key === key);
    if (hit) return hit;
  }
  return active[0];
}

/**
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} offer
 * @param {string} packageKey
 */
export function findPackageByKey(offer, packageKey) {
  const k = String(packageKey || "").trim();
  if (!k) return null;
  return listActivePackages(offer).find((p) => p.key === k) || null;
}

/**
 * Resolve active package by exact THB price (e.g. payment row `expected_amount`).
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} offer
 */
export function findActivePackageByPriceThb(offer, priceThb) {
  const n = Number(priceThb);
  if (!Number.isFinite(n)) return null;
  return listActivePackages(offer).find((p) => Number(p.priceThb) === n) || null;
}

/**
 * Parse user text → package key (49, 99, แพ็ก 49, 49 บาท, …).
 * @param {string} text
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} offer
 * @param {{ thaiRelativeAliases?: boolean, allowEoaPricePhrase?: boolean }} [opts]
 * @returns {string|null} package key
 */
export function parsePackageSelectionFromText(text, offer, opts = {}) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const pkgs = listActivePackages(offer);
  if (!pkgs.length) return null;

  const t = raw.replace(/\s+/g, " ");
  const lower = t.toLowerCase();

  const sorted = [...pkgs].sort(
    (a, b) => String(b.priceThb).length - String(a.priceThb).length,
  );

  for (const p of sorted) {
    const priceStr = String(p.priceThb);
    if (t === priceStr) return p.key;
    if (lower === `${priceStr} บาท`) return p.key;
    if (new RegExp(`^${priceStr}\\s*บาท$`, "i").test(t)) return p.key;
    if (new RegExp(`แพ็ก\\s*${priceStr}`, "i").test(t)) return p.key;
    if (new RegExp(`แพ็ค\\s*${priceStr}`, "i").test(t)) return p.key;
  }

  if (opts?.allowEoaPricePhrase) {
    const m = /^เอา\s*(\d+)\b/.exec(t);
    if (m) {
      const price = Number(m[1]);
      const hit = pkgs.find((p) => Number(p.priceThb) === price);
      if (hit) return hit.key;
    }
  }

  if (opts?.thaiRelativeAliases) {
    const norm = t.trim();
    const sorted = [...pkgs].sort(
      (a, b) => Number(a.priceThb) - Number(b.priceThb),
    );
    const cheapest = sorted[0] || null;
    const priciest = sorted.length ? sorted[sorted.length - 1] : null;
    const aliasCheap = new Set([
      "อันแรก",
      "แบบถูก",
      "ถูก",
      "แพ็กถูก",
      "อันถูก",
    ]);
    const aliasPricy = new Set([
      "อันสอง",
      "แบบแพง",
      "แพง",
      "แพ็กแพง",
      "อันแพง",
    ]);
    if (cheapest && aliasCheap.has(norm)) return cheapest.key;
    if (priciest && aliasPricy.has(norm)) {
      if (priciest !== cheapest) return priciest.key;
      if (sorted.length === 1) return priciest.key;
    }
  }

  return null;
}

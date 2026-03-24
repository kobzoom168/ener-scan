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
 * Parse user text → package key (49, 99, แพ็ก 49, 49 บาท, …).
 * @param {string} text
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} offer
 * @returns {string|null} package key
 */
export function parsePackageSelectionFromText(text, offer) {
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

  return null;
}

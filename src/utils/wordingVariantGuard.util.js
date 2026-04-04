/**
 * Lightweight in-process anti-repeat for Flex short copy (per LINE user).
 * Does not persist across process restarts.
 * @module
 */

/** @type {Map<string, Array<{ bankKey: string, truthKey?: string, variantIndex: number, presentationAngle?: string, ts: number }>>} */
const recentByUser = new Map();

const MAX_HISTORY = 14;

/**
 * @param {string} bankKey
 * @returns {string}
 */
function truthCategoryKeyFromBankKey(bankKey) {
  return String(bankKey || "").replace(/^line\./, "").slice(0, 96);
}

/**
 * @param {string} lineUserId
 * @param {string} bankKey
 * @param {number} candidateCount
 * @param {string} seed
 * @returns {{ variantIndex: number, avoidedRepeat: boolean }}
 */
export function pickVariantAvoidingRepeat(lineUserId, bankKey, candidateCount, seed) {
  const n = Math.max(1, Math.floor(candidateCount));
  const uid = String(lineUserId || "anon").slice(0, 64);
  const key = String(bankKey || "default").slice(0, 80);

  let h = 0;
  const s = String(seed || "seed");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  let preferred = h % n;

  const hist = recentByUser.get(uid) || [];
  const sameBank = hist.filter((x) => x.bankKey === key).slice(-5);
  const recentIdx = new Set(sameBank.map((x) => x.variantIndex));

  let variantIndex = preferred;
  let avoidedRepeat = false;
  if (recentIdx.has(preferred) && n > 1) {
    for (let k = 0; k < n; k++) {
      const j = (preferred + 1 + k) % n;
      if (!recentIdx.has(j)) {
        variantIndex = j;
        avoidedRepeat = true;
        break;
      }
    }
    if (!avoidedRepeat) {
      variantIndex = (preferred + 1) % n;
      avoidedRepeat = recentIdx.has(preferred);
    }
  }

  const next = [...hist, { bankKey: key, variantIndex, ts: Date.now() }].slice(
    -MAX_HISTORY,
  );
  recentByUser.set(uid, next);

  return { variantIndex, avoidedRepeat };
}

/**
 * Anti-repeat with optional `presentationAngle` per variant (same truth category, different surface).
 * Tracks last few angles per truth category (crystal.protection, thai.protection, …).
 *
 * @param {string} lineUserId
 * @param {string} bankKey — e.g. `line.crystal.protection` or `crystal.protection`
 * @param {ReadonlyArray<{ presentationAngle?: string }>} variants
 * @param {string} seed
 * @returns {{ variantIndex: number, avoidedRepeat: boolean, avoidedAngleCluster: boolean }}
 */
export function pickVariantAvoidingRepeatWithAngles(
  lineUserId,
  bankKey,
  variants,
  seed,
) {
  const list = Array.isArray(variants) ? variants : [];
  const n = Math.max(1, list.length);
  const uid = String(lineUserId || "anon").slice(0, 64);
  const key = String(bankKey || "default").slice(0, 80);
  const truthKey = truthCategoryKeyFromBankKey(bankKey);

  const angleOf = (i) => {
    const a = list[i]?.presentationAngle;
    return a ? String(a).slice(0, 48) : `slot_${i}`;
  };

  let h = 0;
  const s = String(seed || "seed");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const preferred = h % n;

  const hist = recentByUser.get(uid) || [];
  const sameTruth = hist.filter((x) => x.truthKey === truthKey).slice(-4);
  const recentAngles = new Set(
    sameTruth.map((x) => x.presentationAngle).filter(Boolean),
  );

  const sameBank = hist.filter((x) => x.bankKey === key).slice(-5);
  const recentIdx = new Set(sameBank.map((x) => x.variantIndex));

  const order = Array.from({ length: n }, (_, k) => (preferred + k) % n);

  /** @type {number | null} */
  let variantIndex = null;
  let avoidedAngleCluster = false;

  for (const j of order) {
    if (!recentAngles.has(angleOf(j))) {
      variantIndex = j;
      avoidedAngleCluster = recentAngles.size > 0;
      break;
    }
  }
  if (variantIndex == null) {
    for (const j of order) {
      if (!recentIdx.has(j)) {
        variantIndex = j;
        break;
      }
    }
  }
  if (variantIndex == null) {
    variantIndex = (preferred + 1) % n;
  }

  let avoidedRepeat = false;
  if (recentIdx.has(preferred) && variantIndex !== preferred) {
    avoidedRepeat = true;
  }
  if (
    recentAngles.has(angleOf(preferred)) &&
    angleOf(variantIndex) !== angleOf(preferred)
  ) {
    avoidedRepeat = true;
  }

  const next = [
    ...hist,
    {
      bankKey: key,
      truthKey,
      variantIndex,
      presentationAngle: angleOf(variantIndex),
      ts: Date.now(),
    },
  ].slice(-MAX_HISTORY);
  recentByUser.set(uid, next);

  return { variantIndex, avoidedRepeat, avoidedAngleCluster };
}

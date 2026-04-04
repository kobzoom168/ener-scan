/**
 * Lightweight in-process anti-repeat for Flex short copy (per LINE user).
 * Does not persist across process restarts.
 * @module
 */

/** @type {Map<string, Array<{ bankKey: string, variantIndex: number, ts: number }>>} */
const recentByUser = new Map();

const MAX_HISTORY = 14;

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

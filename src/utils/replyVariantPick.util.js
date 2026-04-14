/**
 * Pick curated reply lines with simple anti-repeat per user + pool (in-process only).
 */

/** @type {Map<string, string[]>} key `${userId}|${poolKey}` → last chosen lines (oldest → newest) */
const recentPicks = new Map();

/** @type {Map<string, number>} monotonic counter per key for spread */
const pickCounters = new Map();

function hash32(str) {
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @param {string} userId
 * @param {string} poolKey
 * @param {readonly string[]} variants
 * @param {number} [avoidLastN=3]
 * @returns {string}
 */
export function pickReplyVariant(userId, poolKey, variants, avoidLastN = 3) {
  const list = (Array.isArray(variants) ? variants : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];

  const uid = String(userId || "anonymous").trim() || "anonymous";
  const pk = String(poolKey || "default").trim() || "default";
  const mapKey = `${uid}|${pk}`;
  const nAvoid = Math.max(0, Math.min(list.length - 1, Number(avoidLastN) || 3));

  const recent = recentPicks.get(mapKey) ?? [];
  const avoid = new Set(recent.slice(-nAvoid));
  let candidates = list.filter((v) => !avoid.has(v));
  if (candidates.length === 0) candidates = [...list];

  const ctr = (pickCounters.get(mapKey) ?? 0) + 1;
  pickCounters.set(mapKey, ctr);
  const idx = hash32(`${mapKey}|${ctr}`) % candidates.length;
  const chosen = candidates[idx];

  const next = [...recent, chosen].slice(-Math.max(nAvoid, 1));
  recentPicks.set(mapKey, next);

  return chosen;
}

/**
 * Like {@link pickReplyVariant} but never returns a line in `excludeLines` when alternatives exist.
 * @param {string} userId
 * @param {string} poolKey
 * @param {readonly string[]} variants
 * @param {readonly string[]} excludeLines
 * @param {number} [avoidLastN=3]
 */
export function pickReplyVariantExcluding(
  userId,
  poolKey,
  variants,
  excludeLines,
  avoidLastN = 3,
) {
  const ex = new Set(
    (Array.isArray(excludeLines) ? excludeLines : [])
      .map((s) => String(s || "").trim())
      .filter(Boolean),
  );
  const full = (Array.isArray(variants) ? variants : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const filtered = full.filter((v) => !ex.has(v));
  const pool = filtered.length > 0 ? filtered : full;
  return pickReplyVariant(userId, poolKey, pool, avoidLastN);
}

/** Test helper: clear in-memory state */
export function __resetReplyVariantPickTestState() {
  recentPicks.clear();
  pickCounters.clear();
}

/**
 * Share-to-earn referral service.
 *
 * Flow:
 *  1. A user asks for their invite code → ensureReferralForLineUser() (lazy assign).
 *  2. A (new) user pastes someone's code → redeemReferralCode() links referee → referrer.
 *  3. When the referee completes their FIRST scan → grantReferralRewardOnFirstScanIfEligible()
 *     grants bonus scan credits to BOTH (one-time, idempotent).
 *
 * All callers should themselves be gated by env.ENABLE_REFERRAL.
 */

import { env } from "../config/env.js";
import { ensureUserByLineUserId } from "../stores/users.db.js";
import {
  getReferralStateForAppUser,
  getOrCreateReferralCodeForAppUser,
  findAppUserIdByReferralCode,
  setReferredByIfUnset,
  addBonusScanCredits,
  markReferralRewardGrantedIfUnset,
  getLineUserIdByAppUserId,
} from "../stores/referral.db.js";
import { normalizeReferralCode } from "../utils/referralCode.util.js";

/**
 * Ensure a LINE user has an app_users row + a referral code.
 * @param {string} lineUserId
 * @returns {Promise<{ appUserId: string, code: string|null }>}
 */
export async function ensureReferralForLineUser(lineUserId) {
  const appUser = await ensureUserByLineUserId(lineUserId);
  const appUserId = String(appUser.id);
  const code = await getOrCreateReferralCodeForAppUser(appUserId);
  return { appUserId, code };
}

/**
 * @typedef {Object} RedeemResult
 * @property {boolean} ok
 * @property {"redeemed"|"invalid_format"|"not_found"|"self"|"already_referred"} reason
 * @property {string|null} [referrerAppUserId]
 */

/**
 * Link a referee to a referrer via the referrer's code.
 * Idempotent: a referee can only ever be linked once.
 * @param {{ refereeAppUserId: string, rawCode: string }} p
 * @returns {Promise<RedeemResult>}
 */
export async function redeemReferralCode({ refereeAppUserId, rawCode }) {
  const refereeId = String(refereeAppUserId || "").trim();
  const code = normalizeReferralCode(rawCode);
  if (!refereeId) return { ok: false, reason: "invalid_format" };
  if (!code) return { ok: false, reason: "invalid_format" };

  const referee = await getReferralStateForAppUser(refereeId);
  if (referee?.referredByAppUserId) {
    return {
      ok: false,
      reason: "already_referred",
      referrerAppUserId: referee.referredByAppUserId,
    };
  }

  const referrerAppUserId = await findAppUserIdByReferralCode(code);
  if (!referrerAppUserId) return { ok: false, reason: "not_found" };
  if (referrerAppUserId === refereeId) return { ok: false, reason: "self" };

  const linked = await setReferredByIfUnset(refereeId, referrerAppUserId);
  if (!linked) {
    // Lost a race — someone linked it first; treat as already referred.
    return { ok: false, reason: "already_referred", referrerAppUserId };
  }

  console.log(
    JSON.stringify({
      event: "REFERRAL_REDEEMED",
      refereeAppUserIdPrefix: refereeId.slice(0, 8),
      referrerAppUserIdPrefix: referrerAppUserId.slice(0, 8),
    }),
  );
  return { ok: true, reason: "redeemed", referrerAppUserId };
}

/**
 * @typedef {Object} GrantResult
 * @property {boolean} granted
 * @property {string|null} [referrerAppUserId]
 * @property {string|null} [referrerLineUserId]
 * @property {number} [refereeBonus]
 * @property {number} [referrerBonus]
 */

/**
 * Grant the one-time referral reward to BOTH referee and referrer.
 * Safe to call after every scan; only fires once per referee (idempotent), and
 * only when the referee was actually referred.
 * @param {{ refereeAppUserId: string }} p
 * @returns {Promise<GrantResult>}
 */
export async function grantReferralRewardOnFirstScanIfEligible({
  refereeAppUserId,
}) {
  const refereeId = String(refereeAppUserId || "").trim();
  if (!refereeId) return { granted: false };

  const referee = await getReferralStateForAppUser(refereeId);
  if (!referee) return { granted: false };
  if (!referee.referredByAppUserId) return { granted: false };
  if (referee.referralRewardGrantedAt) return { granted: false };

  // Claim the one-time reward slot first (idempotency guard).
  const claimed = await markReferralRewardGrantedIfUnset(refereeId);
  if (!claimed) return { granted: false };

  const refereeBonus = env.REFERRAL_REFEREE_BONUS;
  const referrerBonus = env.REFERRAL_REFERRER_BONUS;
  const referrerAppUserId = referee.referredByAppUserId;

  await addBonusScanCredits(refereeId, refereeBonus);
  await addBonusScanCredits(referrerAppUserId, referrerBonus);

  let referrerLineUserId = null;
  let refereeLineUserId = null;
  try {
    referrerLineUserId = await getLineUserIdByAppUserId(referrerAppUserId);
    refereeLineUserId = await getLineUserIdByAppUserId(refereeId);
  } catch {
    /* notification is best-effort */
  }

  console.log(
    JSON.stringify({
      event: "REFERRAL_REWARD_GRANTED",
      refereeAppUserIdPrefix: refereeId.slice(0, 8),
      referrerAppUserIdPrefix: String(referrerAppUserId).slice(0, 8),
      refereeBonus,
      referrerBonus,
    }),
  );

  return {
    granted: true,
    referrerAppUserId,
    referrerLineUserId,
    refereeLineUserId,
    refereeBonus,
    referrerBonus,
  };
}

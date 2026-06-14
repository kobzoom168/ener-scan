/**
 * Referral / share-to-earn persistence on `app_users`
 * (referral_code, referred_by_app_user_id, bonus_scan_credits, referral_reward_granted_at).
 *
 * Decrements/increments are simple read-then-write (same convention as
 * decrementUserPaidRemainingScans); the scan flow is resilient to rare races.
 */

import { supabase } from "../config/supabase.js";
import { generateReferralCodeCandidate } from "../utils/referralCode.util.js";

const MAX_CODE_GEN_ATTEMPTS = 6;

/**
 * @param {string} appUserId
 * @returns {Promise<{
 *   id: string,
 *   referralCode: string|null,
 *   referredByAppUserId: string|null,
 *   bonusScanCredits: number,
 *   referralRewardGrantedAt: string|null,
 * } | null>}
 */
export async function getReferralStateForAppUser(appUserId) {
  const id = String(appUserId || "").trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select(
      "id, referral_code, referred_by_app_user_id, bonus_scan_credits, referral_reward_granted_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: String(data.id),
    referralCode: data.referral_code ? String(data.referral_code) : null,
    referredByAppUserId: data.referred_by_app_user_id
      ? String(data.referred_by_app_user_id)
      : null,
    bonusScanCredits: Number(data.bonus_scan_credits) || 0,
    referralRewardGrantedAt: data.referral_reward_granted_at
      ? String(data.referral_reward_granted_at)
      : null,
  };
}

/**
 * @param {string} appUserId
 * @returns {Promise<string|null>} line_user_id for this app user (for push notifications)
 */
export async function getLineUserIdByAppUserId(appUserId) {
  const id = String(appUserId || "").trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("line_user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.line_user_id ? String(data.line_user_id) : null;
}

/**
 * @param {string} appUserId
 * @returns {Promise<number>}
 */
export async function getBonusScanCredits(appUserId) {
  const state = await getReferralStateForAppUser(appUserId);
  return state?.bonusScanCredits ?? 0;
}

/**
 * Lazily assign a unique referral code to this app user (idempotent).
 * @param {string} appUserId
 * @returns {Promise<string|null>}
 */
export async function getOrCreateReferralCodeForAppUser(appUserId) {
  const id = String(appUserId || "").trim();
  if (!id) return null;

  const existing = await getReferralStateForAppUser(id);
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < MAX_CODE_GEN_ATTEMPTS; attempt += 1) {
    const candidate = generateReferralCodeCandidate();
    const { data, error } = await supabase
      .from("app_users")
      .update({ referral_code: candidate, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("referral_code", null)
      .select("referral_code")
      .maybeSingle();

    if (!error && data?.referral_code) {
      return String(data.referral_code);
    }

    // Unique-violation (code already taken) → retry with a new candidate.
    // Any other condition: re-read in case a concurrent writer set it.
    const reread = await getReferralStateForAppUser(id);
    if (reread?.referralCode) return reread.referralCode;
  }
  return null;
}

/**
 * @param {string} code normalized referral code
 * @returns {Promise<string|null>} referrer app_user id or null
 */
export async function findAppUserIdByReferralCode(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("id")
    .eq("referral_code", c)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

/**
 * Link referee → referrer, only if referee has no referrer yet (idempotent).
 * @param {string} refereeAppUserId
 * @param {string} referrerAppUserId
 * @returns {Promise<boolean>} true if a new link was written
 */
export async function setReferredByIfUnset(refereeAppUserId, referrerAppUserId) {
  const referee = String(refereeAppUserId || "").trim();
  const referrer = String(referrerAppUserId || "").trim();
  if (!referee || !referrer) return false;
  const { data, error } = await supabase
    .from("app_users")
    .update({
      referred_by_app_user_id: referrer,
      updated_at: new Date().toISOString(),
    })
    .eq("id", referee)
    .is("referred_by_app_user_id", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

/**
 * @param {string} appUserId
 * @param {number} amount positive integer
 * @returns {Promise<number>} new balance
 */
export async function addBonusScanCredits(appUserId, amount) {
  const id = String(appUserId || "").trim();
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (!id || add === 0) {
    return (await getBonusScanCredits(id)) || 0;
  }
  const current = await getBonusScanCredits(id);
  const next = current + add;
  const { error } = await supabase
    .from("app_users")
    .update({ bonus_scan_credits: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  return next;
}

/**
 * Consume 1 bonus credit after a bonus-source scan fully succeeded.
 * @param {string} appUserId
 * @returns {Promise<number>} new balance
 */
export async function consumeBonusScanCredit(appUserId) {
  const id = String(appUserId || "").trim();
  if (!id) throw new Error("consumeBonus_missing_app_user_id");
  const current = await getBonusScanCredits(id);
  const next = Math.max(0, current - 1);
  const { error } = await supabase
    .from("app_users")
    .update({ bonus_scan_credits: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  return next;
}

/**
 * Mark the referee's one-time referral reward as granted (idempotent).
 * @param {string} refereeAppUserId
 * @returns {Promise<boolean>} true if this call set the timestamp (i.e. first time)
 */
export async function markReferralRewardGrantedIfUnset(refereeAppUserId) {
  const id = String(refereeAppUserId || "").trim();
  if (!id) return false;
  const { data, error } = await supabase
    .from("app_users")
    .update({
      referral_reward_granted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("referral_reward_granted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

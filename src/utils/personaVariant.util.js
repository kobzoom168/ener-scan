/**
 * Persona A/B assignment: weighted + sticky when optimization is on; else hash-only.
 */

import { env } from "../config/env.js";
import {
  ensurePersonaWeightsSeeded,
  getPersonaWeightsFromDb,
  getPaymentSessionKeyForPersona,
  ensurePersonaAssignment,
  hashUserId,
} from "../stores/personaAb.db.js";

const VARIANT_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Legacy deterministic split (same user → same letter) without DB.
 * Used when PERSONA_AB_OPTIMIZE_ENABLED is false or on storage errors.
 * @param {string} userId
 * @returns {string}
 */
export function hashAssignPersonaVariant(userId) {
  const n = Number(env.PERSONA_AB_VARIANT_COUNT) || 3;
  const uid = String(userId || "").trim();
  if (!uid) return VARIANT_LABELS[0];
  const idx = hashUserId(uid) % n;
  return VARIANT_LABELS[idx] || "A";
}

/**
 * Sticky assignment: returns stored variant or picks once from current weights and stores it.
 * @param {string} userId LINE user id
 * @returns {Promise<string>} e.g. "A" | "B" | "C"
 */
export async function getAssignedPersonaVariant(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return "A";

  if (!env.PERSONA_AB_OPTIMIZE_ENABLED) {
    return hashAssignPersonaVariant(uid);
  }

  try {
    const seeded = await ensurePersonaWeightsSeeded();
    const fromDb = await getPersonaWeightsFromDb();
    const weights =
      fromDb && Object.keys(fromDb).length > 0 ? fromDb : seeded;
    const sessionKey = await getPaymentSessionKeyForPersona(uid);
    return await ensurePersonaAssignment(uid, sessionKey, weights);
  } catch (err) {
    console.error("[PERSONA_AB] getAssignedPersonaVariant fallback:", {
      message: err?.message,
      code: err?.code,
    });
    return hashAssignPersonaVariant(uid);
  }
}

/** @deprecated Prefer `getAssignedPersonaVariant` — same behavior. */
export async function assignPersonaVariant(userId) {
  return getAssignedPersonaVariant(userId);
}

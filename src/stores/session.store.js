const sessions = new Map();

function normalizeUserId(userId) {
  return String(userId || "").trim();
}

function createEmptySession() {
  return {
    pendingImage: null,
    birthdate: null,
    /** Kept in sync with `birthdateChangeFlowState` for legacy checks (image/sticker). */
    awaitingBirthdateUpdate: false,
    /**
     * Birthdate profile change subflow (soft-detect + confirm).
     * @type {'birthdate_change_candidate' | 'waiting_birthdate_change' | 'waiting_birthdate_change_confirm' | null}
     */
    birthdateChangeFlowState: null,
    /**
     * Pending final save (after date parse, before user confirms).
     * @type {{ rawBirthdateInput: string, normalizedBirthdate: string, echoDisplay: string, isoDate: string, yearCE: number } | null}
     */
    birthdateChangePending: null,
    flowVersion: 0,
    /** @type {string|null} selected paid package key from scan-offer config */
    selectedPaymentPackageKey: null,
    /**
     * Consecutive no-progress text turns per interactive state (menu fatigue / shorter reminders).
     * Keys: paywall_offer_single | awaiting_slip | waiting_birthdate | pending_verify
     */
    guidanceNoProgressByState: {},
    /**
     * Consecutive short-ack turns in the same interactive state (human ack ladder).
     * Keys: paywall_offer_single | awaiting_slip | waiting_birthdate | pending_verify
     */
    sameStateAckStreakByState: {},
    /**
     * LINE reply token for this image/webhook flow was already used (before_scan or pre-scan ack).
     * Global error fallbacks must use push, not replyMessage (avoids 400 after token consumed).
     */
    scanFlowReplyTokenSpent: false,
    /**
     * Admin approve notify failed after LINE retries; intro text pushed on next inbound webhook.
     * @type {{ text: string, createdAt: string, paymentId?: string | null } | null}
     */
    pendingApprovedIntroCompensation: null,
  };
}

export function getSession(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return createEmptySession();

  if (!sessions.has(normalizedUserId)) {
    sessions.set(normalizedUserId, createEmptySession());
  }

  return sessions.get(normalizedUserId);
}

export function setPendingImage(userId, pendingImage, flowVersion = null) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = getSession(normalizedUserId);

  session.pendingImage = pendingImage;
  if (flowVersion !== null && flowVersion !== undefined) {
    session.flowVersion = flowVersion;
  }

  sessions.set(normalizedUserId, session);
}

export function setBirthdate(userId, birthdate, flowVersion = null) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = getSession(normalizedUserId);

  session.birthdate = birthdate;
  if (flowVersion !== null && flowVersion !== undefined) {
    session.flowVersion = flowVersion;
  }

  sessions.set(normalizedUserId, session);
}

export function setSessionFlowVersion(userId, flowVersion) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = getSession(normalizedUserId);
  session.flowVersion = Number(flowVersion || 0);

  sessions.set(normalizedUserId, session);
}

export function isSessionFlowVersion(userId, flowVersion) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;

  const session = sessions.get(normalizedUserId);
  if (!session) return false;

  return Number(session.flowVersion || 0) === Number(flowVersion || 0);
}

export function clearPendingImage(userId, flowVersion = null) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = sessions.get(normalizedUserId);
  if (!session) return;

  if (
    flowVersion !== null &&
    flowVersion !== undefined &&
    Number(session.flowVersion || 0) !== Number(flowVersion || 0)
  ) {
    return;
  }

  session.pendingImage = null;
  sessions.set(normalizedUserId, session);
}

export function clearSession(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  sessions.delete(normalizedUserId);
}

export function setSelectedPaymentPackageKey(userId, packageKey) {
  const id = normalizeUserId(userId);
  if (!id) return;
  const session = getSession(id);
  const k = String(packageKey || "").trim();
  session.selectedPaymentPackageKey = k || null;
  sessions.set(id, session);
}

export function getSelectedPaymentPackageKey(userId) {
  const id = normalizeUserId(userId);
  if (!id) return null;
  const session = sessions.get(id);
  const k = session?.selectedPaymentPackageKey;
  return k ? String(k).trim() : null;
}

export function clearSelectedPaymentPackageKey(userId) {
  const id = normalizeUserId(userId);
  if (!id) return;
  const session = getSession(id);
  session.selectedPaymentPackageKey = null;
  sessions.set(id, session);
}

export function markScanFlowReplyTokenSpent(userId) {
  const id = normalizeUserId(userId);
  if (!id) return;
  const session = getSession(id);
  session.scanFlowReplyTokenSpent = true;
  sessions.set(id, session);
}

export function isScanFlowReplyTokenSpent(userId) {
  const id = normalizeUserId(userId);
  if (!id) return false;
  return Boolean(getSession(id).scanFlowReplyTokenSpent);
}

/** Reset at the start of each image message so a new webhook event gets a fresh token lifecycle. */
export function resetScanFlowReplyTokenSpent(userId) {
  const id = normalizeUserId(userId);
  if (!id) return;
  const session = getSession(id);
  session.scanFlowReplyTokenSpent = false;
  sessions.set(id, session);
}

/**
 * Queue approved-payment intro copy when admin-dashboard LINE notify fails after retries.
 * @param {string} userId
 * @param {{ text: string, paymentId?: string | null, createdAt?: string }} payload
 */
export function setPendingApprovedIntroCompensation(userId, payload) {
  const id = normalizeUserId(userId);
  if (!id || !payload?.text) return;
  const session = getSession(id);
  const createdAt =
    typeof payload.createdAt === "string" && payload.createdAt.trim()
      ? payload.createdAt.trim()
      : new Date().toISOString();
  const pid = payload.paymentId;
  session.pendingApprovedIntroCompensation = {
    text: String(payload.text).slice(0, 4900),
    createdAt,
    paymentId:
      pid != null && String(pid).trim() ? String(pid).trim() : null,
  };
  sessions.set(id, session);
}

/**
 * @param {string} userId
 * @returns {{ text: string, createdAt: string, paymentId?: string | null } | null}
 */
export function getPendingApprovedIntroCompensation(userId) {
  const id = normalizeUserId(userId);
  if (!id) return null;
  const session = sessions.get(id);
  const p = session?.pendingApprovedIntroCompensation;
  if (!p?.text) return null;
  return {
    text: p.text,
    createdAt: p.createdAt,
    paymentId: p.paymentId ?? null,
  };
}

export function clearPendingApprovedIntroCompensation(userId) {
  const id = normalizeUserId(userId);
  if (!id) return;
  const session = getSession(id);
  session.pendingApprovedIntroCompensation = null;
  sessions.set(id, session);
}

export function clearSessionIfFlowVersionMatches(userId, flowVersion) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = sessions.get(normalizedUserId);
  if (!session) return;

  if (Number(session.flowVersion || 0) !== Number(flowVersion || 0)) {
    return;
  }

  sessions.delete(normalizedUserId);
}

export function getBirthdateChangeFlowState(userId) {
  const s = getSession(userId);
  const st = s?.birthdateChangeFlowState;
  return st ? String(st).trim() : null;
}

export function getBirthdateChangePending(userId) {
  const s = getSession(userId);
  return s?.birthdateChangePending ?? null;
}

/**
 * @param {'birthdate_change_candidate' | 'waiting_birthdate_change' | 'waiting_birthdate_change_confirm' | null} state
 * @param {Record<string, unknown> | null} [pending]
 */
export function setBirthdateChangeFlowState(userId, state, pending = null) {
  const id = normalizeUserId(userId);
  if (!id) return;

  const session = getSession(id);
  session.birthdateChangeFlowState = state || null;
  session.birthdateChangePending = pending;
  session.awaitingBirthdateUpdate = Boolean(state);
  sessions.set(id, session);
}

export function clearBirthdateChangeFlow(userId) {
  setBirthdateChangeFlowState(userId, null, null);
}

/** Legacy: `true` starts at first confirmation (candidate), not direct date entry. */
export function setAwaitingBirthdateUpdate(userId, awaiting = true) {
  if (!awaiting) {
    clearBirthdateChangeFlow(userId);
    return;
  }
  setBirthdateChangeFlowState(userId, "birthdate_change_candidate", null);
}

export function clearAwaitingBirthdateUpdate(userId) {
  clearBirthdateChangeFlow(userId);
}

const GUIDANCE_STATE_KEYS = new Set([
  "paywall_offer_single",
  "awaiting_slip",
  "waiting_birthdate",
  "pending_verify",
]);

function getGuidanceMap(userId) {
  const s = getSession(userId);
  if (!s.guidanceNoProgressByState || typeof s.guidanceNoProgressByState !== "object") {
    s.guidanceNoProgressByState = {};
  }
  return s.guidanceNoProgressByState;
}

/** @param {string} stateKey */
export function resetGuidanceNoProgress(userId, stateKey) {
  const id = normalizeUserId(userId);
  const k = String(stateKey || "").trim();
  if (!id || !GUIDANCE_STATE_KEYS.has(k)) return;
  const map = getGuidanceMap(id);
  map[k] = 0;
  sessions.set(id, getSession(id));
}

/**
 * Increment no-progress streak for an interactive state (after a guidance-only reply).
 * @returns {number} new streak count (>= 1)
 */
export function bumpGuidanceNoProgress(userId, stateKey) {
  const id = normalizeUserId(userId);
  const k = String(stateKey || "").trim();
  if (!id || !GUIDANCE_STATE_KEYS.has(k)) return 0;
  const map = getGuidanceMap(id);
  const next = Number(map[k] || 0) + 1;
  map[k] = next;
  sessions.set(id, getSession(id));
  return next;
}

export function getGuidanceNoProgressCount(userId, stateKey) {
  const id = normalizeUserId(userId);
  const k = String(stateKey || "").trim();
  if (!id || !GUIDANCE_STATE_KEYS.has(k)) return 0;
  return Number(getGuidanceMap(id)[k] || 0);
}

function getAckStreakMap(userId) {
  const s = getSession(userId);
  if (!s.sameStateAckStreakByState || typeof s.sameStateAckStreakByState !== "object") {
    s.sameStateAckStreakByState = {};
  }
  return s.sameStateAckStreakByState;
}

/** @param {string} stateKey */
export function resetSameStateAckStreak(userId, stateKey) {
  const id = normalizeUserId(userId);
  const k = String(stateKey || "").trim();
  if (!id || !GUIDANCE_STATE_KEYS.has(k)) return;
  const map = getAckStreakMap(id);
  map[k] = 0;
  sessions.set(id, getSession(id));
}

/**
 * Increment consecutive same-state acknowledgement streak (short Thai ack / emoji).
 * @param {string} stateKey
 * @returns {number} new streak (>= 1)
 */
export function bumpSameStateAckStreak(userId, stateKey) {
  const id = normalizeUserId(userId);
  const k = String(stateKey || "").trim();
  if (!id || !GUIDANCE_STATE_KEYS.has(k)) return 0;
  const map = getAckStreakMap(id);
  const next = Number(map[k] || 0) + 1;
  map[k] = next;
  sessions.set(id, getSession(id));
  return next;
}

/** @param {string} stateKey */
export function getSameStateAckStreak(userId, stateKey) {
  const id = normalizeUserId(userId);
  const k = String(stateKey || "").trim();
  if (!id || !GUIDANCE_STATE_KEYS.has(k)) return 0;
  return Number(getAckStreakMap(id)[k] || 0);
}
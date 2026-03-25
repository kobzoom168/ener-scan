const sessions = new Map();

function normalizeUserId(userId) {
  return String(userId || "").trim();
}

function createEmptySession() {
  return {
    pendingImage: null,
    birthdate: null,
    awaitingBirthdateUpdate: false,
    flowVersion: 0,
    /** @type {string|null} selected paid package key from scan-offer config */
    selectedPaymentPackageKey: null,
    /**
     * Consecutive no-progress text turns per interactive state (menu fatigue / shorter reminders).
     * Keys: paywall_offer_single | awaiting_slip | waiting_birthdate | pending_verify
     */
    guidanceNoProgressByState: {},
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

export function setAwaitingBirthdateUpdate(userId, awaiting = true) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = getSession(normalizedUserId);
  session.awaitingBirthdateUpdate = Boolean(awaiting);
  sessions.set(normalizedUserId, session);
}

export function clearAwaitingBirthdateUpdate(userId) {
  setAwaitingBirthdateUpdate(userId, false);
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
/**
 * Abuse guard v2 — in-memory. Separate scan vs payment/slip scores & locks.
 * Resets on process restart.
 */

const abuseMap = new Map();

export const QUIET_RESET_MS = 10 * 60 * 1000;
export const HARD_BLOCK_THRESHOLD = 16;
export const QUIET_SCORE_DECAY = 3;

export const MAX_TEXT_EVENTS_PER_MINUTE = 8;
export const MAX_SCAN_EVENTS_PER_10_MIN = 4;
export const SCAN_TEMP_LOCK_THRESHOLD = 7;
export const SCAN_TEMP_LOCK_MS = 5 * 60 * 1000;

export const MAX_PAYMENT_EVENTS_PER_15_MIN = 4;
export const MAX_SLIP_EVENTS_PER_15_MIN = 3;
export const PAYMENT_TEMP_LOCK_THRESHOLD = 6;
export const PAYMENT_TEMP_LOCK_MS = 10 * 60 * 1000;

const TEXT_WINDOW_MS = 60 * 1000;
const SCAN_IMAGE_WINDOW_MS = 10 * 60 * 1000;
const PAYMENT_WINDOW_MS = 15 * 60 * 1000;
const SLIP_WINDOW_MS = 15 * 60 * 1000;
const TOO_FAST_TEXT_MS = 5000;
const TOO_FAST_SCAN_IMAGE_MS = 15000;
const TOO_FAST_SLIP_MS = 20000;

function nowMs() {
  return Date.now();
}

function getDefaultState() {
  return {
    textSpamScore: 0,
    scanSpamScore: 0,
    paymentSpamScore: 0,

    recentMessageTimestamps: [],
    recentImageTimestamps: [],
    recentScanTimestamps: [],
    recentPaymentTimestamps: [],
    recentSlipTimestamps: [],

    scanLockUntil: 0,
    paymentLockUntil: 0,

    scanWarningCount: 0,
    paymentWarningCount: 0,

    isHardBlocked: false,
    lastEventAt: 0,
  };
}

export function getAbuseState(userId) {
  if (!abuseMap.has(userId)) {
    abuseMap.set(userId, getDefaultState());
  }
  return abuseMap.get(userId);
}

/** @deprecated use getAbuseState */
export function getState(userId) {
  return getAbuseState(userId);
}

function trimWindow(list, windowMs, now) {
  return list.filter((ts) => now - ts <= windowMs);
}

export function totalScore(state) {
  return (
    state.textSpamScore + state.scanSpamScore + state.paymentSpamScore
  );
}

function recomputeHardBlock(state) {
  if (totalScore(state) >= HARD_BLOCK_THRESHOLD) {
    state.isHardBlocked = true;
  }
  return state;
}

function buildLockStateSnapshot(state, now) {
  return {
    scanLocked: Boolean(state.scanLockUntil && now < state.scanLockUntil),
    scanLockUntil: state.scanLockUntil,
    paymentLocked: Boolean(state.paymentLockUntil && now < state.paymentLockUntil),
    paymentLockUntil: state.paymentLockUntil,
    isHardBlocked: state.isHardBlocked,
  };
}

/**
 * Compact snapshot for admin reset logs (before/after).
 */
export function snapshotAbuseForAdminResetLog(userId, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);
  return {
    textSpamScore: state.textSpamScore,
    scanSpamScore: state.scanSpamScore,
    paymentSpamScore: state.paymentSpamScore,
    totalScore: totalScore(state),
    isHardBlocked: state.isHardBlocked,
    scanLockUntil: state.scanLockUntil,
    paymentLockUntil: state.paymentLockUntil,
    lockState: buildLockStateSnapshot(state, now),
  };
}

/**
 * Diagnostics for handleEvent global gate (single snapshot; use for logging + branch).
 */
export function getHandleEventAbuseGateDiagnostics(userId, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);
  const textSpamScore = state.textSpamScore;
  const scanSpamScore = state.scanSpamScore;
  const paymentSpamScore = state.paymentSpamScore;
  const total = totalScore(state);
  const isHardBlocked = state.isHardBlocked;
  const scanLockUntil = state.scanLockUntil;
  const paymentLockUntil = state.paymentLockUntil;
  const scanLocked = Boolean(scanLockUntil && now < scanLockUntil);
  const paymentLocked = Boolean(paymentLockUntil && now < paymentLockUntil);

  let hardBlockReason = null;
  if (isHardBlocked) {
    if (total >= HARD_BLOCK_THRESHOLD) {
      hardBlockReason = {
        code: `total_score_ge_${HARD_BLOCK_THRESHOLD}`,
        textSpamScore,
        scanSpamScore,
        paymentSpamScore,
        totalScore: total,
      };
    } else {
      hardBlockReason = {
        code: "hard_block_flag_below_threshold",
        textSpamScore,
        scanSpamScore,
        paymentSpamScore,
        totalScore: total,
      };
    }
  }

  return {
    textSpamScore,
    scanSpamScore,
    paymentSpamScore,
    totalScore: total,
    isHardBlocked,
    scanLockUntil,
    paymentLockUntil,
    scanLocked,
    paymentLocked,
    hardBlockReason,
  };
}

/**
 * Admin-only: clear scan-side abuse (score, windows, temp lock). Preserves text + payment scores, payment lock, slip/payment windows.
 * If total score falls below HARD_BLOCK_THRESHOLD, clears global hard block; otherwise re-applies from remaining scores.
 */
export function adminResetScanAbuseState(userId, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);
  const previousScanSpamScore = state.scanSpamScore;
  const previousLockState = buildLockStateSnapshot(state, now);

  state.scanSpamScore = 0;
  state.scanLockUntil = 0;
  state.recentScanTimestamps = [];
  state.recentImageTimestamps = [];
  state.scanWarningCount = 0;

  if (totalScore(state) < HARD_BLOCK_THRESHOLD) {
    state.isHardBlocked = false;
  } else {
    recomputeHardBlock(state);
  }

  const newLockState = buildLockStateSnapshot(state, now);
  return {
    previousScanSpamScore,
    previousLockState,
    newScanSpamScore: state.scanSpamScore,
    newLockState,
    newIsHardBlocked: state.isHardBlocked,
  };
}

function maybeApplyScanLock(state, now, prevScanScore) {
  if (state.scanSpamScore >= SCAN_TEMP_LOCK_THRESHOLD) {
    state.scanLockUntil = Math.max(state.scanLockUntil || 0, now + SCAN_TEMP_LOCK_MS);
    if (prevScanScore < SCAN_TEMP_LOCK_THRESHOLD) {
      state.scanWarningCount += 1;
    }
  }
}

function maybeApplyPaymentLock(state, now, prevPaymentScore) {
  if (state.paymentSpamScore >= PAYMENT_TEMP_LOCK_THRESHOLD) {
    state.paymentLockUntil = Math.max(
      state.paymentLockUntil || 0,
      now + PAYMENT_TEMP_LOCK_MS,
    );
    if (prevPaymentScore < PAYMENT_TEMP_LOCK_THRESHOLD) {
      state.paymentWarningCount += 1;
    }
  }
}

/**
 * Decay scores, clear windows after quiet period; clear expired locks.
 */
export function resetAbuseStateIfExpired(userId, now = nowMs()) {
  const state = getAbuseState(userId);

  if (state.lastEventAt && now - state.lastEventAt > QUIET_RESET_MS) {
    state.textSpamScore = Math.max(0, state.textSpamScore - QUIET_SCORE_DECAY);
    state.scanSpamScore = Math.max(0, state.scanSpamScore - QUIET_SCORE_DECAY);
    state.paymentSpamScore = Math.max(0, state.paymentSpamScore - QUIET_SCORE_DECAY);

    state.recentMessageTimestamps = [];
    state.recentImageTimestamps = [];
    state.recentScanTimestamps = [];
    state.recentPaymentTimestamps = [];
    state.recentSlipTimestamps = [];
  }

  if (state.scanLockUntil && now >= state.scanLockUntil) {
    state.scanLockUntil = 0;
  }

  if (state.paymentLockUntil && now >= state.paymentLockUntil) {
    state.paymentLockUntil = 0;
  }

  recomputeHardBlock(state);
  return state;
}

export function checkGlobalAbuseStatus(userId, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);

  return {
    isHardBlocked: state.isHardBlocked,
    totalScore: totalScore(state),
    textSpamScore: state.textSpamScore,
    scanSpamScore: state.scanSpamScore,
    paymentSpamScore: state.paymentSpamScore,
  };
}

export function checkScanAbuseStatus(userId, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);

  return {
    isLocked: Boolean(state.scanLockUntil && now < state.scanLockUntil),
    lockUntil: state.scanLockUntil,
    scanSpamScore: state.scanSpamScore,
  };
}

export function checkPaymentAbuseStatus(userId, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);

  return {
    isLocked: Boolean(state.paymentLockUntil && now < state.paymentLockUntil),
    lockUntil: state.paymentLockUntil,
    paymentSpamScore: state.paymentSpamScore,
  };
}

export function isGarbageText(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (/^[\W_]+$/u.test(t)) return true;
  if (/^(5){5,}$/u.test(t)) return true;
  if (/^(.)\1{4,}$/u.test(t.replace(/\s/g, ""))) return true;
  if (/^[😂🤣😭😅🙏👍❤️🔥✨🎉💥]+$/u.test(t)) return true;
  return false;
}

/**
 * Image while scan or payment lock: +2 text; +3 scan if scan lock; +3 payment if payment lock.
 */
export function recordLockedImageActivity(userId, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);
  const scanLocked = state.scanLockUntil && now < state.scanLockUntil;
  const payLocked = state.paymentLockUntil && now < state.paymentLockUntil;

  if (!scanLocked && !payLocked) {
    return { state, bumped: false };
  }

  state.textSpamScore += 2;
  if (scanLocked) state.scanSpamScore += 3;
  if (payLocked) state.paymentSpamScore += 3;
  state.lastEventAt = now;
  recomputeHardBlock(state);

  return { state, bumped: true };
}

export function registerTextEvent(userId, text, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);

  state.lastEventAt = now;
  state.recentMessageTimestamps.push(now);
  state.recentMessageTimestamps = trimWindow(
    state.recentMessageTimestamps,
    TEXT_WINDOW_MS,
    now,
  );

  const reasons = [];

  if (isGarbageText(text)) {
    state.textSpamScore += 1;
    reasons.push("garbage_text");
  }

  if (state.recentMessageTimestamps.length > MAX_TEXT_EVENTS_PER_MINUTE) {
    state.textSpamScore += 2;
    reasons.push("too_many_texts");
  }

  const ts = state.recentMessageTimestamps;
  if (ts.length >= 3 && now - ts[ts.length - 3] < TOO_FAST_TEXT_MS) {
    state.textSpamScore += 2;
    reasons.push("too_fast_text");
  }

  recomputeHardBlock(state);

  return { state, reasons, abusive: reasons.length > 0 };
}

export function registerScanIntent(userId, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);
  const prevScan = state.scanSpamScore;

  state.lastEventAt = now;
  state.recentImageTimestamps.push(now);
  state.recentScanTimestamps.push(now);

  state.recentImageTimestamps = trimWindow(
    state.recentImageTimestamps,
    SCAN_IMAGE_WINDOW_MS,
    now,
  );
  state.recentScanTimestamps = trimWindow(
    state.recentScanTimestamps,
    SCAN_IMAGE_WINDOW_MS,
    now,
  );

  const reasons = [];

  if (state.recentScanTimestamps.length > MAX_SCAN_EVENTS_PER_10_MIN) {
    state.scanSpamScore += 2;
    reasons.push("too_many_scan_attempts");
  }

  const imgs = state.recentImageTimestamps;
  if (imgs.length >= 2 && now - imgs[imgs.length - 2] < TOO_FAST_SCAN_IMAGE_MS) {
    state.scanSpamScore += 3;
    reasons.push("too_fast_images");
  }

  maybeApplyScanLock(state, now, prevScan);
  recomputeHardBlock(state);

  return { state, reasons, abusive: reasons.length > 0 };
}

export function registerScanAbuse(userId, reason, amount = 1, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);
  const prevScan = state.scanSpamScore;
  state.scanSpamScore += Number(amount) || 0;
  state.lastEventAt = now;

  maybeApplyScanLock(state, now, prevScan);
  recomputeHardBlock(state);

  return { state, reason };
}

export function registerPaymentIntent(userId, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);
  const prevPay = state.paymentSpamScore;

  state.lastEventAt = now;
  state.recentPaymentTimestamps.push(now);
  state.recentPaymentTimestamps = trimWindow(
    state.recentPaymentTimestamps,
    PAYMENT_WINDOW_MS,
    now,
  );

  const reasons = [];

  if (state.recentPaymentTimestamps.length > MAX_PAYMENT_EVENTS_PER_15_MIN) {
    state.paymentSpamScore += 2;
    reasons.push("too_many_payment_attempts");
  }

  maybeApplyPaymentLock(state, now, prevPay);
  recomputeHardBlock(state);

  return { state, reasons, abusive: reasons.length > 0 };
}

export function registerSlipEvent(userId, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);
  const prevPay = state.paymentSpamScore;

  state.lastEventAt = now;
  state.recentSlipTimestamps.push(now);
  state.recentSlipTimestamps = trimWindow(
    state.recentSlipTimestamps,
    SLIP_WINDOW_MS,
    now,
  );

  const reasons = [];

  if (state.recentSlipTimestamps.length > MAX_SLIP_EVENTS_PER_15_MIN) {
    state.paymentSpamScore += 3;
    reasons.push("too_many_slip_uploads");
  }

  const slips = state.recentSlipTimestamps;
  if (slips.length >= 2 && now - slips[slips.length - 2] < TOO_FAST_SLIP_MS) {
    state.paymentSpamScore += 3;
    reasons.push("too_fast_slip_uploads");
  }

  maybeApplyPaymentLock(state, now, prevPay);
  recomputeHardBlock(state);

  return { state, reasons, abusive: reasons.length > 0 };
}

export function registerPaymentAbuse(userId, reason, amount = 1, now = nowMs()) {
  const state = resetAbuseStateIfExpired(userId, now);
  const prevPay = state.paymentSpamScore;
  state.paymentSpamScore += Number(amount) || 0;
  state.lastEventAt = now;

  maybeApplyPaymentLock(state, now, prevPay);
  recomputeHardBlock(state);

  return { state, reason };
}

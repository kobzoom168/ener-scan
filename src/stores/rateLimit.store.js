const userScanHistory = new Map();

const LIMIT = 5;
const WINDOW_MS = 60 * 1000;

function normalizeUserId(userId) {
  return String(userId || "").trim();
}

export function checkScanRateLimit(userId) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    return {
      allowed: true,
      remainingCount: LIMIT,
      retryAfterMs: 0,
      retryAfterSec: 0,
    };
  }

  const now = Date.now();

  if (!userScanHistory.has(normalizedUserId)) {
    userScanHistory.set(normalizedUserId, []);
  }

  const history = userScanHistory.get(normalizedUserId) || [];

  const filtered = history.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (filtered.length >= LIMIT) {
    const oldestInWindow = filtered[0];
    const retryAfterMs = Math.max(0, WINDOW_MS - (now - oldestInWindow));
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);

    userScanHistory.set(normalizedUserId, filtered);

    return {
      allowed: false,
      remainingCount: 0,
      retryAfterMs,
      retryAfterSec,
    };
  }

  filtered.push(now);
  userScanHistory.set(normalizedUserId, filtered);

  return {
    allowed: true,
    remainingCount: Math.max(0, LIMIT - filtered.length),
    retryAfterMs: 0,
    retryAfterSec: 0,
  };
}

export function clearRateLimit(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  userScanHistory.delete(normalizedUserId);
}

export function getRateLimitConfig() {
  return {
    limit: LIMIT,
    windowMs: WINDOW_MS,
    windowSec: Math.ceil(WINDOW_MS / 1000),
  };
}
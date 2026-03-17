const userCooldownMap = new Map();

const COOLDOWN_MS = 20 * 1000;

function normalizeUserId(userId) {
  return String(userId || "").trim();
}

export function getCooldownStatus(userId) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    return {
      allowed: true,
      remainingMs: 0,
      remainingSec: 0,
    };
  }

  const now = Date.now();
  const last = userCooldownMap.get(normalizedUserId);

  if (!last) {
    return {
      allowed: true,
      remainingMs: 0,
      remainingSec: 0,
    };
  }

  const diff = now - last;
  const remainingMs = Math.max(0, COOLDOWN_MS - diff);
  const remainingSec = Math.ceil(remainingMs / 1000);

  if (remainingMs > 0) {
    return {
      allowed: false,
      remainingMs,
      remainingSec,
    };
  }

  return {
    allowed: true,
    remainingMs: 0,
    remainingSec: 0,
  };
}

export function setCooldownNow(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  userCooldownMap.set(normalizedUserId, Date.now());
}

export function clearCooldown(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  userCooldownMap.delete(normalizedUserId);
}

export function getCooldownConfig() {
  return {
    cooldownMs: COOLDOWN_MS,
    cooldownSec: Math.ceil(COOLDOWN_MS / 1000),
  };
}
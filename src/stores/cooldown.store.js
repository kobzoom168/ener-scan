const userCooldownMap = new Map();
const COOLDOWN_MS = 20 * 1000;

export function getCooldownStatus(userId) {
  const now = Date.now();
  const last = userCooldownMap.get(userId);

  if (!last) {
    return { allowed: true, remainingMs: 0 };
  }

  const diff = now - last;
  const remainingMs = COOLDOWN_MS - diff;

  if (remainingMs > 0) {
    return {
      allowed: false,
      remainingMs,
    };
  }

  return {
    allowed: true,
    remainingMs: 0,
  };
}

export function setCooldownNow(userId) {
  userCooldownMap.set(userId, Date.now());
}
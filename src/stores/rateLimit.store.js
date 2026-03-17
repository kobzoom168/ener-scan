const userScanHistory = new Map();

const LIMIT = 5;
const WINDOW_MS = 60 * 1000;

export function checkScanRateLimit(userId) {
  const now = Date.now();

  if (!userScanHistory.has(userId)) {
    userScanHistory.set(userId, []);
  }

  const history = userScanHistory.get(userId);

  const filtered = history.filter(
    (timestamp) => now - timestamp < WINDOW_MS
  );

  if (filtered.length >= LIMIT) {
    return {
      allowed: false,
      remaining: 0,
    };
  }

  filtered.push(now);

  userScanHistory.set(userId, filtered);

  return {
    allowed: true,
    remaining: LIMIT - filtered.length,
  };
}
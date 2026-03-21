/**
 * In-memory login attempt limiter: max failures per IP per sliding window.
 * For single-instance MVP; use Redis for multi-instance.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** @type {Map<string, number[]>} */
const ipAttempts = new Map();

function prune(ip) {
  const now = Date.now();
  const arr = ipAttempts.get(ip) || [];
  const next = arr.filter((t) => now - t < WINDOW_MS);
  ipAttempts.set(ip, next);
  return next;
}

export function getClientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || "";
  return String(raw || "unknown").replace(/^::ffff:/, "");
}

/** True if this IP already has MAX_ATTEMPTS failed logins in the window. */
export function isLoginRateLimited(req) {
  return prune(getClientIp(req)).length >= MAX_ATTEMPTS;
}

/** Record one failed login; returns true if IP is now blocked. */
export function recordLoginFailure(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const arr = prune(ip);
  arr.push(now);
  ipAttempts.set(ip, arr);
  return arr.length >= MAX_ATTEMPTS;
}

export function clearLoginFailures(req) {
  ipAttempts.delete(getClientIp(req));
}

/** States eligible for Phase A conversation surface (humanizer only). */
export const PHASE_A_STATE_OWNERS = new Set(
  /** @type {import("./contracts.types.js").StateOwner[]} */ ([
    "waiting_birthdate",
    "paywall_selecting_package",
    "payment_package_selected",
    "awaiting_slip",
    "pending_verify",
    "object_gate",
  ]),
);

/** @type {import("./contracts.types.js").StateOwner[]} */
export const STATE_OWNERS = [
  "idle",
  "waiting_birthdate",
  "paywall_selecting_package",
  "payment_package_selected",
  "awaiting_slip",
  "pending_verify",
  "paid_active_scan_ready",
  "soft_locked",
  "hard_blocked",
  "object_gate",
];

/** @param {number} streak @returns {import("./contracts.types.js").GuidanceTierNumeric} */
export function guidanceTierFromNoProgressStreak(streak) {
  const n = Math.max(1, Number(streak) || 1);
  if (n >= 3) return 3;
  if (n === 2) return 2;
  return 1;
}

/**
 * Map ack ladder streak (1..n) to guidance tier for same-state acks.
 * @param {number} ackStreak
 * @returns {import("./contracts.types.js").GuidanceTierNumeric}
 */
export function guidanceTierFromAckStreak(ackStreak) {
  const n = Math.max(1, Number(ackStreak) || 1);
  if (n >= 3) return 3;
  if (n === 2) return 2;
  return 1;
}

/**
 * Deterministic active-state owner (Phase A snapshot). Testable pure function.
 * Webhook builds the snapshot from existing guards; this does not hit DB.
 *
 * Priority:
 * 1) hard_blocked
 * 2) soft_locked (scan)
 * 3) payment interactive (pending_verify > awaiting_slip > paywall > package_selected)
 * 4) waiting_birthdate (pending scan image, birthdate needed)
 * 5) paid_active_scan_ready
 * 6) explicit_command (utility/menu/history — narrow surface)
 * 7) idle
 *
 * @param {import("./contracts.types.js").ActiveStateResolutionInput} s
 * @returns {import("./contracts.types.js").ActiveStateResolution}
 */
export function resolveActiveState(s) {
  if (s.hardBlocked) {
    return {
      stateOwner: "hard_blocked",
      expectedInputKind: "none",
      noProgressStreak: 0,
      resolutionReason: "abuse_hard_block",
    };
  }
  if (s.softLockedScan) {
    return {
      stateOwner: "soft_locked",
      expectedInputKind: "scan_unlock_or_wait",
      noProgressStreak: 0,
      resolutionReason: "scan_soft_lock",
    };
  }

  if (s.hasAwaitingPaymentInteractive) {
    if (s.paymentInteractiveKind === "pending_verify") {
      return {
        stateOwner: "pending_verify",
        expectedInputKind: "slip_or_status_or_waiting",
        noProgressStreak: 0,
        resolutionReason: "db_pending_verify",
      };
    }
    if (s.paymentInteractiveKind === "awaiting_slip") {
      return {
        stateOwner: "awaiting_slip",
        expectedInputKind: "slip_image_or_pay_again",
        noProgressStreak: 0,
        resolutionReason: "db_awaiting_slip",
      };
    }
    if (s.paymentInteractiveKind === "paywall") {
      return {
        stateOwner: "paywall_selecting_package",
        expectedInputKind: "package_or_pay_or_wait",
        noProgressStreak: 0,
        resolutionReason: "paywall_gate",
      };
    }
    if (s.paymentInteractiveKind === "package_selected") {
      return {
        stateOwner: "payment_package_selected",
        expectedInputKind: "pay_command",
        noProgressStreak: 0,
        resolutionReason: "package_selected_await_pay",
      };
    }
  }

  if (s.waitingBirthdateForScan) {
    return {
      stateOwner: "waiting_birthdate",
      expectedInputKind: "birthdate_or_deferred_intent",
      noProgressStreak: 0,
      resolutionReason: "pending_image_needs_birthdate",
    };
  }

  if (s.accessPaidReady) {
    return {
      stateOwner: "paid_active_scan_ready",
      expectedInputKind: "scan_image",
      noProgressStreak: 0,
      resolutionReason: "paid_active",
    };
  }

  if (s.explicitCommandOrUtility) {
    return {
      stateOwner: "idle",
      expectedInputKind: "command",
      noProgressStreak: 0,
      resolutionReason: "explicit_command",
    };
  }

  return {
    stateOwner: "idle",
    expectedInputKind: "open",
    noProgressStreak: 0,
    resolutionReason: "default_idle",
  };
}

/** Outbound queue priority: lower number = higher priority (sent first). */
export const OUTBOUND_PRIORITY = {
  scan_result: 10,
  /** After scan_result; generic “job failed” text when pipeline errors (no user reply yet). */
  scan_failure_notify: 15,
  approve_notify: 20,
  pending_intro: 21,
  reject_notify: 22,
  payment_qr: 30,
  pre_scan_ack: 80,
  /** เตือนต่ออายุรายเดือน (push อัตโนมัติ) — ต่ำสุด ไม่แซงข้อความตอบลูกค้า */
  renewal_reminder: 90,
  daily_pick_push: 88,
};

/** Backoff steps (ms) for LINE 429 / transient failures. */
export const OUTBOUND_BACKOFF_MS = [2000, 5000, 10000, 20000, 40000];

export const OUTBOUND_MAX_ATTEMPTS = {
  pre_scan_ack: 2,
  scan_failure_notify: 2,
  scan_result: 5,
  approve_notify: 4,
  payment_qr: 3,
  reject_notify: 3,
  pending_intro: 4,
  slip_received: 3,
  renewal_reminder: 2,
};

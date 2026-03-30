/**
 * Payload contracts for `outbound_messages.payload_json` (PR1 admin/payment path).
 * Validated at send time in `deliverOutbound.service.js`.
 *
 * @typedef {object} ApproveNotifyPayload
 * @property {string} text
 * @property {string} [replyToken] Optional one-shot LINE reply token from admin UI
 * @property {string} [paymentId] Correlation
 * @property {string} [source] e.g. "admin_approve" | "admin_free_reset"
 *
 * @typedef {object} RejectNotifyPayload
 * @property {string} text
 * @property {string} [paymentId]
 *
 * @typedef {object} PaymentQrPayload
 * @property {string} [text] Caption or instructions
 * @property {string} [imageUrl] HTTPS URL for LINE image message (original + preview)
 *
 * @typedef {object} PendingIntroPayload
 * @property {string} text
 * @property {string} [paymentId]
 * @property {string} [createdAt] ISO
 */

export const OUTBOUND_PAYLOAD_VERSION = 1;

import { sendNonScanReply } from "../services/nonScanReply.gateway.js";

/** Primary + alternates must not reuse wording from free-quota or generic “ระบบพัง”. */
export const SCAN_LOCKED_SOFT_PRIMARY = "พักรับสแกนชั่วคราว";

export const SCAN_LOCKED_SOFT_ALTERNATES = [
  "ส่งถี่เกินไป พักรับชั่วคราว",
  "รับสแกนใหม่ภายหลัง",
];

export const SCAN_LOCKED_HARD_PRIMARY = "รับสแกนไม่ได้ชั่วคราว";

export const SCAN_LOCKED_HARD_ALTERNATES = [
  "ปิดรับสแกนชั่วคราว",
  "ยังรับสแกนไม่ได้",
];

/**
 * Scan abuse soft/hard lock — always via non-scan gateway + SCAN_LOCK_REPLY_ROUTED log.
 *
 * @param {*} client
 * @param {{ userId: string, replyToken: string|null|undefined, lockType: 'soft'|'hard', semanticKey: string }} opts
 */
export async function sendScanLockReply(client, opts) {
  const { userId, replyToken, lockType, semanticKey } = opts;
  const uid = String(userId || "").trim();
  const sk = String(semanticKey || "").trim() || "scan_lock_unknown";
  const hard = lockType === "hard";
  const replyType = hard ? "scan_locked_hard" : "scan_locked_soft";

  console.log(
    JSON.stringify({
      event: "SCAN_LOCK_REPLY_ROUTED",
      lineUserId: uid,
      replyType,
      lockType: hard ? "hard" : "soft",
      semanticKey: sk,
    }),
  );

  return sendNonScanReply({
    client,
    userId: uid,
    replyToken,
    replyType,
    semanticKey: sk,
    text: hard ? SCAN_LOCKED_HARD_PRIMARY : SCAN_LOCKED_SOFT_PRIMARY,
    alternateTexts: hard ? SCAN_LOCKED_HARD_ALTERNATES : SCAN_LOCKED_SOFT_ALTERNATES,
  });
}

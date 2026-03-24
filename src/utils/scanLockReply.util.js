import { sendNonScanReply } from "../services/nonScanReply.gateway.js";

/** Primary + alternates must not reuse wording from free-quota or generic “ระบบพัง”. */
export const SCAN_LOCKED_SOFT_PRIMARY =
  "ตอนนี้ระบบขอพักการรับสแกนชั่วคราวนะครับ ลองส่งใหม่อีกครั้งในอีกสักครู่";

export const SCAN_LOCKED_SOFT_ALTERNATES = [
  "ขอพักรับสแกนชั่วคราวครับ รอสักครู่แล้วลองส่งรูปใหม่อีกทีนะครับ",
  "รับสแกนถี่ไปในช่วงสั้น ๆ ขอพักรับชั่วคราว แล้วค่อยลองใหม่นะครับ",
];

export const SCAN_LOCKED_HARD_PRIMARY =
  "ตอนนี้ระบบขอพักการรับสแกนไว้ชั่วคราวก่อนนะครับ รอสักพักแล้วค่อยลองใหม่อีกครั้ง";

export const SCAN_LOCKED_HARD_ALTERNATES = [
  "ขอพักรับสแกนไว้ชั่วคราวก่อนครับ รอแล้วค่อยส่งรูปใหม่ได้เลย",
  "ช่วงนี้รับสแกนไม่ได้ชั่วคราวครับ ลองใหม่ในอีกสักพักนะครับ",
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

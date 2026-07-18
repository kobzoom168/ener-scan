import { env } from "../config/env.js";
import { isAuditNonScanBypassSuspect } from "./lineReplyAudit.context.js";
import {
  invokeLinePushMessage,
  invokeLineReplyMessage,
} from "../utils/lineClientTransport.util.js";

/**
 * @param {*} client
 * @param {string} replyToken
 * @param {string} text
 * @param {{ items: unknown[] } | null} [quickReply] — LINE quickReply object
 */
export async function replyText(client, replyToken, text, quickReply = null) {
  if (
    env.NONSCAN_REPLY_AUDIT === "warn" &&
    isAuditNonScanBypassSuspect()
  ) {
    console.warn(
      JSON.stringify({
        event: "NONSCAN_REPLY_BYPASS_SUSPECT",
        channel: "replyText",
        replyTokenExists: Boolean(replyToken),
        textLen: String(text || "").length,
      }),
    );
  }
  const safeText = String(text || "").slice(0, 4900);

  /** @type {{ type: "text", text: string, quickReply?: unknown }} */
  const msg = { type: "text", text: safeText };
  if (quickReply && Array.isArray(quickReply.items) && quickReply.items.length) {
    msg.quickReply = quickReply;
  }
  return invokeLineReplyMessage(client, "lineReply.replyText", replyToken, msg);
}

/**
 * Reply with text then a sticker (one reply token, max 5 messages).
 * @param {*} client
 * @param {string} replyToken
 * @param {string} text
 * @param {{ type: "sticker", packageId: string, stickerId: string }} stickerMessage
 */
export async function replyTextWithTrailingSticker(
  client,
  replyToken,
  text,
  stickerMessage,
  quickReply = null,
) {
  if (
    env.NONSCAN_REPLY_AUDIT === "warn" &&
    isAuditNonScanBypassSuspect()
  ) {
    console.warn(
      JSON.stringify({
        event: "NONSCAN_REPLY_BYPASS_SUSPECT",
        channel: "replyTextWithTrailingSticker",
        replyTokenExists: Boolean(replyToken),
        textLen: String(text || "").length,
      }),
    );
  }
  const safeText = String(text || "").slice(0, 4900);
  // quickReply attaches to the LAST message in the sequence (the sticker).
  const stickerMsg =
    quickReply && Array.isArray(quickReply.items) && quickReply.items.length
      ? { ...stickerMessage, quickReply }
      : stickerMessage;
  return invokeLineReplyMessage(
    client,
    "lineReply.replyTextWithTrailingSticker",
    replyToken,
    [
      { type: "text", text: safeText },
      stickerMsg,
    ],
  );
}

export async function replyFlex(client, replyToken, flexMessage) {
  console.log("[LINE_REPLY_FLEX] start");
  console.log("[LINE_REPLY_FLEX] replyToken exists:", Boolean(replyToken));
  console.log("[LINE_REPLY_FLEX] altText:", flexMessage?.altText || "no-altText");
  try {
    const flexPayloadJson = JSON.stringify(flexMessage);
    console.log(
      "[LINE_REPLY_FLEX] payload_json_preview:",
      flexPayloadJson.slice(0, 500),
    );
  } catch {
    console.log("[LINE_REPLY_FLEX] payload_json_preview: <stringify failed>");
  }

  return invokeLineReplyMessage(client, "lineReply.replyFlex", replyToken, [
    flexMessage,
  ]);
}

/**
 * Push Flex (Messaging API). Use after the webhook `replyToken` has been consumed.
 * @param {*} client
 * @param {string} userId
 * @param {*} flexMessage
 */
export async function pushFlex(client, userId, flexMessage) {
  const uid = String(userId || "").trim();
  if (!uid) {
    throw new Error("pushFlex_missing_userId");
  }
  console.log("[LINE_PUSH_FLEX] start");
  console.log("[LINE_PUSH_FLEX] userId prefix:", uid.slice(0, 8));
  console.log("[LINE_PUSH_FLEX] altText:", flexMessage?.altText || "no-altText");
  try {
    const flexPayloadJson = JSON.stringify(flexMessage);
    console.log(
      "[LINE_PUSH_FLEX] payload_json_preview:",
      flexPayloadJson.slice(0, 500),
    );
  } catch {
    console.log("[LINE_PUSH_FLEX] payload_json_preview: <stringify failed>");
  }

  return invokeLinePushMessage(client, "lineReply.pushFlex", uid, flexMessage);
}

/**
 * Manual payment: intro text → QR image → short slip reminder (max 5 messages in one reply).
 * @param {{ introText: string, qrImageUrl: string, slipText: string }} opts
 */
export async function replyPaymentInstructionWithQr(client, replyToken, opts) {
  const introText = String(opts?.introText || "").slice(0, 4900);
  const qrImageUrl = String(opts?.qrImageUrl || "").trim();
  const slipText = String(opts?.slipText || "").slice(0, 4900);

  if (!qrImageUrl) {
    throw new Error("replyPaymentInstructionWithQr_missing_qrImageUrl");
  }

  // กบ 18 ก.ค. 2026 (เคส 7Kendo): ยุบ 4 ข้อความ → 2 (สรุป+วิธีส่งสลิปรวมก้อนเดียว,
  // QR ปิดท้าย) — ข้อความใน call เดียว timestamp ชนกัน แอป LINE เรียง tie สลับได้
  // ยิ่งน้อยก้อนยิ่งไม่สลับ และสิ่งสุดท้ายที่ค้างตาลูกค้า = QR ที่ต้องสแกน
  const combinedText = [introText, slipText]
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4900);
  const messages = [
    { type: "text", text: combinedText },
    {
      type: "image",
      originalContentUrl: qrImageUrl,
      previewImageUrl: qrImageUrl,
    },
  ];

  console.log("[LINE_REPLY_PAYMENT_QR] start", {
    replyTokenExists: Boolean(replyToken),
    qrHost: (() => {
      try {
        return new URL(qrImageUrl).hostname;
      } catch {
        return null;
      }
    })(),
  });

  return invokeLineReplyMessage(
    client,
    "lineReply.replyPaymentQr",
    replyToken,
    messages,
  );
}

/** Alias ตามสเปค — ส่ง text + image QR + text สลิป */
export async function replyPaymentInstructions(client, replyToken, opts) {
  return replyPaymentInstructionWithQr(client, replyToken, opts);
}
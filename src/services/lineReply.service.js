import { env } from "../config/env.js";
import { isAuditNonScanBypassSuspect } from "./lineReplyAudit.context.js";
import {
  invokeLinePushMessage,
  invokeLineReplyMessage,
} from "../utils/lineClientTransport.util.js";
import { lineStickerPaymentSupportMessage } from "../utils/lineStickerMessage.util.js";

export async function replyText(client, replyToken, text) {
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

  return invokeLineReplyMessage(client, "lineReply.replyText", replyToken, {
    type: "text",
    text: safeText,
  });
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
  return invokeLineReplyMessage(
    client,
    "lineReply.replyTextWithTrailingSticker",
    replyToken,
    [
      { type: "text", text: safeText },
      stickerMessage,
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

  const messages = [
    { type: "text", text: introText },
    lineStickerPaymentSupportMessage(),
    {
      type: "image",
      originalContentUrl: qrImageUrl,
      previewImageUrl: qrImageUrl,
    },
    { type: "text", text: slipText },
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
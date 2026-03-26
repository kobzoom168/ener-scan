import { env } from "../config/env.js";
import { isAuditNonScanBypassSuspect } from "./lineReplyAudit.context.js";

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
  console.log("[LINE_REPLY_TEXT] start");
  console.log("[LINE_REPLY_TEXT] replyToken exists:", Boolean(replyToken));
  console.log("[LINE_REPLY_TEXT] text length:", text?.length || 0);

  const safeText = String(text || "").slice(0, 4900);

  try {
    const result = await client.replyMessage(replyToken, {
      type: "text",
      text: safeText,
    });

    console.log("[LINE_REPLY_TEXT] success");
    return result;
  } catch (error) {
    console.error("[LINE_REPLY_TEXT] failed:", error?.message || error);
    console.error(
      "[LINE_REPLY_TEXT] error.response.data:",
      error?.response?.data || null,
    );
    throw error;
  }
}

export async function replyFlex(client, replyToken, flexMessage) {
  console.log("[LINE_REPLY_FLEX] start");
  console.log("[LINE_REPLY_FLEX] replyToken exists:", Boolean(replyToken));
  console.log("[LINE_REPLY_FLEX] altText:", flexMessage?.altText || "no-altText");

  try {
    const result = await client.replyMessage(replyToken, flexMessage);

    console.log("[LINE_REPLY_FLEX] success");
    return result;
  } catch (error) {
    console.error("[LINE_REPLY_FLEX] failed:", error?.message || error);
    console.error(
      "[LINE_REPLY_FLEX] error.response.data:",
      error?.response?.data || null,
    );
    throw error;
  }
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

  try {
    const result = await client.replyMessage(replyToken, messages);
    console.log("[LINE_REPLY_PAYMENT_QR] success");
    return result;
  } catch (error) {
    console.error("[LINE_REPLY_PAYMENT_QR] failed:", error?.message || error);
    throw error;
  }
}

/** Alias ตามสเปค — ส่ง text + image QR + text สลิป */
export async function replyPaymentInstructions(client, replyToken, opts) {
  return replyPaymentInstructionWithQr(client, replyToken, opts);
}
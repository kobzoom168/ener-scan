import { getPaymentState } from "../stores/manualPaymentAccess.store.js";
import { getBirthdateChangeFlowState } from "../stores/session.store.js";
import {
  ensurePaymentRefForPaymentId,
  getLatestAwaitingPaymentForLineUserId,
} from "../stores/payments.db.js";
import {
  BIRTHDATE_CHANGE_FLOW,
  pickBirthdateAskDateLine,
} from "../utils/birthdateChangeFlow.util.js";
import {
  buildAwaitingSlipReminderText,
  buildPendingVerifyReminderText,
  buildWaitingBirthdateGuidanceText,
} from "../utils/webhookText.util.js";
import { sendNonScanReply } from "../services/nonScanReply.gateway.js";

/**
 * LINE sometimes delivers sticker sends as plain text like "(content Cony)" or "(unwell Moon)".
 * Require parentheses, single line, and a loose "descriptor + name" shape to avoid matching arbitrary text.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isLineStickerPlaceholderText(text) {
  const raw = String(text || "").trim();
  if (!/^\([^)]{2,120}\)$/.test(raw)) return false;
  const inner = raw.slice(1, -1).trim();
  if (!inner || /[\r\n]/.test(inner)) return false;
  const parts = inner.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  const first = parts[0];
  const second = parts[1];
  // e.g. content / unwell / wailing / pleading + Cony / Moon
  if (!/^[a-z][a-z0-9]{1,24}$/.test(first)) return false;
  if (!/^[A-Z][a-zA-Z0-9]{1,24}$/.test(second)) return false;
  return true;
}

const IDLE_STICKER_LINES = [
  "ได้ครับ",
  "ส่งรูปมาได้เลย เดี๋ยวผมดูให้",
  "ถ้ามีชิ้นที่อยากให้ดู ส่งมาได้เลย",
];

function pickIdleStickerLine(userId) {
  const uid = String(userId || "");
  let h = 0;
  for (let i = 0; i < uid.length; i += 1) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return IDLE_STICKER_LINES[h % IDLE_STICKER_LINES.length];
}

/**
 * @param {object} opts
 * @param {*} opts.client
 * @param {*} opts.event — LINE webhook message event
 * @param {string} opts.userId
 * @param {object} opts.session
 * @param {"sticker"|"placeholder_text"} opts.source
 */
export async function handleStickerLikeInput(opts) {
  const { client, event, userId, session, source } = opts;
  const replyToken = event.replyToken;
  const uid = String(userId || "").trim();
  if (!uid || !replyToken) return;

  const replyType =
    source === "sticker" ? "sticker_input" : "sticker_placeholder_text";
  const semanticKey = "sticker_like_input";

  // awaiting_slip: remind slip
  if (getPaymentState(uid).state === "awaiting_slip") {
    let paymentRef = null;
    try {
      const row = await getLatestAwaitingPaymentForLineUserId(uid);
      if (row?.id) {
        paymentRef =
          row.payment_ref || (await ensurePaymentRefForPaymentId(row.id));
      }
    } catch (_) {
      paymentRef = null;
    }
    const text = await buildAwaitingSlipReminderText({ userId: uid, paymentRef });
    await sendNonScanReply({
      client,
      userId: uid,
      replyToken,
      replyType,
      semanticKey: "sticker_awaiting_slip",
      text,
      alternateTexts: [
        "ตอนนี้รอสลิปโอนอยู่นะครับ ส่งสลิปมาในแชทนี้ได้เลย",
      ],
    });
    return;
  }

  // pending_verify
  try {
    const row = await getLatestAwaitingPaymentForLineUserId(uid);
    if (row && String(row.status) === "pending_verify") {
      let paymentRef = null;
      try {
        paymentRef =
          row.payment_ref || (await ensurePaymentRefForPaymentId(row.id));
      } catch (_) {
        paymentRef = null;
      }
      const text = await buildPendingVerifyReminderText({
        userId: uid,
        paymentRef,
      });
      await sendNonScanReply({
        client,
        userId: uid,
        replyToken,
        replyType,
        semanticKey: "sticker_pending_verify",
        text,
        alternateTexts: [
          "รอแอดมินตรวจสลิปแป๊บนึงนะครับ ถ้ามีสลิปแล้วส่งมาได้เลย",
        ],
      });
      return;
    }
  } catch (_) {
    /* ignore */
  }

  // Profile flow: birthdate change (soft-detect + confirm; mirror image-handler hints)
  const bdFlow = getBirthdateChangeFlowState(uid);
  if (bdFlow) {
    let hint =
      "รบกวนตอบกลับเป็นข้อความก่อนนะครับ ถ้าถูก ตอบว่าใช่ หรือโอเค มาก็ได้";
    if (bdFlow === BIRTHDATE_CHANGE_FLOW.WAITING_DATE) {
      hint = pickBirthdateAskDateLine(uid);
    } else if (bdFlow === BIRTHDATE_CHANGE_FLOW.WAITING_FINAL_CONFIRM) {
      hint =
        "รบกวนตอบกลับเป็นข้อความยืนยันก่อนนะครับ ถ้าถูก ตอบว่าใช่ หรือโอเค มาก็ได้";
    }
    const text = hint;
    await sendNonScanReply({
      client,
      userId: uid,
      replyToken,
      replyType,
      semanticKey: "sticker_birthdate_change_flow",
      text,
      alternateTexts: [
        `${hint}\n\nลองบอกวันเกิดใหม่ตามรูปแบบ DD/MM/YYYY ได้เลยครับ`,
      ],
    });
    return;
  }

  // waiting_birthdate (pending scan image, not slip path)
  if (session?.pendingImage && getPaymentState(uid).state !== "awaiting_slip") {
    const text = await buildWaitingBirthdateGuidanceText(uid);
    await sendNonScanReply({
      client,
      userId: uid,
      replyToken,
      replyType,
      semanticKey: "sticker_waiting_birthdate",
      text,
      alternateTexts: [
        "รอวันเกิดก่อนสแกนนะครับ บอกเป็น DD/MM/YYYY ได้เลยครับ",
      ],
    });
    return;
  }

  const idle = pickIdleStickerLine(uid);
  await sendNonScanReply({
    client,
    userId: uid,
    replyToken,
    replyType,
    semanticKey: "sticker_idle",
    text: idle,
    alternateTexts: IDLE_STICKER_LINES.filter((l) => l !== idle),
  });
}

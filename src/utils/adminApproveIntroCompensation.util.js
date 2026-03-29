import { notifyLineUserTextAfterAdminAction } from "./lineNotify429Retry.util.js";
import {
  clearPendingApprovedIntroCompensation,
  getPendingApprovedIntroCompensation,
  setPendingApprovedIntroCompensation,
} from "../stores/session.store.js";

/**
 * Push-only retry path for queued approved-intro text (does not use inbound replyToken).
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.userId
 */
export async function maybeFlushPendingApprovedIntroCompensation({
  client,
  userId,
}) {
  const uid = String(userId || "").trim();
  if (!uid) return;

  try {
    const pending = getPendingApprovedIntroCompensation(uid);
    if (!pending?.text) return;

    clearPendingApprovedIntroCompensation(uid);

    let result;
    try {
      result = await notifyLineUserTextAfterAdminAction({
        client,
        lineUserId: uid,
        text: pending.text,
        replyToken: null,
        eventTag: "APPROVE_PENDING_INTRO",
        logPrefix: "[APPROVE_PENDING_INTRO]",
      });
    } catch (err) {
      setPendingApprovedIntroCompensation(uid, {
        text: pending.text,
        paymentId: pending.paymentId,
        createdAt: pending.createdAt,
      });
      console.log(
        JSON.stringify({
          event: "APPROVE_PENDING_INTRO_REQUEUED",
          reason: "notify_threw",
          paymentId: pending.paymentId ?? null,
          lineUserIdPrefix: uid.slice(0, 8),
          message: err && typeof err === "object" && "message" in err ? String(/** @type {{ message?: unknown }} */ (err).message) : String(err),
        }),
      );
      return;
    }

    if (result.userNotified) {
      console.log(
        JSON.stringify({
          event: "APPROVE_PENDING_INTRO_PUSH_OK",
          paymentId: pending.paymentId ?? null,
          lineUserIdPrefix: uid.slice(0, 8),
          attempts: result.attempts,
        }),
      );
      return;
    }

    setPendingApprovedIntroCompensation(uid, {
      text: pending.text,
      paymentId: pending.paymentId,
      createdAt: pending.createdAt,
    });
    console.log(
      JSON.stringify({
        event: "APPROVE_PENDING_INTRO_REQUEUED",
        paymentId: pending.paymentId ?? null,
        lineUserIdPrefix: uid.slice(0, 8),
        notifyError: result.notifyError,
        attempts: result.attempts,
        is429: result.is429,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "APPROVE_PENDING_INTRO_FLUSH_UNHANDLED",
        lineUserIdPrefix: uid.slice(0, 8),
        message:
          err && typeof err === "object" && "message" in err
            ? String(/** @type {{ message?: unknown }} */ (err).message)
            : String(err),
      }),
    );
  }
}

import {
  clearPendingApprovedIntroCompensation,
  getPendingApprovedIntroCompensation,
} from "../stores/session.store.js";
import { enqueuePendingIntroMessage } from "../services/scanV2/outboundAdminEnqueue.service.js";

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

    console.log(
      JSON.stringify({
        event: "APPROVE_PENDING_INTRO_FLUSH_START",
        lineUserIdPrefix: uid.slice(0, 8),
        paymentId: pending.paymentId ?? null,
      }),
    );

    let enqueuedId = null;
    try {
      const enq = await enqueuePendingIntroMessage({
        lineUserId: uid,
        paymentId: pending.paymentId ?? null,
        text: pending.text,
        createdAt: pending.createdAt,
      });
      enqueuedId = enq?.id ?? null;
    } catch (err) {
      console.log(
        JSON.stringify({
          event: "APPROVE_PENDING_INTRO_ENQUEUE_FAILED",
          reason: "enqueue_threw",
          paymentId: pending.paymentId ?? null,
          lineUserIdPrefix: uid.slice(0, 8),
          message:
            err && typeof err === "object" && "message" in err
              ? String(/** @type {{ message?: unknown }} */ (err).message)
              : String(err),
        }),
      );
      return;
    }

    clearPendingApprovedIntroCompensation(uid);

    console.log(
      JSON.stringify({
        event: "APPROVE_PENDING_INTRO_QUEUED",
        paymentId: pending.paymentId ?? null,
        lineUserIdPrefix: uid.slice(0, 8),
        outboundIdPrefix: enqueuedId ? String(enqueuedId).slice(0, 8) : null,
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

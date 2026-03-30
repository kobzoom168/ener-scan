import { pushText } from "../lineSequenceReply.service.js";
import { sendScanResultPushWith429Retry } from "../../utils/linePush429Retry.util.js";
import {
  isLine429Error,
  notifyLineUserTextAfterAdminAction,
} from "../../utils/lineNotify429Retry.util.js";
import { invokeLinePushMessage } from "../../utils/lineClientTransport.util.js";
import { updateOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import { getScanJobById, updateScanJob } from "../../stores/scanV2/scanJobs.db.js";
import { decrementUserPaidRemainingScans } from "../../stores/paymentAccess.db.js";
import {
  OUTBOUND_BACKOFF_MS,
  OUTBOUND_MAX_ATTEMPTS,
} from "../../stores/scanV2/outboundPriority.js";

/**
 * @param {*} client LINE SDK client
 * @param {object} msg outbound_messages row
 * @returns {Promise<{ sent: boolean, is429?: boolean, errorCode?: string, errorMessage?: string }>}
 */
export async function deliverOutboundMessage(client, msg) {
  const id = msg.id;
  const lineUserId = msg.line_user_id;
  const kind = msg.kind;
  const payload =
    msg.payload_json && typeof msg.payload_json === "object"
      ? msg.payload_json
      : {};

  console.log(
    JSON.stringify({
      event: "OUTBOUND_SEND_START",
      outboundIdPrefix: String(id).slice(0, 8),
      kind,
      lineUserIdPrefix: String(lineUserId).slice(0, 8),
      attempt: msg.attempt_count,
    }),
  );

  try {
    if (kind === "pre_scan_ack") {
      const text = String(payload.text || "").trim();
      if (!text) {
        return {
          sent: false,
          errorCode: "empty_payload",
          errorMessage: "pre_scan_ack missing text",
        };
      }
      await pushText(client, lineUserId, text);
      await markSent(id);
      console.log(
        JSON.stringify({
          event: "OUTBOUND_SEND_SUCCESS",
          outboundIdPrefix: String(id).slice(0, 8),
          kind,
        }),
      );
      return { sent: true };
    }

    if (kind === "scan_result") {
      if (payload.error) {
        const t = String(payload.text || "").trim() || "ขออภัยครับ ลองส่งรูปใหม่ได้เลย";
        await pushText(client, lineUserId, t);
        await markSent(id);
        console.log(
          JSON.stringify({
            event: "OUTBOUND_SEND_SUCCESS",
            outboundIdPrefix: String(id).slice(0, 8),
            kind: "scan_result_error_text",
          }),
        );
        return { sent: true };
      }

      const flex = payload.flex ?? null;
      const text = String(payload.text || "");
      const delivery = await sendScanResultPushWith429Retry({
        client,
        userId: lineUserId,
        flexMessage: flex,
        text,
        logPrefix: "[SCAN_V2_DELIVERY]",
      });

      if (delivery.sent) {
        await markSent(id);
        await handleScanResultPostDelivery(msg, payload);
        console.log(
          JSON.stringify({
            event: "OUTBOUND_SEND_SUCCESS",
            outboundIdPrefix: String(id).slice(0, 8),
            kind: "scan_result",
            method: delivery.method,
          }),
        );
        return { sent: true };
      }

      if (delivery.is429) {
        console.warn(
          JSON.stringify({
            event: "LINE_RATE_LIMIT_HIT",
            outboundIdPrefix: String(id).slice(0, 8),
            kind: "scan_result",
          }),
        );
        return { sent: false, is429: true, errorCode: "line_429" };
      }

      return {
        sent: false,
        errorCode: "line_send_failed",
        errorMessage: delivery.finalMessage || "push_failed",
      };
    }

    if (
      kind === "approve_notify" ||
      kind === "reject_notify" ||
      kind === "pending_intro"
    ) {
      const text = String(payload.text || "").trim();
      if (!text) {
        return {
          sent: false,
          errorCode: "empty_payload",
          errorMessage: `${kind} missing text`,
        };
      }
      const replyToken =
        kind === "approve_notify" && payload.replyToken
          ? String(payload.replyToken).trim()
          : null;
      const tag =
        kind === "approve_notify"
          ? "OUTBOUND_APPROVE_NOTIFY"
          : kind === "reject_notify"
            ? "OUTBOUND_REJECT_NOTIFY"
            : "OUTBOUND_PENDING_INTRO";
      const r = await notifyLineUserTextAfterAdminAction({
        client,
        lineUserId,
        text,
        replyToken: replyToken || null,
        eventTag: tag,
        logPrefix: "[OUTBOUND_ADMIN_TEXT]",
      });
      if (r.userNotified) {
        await markSent(id);
        console.log(
          JSON.stringify({
            event: "OUTBOUND_SEND_SUCCESS",
            outboundIdPrefix: String(id).slice(0, 8),
            kind,
            channel: r.channel,
            attempts: r.attempts,
          }),
        );
        return { sent: true };
      }
      if (r.is429) {
        console.warn(
          JSON.stringify({
            event: "LINE_RATE_LIMIT_HIT",
            outboundIdPrefix: String(id).slice(0, 8),
            kind,
          }),
        );
        return {
          sent: false,
          is429: true,
          errorCode: "line_429",
        };
      }
      return {
        sent: false,
        errorCode: r.notifyError || "line_send_failed",
        errorMessage: r.finalMessage || "notify_failed",
      };
    }

    if (kind === "payment_qr") {
      const imageUrl = String(payload.imageUrl || "").trim();
      const text = String(payload.text || "").trim();
      try {
        if (imageUrl) {
          await invokeLinePushMessage(
            client,
            "outbound.payment_qr.image",
            lineUserId,
            {
              type: "image",
              originalContentUrl: imageUrl,
              previewImageUrl: imageUrl,
            },
          );
        }
        if (text) {
          await invokeLinePushMessage(
            client,
            "outbound.payment_qr.text",
            lineUserId,
            { type: "text", text: text.slice(0, 4900) },
          );
        }
        if (!imageUrl && !text) {
          return {
            sent: false,
            errorCode: "empty_payload",
            errorMessage: "payment_qr missing text and imageUrl",
          };
        }
        await markSent(id);
        console.log(
          JSON.stringify({
            event: "OUTBOUND_SEND_SUCCESS",
            outboundIdPrefix: String(id).slice(0, 8),
            kind: "payment_qr",
            hasImage: Boolean(imageUrl),
            hasText: Boolean(text),
          }),
        );
        return { sent: true };
      } catch (err) {
        if (isLine429Error(err)) {
          console.warn(
            JSON.stringify({
              event: "LINE_RATE_LIMIT_HIT",
              outboundIdPrefix: String(id).slice(0, 8),
              kind: "payment_qr",
            }),
          );
          return { sent: false, is429: true, errorCode: "line_429" };
        }
        return {
          sent: false,
          errorCode: "line_send_failed",
          errorMessage: String(err?.message || err),
        };
      }
    }

    const fallback = String(payload.text || "").trim();
    if (fallback) {
      await pushText(client, lineUserId, fallback);
      await markSent(id);
      console.log(
        JSON.stringify({
          event: "OUTBOUND_SEND_SUCCESS",
          outboundIdPrefix: String(id).slice(0, 8),
          kind,
          note: "generic_text",
        }),
      );
      return { sent: true };
    }

    return { sent: false, errorCode: "unknown_kind", errorMessage: String(kind) };
  } catch (err) {
    const is429 = isLine429Error(err);
    if (is429) {
      console.warn(
        JSON.stringify({
          event: "LINE_RATE_LIMIT_HIT",
          outboundIdPrefix: String(id).slice(0, 8),
          kind,
          thrown: true,
        }),
      );
      return { sent: false, is429: true, errorCode: "line_429" };
    }
    return {
      sent: false,
      errorCode: "unexpected",
      errorMessage: String(err?.message || err),
    };
  }
}

/**
 * @param {string} id
 * @param {object} msg full row
 * @param {object} payload
 */
async function handleScanResultPostDelivery(msg, payload) {
  const jobId = msg.related_job_id;
  if (!jobId || payload.error) return;

  const job = await getScanJobById(jobId);
  if (!job) return;

  await updateScanJob(jobId, {
    status: "delivered",
    updated_at: new Date().toISOString(),
  });

  if (job.access_source === "paid" && job.app_user_id) {
    try {
      await decrementUserPaidRemainingScans(job.app_user_id);
      console.log(
        JSON.stringify({
          event: "QUOTA_DECREMENT_AFTER_DELIVERY_OK",
          jobIdPrefix: String(jobId).slice(0, 8),
          appUserIdPrefix: String(job.app_user_id).slice(0, 8),
        }),
      );
    } catch (e) {
      console.error(
        JSON.stringify({
          event: "QUOTA_DECREMENT_AFTER_DELIVERY_FAILED",
          jobIdPrefix: String(jobId).slice(0, 8),
          message: e?.message,
        }),
      );
    }
  }
}

async function markSent(id) {
  await updateOutboundMessage(id, {
    status: "sent",
    sent_at: new Date().toISOString(),
    last_error_code: null,
    last_error_message: null,
    next_retry_at: null,
    updated_at: new Date().toISOString(),
  });
}

/**
 * @param {string} id
 * @param {object} msg
 * @param {{ sent: boolean, is429?: boolean }} result
 */
export async function finalizeOutboundAttempt(id, msg, result) {
  const kind = msg.kind;
  const max = OUTBOUND_MAX_ATTEMPTS[kind] ?? 5;

  if (result.sent) return;

  if (result.is429) {
    const nextAttempt = (msg.attempt_count || 0);
    if (nextAttempt >= max) {
      await updateOutboundMessage(id, {
        status: "dead",
        last_error_code: "line_429",
        last_error_message: "max_attempts",
        updated_at: new Date().toISOString(),
      });
      console.error(
        JSON.stringify({
          event: "OUTBOUND_SEND_FAILED",
          outboundIdPrefix: String(id).slice(0, 8),
          reason: "max_429",
          kind,
        }),
      );
      return;
    }

    const backoff =
      OUTBOUND_BACKOFF_MS[Math.min(nextAttempt - 1, OUTBOUND_BACKOFF_MS.length - 1)] ??
      40000;
    const next = new Date(Date.now() + backoff).toISOString();
    await updateOutboundMessage(id, {
      status: "retry_wait",
      next_retry_at: next,
      last_error_code: "line_429",
      last_error_message: "rate_limit",
      updated_at: new Date().toISOString(),
    });
    console.warn(
      JSON.stringify({
        event: "OUTBOUND_SEND_RETRY",
        outboundIdPrefix: String(id).slice(0, 8),
        kind,
        nextRetryAt: next,
        backoffMs: backoff,
      }),
    );
    return;
  }

  await updateOutboundMessage(id, {
    status: "failed",
    last_error_code: result.errorCode || "send_failed",
    last_error_message: String(result.errorMessage || "").slice(0, 2000),
    updated_at: new Date().toISOString(),
  });
  console.error(
    JSON.stringify({
      event: "OUTBOUND_SEND_FAILED",
      outboundIdPrefix: String(id).slice(0, 8),
      code: result.errorCode || "send_failed",
    }),
  );
}

import { randomBetween } from "./timing.util.js";
import { logLineTransportError, serializeLineErrorSafe } from "./lineErrorLog.util.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * LINE Messaging / HTTP client errors that indicate rate limit.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isLine429Error(err) {
  if (!err || typeof err !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (err);
  const status =
    (typeof o.statusCode === "number" ? o.statusCode : null) ??
    (typeof o.status === "number" ? o.status : null) ??
    /** @type {{ status?: number }} */ (o.response)?.status;
  if (status === 429) return true;
  const msg = String(o.message || "").toLowerCase();
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests"))
    return true;
  return false;
}

/**
 * @param {object} p
 * @param {boolean} p.userNotified
 * @param {'reply' | 'push'} p.channel
 * @param {number} p.attempts
 * @param {string | null} p.notifyError
 * @param {unknown} [p.lastError]
 */
function finalizeNotifyResult({ userNotified, channel, attempts, notifyError, lastError }) {
  const safe =
    lastError && typeof lastError === "object"
      ? serializeLineErrorSafe(lastError)
      : { message: null, status: null };
  const statusVal = /** @type {{ status?: number | null }} */ (safe).status;
  /** @type {Record<string, unknown>} */
  const out = {
    userNotified,
    channel,
    attempts,
    notifyError,
    sent: userNotified,
    method: channel,
    finalStatus:
      userNotified
        ? null
        : typeof statusVal === "number"
          ? statusVal
          : null,
    finalMessage: userNotified
      ? null
      : typeof safe.message === "string"
        ? safe.message
        : String(safe.message ?? ""),
    is429: Boolean(!userNotified && lastError && isLine429Error(lastError)),
  };
  if (lastError !== undefined && lastError !== null) {
    out.lastError = lastError;
  }
  return /** @type {typeof out & { lastError?: unknown }} */ (out);
}

/**
 * Notify a user by text: optional one-shot reply, then push with 429-aware retries.
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.lineUserId
 * @param {string} opts.text
 * @param {string | null | undefined} opts.replyToken
 * @param {string} [opts.logPrefix]
 * @param {string | null} [opts.eventTag] e.g. "ADMIN_APPROVE_NOTIFY" — emits *_RETRY / *_SUCCESS / *_FAILED and safe transport errors
 * @returns {Promise<{
 *   userNotified: boolean,
 *   channel: 'reply' | 'push',
 *   attempts: number,
 *   notifyError: string | null,
 *   lastError?: unknown,
 *   sent: boolean,
 *   method: 'reply' | 'push',
 *   finalStatus: number | null,
 *   finalMessage: string | null,
 *   is429: boolean
 * }>}
 */
export async function notifyLineUserTextAfterAdminAction({
  client,
  lineUserId,
  text,
  replyToken = null,
  logPrefix = "[ADMIN_LINE_NOTIFY]",
  eventTag = null,
}) {
  const uid = String(lineUserId || "").trim();
  const safeText = String(text || "").slice(0, 4900);
  const tag = typeof eventTag === "string" && eventTag.trim() ? eventTag.trim() : null;
  if (!uid) {
    return finalizeNotifyResult({
      userNotified: false,
      channel: "push",
      attempts: 0,
      notifyError: "missing_line_user_id",
    });
  }

  const payload = { type: "text", text: safeText };
  const rt = String(replyToken || "").trim();

  async function pushWith429Retries() {
    const backoffs = [800, 1600];
    /** @type {unknown} */
    let lastErr = null;
    for (let i = 0; i < 3; i += 1) {
      try {
        if (!tag) {
          console.log(
            JSON.stringify({
              event: `${logPrefix}_push_attempt`,
              attempt: i + 1,
              lineUserIdPrefix: uid.slice(0, 8),
            }),
          );
        }
        await client.pushMessage(uid, payload);
        if (tag) {
          console.log(
            JSON.stringify({
              event: `${tag}_SUCCESS`,
              channel: "push",
              attempt: i + 1,
              lineUserIdPrefix: uid.slice(0, 8),
            }),
          );
        } else {
          console.log(
            JSON.stringify({
              event: `${logPrefix}_push_ok`,
              attempt: i + 1,
              lineUserIdPrefix: uid.slice(0, 8),
            }),
          );
        }
        return finalizeNotifyResult({
          userNotified: true,
          channel: /** @type {"push"} */ ("push"),
          attempts: i + 1,
          notifyError: null,
        });
      } catch (err) {
        lastErr = err;
        const is429 = isLine429Error(err);
        if (!tag) {
          console.error(
            JSON.stringify({
              event: `${logPrefix}_push_failed`,
              attempt: i + 1,
              is429,
              message: /** @type {{ message?: string }} */ (err)?.message,
              status:
                /** @type {{ status?: number }} */ (err)?.status ??
                /** @type {{ response?: { status?: number } }} */ (err)?.response?.status,
            }),
          );
        }
        if (!is429 || i >= 2) {
          if (tag) {
            logLineTransportError("admin_approve_notify_push", err);
            console.error(
              JSON.stringify({
                event: `${tag}_FAILED`,
                channel: "push",
                attempt: i + 1,
                notifyError: is429 ? "line_429" : "line_send_failed",
                is429,
                lineUserIdPrefix: uid.slice(0, 8),
              }),
            );
          }
          return finalizeNotifyResult({
            userNotified: false,
            channel: "push",
            attempts: i + 1,
            notifyError: is429 ? "line_429" : "line_send_failed",
            lastError: err,
          });
        }
        const waitMs = backoffs[i] ?? 1600;
        if (tag) {
          console.warn(
            JSON.stringify({
              event: `${tag}_RETRY`,
              waitMs,
              nextAttempt: i + 2,
              lineUserIdPrefix: uid.slice(0, 8),
            }),
          );
        } else {
          console.warn(
            JSON.stringify({
              event: `${logPrefix}_429_retry_wait`,
              waitMs,
              nextAttempt: i + 2,
              lineUserIdPrefix: uid.slice(0, 8),
            }),
          );
        }
        await sleep(waitMs);
      }
    }
    if (tag && lastErr) {
      logLineTransportError("admin_approve_notify_push", lastErr);
      console.error(
        JSON.stringify({
          event: `${tag}_FAILED`,
          channel: "push",
          attempts: 3,
          notifyError: "line_429",
          is429: true,
          lineUserIdPrefix: uid.slice(0, 8),
        }),
      );
    }
    return finalizeNotifyResult({
      userNotified: false,
      channel: "push",
      attempts: 3,
      notifyError: "line_429",
      lastError: lastErr,
    });
  }

  if (rt) {
    try {
      if (!tag) {
        console.log(
          JSON.stringify({
            event: `${logPrefix}_reply_attempt`,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
      }
      await client.replyMessage(rt, payload);
      if (tag) {
        console.log(
          JSON.stringify({
            event: `${tag}_SUCCESS`,
            channel: "reply",
            lineUserIdPrefix: uid.slice(0, 8),
            attempts: 1,
          }),
        );
      } else {
        console.log(
          JSON.stringify({
            event: `${logPrefix}_reply_ok`,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
      }
      return finalizeNotifyResult({
        userNotified: true,
        channel: "reply",
        attempts: 1,
        notifyError: null,
      });
    } catch (err) {
      if (tag) {
        logLineTransportError("admin_approve_notify_reply", err);
      }
      console.error(
        JSON.stringify(
          tag
            ? {
                event: `${tag}_REPLY_FALLBACK_PUSH`,
                lineUserIdPrefix: uid.slice(0, 8),
                is429: isLine429Error(err),
                ...serializeLineErrorSafe(err),
              }
            : {
                event: `${logPrefix}_reply_failed`,
                lineUserIdPrefix: uid.slice(0, 8),
                is429: isLine429Error(err),
                message: /** @type {{ message?: string }} */ (err)?.message,
                status:
                  /** @type {{ status?: number }} */ (err)?.status ??
                  /** @type {{ response?: { status?: number } }} */ (err)?.response?.status,
              },
        ),
      );
    }
  }

  const jitterMs = randomBetween(300, 500);
  if (!tag) {
    console.log(
      JSON.stringify({
        event: `${logPrefix}_push_jitter`,
        ms: jitterMs,
        lineUserIdPrefix: uid.slice(0, 8),
      }),
    );
  }
  await sleep(jitterMs);
  return pushWith429Retries();
}

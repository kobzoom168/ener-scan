import { randomBetween } from "./timing.util.js";

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
 * Notify a user by text: optional one-shot reply, then push with 429-aware retries.
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.lineUserId
 * @param {string} opts.text
 * @param {string | null | undefined} opts.replyToken
 * @param {string} [opts.logPrefix]
 * @returns {Promise<{
 *   userNotified: boolean,
 *   channel: 'reply' | 'push',
 *   attempts: number,
 *   notifyError: string | null,
 *   lastError?: unknown
 * }>}
 */
export async function notifyLineUserTextAfterAdminAction({
  client,
  lineUserId,
  text,
  replyToken = null,
  logPrefix = "[ADMIN_LINE_NOTIFY]",
}) {
  const uid = String(lineUserId || "").trim();
  const safeText = String(text || "").slice(0, 4900);
  if (!uid) {
    return {
      userNotified: false,
      channel: "push",
      attempts: 0,
      notifyError: "missing_line_user_id",
    };
  }

  const payload = { type: "text", text: safeText };
  const rt = String(replyToken || "").trim();

  async function pushWith429Retries() {
    const backoffs = [800, 1600];
    /** @type {unknown} */
    let lastErr = null;
    for (let i = 0; i < 3; i += 1) {
      try {
        console.log(
          JSON.stringify({
            event: `${logPrefix}_push_attempt`,
            attempt: i + 1,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
        await client.pushMessage(uid, payload);
        console.log(
          JSON.stringify({
            event: `${logPrefix}_push_ok`,
            attempt: i + 1,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
        return {
          userNotified: true,
          channel: /** @type {"push"} */ ("push"),
          attempts: i + 1,
          notifyError: null,
        };
      } catch (err) {
        lastErr = err;
        const is429 = isLine429Error(err);
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
        if (!is429 || i >= 2) {
          return {
            userNotified: false,
            channel: "push",
            attempts: i + 1,
            notifyError: is429 ? "line_429" : "line_notify_failed",
            lastError: err,
          };
        }
        const waitMs = backoffs[i] ?? 1600;
        console.warn(
          JSON.stringify({
            event: `${logPrefix}_429_retry_wait`,
            waitMs,
            nextAttempt: i + 2,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
        await sleep(waitMs);
      }
    }
    return {
      userNotified: false,
      channel: "push",
      attempts: 3,
      notifyError: "line_429",
      lastError: lastErr,
    };
  }

  if (rt) {
    try {
      console.log(
        JSON.stringify({
          event: `${logPrefix}_reply_attempt`,
          lineUserIdPrefix: uid.slice(0, 8),
        }),
      );
      await client.replyMessage(rt, payload);
      console.log(
        JSON.stringify({
          event: `${logPrefix}_reply_ok`,
          lineUserIdPrefix: uid.slice(0, 8),
        }),
      );
      return {
        userNotified: true,
        channel: "reply",
        attempts: 1,
        notifyError: null,
      };
    } catch (err) {
      console.error(
        JSON.stringify({
          event: `${logPrefix}_reply_failed`,
          lineUserIdPrefix: uid.slice(0, 8),
          is429: isLine429Error(err),
          message: /** @type {{ message?: string }} */ (err)?.message,
          status:
            /** @type {{ status?: number }} */ (err)?.status ??
            /** @type {{ response?: { status?: number } }} */ (err)?.response?.status,
        }),
      );
    }
  }

  const jitterMs = randomBetween(300, 500);
  console.log(
    JSON.stringify({
      event: `${logPrefix}_push_jitter`,
      ms: jitterMs,
      lineUserIdPrefix: uid.slice(0, 8),
    }),
  );
  await sleep(jitterMs);
  return pushWith429Retries();
}

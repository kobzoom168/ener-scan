import { randomBetween } from "./timing.util.js";
import { isLine429Error } from "./lineNotify429Retry.util.js";
import { serializeLineErrorSafe } from "./lineErrorLog.util.js";
import { replyFlex } from "../services/lineReply.service.js";
import {
  invokeLinePushMessage,
  invokeLineReplyMessage,
} from "./lineClientTransport.util.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract HTTP status from LINE client errors.
 * @param {unknown} err
 * @returns {number | null}
 */
function lineErrorStatus(err) {
  if (!err || typeof err !== "object") return null;
  const o = /** @type {{ statusCode?: number; status?: number; response?: { status?: number } }} */ (
    err
  );
  return (
    (typeof o.statusCode === "number" ? o.statusCode : null) ??
    (typeof o.status === "number" ? o.status : null) ??
    o.response?.status ??
    null
  );
}

/**
 * Extract message string from errors.
 * @param {unknown} err
 * @returns {string | null}
 */
function lineErrorMessage(err) {
  if (!err) return null;
  if (typeof err === "object" && "message" in err) {
    const m = /** @type {{ message?: unknown }} */ (err).message;
    if (typeof m === "string") return m;
  }
  return String(err);
}

/**
 * Push flex or text to a LINE user with jitter and 429-aware retries (3 attempts, 800ms / 1600ms backoff).
 *
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.userId
 * @param {Record<string, unknown>} [opts.flexMessage]
 * @param {string} [opts.text] — plain text body (used as fallback if flex fails or omitted)
 * @param {string} [opts.logPrefix]
 * @returns {Promise<{
 *   sent: boolean,
 *   method: "push_flex" | "push_text",
 *   attempts: number,
 *   finalStatus: number | null,
 *   finalMessage: string | null,
 *   is429: boolean,
 * }>}
 */
export async function sendScanResultPushWith429Retry({
  client,
  userId,
  flexMessage = null,
  text = "",
  logPrefix = "[SCAN_RESULT_LINE_PUSH]",
}) {
  const uid = String(userId || "").trim();
  const safeText = String(text || "").slice(0, 4900);

  const emptyResult = {
    sent: false,
    method: /** @type {"push_text"} */ ("push_text"),
    attempts: 0,
    finalStatus: null,
    finalMessage: uid ? "missing_content" : "missing_line_user_id",
    is429: false,
  };

  if (!uid) {
    return emptyResult;
  }

  const hasFlex = flexMessage && typeof flexMessage === "object";
  if (!hasFlex && !safeText) {
    return emptyResult;
  }

  let totalAttempts = 0;

  /**
   * @param {unknown} payload
   * @param {"push_flex" | "push_text"} method
   */
  async function pushWithRetries(payload, method) {
    const backoffs = [5000, 10000];
    /** @type {unknown} */
    let lastErr = null;

    const jitterMs = randomBetween(300, 500);
    console.log(
      JSON.stringify({
        event: `${logPrefix}_jitter`,
        ms: jitterMs,
        method,
        lineUserIdPrefix: uid.slice(0, 8),
      }),
    );
    await sleep(jitterMs);

    for (let i = 0; i < 3; i += 1) {
      totalAttempts += 1;
      try {
        console.log(
          JSON.stringify({
            event: `${logPrefix}_attempt`,
            attempt: i + 1,
            method,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
        await invokeLinePushMessage(
          client,
          "scanResult.pushWith429Retry",
          uid,
          payload,
        );
        console.log(
          JSON.stringify({
            event: `${logPrefix}_ok`,
            attempt: i + 1,
            method,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
        return {
          sent: true,
          method,
          attempts: totalAttempts,
          finalStatus: null,
          finalMessage: null,
          is429: false,
        };
      } catch (err) {
        lastErr = err;
        const is429 = isLine429Error(err);
        console.error(
          JSON.stringify({
            event: `${logPrefix}_failed`,
            attempt: i + 1,
            method,
            is429,
            lineUserIdPrefix: uid.slice(0, 8),
            ...serializeLineErrorSafe(err),
          }),
        );
        if (!is429 || i >= 2) {
          return {
            sent: false,
            method,
            attempts: totalAttempts,
            finalStatus: lineErrorStatus(err),
            finalMessage: lineErrorMessage(err),
            is429,
          };
        }
        const waitMs = backoffs[i] ?? 1600;
        console.warn(
          JSON.stringify({
            event: `${logPrefix}_429_retry_wait`,
            waitMs,
            nextAttempt: i + 2,
            method,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
        await sleep(waitMs);
      }
    }
    return {
      sent: false,
      method,
      attempts: totalAttempts,
      finalStatus: lineErrorStatus(lastErr),
      finalMessage: lineErrorMessage(lastErr),
      is429: isLine429Error(lastErr),
    };
  }

  if (hasFlex) {
    const flexRes = await pushWithRetries(flexMessage, "push_flex");
    if (flexRes.sent) return flexRes;
    if (!safeText) return flexRes;
    const textPayload = { type: "text", text: safeText };
    const textRes = await pushWithRetries(textPayload, "push_text");
    return textRes;
  }

  const textPayload = /** @type {{ type: 'text', text: string }} */ ({
    type: "text",
    text: safeText,
  });
  return pushWithRetries(textPayload, "push_text");
}

/**
 * Reply with flex (or text fallback) using webhook replyToken — jitter + 429-aware retries (3 attempts, 800ms / 1600ms).
 * Uses one `replyMessage` call per attempt; flex failure may fall back to a text reply (second batch only if flex attempts exhausted).
 *
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.replyToken
 * @param {string} opts.userId
 * @param {Record<string, unknown>} [opts.flexMessage]
 * @param {string} [opts.text]
 * @param {string} [opts.logPrefix]
 * @returns {Promise<{
 *   sent: boolean,
 *   method: "reply_flex" | "reply_text",
 *   attempts: number,
 *   finalStatus: number | null,
 *   finalMessage: string | null,
 *   is429: boolean,
 * }>}
 */
export async function sendScanResultReplyWith429Retry({
  client,
  replyToken,
  userId,
  flexMessage = null,
  text = "",
  logPrefix = "[SCAN_RESULT_LINE_REPLY]",
}) {
  const rt = String(replyToken || "").trim();
  const uid = String(userId || "").trim();
  const safeText = String(text || "").slice(0, 4900);

  const emptyResult = {
    sent: false,
    method: /** @type {"reply_text"} */ ("reply_text"),
    attempts: 0,
    finalStatus: null,
    finalMessage: !rt ? "missing_reply_token" : !uid ? "missing_line_user_id" : "missing_content",
    is429: false,
  };

  if (!rt || !uid) {
    return emptyResult;
  }

  const hasFlex = flexMessage && typeof flexMessage === "object";
  if (!hasFlex && !safeText) {
    return emptyResult;
  }

  let totalAttempts = 0;

  /**
   * @param {unknown[]} messages
   * @param {"reply_flex" | "reply_text"} method
   */
  async function replyWithRetries(messages, method) {
    const backoffs = [3000, 6000];
    /** @type {unknown} */
    let lastErr = null;

    const jitterMs = randomBetween(300, 500);
    console.log(
      JSON.stringify({
        event: `${logPrefix}_jitter`,
        ms: jitterMs,
        method,
        lineUserIdPrefix: uid.slice(0, 8),
      }),
    );
    await sleep(jitterMs);

    for (let i = 0; i < 3; i += 1) {
      totalAttempts += 1;
      try {
        console.log(
          JSON.stringify({
            event: `${logPrefix}_attempt`,
            attempt: i + 1,
            method,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
        const single = messages.length === 1 ? messages[0] : null;
        if (single && typeof single === "object" && single.type === "flex") {
          await replyFlex(client, rt, single);
        } else {
          await invokeLineReplyMessage(
            client,
            "scanResult.replyWith429Retry",
            rt,
            messages,
          );
        }
        console.log(
          JSON.stringify({
            event: `${logPrefix}_ok`,
            attempt: i + 1,
            method,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
        return {
          sent: true,
          method,
          attempts: totalAttempts,
          finalStatus: null,
          finalMessage: null,
          is429: false,
        };
      } catch (err) {
        lastErr = err;
        const is429 = isLine429Error(err);
        console.error(
          JSON.stringify({
            event: `${logPrefix}_failed`,
            attempt: i + 1,
            method,
            is429,
            lineUserIdPrefix: uid.slice(0, 8),
            ...serializeLineErrorSafe(err),
          }),
        );
        if (!is429 || i >= 2) {
          return {
            sent: false,
            method,
            attempts: totalAttempts,
            finalStatus: lineErrorStatus(err),
            finalMessage: lineErrorMessage(err),
            is429,
          };
        }
        const waitMs = backoffs[i] ?? 1600;
        console.warn(
          JSON.stringify({
            event: `${logPrefix}_429_retry_wait`,
            waitMs,
            nextAttempt: i + 2,
            method,
            lineUserIdPrefix: uid.slice(0, 8),
          }),
        );
        await sleep(waitMs);
      }
    }
    return {
      sent: false,
      method,
      attempts: totalAttempts,
      finalStatus: lineErrorStatus(lastErr),
      finalMessage: lineErrorMessage(lastErr),
      is429: isLine429Error(lastErr),
    };
  }

  if (hasFlex) {
    const flexRes = await replyWithRetries([flexMessage], "reply_flex");
    if (flexRes.sent) return flexRes;
    if (!safeText) return flexRes;
    const textMsgs = /** @type {unknown[]} */ ([{ type: "text", text: safeText }]);
    const textRes = await replyWithRetries(textMsgs, "reply_text");
    return textRes;
  }

  const textMsgs = /** @type {unknown[]} */ ([{ type: "text", text: safeText }]);
  return replyWithRetries(textMsgs, "reply_text");
}

/**
 * Admin / low-volume push: one attempt, on 429 wait 3s and retry once. Non-429 errors rethrow.
 * @param {*} client
 * @param {string} userId
 * @param {unknown} messagePayload e.g. { type: "text", text }
 * @returns {Promise<{ ok: boolean, attempts: number, lastError?: unknown, lastIs429?: boolean }>}
 */
export async function tryLinePushMessageWith429RetryOnce(
  client,
  userId,
  messagePayload,
) {
  const uid = String(userId || "").trim();
  if (!uid) {
    throw new Error("tryLinePushMessageWith429RetryOnce_missing_userId");
  }
  try {
    await invokeLinePushMessage(
      client,
      "admin.tryLinePush429.attempt1",
      uid,
      messagePayload,
    );
    console.log(
      JSON.stringify({
        event: "ADMIN_APPROVE_PUSH_OK",
        lineUserIdPrefix: uid.slice(0, 8),
        attempt: 1,
      }),
    );
    return { ok: true, attempts: 1 };
  } catch (err) {
    if (!isLine429Error(err)) {
      throw err;
    }
    console.log(
      JSON.stringify({
        event: "ADMIN_PUSH_RETRY",
        reason: "429",
        waitMs: 30000,
        lineUserIdPrefix: uid.slice(0, 8),
      }),
    );
    await new Promise((r) => setTimeout(r, 30000));
    try {
      await invokeLinePushMessage(
        client,
        "admin.tryLinePush429.attempt2",
        uid,
        messagePayload,
      );
      console.log(
        JSON.stringify({
          event: "ADMIN_APPROVE_PUSH_OK",
          lineUserIdPrefix: uid.slice(0, 8),
          attempt: 2,
        }),
      );
      return { ok: true, attempts: 2 };
    } catch (err2) {
      console.error(
        JSON.stringify({
          event: "ADMIN_APPROVE_PUSH_FAILED",
          afterRetry: true,
          lineUserIdPrefix: uid.slice(0, 8),
        }),
      );
      return {
        ok: false,
        attempts: 2,
        lastError: err2,
        lastIs429: isLine429Error(err2),
      };
    }
  }
}

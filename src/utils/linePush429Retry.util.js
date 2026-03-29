import { randomBetween } from "./timing.util.js";
import { isLine429Error } from "./lineNotify429Retry.util.js";

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
    const backoffs = [800, 1600];
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
        await client.pushMessage(uid, payload);
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
            status: lineErrorStatus(err),
            message: lineErrorMessage(err),
            lineUserIdPrefix: uid.slice(0, 8),
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

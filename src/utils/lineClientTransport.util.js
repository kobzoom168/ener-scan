import { logLineTransportError } from "./lineErrorLog.util.js";

/**
 * Stable channel id for `LINE_TRANSPORT_ERROR` logs (`op|path`) so 429 traces map to call sites.
 * @param {"replyMessage" | "pushMessage"} op
 * @param {string} path
 */
export function lineTransportChannel(op, path) {
  return `${op}|${path}`;
}

/**
 * @param {"replyMessage" | "pushMessage"} op
 * @param {string} path
 * @param {Record<string, unknown>} [detail]
 */
function transportStart(op, path, detail = {}) {
  console.log(
    JSON.stringify({
      event: "LINE_TRANSPORT_START",
      op,
      path,
      ...detail,
    }),
  );
}

/**
 * @param {"replyMessage" | "pushMessage"} op
 * @param {string} path
 * @param {Record<string, unknown>} [detail]
 */
function transportOk(op, path, detail = {}) {
  console.log(
    JSON.stringify({
      event: "LINE_TRANSPORT_OK",
      op,
      path,
      ...detail,
    }),
  );
}

/**
 * LINE Messaging API `replyMessage` — use from app code instead of raw `client.replyMessage`.
 * @param {*} client
 * @param {string} path
 * @param {string} replyToken
 * @param {unknown} messages — single message or array per LINE client
 */
export async function invokeLineReplyMessage(client, path, replyToken, messages) {
  const rt = String(replyToken || "").trim();
  transportStart("replyMessage", path, { replyTokenExists: Boolean(rt) });
  try {
    const out = await client.replyMessage(replyToken, messages);
    transportOk("replyMessage", path);
    return out;
  } catch (err) {
    logLineTransportError(lineTransportChannel("replyMessage", path), err);
    throw err;
  }
}

/**
 * LINE Messaging API `pushMessage` — use from app code instead of raw `client.pushMessage`.
 * @param {*} client
 * @param {string} path
 * @param {string} toUserId
 * @param {unknown} messages — single message or array per LINE client
 */
export async function invokeLinePushMessage(client, path, toUserId, messages) {
  const uid = String(toUserId || "").trim();
  transportStart("pushMessage", path, {
    lineUserIdPrefix: uid ? uid.slice(0, 8) : "",
  });
  try {
    const out = await client.pushMessage(uid, messages);
    transportOk("pushMessage", path);
    return out;
  } catch (err) {
    logLineTransportError(lineTransportChannel("pushMessage", path), err);
    throw err;
  }
}

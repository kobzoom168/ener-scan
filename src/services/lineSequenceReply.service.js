import { replyText } from "./lineReply.service.js";
import { randomBetween, sleep } from "../utils/timing.util.js";

/**
 * Push a single text (LINE Messaging API).
 * @param {*} client LINE bot client (`pushMessage`)
 * @param {string} userId
 * @param {string} text
 */
export async function pushText(client, userId, text) {
  const uid = String(userId || "").trim();
  if (!uid) {
    throw new Error("pushText_missing_userId");
  }
  const safeText = String(text || "").slice(0, 4900);
  await client.pushMessage(uid, { type: "text", text: safeText });
}

/**
 * Delay after message index `i` (0-based) before sending message `i + 1`.
 * Matches product spec: 1→2: 500–900ms, 2→3+: 800–1400ms.
 * @param {number} messageIndexJustSent
 */
function delayMsAfterMessage(messageIndexJustSent) {
  if (messageIndexJustSent === 0) return randomBetween(500, 900);
  return randomBetween(800, 1400);
}

/**
 * One text reply, or multi-bubble sequence (reply + push) when more than one line.
 */
export async function replyTextSequenceOrSingle({
  client,
  replyToken,
  userId,
  messages,
}) {
  const list = (Array.isArray(messages) ? messages : [])
    .map((m) => String(m || "").trim())
    .filter(Boolean);
  if (list.length === 0) return;
  if (list.length === 1) {
    await replyText(client, replyToken, list[0]);
    return;
  }
  await sendTextSequence({ client, replyToken, userId, messages: list });
}

/**
 * First message uses reply API (single use of replyToken). Further chunks use push.
 * If replyToken is missing, all segments are sent via push (e.g. before_scan while reply is reserved for scan).
 *
 * @param {{ client: *, replyToken?: string | null, userId: string, messages: string[] }} opts
 */
export async function sendTextSequence({ client, replyToken, userId, messages }) {
  const uid = String(userId || "").trim();
  if (!uid) {
    throw new Error("sendTextSequence_missing_userId");
  }

  const list = (Array.isArray(messages) ? messages : [])
    .map((m) => String(m || "").trim())
    .filter(Boolean);

  if (list.length === 0) return;

  const hasReply = Boolean(replyToken && String(replyToken).trim());

  if (hasReply) {
    await replyText(client, replyToken, list[0]);
  } else {
    await pushText(client, uid, list[0]);
  }

  for (let i = 1; i < list.length; i += 1) {
    await sleep(delayMsAfterMessage(i - 1));
    await pushText(client, uid, list[i]);
  }
}

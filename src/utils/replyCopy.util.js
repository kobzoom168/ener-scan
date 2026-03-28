import { pickVariant } from "./replyVariant.util.js";
import { REPLY_VARIANTS, BIRTHDATE_EXAMPLE_LINE } from "../config/replyVariants.th.js";
import { env } from "../config/env.js";
import { generatePersonaReply, generatePersonaReplyMeta } from "./replyPersona.util.js";
import { logPaywallShown } from "./personaAnalytics.util.js";

export {
  generatePersonaReply,
  generatePersonaReplyMeta,
  generateConversation,
  clearPersonaMemory,
  clearConversationPatternMemory,
} from "./replyPersona.util.js";

function paywallAmountDisplay() {
  const n = Number(env.PAYMENT_UNLOCK_AMOUNT_THB);
  if (Number.isFinite(n) && n > 0) return String(Math.floor(n));
  return "49";
}

function injectPaywallPlaceholders(lines) {
  const amt = paywallAmountDisplay();
  return lines.map((line) =>
    String(line || "").replace(/\{\{AMOUNT\}\}/g, amt)
  );
}

function formatPaymentRefLine(paymentRef) {
  const r = String(paymentRef || "").trim();
  if (!r) return "";
  return `รหัสรายการ: ${r}`;
}

function appendExample(body) {
  const b = String(body || "").trim();
  if (!b) return BIRTHDATE_EXAMPLE_LINE;
  return `${b}\n\n${BIRTHDATE_EXAMPLE_LINE}`;
}

/** If no date-like hint in the bubble list, append example to last bubble. */
function ensureBirthdateExampleInMessages(messages) {
  const m = (Array.isArray(messages) ? messages : [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (m.length === 0) return [BIRTHDATE_EXAMPLE_LINE];
  const combined = m.join("\n");
  if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(combined) || /2538/.test(combined)) {
    return m;
  }
  m[m.length - 1] = `${m[m.length - 1]}\n\n${BIRTHDATE_EXAMPLE_LINE}`;
  return m;
}

function appendRefToLastMessage(messages, paymentRef) {
  const r = formatPaymentRefLine(paymentRef);
  if (!r) return [...messages];
  const m = (Array.isArray(messages) ? messages : [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (m.length === 0) return [r];
  m[m.length - 1] = `${m[m.length - 1]}\n\n${r}`;
  return m;
}

/** @returns {Promise<string[]>} 1–3 messages (Ajarn Ener persona). */
export async function waitingBirthdateInitialMessages(userId) {
  const msgs = await generatePersonaReply(userId, "waiting_birthdate_initial");
  return ensureBirthdateExampleInMessages(msgs);
}

export async function waitingBirthdateInitial(userId) {
  return (await waitingBirthdateInitialMessages(userId)).join("\n\n");
}

/** @returns {Promise<string[]>} 1–3 messages. */
export async function waitingBirthdateGuidanceMessages(userId) {
  const msgs = await generatePersonaReply(userId, "waiting_birthdate_guidance");
  return ensureBirthdateExampleInMessages(msgs);
}

export async function waitingBirthdateGuidance(userId) {
  return (await waitingBirthdateGuidanceMessages(userId)).join("\n\n");
}

export async function waitingBirthdateInvalidFormatMessages(userId) {
  const msgs = await generatePersonaReply(userId, "waiting_birthdate_invalid_format");
  return ensureBirthdateExampleInMessages(msgs);
}

export async function waitingBirthdateInvalidFormat(userId) {
  return (await waitingBirthdateInvalidFormatMessages(userId)).join("\n\n");
}

export async function waitingBirthdateInvalidDateMessages(userId) {
  const msgs = await generatePersonaReply(userId, "waiting_birthdate_invalid_date");
  return ensureBirthdateExampleInMessages(msgs);
}

export async function waitingBirthdateInvalidDate(userId) {
  return (await waitingBirthdateInvalidDateMessages(userId)).join("\n\n");
}

export async function waitingBirthdateOutOfRangeMessages(userId) {
  const msgs = await generatePersonaReply(userId, "waiting_birthdate_out_of_range");
  return ensureBirthdateExampleInMessages(msgs);
}

export async function waitingBirthdateOutOfRange(userId) {
  return (await waitingBirthdateOutOfRangeMessages(userId)).join("\n\n");
}

export async function waitingBirthdateImageReminderMessages(userId) {
  return generatePersonaReply(userId, "waiting_birthdate_image_reminder");
}

export async function waitingBirthdateImageReminder(userId) {
  return (await waitingBirthdateImageReminderMessages(userId)).join("\n\n");
}

/** @returns {Promise<string[]>} for `invalid_format` | `invalid_date` | `out_of_range` */
export async function birthdateErrorMessages(userId, reason) {
  const r = String(reason || "invalid_format");
  if (r === "invalid_format") return waitingBirthdateInvalidFormatMessages(userId);
  if (r === "invalid_date") return waitingBirthdateInvalidDateMessages(userId);
  return waitingBirthdateOutOfRangeMessages(userId);
}

/** Multi-part before-scan ack (push-only; replyToken reserved for scan). */
export async function beforeScanMessageSequence(userId) {
  return generatePersonaReply(userId, "before_scan");
}

export async function beforeScanAck(userId) {
  return (await beforeScanMessageSequence(userId)).join("\n\n");
}

export async function birthdateErrorForReason(userId, reason) {
  return (await birthdateErrorMessages(userId, reason)).join("\n\n");
}

/** Paywall: 1–3 chat bubbles (persona pattern + A/B variant). */
export async function paywallMessageSequence(userId) {
  if (!String(userId || "").trim()) return [];
  const meta = await generatePersonaReplyMeta(userId, "paywall");
  await logPaywallShown(userId, {
    personaVariant: meta.personaVariant,
    patternUsed: meta.patternUsed,
    bubbleCount: meta.bubbleCount,
    source: "persona_paywall_text",
  });
  return injectPaywallPlaceholders(meta.messages);
}

export async function paywallText(userId) {
  const seq = await paywallMessageSequence(userId);
  if (seq.length === 0) return "";
  return seq.join("\n\n");
}

export async function awaitingSlipReminderMessages(userId) {
  return generatePersonaReply(userId, "awaiting_slip");
}

export async function awaitingSlipReminderText(userId, paymentRef) {
  const msgs = await awaitingSlipReminderMessages(userId);
  return appendRefToLastMessage(msgs, paymentRef).join("\n\n");
}

export async function pendingVerifyReminderMessages(userId) {
  return generatePersonaReply(userId, "pending_verify");
}

export async function pendingVerifyReminderText(userId, paymentRef) {
  const msgs = await pendingVerifyReminderMessages(userId);
  return appendRefToLastMessage(msgs, paymentRef).join("\n\n");
}

export async function pendingVerifyBlockScanMessages(userId) {
  return generatePersonaReply(userId, "pending_verify_block_scan");
}

export async function pendingVerifyBlockScanText(userId, paymentRef) {
  const msgs = await pendingVerifyBlockScanMessages(userId);
  return appendRefToLastMessage(msgs, paymentRef).join("\n\n");
}

export async function pendingVerifyPaymentAgainMessages(userId) {
  return generatePersonaReply(userId, "pending_verify_payment_again");
}

export async function pendingVerifyPaymentAgainText(userId, paymentRef) {
  const msgs = await pendingVerifyPaymentAgainMessages(userId);
  return appendRefToLastMessage(msgs, paymentRef).join("\n\n");
}

export function birthdateUpdatePrompt(userId) {
  const v = pickVariant(
    userId,
    "birthdate_update_prompt",
    REPLY_VARIANTS.birthdate_update_prompt
  );
  return appendExample(v);
}

/** @param {string} displayBirthdateForUser — same era/style as user typed (echo), not forced CE. */
export function birthdateSavedAfterUpdate(userId, displayBirthdateForUser) {
  void userId;
  void displayBirthdateForUser;
  return "โอเคครับ อาจารย์ตั้งวันเกิดนี้ให้แล้ว เดี๋ยวไปต่อให้ครับ";
}

export async function approvedIntroLine(userId) {
  const m = await generatePersonaReply(userId, "approved_intro");
  return m.join("\n") || "";
}

export async function idlePostScanMessages(userId) {
  return generatePersonaReply(userId, "idle_post_scan");
}

export async function idlePostScanText(userId) {
  const m = await idlePostScanMessages(userId);
  return m.join("\n");
}

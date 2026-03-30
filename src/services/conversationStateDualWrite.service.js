import { ensureUserByLineUserId } from "../stores/users.db.js";
import {
  upsertConversationState,
  getConversationStateByLineUserId,
} from "../stores/conversationState.db.js";
import { getSession } from "../stores/session.store.js";

function dualWriteEnabled() {
  return (
    String(process.env.ENABLE_CONVERSATION_STATE_DUAL_WRITE ?? "true")
      .trim()
      .toLowerCase() !== "false"
  );
}

/**
 * Persist mapped session fields to `conversation_state` (best-effort).
 * @param {string} lineUserId
 */
export async function persistConversationStateForUser(lineUserId) {
  if (!dualWriteEnabled()) return;

  const uid = String(lineUserId || "").trim();
  if (!uid) return;

  const appUser = await ensureUserByLineUserId(uid);
  const appUserId = appUser?.id ? String(appUser.id) : null;
  if (!appUserId) return;

  const session = getSession(uid);

  let existing = null;
  try {
    existing = await getConversationStateByLineUserId(uid);
  } catch {
    existing = null;
  }

  await upsertConversationState({
    line_user_id: uid,
    app_user_id: appUserId,
    flow_state: existing?.flow_state ?? null,
    payment_state: existing?.payment_state ?? null,
    pending_upload_id: existing?.pending_upload_id ?? null,
    selected_package_key: session.selectedPaymentPackageKey ?? null,
    birthdate_change_state: session.birthdateChangeFlowState ?? null,
    reply_token_spent: Boolean(session.scanFlowReplyTokenSpent),
    pending_approved_intro_compensation:
      session.pendingApprovedIntroCompensation ?? null,
    last_inbound_at: existing?.last_inbound_at ?? null,
    updated_at: new Date().toISOString(),
  });

  console.log(
    JSON.stringify({
      event: "CONVERSATION_STATE_UPSERT_OK",
      lineUserIdPrefix: uid.slice(0, 8),
    }),
  );
}

/**
 * Overlay DB-backed fields onto in-memory session (DB wins when row exists).
 * Call early in webhook handling after `userId` is known.
 * @param {string} lineUserId
 */
export async function mergeConversationStateFromDbIntoSession(lineUserId) {
  if (!dualWriteEnabled()) return;

  const uid = String(lineUserId || "").trim();
  if (!uid) return;

  let row;
  try {
    row = await getConversationStateByLineUserId(uid);
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "CONVERSATION_STATE_READ_FAILED",
        lineUserIdPrefix: uid.slice(0, 8),
        message: e?.message,
      }),
    );
    return;
  }

  if (!row) return;

  const session = getSession(uid);

  if (
    row.selected_package_key != null &&
    String(row.selected_package_key).trim() !== ""
  ) {
    session.selectedPaymentPackageKey = String(row.selected_package_key).trim();
  }
  if (typeof row.reply_token_spent === "boolean") {
    session.scanFlowReplyTokenSpent = row.reply_token_spent;
  }
  if (row.pending_approved_intro_compensation != null) {
    const p = row.pending_approved_intro_compensation;
    if (
      p &&
      typeof p === "object" &&
      "text" in p &&
      String(/** @type {{ text?: unknown }} */ (p).text || "").trim()
    ) {
      session.pendingApprovedIntroCompensation = {
        text: String(/** @type {{ text?: unknown }} */ (p).text),
        createdAt:
          typeof /** @type {{ createdAt?: unknown }} */ (p).createdAt === "string"
            ? String(/** @type {{ createdAt?: unknown }} */ (p).createdAt)
            : new Date().toISOString(),
        paymentId:
          /** @type {{ paymentId?: unknown }} */ (p).paymentId != null
            ? String(/** @type {{ paymentId?: unknown }} */ (p).paymentId)
            : null,
      };
    }
  }
  if (row.birthdate_change_state != null && row.birthdate_change_state !== "") {
    session.birthdateChangeFlowState = String(row.birthdate_change_state);
  }

  console.log(
    JSON.stringify({
      event: "CONVERSATION_STATE_MERGED_INTO_SESSION",
      lineUserIdPrefix: uid.slice(0, 8),
    }),
  );
}

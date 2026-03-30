/**
 * Batches async persist to DB without importing dual-write at module load (avoids cycles with session.store).
 */

const pending = /** @type {Set<string>} */ (new Set());
let scheduled = false;

function flushSoon() {
  if (scheduled) return;
  scheduled = true;
  setImmediate(() => {
    scheduled = false;
    const ids = [...pending];
    pending.clear();
    void (async () => {
      try {
        const { persistConversationStateForUser } = await import(
          "../services/conversationStateDualWrite.service.js"
        );
        for (const id of ids) {
          try {
            await persistConversationStateForUser(id);
          } catch (e) {
            console.error(
              JSON.stringify({
                event: "CONVERSATION_STATE_PERSIST_FAILED",
                lineUserIdPrefix: String(id).slice(0, 8),
                message: e?.message,
              }),
            );
          }
        }
      } catch (e) {
        console.error(
          JSON.stringify({
            event: "CONVERSATION_STATE_PERSIST_IMPORT_FAILED",
            message: e?.message,
          }),
        );
      }
    })();
  });
}

/**
 * @param {string} lineUserId
 */
export function queueConversationStatePersist(lineUserId) {
  const id = String(lineUserId || "").trim();
  if (!id) return;
  pending.add(id);
  flushSoon();
}

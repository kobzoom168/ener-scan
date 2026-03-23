/**
 * Deterministic fallback handler for hybrid persona.
 */

/**
 * @param {{
 *   userId: string,
 *   replyType: string,
 *   fallbackMessages: string[],
 *   reason: string,
 * }} ctx
 */
export function fallbackHybridPersona(ctx) {
  const fallbackMessages = (ctx.fallbackMessages || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const quietReasons = new Set(["hybrid_disabled", "type_not_allowed"]);
  if (ctx.reason && !quietReasons.has(String(ctx.reason))) {
    console.warn("[HYBRID_PERSONA_FALLBACK]", {
      userId: ctx.userId,
      replyType: ctx.replyType,
      reason: ctx.reason,
    });
  }
  return fallbackMessages;
}


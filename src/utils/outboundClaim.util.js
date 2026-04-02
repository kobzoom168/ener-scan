/**
 * Normalize PostgREST / Supabase RPC payload for claim_next_outbound_message.
 * Handles: array wrap, empty composite (all-null fields), rare single-key wrappers.
 *
 * @param {unknown} data
 * @returns {Record<string, unknown> | null}
 */
export function normalizeClaimNextOutboundRpcPayload(data) {
  if (data == null) return null;

  let row = Array.isArray(data) ? data[0] ?? null : data;
  if (row == null) return null;

  if (typeof row === "object" && row !== null && !Array.isArray(row)) {
    const keys = Object.keys(row);
    if (
      keys.length === 1 &&
      (keys[0] === "claim_next_outbound_message" ||
        keys[0] === "claim_next_outbound_message_result")
    ) {
      const inner = /** @type {Record<string, unknown>} */ (row)[keys[0]];
      row = inner != null && typeof inner === "object" ? inner : null;
    }
  }

  if (row == null || typeof row !== "object") return null;

  return /** @type {Record<string, unknown>} */ (row);
}

/**
 * @param {Record<string, unknown> | null} row
 * @returns {{ id: unknown, line_user_id: unknown, status: unknown, kind: unknown }}
 */
export function pickOutboundClaimFields(row) {
  if (!row || typeof row !== "object") {
    return { id: null, line_user_id: null, status: null, kind: null };
  }
  return {
    id: row.id ?? row.Id ?? null,
    line_user_id: row.line_user_id ?? row.lineUserId ?? null,
    status: row.status ?? row.Status ?? null,
    kind: row.kind ?? row.Kind ?? null,
  };
}

/**
 * True when RPC returned a non-null payload but no claimable row (DB bug / drift).
 * @param {Record<string, unknown> | null} row
 * @param {{ id: unknown, line_user_id: unknown, status: unknown }} picked
 */
export function isOutboundClaimRowEffectivelyEmpty(row, picked) {
  const norm = (v) => {
    if (v == null) return null;
    if (typeof v === "string" && v.trim().toLowerCase() === "null") return null;
    return v;
  };
  const id = norm(picked.id);
  const lineUserId = norm(picked.line_user_id);
  const status = norm(picked.status);
  if (id != null || lineUserId != null || status != null) return false;
  if (!row || typeof row !== "object") return true;
  const keys = Object.keys(row).filter((k) => {
    const v = row[k];
    if (v == null) return false;
    if (typeof v === "string" && v.trim().toLowerCase() === "null") return false;
    return true;
  });
  return keys.length === 0;
}

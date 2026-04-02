import { supabase } from "../../config/supabase.js";
import {
  scanV2TraceTs,
  lineUserIdPrefix8,
  workerIdPrefix16,
} from "../../utils/scanV2Trace.util.js";
import {
  isOutboundClaimRowEffectivelyEmpty,
  normalizeClaimNextOutboundRpcPayload,
  pickOutboundClaimFields,
} from "../../utils/outboundClaim.util.js";

/**
 * @param {object} row
 * @returns {Promise<{ id: string } | null>}
 */
export async function insertOutboundMessage(row) {
  const { data, error } = await supabase
    .from("outbound_messages")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * @param {string} workerId
 * @returns {Promise<object | null>}
 */
export async function claimNextOutboundMessage(workerId) {
  const wid = String(workerId ?? "").trim();
  if (!wid || wid.toLowerCase() === "null") {
    console.log(
      JSON.stringify({
        event: "OUTBOUND_CLAIM_SKIP_BAD_WORKER_ID",
        hasWorkerId: workerId != null,
      }),
    );
    return null;
  }

  console.log(
    JSON.stringify({
      event: "OUTBOUND_CLAIM_RPC_START",
      workerIdPrefix: wid.slice(0, 16),
    }),
  );

  let data;
  let error;
  try {
    const res = await supabase.rpc("claim_next_outbound_message", {
      p_worker_id: wid,
    });
    data = res.data;
    error = res.error;
  } catch (e) {
    const msg = String(e?.message || e);
    console.log(
      JSON.stringify({
        event: "OUTBOUND_CLAIM_RPC_EXCEPTION",
        message: msg.slice(0, 300),
      }),
    );
    if (isUuidNullSyntaxError(msg)) {
      console.log(
        JSON.stringify({
          event: "OUTBOUND_CLAIM_RPC_EXCEPTION_TREATED_AS_EMPTY",
        }),
      );
      return null;
    }
    throw e;
  }

  const rawKeys =
    data != null && typeof data === "object" && !Array.isArray(data)
      ? Object.keys(/** @type {object} */ (data)).slice(0, 24)
      : null;
  console.log(
    JSON.stringify({
      event: "OUTBOUND_CLAIM_RPC_RAW",
      hasError: Boolean(error),
      errorCode: error?.code ?? null,
      errorMessage: error?.message
        ? String(error.message).slice(0, 240)
        : null,
      dataIsNull: data == null,
      dataIsArray: Array.isArray(data),
      dataType: data == null ? null : typeof data,
      /** Helps confirm PostgREST shape: wrapper key vs row keys */
      rawTopLevelKeysSample: rawKeys,
    }),
  );

  if (error) {
    const em = String(error.message || "");
    if (isUuidNullSyntaxError(em)) {
      console.log(
        JSON.stringify({
          event: "OUTBOUND_CLAIM_RPC_ERROR_TREATED_AS_EMPTY",
          errorCode: error.code ?? null,
          errorMessage: em.slice(0, 240),
        }),
      );
      return null;
    }
    throw error;
  }

  // supabase.rpc returns `res.data` from PostgREST JSON as-is (no extra NULL→object mapping).
  // If SQL returns NULL, PostgREST usually sends JSON `null` → data==null. Some stacks still
  // return an object with every column JSON `null` for an empty composite; normalize maps that to null.
  const row = normalizeClaimNextOutboundRpcPayload(data);

  const rowKeysForLog =
    row != null && typeof row === "object" && !Array.isArray(row)
      ? Object.keys(row).slice(0, 24)
      : null;
  console.log(
    JSON.stringify({
      event: "OUTBOUND_CLAIM_NORMALIZED",
      normalizedIsNull: row == null,
      normalizedType: row == null ? null : typeof row,
      normalizedKeysSample: rowKeysForLog,
    }),
  );

  if (row == null) return null;

  const norm = (v) => {
    if (v == null) return null;
    if (typeof v === "string" && v.trim().toLowerCase() === "null") return null;
    return v;
  };

  const picked = pickOutboundClaimFields(row);
  const id = norm(picked.id);
  const lineUserId = norm(picked.line_user_id);
  const status = norm(picked.status);

  // Empty queue: no claimable row (all-null composite, unwrap quirks, etc.) — not an error.
  if (isOutboundClaimRowEffectivelyEmpty(row, picked)) {
    const keys = Object.keys(row);
    const sample =
      keys.length > 0
        ? JSON.stringify(
            Object.fromEntries(keys.slice(0, 12).map((k) => [k, row[k]])),
          ).slice(0, 900)
        : "{}";
    console.log(
      JSON.stringify({
        event: "OUTBOUND_CLAIM_EMPTY_QUEUE",
        reason: "effectively_empty_row",
        rowKeyCount: keys.length,
        rowKeysSample: keys.slice(0, 20),
        rowSample: sample,
      }),
    );
    return null;
  }

  if (id == null) {
    const keys = Object.keys(row);
    const sample =
      keys.length > 0
        ? JSON.stringify(
            Object.fromEntries(keys.slice(0, 12).map((k) => [k, row[k]])),
          ).slice(0, 900)
        : "{}";
    console.log(
      JSON.stringify({
        event: "OUTBOUND_CLAIM_INVALID_PRECHECK",
        rowIsNull: row == null,
        rowKeysSample: keys.slice(0, 20),
        rowSample: sample,
      }),
    );
    console.log(
      JSON.stringify({
        event: "OUTBOUND_CLAIM_ROW_INVALID",
        reason: "missing_id_after_normalize",
        rowKeyCount: keys.length,
        rowKeysSample: keys.slice(0, 20),
        hint: "check_postgrest_composite_or_rpc_return_type",
      }),
    );
    return null;
  }

  const lid = picked.line_user_id ?? null;
  const k = picked.kind ?? null;
  console.log(
    JSON.stringify({
      event: "OUTBOUND_CLAIM_ROW_OK",
      path: "worker-delivery",
      workerIdPrefix: workerIdPrefix16(wid),
      outboundIdPrefix: normRowIdPrefix(row),
      lineUserIdPrefix: lineUserIdPrefix8(
        lid != null ? String(lid) : null,
      ),
      kind: k != null ? String(k) : null,
      status: status != null ? String(status) : null,
      timestamp: scanV2TraceTs(),
    }),
  );

  console.log(
    JSON.stringify({
      event: "OUTBOUND_CLAIM_ROW_SHAPE",
      path: "worker-delivery",
      outboundIdPrefix: normRowIdPrefix(row),
      hasPayloadJson: Boolean(row.payload_json),
      lineUserIdPrefix: lineUserIdPrefix8(
        lid != null ? String(lid) : null,
      ),
      kind: k != null ? String(k) : null,
      timestamp: scanV2TraceTs(),
    }),
  );

  return row;
}

/** @param {string} msg */
function isUuidNullSyntaxError(msg) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  if (!m.includes("invalid input syntax for type uuid")) return false;
  return /:\s*"null"|:\s*'null'|:\s*null\b|"null"|'null'/i.test(msg);
}

/** @param {unknown} row */
function normRowIdPrefix(row) {
  if (!row || typeof row !== "object") return null;
  const id = row.id;
  if (id == null) return null;
  const s = String(id);
  if (!s || s.trim().toLowerCase() === "null") return null;
  return s.slice(0, 8);
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateOutboundMessage(id, patch) {
  if (
    id == null ||
    (typeof id === "string" && id.trim().toLowerCase() === "null")
  ) {
    console.log(
      JSON.stringify({
        event: "OUTBOUND_UPDATE_SKIP_INVALID_ID",
        idPresent: id != null,
      }),
    );
    throw new Error("OUTBOUND_UPDATE_INVALID_ID");
  }

  const { error } = await supabase
    .from("outbound_messages")
    .update(patch)
    .eq("id", id);

  if (error) throw error;
}

/**
 * Active = not yet terminal (sent/failed/dead).
 * @param {string} paymentId UUID
 * @param {string} kind
 * @returns {Promise<{ id: string, status: string } | null>}
 */
export async function findActiveOutboundByPaymentAndKind(paymentId, kind) {
  const pid = String(paymentId || "").trim();
  if (!pid) return null;

  const { data, error } = await supabase
    .from("outbound_messages")
    .select("id,status")
    .eq("related_payment_id", pid)
    .eq("kind", kind)
    .in("status", ["queued", "sending", "retry_wait"])
    .maybeSingle();

  if (error) throw error;
  return data;
}

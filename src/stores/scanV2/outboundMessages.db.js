import { supabase } from "../../config/supabase.js";

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

  // Supabase RPC can return a NULL composite that is deserialized into an object
  // whose fields are all `null` (or sometimes string "null"). Normalize that to `null`
  // so the worker can treat it as "no message".
  const row = Array.isArray(data) ? (data[0] ?? null) : data;
  if (row == null) return null;

  const norm = (v) => {
    if (v == null) return null;
    if (typeof v === "string" && v.trim().toLowerCase() === "null") return null;
    return v;
  };

  if (typeof row === "object" && row !== null) {
    const id = norm(row.id);
    const lineUserId = norm(row.line_user_id);
    const status = norm(row.status);

    if (id == null && lineUserId == null && status == null) {
      console.log(
        JSON.stringify({
          event: "OUTBOUND_CLAIM_ROW_ALL_NULL_FIELDS",
        }),
      );
      return null;
    }
  }

  console.log(
    JSON.stringify({
      event: "OUTBOUND_CLAIM_ROW_OK",
      outboundIdPrefix: normRowIdPrefix(row),
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

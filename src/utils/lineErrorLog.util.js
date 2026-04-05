/**
 * Axios / LINE SDK errors may nest the HTTP response (e.g. `originalError.response`).
 *
 * @param {unknown} err
 * @returns {{ status: number | null, data: unknown }}
 */
function extractAxiosLikeResponse(err) {
  if (!err || typeof err !== "object") {
    return { status: null, data: null };
  }
  const o = /** @type {Record<string, unknown>} */ (err);
  const candidates = [
    o.response,
    /** @type {{ response?: { status?: number; data?: unknown } }} */ (o.originalError)
      ?.response,
    /** @type {{ response?: { status?: number; data?: unknown } }} */ (o.cause)
      ?.response,
  ];
  for (const r of candidates) {
    if (r && typeof r === "object" && "data" in r) {
      const status =
        typeof /** @type {{ status?: number }} */ (r).status === "number"
          ? /** @type {{ status?: number }} */ (r).status
          : null;
      return { status, data: /** @type {{ data?: unknown }} */ (r).data };
    }
  }
  return { status: null, data: null };
}

function truncateForLog(s, max = 800) {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Redact secrets and huge payloads from LINE SDK / Axios errors before logging.
 * Never log request headers, Authorization, or full config.
 *
 * @param {unknown} err
 * @returns {Record<string, unknown>}
 */
export function serializeLineErrorSafe(err) {
  if (!err || typeof err !== "object") {
    return { message: String(err ?? "") };
  }
  const o = /** @type {Record<string, unknown>} */ (err);
  const msg = o.message;
  const { status: nestedStatus, data: rawData } = extractAxiosLikeResponse(err);
  const status =
    typeof o.statusCode === "number"
      ? o.statusCode
      : typeof o.status === "number"
        ? o.status
        : typeof /** @type {{ response?: { status?: number } }} */ (o).response?.status ===
            "number"
          ? /** @type {{ response?: { status?: number } }} */ (o).response?.status
          : nestedStatus;
  const statusMessage =
    typeof o.statusMessage === "string" ? o.statusMessage : null;

  const rawForLog = rawData ?? null;

  /** @type {Record<string, unknown>} */
  const out = {
    message: typeof msg === "string" ? msg : String(err),
    status,
    statusMessage,
    responseData: null,
  };

  if (
    rawForLog &&
    typeof rawForLog === "object" &&
    !Array.isArray(rawForLog)
  ) {
    const rd = /** @type {Record<string, unknown>} */ (rawForLog);
    if (typeof rd.message === "string") {
      out.lineApiMessage = rd.message;
    }
    const details = rd.details;
    if (Array.isArray(details) && details[0] && typeof details[0] === "object") {
      const d0 = /** @type {Record<string, unknown>} */ (details[0]);
      if (typeof d0.message === "string") {
        out.lineApiDetailMessage = d0.message;
      }
      if (typeof d0.property === "string") {
        out.lineApiDetailProperty = d0.property;
      }
    }
  }

  if (typeof rawForLog === "string") {
    out.responseData = truncateForLog(rawForLog);
  } else if (rawForLog !== null && typeof rawForLog === "object") {
    try {
      const s = JSON.stringify(rawForLog);
      out.responseData = s.length > 800 ? `${s.slice(0, 800)}…` : rawForLog;
    } catch {
      out.responseData = "[unserializable]";
    }
  } else {
    out.responseData = rawForLog;
  }

  return out;
}

/**
 * @param {string} channel
 * @param {unknown} err
 */
export function logLineTransportError(channel, err) {
  console.error(
    JSON.stringify({
      event: "LINE_TRANSPORT_ERROR",
      channel,
      ...serializeLineErrorSafe(err),
    }),
  );
}

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
  const status =
    typeof o.statusCode === "number"
      ? o.statusCode
      : typeof o.status === "number"
        ? o.status
        : typeof /** @type {{ response?: { status?: number } }} */ (o).response?.status ===
            "number"
          ? /** @type {{ response?: { status?: number } }} */ (o).response?.status
          : null;
  const statusMessage =
    typeof o.statusMessage === "string" ? o.statusMessage : null;
  const res = /** @type {{ response?: { data?: unknown } }} */ (o).response;
  let responseData = res?.data ?? null;
  if (responseData !== null && typeof responseData === "object") {
    try {
      const s = JSON.stringify(responseData);
      responseData = s.length > 800 ? `${s.slice(0, 800)}…` : responseData;
    } catch {
      responseData = "[unserializable]";
    }
  }
  return {
    message: typeof msg === "string" ? msg : String(err),
    status,
    statusMessage,
    responseData,
  };
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

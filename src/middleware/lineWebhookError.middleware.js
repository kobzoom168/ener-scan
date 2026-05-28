import { JSONParseError, SignatureValidationFailed } from "@line/bot-sdk";

/**
 * True when LINE webhook middleware rejected missing/invalid x-line-signature.
 * @param {unknown} err
 */
export function isLineSignatureError(err) {
  if (!err) return false;
  if (err instanceof SignatureValidationFailed) return true;
  const name = String(err?.name || "").toLowerCase();
  if (name.includes("signature")) return true;
  const msg = String(err?.message || err).toLowerCase();
  return msg.includes("signature");
}

/**
 * Express error handler for LINE webhook middleware failures (signature / JSON body).
 * Register after routes; keep generic 500 handler after this.
 */
export function lineWebhookErrorHandler(err, req, res, next) {
  if (isLineSignatureError(err)) {
    console.warn(
      JSON.stringify({
        event: "LINE_WEBHOOK_SIGNATURE_REJECTED",
        path: req?.path || req?.originalUrl || "/webhook/line",
      }),
    );
    res.status(401).json({ ok: false, error: "invalid_line_signature" });
    return;
  }

  if (err instanceof JSONParseError) {
    console.warn(
      JSON.stringify({
        event: "LINE_WEBHOOK_JSON_PARSE_REJECTED",
        path: req?.path || req?.originalUrl || "/webhook/line",
      }),
    );
    res.status(400).json({ ok: false, error: "invalid_line_webhook_body" });
    return;
  }

  next(err);
}

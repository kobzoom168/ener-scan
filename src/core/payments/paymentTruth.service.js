/**
 * Payment truth = amounts, refs, status labels approved by code + DB only.
 * Conversation AI consumes only normalized facts built here (never raw rows).
 */

/**
 * @typedef {import("../conversation/contracts.types.js").AllowedFact} AllowedFact
 */

/**
 * @param {object} params
 * @param {number|null|undefined} params.priceThb
 * @param {string} [params.currency]
 * @param {string|null|undefined} params.paymentRef
 * @param {string|null|undefined} params.packageLabel
 * @param {'none'|'awaiting_slip'|'pending_verify'|'awaiting_payment'|string} [params.paymentStatusVerbal]
 * @returns {AllowedFact[]}
 */
export function allowedFactsFromPaymentTruth({
  priceThb,
  currency = "THB",
  paymentRef,
  packageLabel,
  paymentStatusVerbal = "none",
}) {
  /** @type {AllowedFact[]} */
  const out = [];

  if (packageLabel != null && String(packageLabel).trim()) {
    out.push({
      key: "package_label",
      value: String(packageLabel).trim(),
      mustPreserveInOutput: false,
    });
  }

  if (priceThb != null && Number.isFinite(Number(priceThb))) {
    const p = String(Math.round(Number(priceThb)));
    out.push({
      key: "package_price_thb",
      value: p,
      mustPreserveInOutput: true,
    });
  }

  if (currency) {
    out.push({
      key: "currency",
      value: String(currency).trim().toUpperCase(),
      mustPreserveInOutput: false,
    });
  }

  if (paymentRef != null && String(paymentRef).trim()) {
    out.push({
      key: "payment_ref",
      value: String(paymentRef).trim(),
      mustPreserveInOutput: true,
    });
  }

  if (paymentStatusVerbal && paymentStatusVerbal !== "none") {
    out.push({
      key: "payment_status",
      value: String(paymentStatusVerbal).trim(),
      mustPreserveInOutput: true,
    });
  }

  return out;
}

/**
 * @param {object} o
 * @param {string} o.priceLine Human-safe price line for deterministic fallback copy only (e.g. "49 บาท / 1 ครั้ง").
 * @param {string} [o.paymentRefLine] Full ref line as shown to user (may duplicate payment_ref fact).
 */
export function buildPaymentSurfaceContext(o) {
  return {
    priceLine: o.priceLine || "",
    paymentRefLine: o.paymentRefLine || "",
  };
}

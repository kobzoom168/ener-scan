/**
 * Fail-closed validator for conversation surface output.
 * @param {string} llmText
 * @param {import("./contracts.types.js").ReplyContract} contract
 * @param {string} _baseline unused reserved for stricter anchors
 * @returns {import("./contracts.types.js").ValidationResult & { sanitizedText?: string }}
 */
export function validateConversationOutput(llmText, contract, _baseline = "") {
  const violations = [];
  const text = String(llmText || "").replace(/\r\n/g, "\n").trim();

  if (!text) {
    return { valid: false, violations: ["empty_output"], fallbackReason: "empty_output" };
  }

  if (contract.stateOwner === "waiting_birthdate") {
    if (/\d{2,4}\s*บาท|บาท\s*[:：]?\s*\d{2,4}|฿\s*\d{2,4}|\d{2,4}\s*฿/.test(text)) {
      return {
        valid: false,
        violations: ["unexpected_price_in_birthdate_flow"],
        fallbackReason: "unexpected_price_in_birthdate_flow",
      };
    }
  }

  const maxLen =
    contract.guidanceTier >= 3 ? 200 : contract.guidanceTier === 2 ? 360 : 520;
  if (text.length > maxLen) {
    violations.push("exceeds_guidance_length");
  }

  const blockedSnippets =
    /\bhttps?:\/\/|line\.me\/| carousel|flex message|\u200b.*qr.*http/i;
  if (blockedSnippets.test(text)) {
    violations.push("unauthorized_cta_or_link");
  }

  const pendingStatus = (contract.allowedFacts || []).find(
    (f) => f.key === "payment_status" && /pending|verify|await/i.test(f.value),
  );
  if (pendingStatus) {
    const falseSuccess =
      /อนุมัติแล้ว|ชำระ\s*สำเร็จ|ตรวจ\s*ผ่านแล้ว|ได้รับ\s*เงินแล้ว|โอน\s*เข้าแล้ว/i;
    if (falseSuccess.test(text)) {
      violations.push("false_payment_success");
    }
  }

  const allowedPrices = new Set();
  for (const f of contract.allowedFacts || []) {
    if (f.key === "package_price_thb" && f.value) allowedPrices.add(String(f.value));
  }

  const nums = text.match(/\d{2,5}/g) || [];
  for (const n of nums) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 20) continue;
    if (allowedPrices.size === 0) continue;
    if (!allowedPrices.has(n)) {
      const looksPrice =
        new RegExp(`${n}\\s*บาท`).test(text) ||
        new RegExp(`${n} บาท`).test(text) ||
        new RegExp(`฿\\s*${n}`).test(text) ||
        new RegExp(`${n} ฿`).test(text);
      if (looksPrice) violations.push(`foreign_price_${n}`);
    }
  }

  for (const f of contract.allowedFacts || []) {
    if (!f.mustPreserveInOutput) continue;
    const needle = String(f.value || "").trim();
    if (!needle) continue;
    if (!text.includes(needle)) {
      violations.push(`missing_fact_${f.key}`);
    }
  }

  if (violations.length) {
    return {
      valid: false,
      violations,
      fallbackReason: violations[0] || "validation_failed",
    };
  }

  return { valid: true, violations: [], sanitizedText: text };
}

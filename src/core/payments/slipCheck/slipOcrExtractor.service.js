import { env } from "../../../config/env.js";
import { openai, withOpenAi429RetryOnce } from "../../../services/openaiDeepScan.api.js";

/**
 * @typedef {Object} SlipOcrExtractResult
 * @property {number|null} amount
 * @property {"THB"|null} currency
 * @property {string|null} transferredAtText
 * @property {string|null} transferredAtIso
 * @property {string|null} receiverName
 * @property {string|null} receiverAccountLast4
 * @property {string|null} receiverPromptPay
 * @property {string|null} senderName
 * @property {string|null} bankName
 * @property {string|null} slipRef
 * @property {number} confidence
 * @property {string} rawText
 */

const SYSTEM_PROMPT = `You are extracting payment slip data from a Thai bank transfer slip.
Return JSON only.
Do not guess.
If a field is unclear, return null.
Extract amount, currency, transaction datetime text, transaction datetime ISO, receiver name, receiver account last 4 digits, receiver PromptPay if visible, sender name, bank name, slip reference / transaction id, confidence, and raw important text.
Prioritize these labels/keywords when present on Thai slips:
- เลขอ้างอิง, หมายเลขอ้างอิง, Ref, Reference No., Transaction ID, หมายเลขรายการ, เลขที่รายการ, รายการโอนเงิน
- วันเวลาโอน, วันที่ทำรายการ
- ผู้รับเงิน, บัญชีผู้รับ, เลขท้ายบัญชีผู้รับ, PromptPay, พร้อมเพย์ผู้รับ
Always return transferredAtText if you can see any date/time text, even if transferredAtIso is null.
Use Asia/Bangkok timezone.
Convert Buddhist Era years to Common Era.
If datetime cannot be parsed confidently, set transferredAtIso to null.`;

/**
 * @param {string} text
 * @returns {Record<string, unknown>|null}
 */
function extractJsonObject(text) {
  const s = String(text || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return /** @type {Record<string, unknown>} */ (JSON.parse(s.slice(start, end + 1)));
  } catch {
    return null;
  }
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
function toAmount(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
function cleanText(raw) {
  const s = String(raw || "").trim();
  return s ? s.slice(0, 500) : null;
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
function normalizeLast4(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  return s.length >= 4 ? s.slice(-4) : null;
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
function normalizeIso(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Best-effort parse from Thai/BE date text into ISO.
 * Example: 24/04/2569 17:23
 * @param {string|null} text
 * @returns {string|null}
 */
function parseThaiDateTextToIso(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const m = s.match(
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return null;
  let y = Number(m[3]);
  if (y >= 2400) y -= 543;
  if (y < 100) y += 2000;
  const mo = Math.max(1, Math.min(12, Number(m[2])));
  const d = Math.max(1, Math.min(31, Number(m[1])));
  const hh = Math.max(0, Math.min(23, Number(m[4] || 0)));
  const mm = Math.max(0, Math.min(59, Number(m[5] || 0)));
  const ss = Math.max(0, Math.min(59, Number(m[6] || 0)));
  // interpret as Asia/Bangkok local (+07:00)
  const iso = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(
    d,
  ).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(
    2,
    "0",
  )}:${String(ss).padStart(2, "0")}+07:00`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * @param {string} text
 * @returns {string}
 */
function maskSensitiveForLog(text) {
  const s = String(text || "");
  return s
    .replace(/\b\d{10,16}\b/g, (m) => `${m.slice(0, 2)}***${m.slice(-2)}`)
    .replace(/\b\d{4,6}\b/g, "***");
}

/**
 * @param {string} rawText
 * @returns {string|null}
 */
function extractSlipRefFromRawText(rawText) {
  const s = String(rawText || "");
  if (!s) return null;
  const labeled =
    s.match(
      /(เลขอ้างอิง|หมายเลขอ้างอิง|reference(?:\s*no\.?)?|ref|transaction\s*id|หมายเลขรายการ|เลขที่รายการ)\s*[:\-]?\s*([A-Z0-9\-]{8,40})/i,
    ) || null;
  if (labeled?.[2]) return String(labeled[2]).trim();
  const generic = s.match(/\b(?=[A-Z0-9\-]{10,30}\b)(?=.*[A-Z])(?=.*\d)[A-Z0-9\-]+\b/i);
  if (!generic) return null;
  const candidate = String(generic[0]).trim();
  if (/^[xX\*\-0-9]+$/.test(candidate)) return null;
  return candidate;
}

/**
 * @param {string} rawText
 * @returns {string|null}
 */
function extractTransferredAtTextFromRawText(rawText) {
  const s = String(rawText || "");
  if (!s) return null;
  const labeled =
    s.match(
      /(วันเวลาโอน|วันที่ทำรายการ|เวลาทำรายการ|transaction\s*(date|time)|date\/time)\s*[:\-]?\s*((\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](?:\d{2}|\d{4}))(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/i,
    ) || null;
  if (labeled?.[3]) return String(labeled[3]).trim();
  const direct =
    s.match(
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](?:\d{2}|\d{4})\s+\d{1,2}:\d{2}(?::\d{2})?)/,
    ) || null;
  return direct?.[1] ? String(direct[1]).trim() : null;
}

/**
 * @param {string} rawText
 * @returns {string|null}
 */
function extractReceiverAccountLast4FromRawText(rawText) {
  const s = String(rawText || "");
  if (!s) return null;
  const labeled =
    s.match(
      /(เลขท้ายบัญชีผู้รับ|บัญชีผู้รับ|to|receiver)\s*[:\-]?\s*([xX\*\d\-]{4,30})/i,
    ) || null;
  const source = labeled?.[2];
  if (!source) return null;
  const digits = String(source).replace(/\D+/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * @param {string} rawText
 * @returns {string|null}
 */
function extractReceiverNameFromRawText(rawText) {
  const s = String(rawText || "");
  if (!s) return null;
  const m =
    s.match(
      /(ผู้รับเงิน|ชื่อผู้รับ|receiver|to)\s*[:\-]?\s*([^\n\r]{2,80})/i,
    ) || null;
  if (!m?.[2]) return null;
  return String(m[2])
    .replace(/(บัญชีผู้รับ|เลขท้ายบัญชี|promptpay|พร้อมเพย์).*/i, "")
    .replace(/\d+/g, "")
    .trim();
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
function normalizeConfidence(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {unknown} parsedRaw
 * @returns {SlipOcrExtractResult}
 */
export function normalizeSlipOcrResult(parsedRaw) {
  const p =
    parsedRaw && typeof parsedRaw === "object" && !Array.isArray(parsedRaw)
      ? /** @type {Record<string, unknown>} */ (parsedRaw)
      : {};
  const transferredAtText = cleanText(p.transferredAtText);
  const transferredAtIsoRaw = normalizeIso(p.transferredAtIso);
  return {
    amount: toAmount(p.amount),
    currency: String(p.currency || "").trim().toUpperCase() === "THB" ? "THB" : null,
    transferredAtText,
    transferredAtIso: transferredAtIsoRaw || parseThaiDateTextToIso(transferredAtText),
    receiverName: cleanText(p.receiverName),
    receiverAccountLast4: normalizeLast4(p.receiverAccountLast4),
    receiverPromptPay: cleanText(p.receiverPromptPay),
    senderName: cleanText(p.senderName),
    bankName: cleanText(p.bankName),
    slipRef: cleanText(p.slipRef),
    confidence: normalizeConfidence(p.confidence),
    rawText: String(p.rawText || "").trim().slice(0, 4000),
  };
}

/**
 * @param {SlipOcrExtractResult} result
 * @returns {{ result: SlipOcrExtractResult, applied: string[] }}
 */
function applyFallbackFromRawText(result) {
  const r = { ...result };
  /** @type {string[]} */
  const applied = [];
  const raw = String(r.rawText || "");
  if (!raw) return { result: r, applied };

  if (!r.slipRef) {
    const v = extractSlipRefFromRawText(raw);
    if (v) {
      r.slipRef = v;
      applied.push("slipRef");
    }
  }
  if (!r.transferredAtText) {
    const v = extractTransferredAtTextFromRawText(raw);
    if (v) {
      r.transferredAtText = v;
      applied.push("transferredAtText");
    }
  }
  if (!r.transferredAtIso && r.transferredAtText) {
    const v = parseThaiDateTextToIso(r.transferredAtText);
    if (v) {
      r.transferredAtIso = v;
      applied.push("transferredAtIso");
    }
  }
  if (!r.receiverAccountLast4) {
    const v = extractReceiverAccountLast4FromRawText(raw);
    if (v) {
      r.receiverAccountLast4 = v;
      applied.push("receiverAccountLast4");
    }
  }
  if (!r.receiverName) {
    const v = extractReceiverNameFromRawText(raw);
    if (v) {
      r.receiverName = v;
      applied.push("receiverName");
    }
  }
  return { result: r, applied };
}

/**
 * @param {object} p
 * @param {Buffer} p.imageBuffer
 * @param {string} [p.mimeType]
 * @param {string} [p.lineUserId]
 * @param {string|number|null} [p.paymentId]
 * @param {(req: object) => Promise<{ output_text?: string }>} [p.createResponses]
 * @returns {Promise<SlipOcrExtractResult>}
 */
export async function extractSlipOcrFromImage({
  imageBuffer,
  mimeType = "image/jpeg",
  lineUserId = "",
  paymentId = null,
  createResponses,
}) {
  const b = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer || []);
  if (!b.length) throw new Error("slip_ocr_empty_image");
  console.log(
    JSON.stringify({
      event: "SLIP_OCR_EXTRACT_STARTED",
      lineUserIdPrefix: String(lineUserId || "").slice(0, 8),
      paymentId: paymentId != null ? String(paymentId) : null,
      model: env.SLIP_OCR_MODEL,
    }),
  );
  try {
    const call = createResponses ?? ((req) => openai.responses.create(req));
    const res = await withOpenAi429RetryOnce(() =>
      call({
        model: env.SLIP_OCR_MODEL,
        temperature: 0,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: SYSTEM_PROMPT },
              {
                type: "input_image",
                image_url: `data:${mimeType};base64,${b.toString("base64")}`,
              },
            ],
          },
        ],
      }),
    );
    const rawText = String(res?.output_text || "").trim();
    const parsed = extractJsonObject(rawText);
    if (!parsed) {
      const e = new Error("ocr_json_parse_failed");
      console.error(
        JSON.stringify({
          event: "SLIP_OCR_EXTRACT_FAILED",
          reason: e.message,
          lineUserIdPrefix: String(lineUserId || "").slice(0, 8),
          paymentId: paymentId != null ? String(paymentId) : null,
        }),
      );
      throw e;
    }
    const normalized = normalizeSlipOcrResult(parsed);
    const fb = applyFallbackFromRawText(normalized);
    const out = fb.result;
    if (!out.rawText && rawText) out.rawText = rawText.slice(0, 4000);
    if (fb.applied.length) {
      console.log(
        JSON.stringify({
          event: "SLIP_OCR_FALLBACK_APPLIED",
          lineUserIdPrefix: String(lineUserId || "").slice(0, 8),
          paymentId: paymentId != null ? String(paymentId) : null,
          fields: fb.applied,
        }),
      );
    }
    console.log(
      JSON.stringify({
        event: "SLIP_OCR_RAW_DEBUG",
        lineUserIdPrefix: String(lineUserId || "").slice(0, 8),
        paymentId: paymentId != null ? String(paymentId) : null,
        rawTextMasked: maskSensitiveForLog(out.rawText).slice(0, 900),
        amount: out.amount,
        transferredAtText: out.transferredAtText,
        transferredAtIso: out.transferredAtIso,
        receiverName: out.receiverName,
        receiverAccountLast4: out.receiverAccountLast4,
        receiverPromptPay: out.receiverPromptPay,
        slipRef: out.slipRef,
        bankName: out.bankName,
        confidence: out.confidence,
      }),
    );
    console.log(
      JSON.stringify({
        event: "SLIP_OCR_EXTRACT_SUCCESS",
        lineUserIdPrefix: String(lineUserId || "").slice(0, 8),
        paymentId: paymentId != null ? String(paymentId) : null,
        hasAmount: out.amount != null,
        hasSlipRef: Boolean(out.slipRef),
        confidence: out.confidence,
      }),
    );
    console.log(
      JSON.stringify({
        event: "SLIP_OCR_FIELD_COMPLETENESS",
        lineUserIdPrefix: String(lineUserId || "").slice(0, 8),
        paymentId: paymentId != null ? String(paymentId) : null,
        hasAmount: out.amount != null,
        hasTransferredAtIso: Boolean(out.transferredAtIso),
        hasReceiver:
          Boolean(out.receiverName) ||
          Boolean(out.receiverAccountLast4) ||
          Boolean(out.receiverPromptPay),
        hasSlipRef: Boolean(out.slipRef),
      }),
    );
    return out;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "SLIP_OCR_EXTRACT_FAILED",
        reason: String(err?.message || err).slice(0, 200),
        lineUserIdPrefix: String(lineUserId || "").slice(0, 8),
        paymentId: paymentId != null ? String(paymentId) : null,
      }),
    );
    throw err;
  }
}

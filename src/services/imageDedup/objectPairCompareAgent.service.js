import { openai, withOpenAi429RetryOnce } from "../openaiDeepScan.api.js";

/**
 * @typedef {"yes"|"no"|"unsure"} SameObjectDecision
 *
 * @typedef {Object} ObjectPairCompareResult
 * @property {SameObjectDecision} same_object
 * @property {number} confidence
 * @property {string} reason_th
 * @property {string[]} matching_signals
 * @property {string[]} different_signals
 */

const MODEL = "gpt-4.1-mini";

/**
 * @param {string} text
 * @returns {Record<string, unknown>|null}
 */
function extractJsonObject(text) {
  const s = String(text || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return /** @type {Record<string, unknown>} */ (JSON.parse(s.slice(start, end + 1)));
  } catch {
    return null;
  }
}

/**
 * @param {unknown} raw
 * @returns {ObjectPairCompareResult}
 */
export function normalizeObjectPairCompareResult(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const sameRaw = String(/** @type {Record<string, unknown>} */ (o).same_object || "")
    .trim()
    .toLowerCase();
  /** @type {SameObjectDecision} */
  const same_object =
    sameRaw === "yes" || sameRaw === "no" || sameRaw === "unsure" ? sameRaw : "unsure";
  const confidenceNum = Number(/** @type {Record<string, unknown>} */ (o).confidence);
  const confidence = Number.isFinite(confidenceNum)
    ? Math.max(0, Math.min(1, confidenceNum))
    : 0;
  const reason_th = String(/** @type {Record<string, unknown>} */ (o).reason_th || "")
    .trim()
    .slice(0, 500);
  const matching_signals = Array.isArray(/** @type {Record<string, unknown>} */ (o).matching_signals)
    ? /** @type {unknown[]} */ (/** @type {Record<string, unknown>} */ (o).matching_signals)
        .map((v) => String(v || "").trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const different_signals = Array.isArray(/** @type {Record<string, unknown>} */ (o).different_signals)
    ? /** @type {unknown[]} */ (/** @type {Record<string, unknown>} */ (o).different_signals)
        .map((v) => String(v || "").trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  return {
    same_object,
    confidence,
    reason_th,
    matching_signals,
    different_signals,
  };
}

/**
 * Compare two candidate images for possible same-object.
 * This service NEVER auto-merges; caller must require user confirmation.
 *
 * @param {object} p
 * @param {string} p.imageABase64
 * @param {string} p.imageBBase64
 * @param {string} [p.objectFamily]
 * @param {string} [p.mimeTypeA]
 * @param {string} [p.mimeTypeB]
 * @param {(req: object) => Promise<{ output_text?: string }>} [p.createResponses]
 * @returns {Promise<ObjectPairCompareResult>}
 */
export async function comparePossibleSameObjectWithAi({
  imageABase64,
  imageBBase64,
  objectFamily = "",
  mimeTypeA = "image/jpeg",
  mimeTypeB = "image/jpeg",
  createResponses,
}) {
  const a = String(imageABase64 || "").trim();
  const b = String(imageBBase64 || "").trim();
  if (!a || !b) {
    throw new Error("comparePossibleSameObjectWithAi requires 2 images");
  }
  const fam = String(objectFamily || "").trim() || "unknown";
  const prompt = `คุณเป็นผู้ช่วยตรวจว่าภาพสองภาพเป็นวัตถุมงคลชิ้นเดียวกันหรือไม่

ตอบ JSON เท่านั้น:
{
  "same_object": "yes" | "no" | "unsure",
  "confidence": 0.0,
  "reason_th": "เหตุผลสั้น",
  "matching_signals": [],
  "different_signals": []
}

กติกา:
- อย่าตอบ yes ถ้าแค่ทรงคล้ายกัน
- ต้องดูตำแหน่งกรอบ รูปทรง วัตถุด้านใน สี ลาย จุดสึก จุดเด่น
- ถ้าคนละมุมแต่ยังเห็นสัญญาณตรงกันมาก ให้ yes ได้
- ถ้าไม่มั่นใจให้ตอบ unsure
- ห้ามเดาชื่อพระ
- objectFamily: ${fam}`;

  const call = createResponses ?? ((req) => openai.responses.create(req));
  const res = await withOpenAi429RetryOnce(() =>
    call({
      model: MODEL,
      temperature: 0,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: `data:${mimeTypeA};base64,${a}` },
            { type: "input_image", image_url: `data:${mimeTypeB};base64,${b}` },
          ],
        },
      ],
    }),
  );

  const parsed = extractJsonObject(String(res?.output_text || ""));
  return normalizeObjectPairCompareResult(parsed);
}

/**
 * Turn AI compare result into app duplicate status proposal (no auto-merge).
 *
 * @param {ObjectPairCompareResult} result
 * @returns {"possible_duplicate_high"|"possible_duplicate_medium"|null}
 */
export function toPossibleDuplicateLevel(result) {
  if (result.same_object !== "yes") return null;
  if (result.confidence >= 0.9) return "possible_duplicate_high";
  if (result.confidence >= 0.75) return "possible_duplicate_medium";
  return null;
}

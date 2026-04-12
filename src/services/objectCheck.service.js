import { env } from "../config/env.js";
import {
  classifyBraceletFormWithGemini,
  readGeminiBraceletRescueEnabled,
  readGeminiBraceletRescueMinConfidence,
} from "../integrations/gemini/braceletFormRescue.service.js";
import { openai, withOpenAi429RetryOnce } from "./openaiDeepScan.api.js";
import { isTrueUnsupportedEvidence } from "../utils/objectGateReplyResolve.util.js";

const OBJECT_CHECK_PROVIDER = "openai.responses";
const OBJECT_CHECK_MODEL = "gpt-4.1-mini";
const OBJECT_CHECK_TIMEOUT_MS = Number(env.OBJECT_CHECK_TIMEOUT_MS || 35000);
const OBJECT_CHECK_MAX_RETRIES = Number(env.OBJECT_CHECK_MAX_RETRIES || 0);
const OBJECT_CHECK_DISABLE_SECOND_PASS =
  env.OBJECT_CHECK_DISABLE_SECOND_PASS === "true";

/*
ผลลัพธ์ที่คืน

single_supported = มีวัตถุสายพลังหลัก 1 ชิ้นเท่านั้น และเป็นประเภทที่ Ener Scan รองรับ
multiple         = มีหลายชิ้น / หลายรูป / คอลลาจ / screenshot รวมหลายภาพ / มีวัตถุเด่นมากกว่า 1 ชิ้น
unclear          = ภาพไม่ชัด / มืด / เบลอ / ไกลเกินไป / มองไม่แน่ใจ
unsupported      = มี 1 ชิ้น แต่ไม่ใช่ประเภทที่ Ener Scan รองรับ
inconclusive     = ยังตัดไม่ได้ / timeout / โมเดลล้ม / สัญญาณไม่ครบ — ไม่เทียบเท่า unsupported จริง
*/

/**
 * If the model echoes a reason that clearly names a non-amulet subject,
 * treat as unsupported even when it also mentions single_supported.
 */
/** @type {readonly string[]} */
const TRUSTED_PERMISSIVE_FAMILY = Object.freeze([
  "thai_amulet",
  "talisman",
  "crystal",
]);

const PERMISSIVE_UPGRADE_MIN_CONFIDENCE = 0.72;

/**
 * Second pass may only upgrade to allow_scan when family + confidence + objectCount are explicit.
 * @param {object|null|undefined} structured
 * @returns {boolean}
 */
export function permissiveAllowsSingleSupportedUpgrade(structured) {
  if (!structured || typeof structured !== "object") return false;
  const conf = structured.confidence;
  if (conf == null || !Number.isFinite(Number(conf))) return false;
  if (Number(conf) < PERMISSIVE_UPGRADE_MIN_CONFIDENCE) return false;
  const fam = String(structured.supportedFamilyGuess || "")
    .trim()
    .toLowerCase();
  if (!TRUSTED_PERMISSIVE_FAMILY.includes(fam)) return false;
  const oc = structured.objectCount;
  if (oc == null || !Number.isFinite(Number(oc)) || Number(oc) !== 1) {
    return false;
  }
  return true;
}

function outputSuggestsNonAmuletSubject(outputLower) {
  const hints = [
    "อาหาร",
    "ก๋วยเตี๋ยว",
    "ซุป",
    "เครื่องดื่ม",
    "ขนม",
    "coffee",
    "เบอร์เกอร์",
    "food",
    "soup",
    "noodle",
    "meal",
    "breakfast",
    "lunch",
    "dinner",
    "cuisine",
    "beverage",
    "snack",
    "fruit",
    "salad",
    "dessert",
    "human",
    "person",
    "people",
    "portrait",
    "selfie",
    "face",
    "body",
    "child",
    "man",
    "woman",
    "ใบหน้า",
    "ร่างกาย",
    "เซลฟี่",
    "ถ่ายคน",
    "animal",
    "สัตว์",
    "แมว",
    "หมา",
    "น้องหมา",
    "bird",
    "document",
    "เอกสาร",
    "screenshot",
    "หน้าจอ",
    "กระดาษ",
    "receipt",
    "bank slip",
    "payment slip",
    "สลิป",
    "tarot",
    "oracle",
    "playing card",
    "playing cards",
    "card game",
    "trading card",
    "collectible card",
    "card",
    "ไพ่",
    "ไพ่ทาโรต์",
    "ทาโรต์",
    "ไพ่ยิปซี",
    "การ์ด",
    "การ์ดทาโรต์",
    "การ์ดเล่น",
    "board game",
    "เกมกระดาน",
    "mtg",
    "pokemon card",
    "magic: the gathering",
    "landscape",
    "scenery",
    "ทิวทัศน์",
    "วิว",
    "mountain",
    "ท้องฟ้า",
    "ทะเล",
    "beach",
    "skyline",
    "ไม่ใช่วัตถุมงคล",
    "ไม่ใช่พระ",
    "not an amulet",
    "not sacred",
  ];
  return hints.some((h) => outputLower.includes(h));
}

export function normalizeObjectCheckOutput(outputText) {
  const output = String(outputText || "").trim().toLowerCase();

  console.log("[OBJECT_CHECK] raw result:", output);

  if (
    output.includes("multiple") ||
    output.includes("many") ||
    output.includes("several") ||
    output.includes("more than one") ||
    output.includes("หลาย") ||
    output.includes("มากกว่า 1") ||
    output.includes("มากกว่า1") ||
    output.includes("หลายชิ้น") ||
    output.includes("คอลลาจ") ||
    output.includes("collage") ||
    output.includes("หลายรูป")
  ) {
    return "multiple";
  }

  if (
    output.includes("unclear") ||
    output.includes("blur") ||
    output.includes("blurry") ||
    output.includes("ไม่ชัด") ||
    output.includes("เบลอ") ||
    output.includes("มืด")
  ) {
    return "unclear";
  }

  if (output.includes("inconclusive")) {
    return "inconclusive";
  }

  if (
    output.includes("unsupported") ||
    output.includes("not supported") ||
    output.includes("ไม่รองรับ")
  ) {
    return "unsupported";
  }

  if (output.includes("single_supported") && outputSuggestsNonAmuletSubject(output)) {
    return "unsupported";
  }

  if (output.includes("single_supported")) {
    return "single_supported";
  }

  if (outputSuggestsNonAmuletSubject(output)) {
    return "unsupported";
  }

  return "unsupported";
}

/**
 * @param {string} text
 * @returns {object|null}
 */
function extractJsonObject(text) {
  const s = String(text || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

const LABEL_SET = new Set([
  "single_supported",
  "multiple",
  "unclear",
  "unsupported",
  "inconclusive",
]);

/**
 * @param {unknown} v
 * @returns {string}
 */
function normalizePermissiveLabel(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (LABEL_SET.has(s)) return s;
  return "unsupported";
}

/**
 * Label from permissive JSON parse. If JSON missing/invalid → `inconclusive` (avoid accidental hard reject).
 * @param {object|null} parsed
 * @returns {string}
 */
export function permissiveLabelFromParsedJson(parsed) {
  return parsed
    ? normalizePermissiveLabel(parsed?.label)
    : "inconclusive";
}

/**
 * @param {string} instructionText
 * @param {string} imageBase64
 */
async function callObjectCheckModel(instructionText, imageBase64) {
  const model = OBJECT_CHECK_MODEL;
  console.log("[OPENAI_MODEL]", model);
  return openai.responses.create({
    model,
    temperature: 0,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: instructionText,
          },
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${imageBase64}`,
          },
        ],
      },
    ],
  });
}

const STRICT_PROMPT = `
ตรวจสอบภาพนี้ แล้วตอบเพียงคำเดียวจากตัวเลือกด้านล่าง (ห้ามตอบคำอื่น)

คำอธิบายระบบ:
Ener Scan รองรับเฉพาะวัตถุมงคล/พลังแบบชิ้นเดียวที่ชัดเจน:
- พระเครื่อง, เหรียญพระ, พระกลม, เครื่องราง, คริสตัล/หินที่ถือเป็นวัตถุเด่น, พระบูชา, วัตถุมงคล
- อยู่ในกรอบพลาสติก/เลี่ยม/อะคริลิก, วางบนโต๊ะ, ถือบนมือ, ฉากหลังเรียบ — ไม่ใช่เหตุผลปฏิเสธถ้ายังเห็นวัตถุมงคลชิ้นเดียวชัด
- เครื่องประดับสายพลังที่รวมเป็นวัตถุ 1 ชิ้น เช่น สร้อย 1 เส้น กำไล 1 วง ลูกประคำ 1 วง

ต้องตอบ unsupported ทันที (แม้มีแค่ชิ้นเดียวในภาพ) หากเป็นหัวข้อใดหนึ่งต่อไปนี้ชัดเจน:
- อาหาร เครื่องดื่ม ขนม ก๋วยเตี๋ยว ซุป จานอาหาร หรือสิ่งที่เป็นหลักของภาพเป็นอาหาร/เครื่องดื่ม
- คน ใบหน้า ร่างกาย เซลฟี่ ภาพถ่ายบุคคล หรือคนเป็นจุดเด่นของภาพ
- สัตว์ (เลี้ยงหรือป่า) เป็นหลักของภาพ
- เอกสาร กระดาษ หนังสือ บัตร สลิป หรือภาพ screenshot/แคปหน้าจอ ข้อความแชท แอป
- ไพ่ทาโรต์ ไพ่ oracle ไพ่เล่น playing card การ์ดเกม trading card หรือภาพลักษณะการ์ด/เอกสารแบนแบบมีขอบสี่เหลี่ยมและข้อความภาษาอังกฤษตามขอบ (เช่น ชื่อไพ่) ที่ชัดว่าไม่ใช่วัตถุมงคลไทย
- ทิวทัศน์ วิวธรรมชาติ ทะเล ภูเขา ท้องฟ้า ถนน ฉากกว้างที่ไม่มีวัตถุมงคลชิ้นเดียวเป็นจุดเด่น
- ของใช้ทั่วไป ของเล่น อุปกรณ์ ยานพาหนะ ของตกแต่งบ้าน ที่ไม่ใช่วัตถุมงคลตามรายการรองรับด้านบน

กติกาตัดสิน:
- single_supported = วัตถุมงคล/พลังหลัก 1 ชิ้น (ประเภทที่รองรับ) และภาพพอมองประเมินได้
- multiple = วัตถุมงคลแยกกันมากกว่า 1 ชิ้น / หลายรูปในภาพเดียว / คอลลาจ / screenshot รวมหลายภาพ
- unclear = ภาพมืด เบลอ ไกลเกินไป หรือมองไม่ชัดว่ามีวัตถุอะไร
- unsupported = ไม่ใช่วัตถุที่รองรับ (รวมทั้งกรณีด้านบน: อาหาร คน สัตว์ เอกสาร ไพ่/การ์ด ทิวทัศน์ ฯลฯ)

สำคัญ:
- ถ้าหลักของภาพเป็นอาหารหรือเครื่องดื่ม ให้ตอบ unsupported เสมอ (ไม่ใช่ single_supported)
- ถ้าเป็นสร้อย 1 เส้น, กำไล 1 วง, ลูกประคำ 1 วง หรือวัตถุที่หลายเม็ดแต่รวมเป็นชิ้นเดียว ให้ตอบ single_supported
- ห้ามนับเม็ดหิน/ลูกปัดของวัตถุเดียวเป็น multiple
- multiple เฉพาะเมื่อมีวัตถุแยกกันหลายชิ้นจริง ๆ หรือคอลลาจ/screenshot หลายภาพ
- ถ้าไม่มั่นใจระหว่าง single_supported กับ multiple ให้ตอบ multiple
- ถ้าเห็นวัตถุมงคล/เหรียญ/พระ/หิน ชิ้นเดียวชัด แม้มุมถ่ายหรือกรอบแปลก ให้ตอบ single_supported ก่อน (อย่าตอบ unsupported เพียงเพราะทรงกลมหรือมีกรอบพลาสติก)
- ถ้าไม่มั่นใจระหว่าง single_supported กับ unsupported ให้ตอบ unsupported หรือ unclear (อย่าตอบ single_supported ถ้าสัญญาณอ่อน — ระบบอาจตรวจซ้ำอัตโนมัติ)
- ไพ่ การ์ด เอกสาร screenshot สลิป หรือภาพนอกบริการชัดเจน → unsupported; ถ้าสัญญาณอ่อนมากจนเดาไม่ได้ → unclear (ห้ามเดาเป็น single_supported)

ห้ามอธิบาย ห้ามใส่ประโยค ตอบเพียงหนึ่งคำจากรายการเท่านั้น

ตัวเลือกคำตอบ:
single_supported
multiple
unclear
unsupported
`;

const PERMISSIVE_PROMPT = `
คุณเป็นผู้ช่วยตรวจภาพวัตถุมงคล (รอบที่ 2 — ใช้เมื่อรอบแรกไม่แน่ใจ)

ภาพนี้อาจมี: พระในกรอบพลาสติก, เหรียญ/พระกลม, ทรงหยดน้ำ, ถือบนมือ, วางบนพื้นเรียบ, มุมถ่ายแปลก — สิ่งเหล่านี้ไม่ใช่เหตุผลปฏิเสธเองถ้าจุดเด่นคือวัตถุมงคลชิ้นเดียว

ให้ประเมินแล้วตอบเป็น JSON เท่านั้น (ห้าม markdown ห้ามข้อความนอก JSON) รูปแบบ:
{"label":"single_supported"|"multiple"|"unclear"|"unsupported","objectCount":1,"confidence":0.0,"hasCasing":false,"shapeHint":"round|rectangular|teardrop|irregular|unknown","supportedFamilyGuess":"thai_amulet|talisman|crystal|other_unknown"}

คำอธิบายฟิลด์:
- label: single_supported = วัตถุมงคล/พลังที่รองรับ 1 ชิ้นเป็นหลัก (พระ เครื่องราง หิน/คริสตัลชิ้นเดียว)
- multiple = หลายชิ้นแยกกัน / คอลลาจ / หลายรูปในภาพเดียว
- unclear = มองไม่เห็นวัตถุชัด / เบลอมาก / มืดมาก
- unsupported = มั่นใจว่าไม่ใช่วัตถุมงคล (อาหาร คน สัตว์ เอกสาร สลิป ไพ่ทาโรต์/ไพ่ oracle/playing card/การ์ดเกม screenshot meme ทิวทัศน์ ของใช้ทั่วไป ฯลฯ)
- objectCount: จำนวนวัตถุแยกกันที่เด่น (ประมาณการ)
- confidence: 0–1 ความมั่นใจของ label
- hasCasing: true ถ้ามีกรอบพลาสติก/เลี่ยม/อะคริลิกห่อวัตถุ
- shapeHint: ทรงหลักของวัตถุที่เห็น
- supportedFamilyGuess: ประเภทที่คาด

กติกา:
- ถ้ามีวัตถุมงคลชิ้นเดียวที่พอเชื่อได้ แม้มุมแปลกหรือมีกรอบ — ให้ label เป็น single_supported และ confidence สะท้อนความไม่แน่นอนได้
- ห้าม reject เพียงเพราะทรงกลมหรือสี่เหลี่ยมหรือมีกรอบ
- reject (unsupported) เมื่อมั่นใจว่าไม่ใช่พระ/เครื่องราง/หินสายพลัง หรือเป็นไพ่/การ์ด/เอกสาร/สลิป/คน/อาหาร/หลายชิ้นชัด
- ถ้าภาพเป็นไพ่ทาโรต์ ไพ่เล่น หรือการ์ดเกม ให้ label=unsupported และ confidence สูง — ห้าม upgrade เป็น single_supported
- ถ้ายังไม่แน่ใจระหว่างวัตถุมงคลกับของอื่น ให้ label=unclear หรือ unsupported และ confidence ต่ำ — อย่าตอบ single_supported แบบเดา
- ไพ่/การ์ด (tarot, oracle, playing card, trading card, card ทั่วไป) เอกสาร screenshot สลิป → unsupported; ถ้าไม่แน่ใจจริง ๆ ให้ unclear ไม่ใช่ single_supported
`;

/**
 * @param {string} imageBase64
 * @returns {Promise<string>}
 */
async function runStrictObjectCheck(imageBase64) {
  const base64Len = imageBase64?.length || 0;
  const imageBytesApprox = Math.max(0, Math.floor((base64Len * 3) / 4));
  const startedAt = Date.now();
  const maxAttempts = Math.max(1, 1 + OBJECT_CHECK_MAX_RETRIES);

  console.log(
    JSON.stringify({
      event: "OBJECT_CHECK_START",
      provider: OBJECT_CHECK_PROVIDER,
      model: OBJECT_CHECK_MODEL,
      pass: "strict",
      imageBase64Length: base64Len,
      imageBytesApprox,
      timeoutMs: OBJECT_CHECK_TIMEOUT_MS,
      maxAttempts,
    }),
  );

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      const response = await Promise.race([
        withOpenAi429RetryOnce(() =>
          callObjectCheckModel(STRICT_PROMPT, imageBase64),
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("object_check_timeout")), OBJECT_CHECK_TIMEOUT_MS),
        ),
      ]);

      const normalized = normalizeObjectCheckOutput(response?.output_text || "");
      const endedAt = Date.now();
      console.log(
        JSON.stringify({
          event: "OBJECT_CHECK_END",
          provider: OBJECT_CHECK_PROVIDER,
          model: OBJECT_CHECK_MODEL,
          pass: "strict",
          attempt,
          attemptsTotal: maxAttempts,
          result: normalized,
          elapsedMs: endedAt - startedAt,
          attemptElapsedMs: endedAt - attemptStartedAt,
          endCause: "success",
        }),
      );
      return normalized;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || "");
      const timeout = /timeout/i.test(message);
      const status = Number(error?.status || 0);
      const retryable =
        timeout ||
        status === 408 ||
        status === 409 ||
        status === 429 ||
        status >= 500;
      const willRetry = retryable && attempt < maxAttempts;
      console.error(
        JSON.stringify({
          event: "OBJECT_CHECK_FAIL",
          provider: OBJECT_CHECK_PROVIDER,
          model: OBJECT_CHECK_MODEL,
          pass: "strict",
          attempt,
          attemptsTotal: maxAttempts,
          timeout,
          retryable,
          willRetry,
          status: Number.isFinite(status) ? status : 0,
          message,
          elapsedMs: Date.now() - startedAt,
          attemptElapsedMs: Date.now() - attemptStartedAt,
          endCause: willRetry ? "retry" : "fallback_unsupported",
        }),
      );
      if (!willRetry) break;
    }
  }

  const msg = String(lastError?.message || lastError || "");
  const timeout = /object_check_timeout|timeout/i.test(msg);
  console.error("[OBJECT_CHECK] failed:", msg);
  console.log(
    JSON.stringify({
      event: timeout
        ? "OBJECT_GATE_TIMEOUT_RECLASSIFIED"
        : "OBJECT_GATE_INCONCLUSIVE",
      provider: OBJECT_CHECK_PROVIDER,
      model: OBJECT_CHECK_MODEL,
      pass: "strict",
      reason: timeout ? "object_check_timeout" : "strict_pass_total_failure",
      message: msg.slice(0, 200),
    }),
  );
  return "inconclusive";
}

/**
 * @param {string} imageBase64
 * @returns {Promise<{ label: string, objectCount: number|null, confidence: number|null, hasCasing: boolean|null, shapeHint: string|null, supportedFamilyGuess: string|null, rawText: string }>}
 */
async function runPermissiveStructuredObjectCheck(imageBase64) {
  const startedAt = Date.now();
  const response = await Promise.race([
    withOpenAi429RetryOnce(() =>
      callObjectCheckModel(PERMISSIVE_PROMPT, imageBase64),
    ),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("object_check_timeout")), OBJECT_CHECK_TIMEOUT_MS),
    ),
  ]);

  const rawText = String(response?.output_text || "").trim();
  const parsed = extractJsonObject(rawText);
  const label = permissiveLabelFromParsedJson(parsed);
  const objectCount =
    parsed?.objectCount != null && Number.isFinite(Number(parsed.objectCount))
      ? Number(parsed.objectCount)
      : null;
  const confidence =
    parsed?.confidence != null && Number.isFinite(Number(parsed.confidence))
      ? Math.min(1, Math.max(0, Number(parsed.confidence)))
      : null;
  const hasCasing =
    typeof parsed?.hasCasing === "boolean" ? parsed.hasCasing : null;
  const shapeHint =
    parsed?.shapeHint != null ? String(parsed.shapeHint).slice(0, 32) : null;
  const supportedFamilyGuess =
    parsed?.supportedFamilyGuess != null
      ? String(parsed.supportedFamilyGuess).slice(0, 48)
      : null;

  console.log(
    JSON.stringify({
      event: "OBJECT_CHECK_END",
      pass: "permissive_structured",
      model: OBJECT_CHECK_MODEL,
      elapsedMs: Date.now() - startedAt,
      label,
      parseOk: Boolean(parsed),
    }),
  );

  return {
    label,
    objectCount,
    confidence,
    hasCasing,
    shapeHint,
    supportedFamilyGuess,
    rawText: rawText.slice(0, 500),
  };
}

const STRICT_CRYSTAL_FAMILY_PROMPT = `ตรวจภาพนี้แล้วตอบ JSON เท่านั้น (ห้าม markdown ห้ามข้อความอื่น)

{
  "familyLabel": "crystal|sacred_amulet|unknown",
  "familyConfidence": 0.0,
  "primaryObjectOwner": "bracelet|amulet_like|unknown",
  "hasCharmAttachment": false,
  "reason": "short"
}

กติกา:
- crystal = วัตถุหลักของภาพเป็นหิน/คริสตัล/ลูกปัดหินสายพลัง หรือเครื่องประดับหินที่รวมกันเป็นชิ้นเดียว
- sacred_amulet = วัตถุหลักของภาพเป็นพระ/ตะกรุด/เครื่องราง/amulet-like object
- ถ้ามีท่อ ตะกรุด charm หรือชิ้นแทรก แต่โครงหลักเป็นกำไลลูกปัดเป็นวง ให้ primaryObjectOwner = bracelet
- ถ้าไม่มั่นใจ ห้ามเดาเป็น crystal
- beads ในกำไลเส้นเดียวไม่ถือเป็นหลายชิ้น`;

const STRICT_BRACELET_FORM_PROMPT = `ตรวจภาพนี้แล้วตอบ JSON เท่านั้น (ห้าม markdown ห้ามข้อความอื่น)

{
  "formFactor": "bracelet|necklace|pendant|loose_stone|unknown",
  "formConfidence": 0.0,
  "isSingleWearableObject": true,
  "hasBeadLoop": true,
  "isClosedLoop": true,
  "primaryOwner": "bracelet|attachment|unknown",
  "reason": "short"
}

กติกา:
- bracelet = วัตถุหลักเป็นวงกำไล/ลูกปัดร้อยเป็นวงสวมข้อมือ
- ห้ามนับลูกปัดในกำไลเส้นเดียวเป็นหลายชิ้น
- ถ้ามีชาร์มหรือท่อแทรก แต่โครงรวมยังเป็นกำไล ให้ primaryOwner = bracelet
- ถ้าไม่มั่นใจ ให้ตอบ unknown
- อย่าเดาจากชิ้นเล็กที่ห้อยอยู่ ถ้าโครงสร้างหลักของภาพคือวงกำไล`;

/**
 * @param {unknown} v
 * @returns {"crystal"|"sacred_amulet"|"unknown"}
 */
function normalizeStrictFamilyLabel(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (s === "crystal" || s === "sacred_amulet" || s === "unknown") return s;
  return "unknown";
}

/**
 * @param {unknown} v
 * @returns {"bracelet"|"amulet_like"|"unknown"}
 */
function normalizePrimaryObjectOwner(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (s === "bracelet" || s === "amulet_like" || s === "unknown") return s;
  return "unknown";
}

/**
 * @param {unknown} v
 * @returns {"bracelet"|"necklace"|"pendant"|"loose_stone"|"unknown"}
 */
function normalizeFormFactor(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (
    s === "bracelet" ||
    s === "necklace" ||
    s === "pendant" ||
    s === "loose_stone" ||
    s === "unknown"
  )
    return s;
  return "unknown";
}

/**
 * @param {unknown} v
 * @returns {"bracelet"|"attachment"|"unknown"}
 */
function normalizeFormPrimaryOwner(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (s === "bracelet" || s === "attachment" || s === "unknown") return s;
  return "unknown";
}

/**
 * @param {object|null} parsed
 * @returns {{
 *   familyLabel: "crystal"|"sacred_amulet"|"unknown",
 *   familyConfidence: number,
 *   primaryObjectOwner: "bracelet"|"amulet_like"|"unknown",
 *   hasCharmAttachment: boolean,
 *   reason: string,
 * }}
 */
function crystalFamilyFromParsed(parsed) {
  const familyLabel = normalizeStrictFamilyLabel(parsed?.familyLabel);
  const fc = parsed?.familyConfidence;
  const familyConfidence =
    fc != null && Number.isFinite(Number(fc))
      ? Math.min(1, Math.max(0, Number(fc)))
      : 0;
  return {
    familyLabel,
    familyConfidence,
    primaryObjectOwner: normalizePrimaryObjectOwner(parsed?.primaryObjectOwner),
    hasCharmAttachment: Boolean(parsed?.hasCharmAttachment),
    reason:
      parsed?.reason != null ? String(parsed.reason).slice(0, 240) : "",
  };
}

/**
 * @param {object|null} parsed
 * @returns {{
 *   formFactor: ReturnType<typeof normalizeFormFactor>,
 *   formConfidence: number,
 *   isSingleWearableObject: boolean,
 *   hasBeadLoop: boolean,
 *   isClosedLoop: boolean,
 *   primaryOwner: ReturnType<typeof normalizeFormPrimaryOwner>,
 *   reason: string,
 * }}
 */
function braceletFormFromParsed(parsed) {
  const formFactor = normalizeFormFactor(parsed?.formFactor);
  const fc = parsed?.formConfidence;
  const formConfidence =
    fc != null && Number.isFinite(Number(fc))
      ? Math.min(1, Math.max(0, Number(fc)))
      : 0;
  return {
    formFactor,
    formConfidence,
    isSingleWearableObject:
      typeof parsed?.isSingleWearableObject === "boolean"
        ? parsed.isSingleWearableObject
        : false,
    hasBeadLoop:
      typeof parsed?.hasBeadLoop === "boolean" ? parsed.hasBeadLoop : false,
    isClosedLoop:
      typeof parsed?.isClosedLoop === "boolean" ? parsed.isClosedLoop : false,
    primaryOwner: normalizeFormPrimaryOwner(parsed?.primaryOwner),
    reason:
      parsed?.reason != null ? String(parsed.reason).slice(0, 240) : "",
  };
}

/**
 * Strict structured pass: crystal vs sacred amulet vs unknown.
 * @param {string} imageBase64
 */
export async function runStrictCrystalFamilyCheck(imageBase64) {
  const startedAt = Date.now();
  const response = await Promise.race([
    withOpenAi429RetryOnce(() =>
      callObjectCheckModel(STRICT_CRYSTAL_FAMILY_PROMPT, imageBase64),
    ),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("object_check_timeout")), OBJECT_CHECK_TIMEOUT_MS),
    ),
  ]);
  const rawText = String(response?.output_text || "").trim();
  const parsed = extractJsonObject(rawText);
  const row = crystalFamilyFromParsed(parsed);
  console.log(
    JSON.stringify({
      event: "CRYSTAL_BRACELET_FAMILY_CHECK",
      pass: "strict_crystal_family",
      model: OBJECT_CHECK_MODEL,
      elapsedMs: Date.now() - startedAt,
      familyLabel: row.familyLabel,
      familyConfidence: row.familyConfidence,
      primaryObjectOwner: row.primaryObjectOwner,
      parseOk: Boolean(parsed),
    }),
  );
  return row;
}

/**
 * Strict structured pass: bracelet form vs other / unknown.
 * @param {string} imageBase64
 */
export async function runStrictBraceletFormCheck(imageBase64) {
  const startedAt = Date.now();
  const response = await Promise.race([
    withOpenAi429RetryOnce(() =>
      callObjectCheckModel(STRICT_BRACELET_FORM_PROMPT, imageBase64),
    ),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("object_check_timeout")), OBJECT_CHECK_TIMEOUT_MS),
    ),
  ]);
  const rawText = String(response?.output_text || "").trim();
  const parsed = extractJsonObject(rawText);
  const row = braceletFormFromParsed(parsed);
  console.log(
    JSON.stringify({
      event: "CRYSTAL_BRACELET_FORM_CHECK",
      pass: "strict_bracelet_form",
      model: OBJECT_CHECK_MODEL,
      elapsedMs: Date.now() - startedAt,
      formFactor: row.formFactor,
      formConfidence: row.formConfidence,
      primaryOwner: row.primaryOwner,
      parseOk: Boolean(parsed),
    }),
  );
  return row;
}

/**
 * Pure eligibility decision for tests and reuse.
 * @param {{
 *   baseGateResult: string,
 *   familyCheck: object | null,
 *   formCheck: object | null,
 *   familyMin: number,
 *   formMin: number,
 *   strictPassEnabled: boolean,
 * }} p
 */
export function evaluateCrystalBraceletEligibilityFromStructuredChecks(p) {
  const baseGateResult = String(p.baseGateResult || "").trim();
  if (!p.strictPassEnabled) {
    return {
      eligible: false,
      status: /** @type {const} */ ("inconclusive"),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: p.familyCheck,
      formCheck: p.formCheck,
      shapeFamilyForcedToBracelet: false,
    };
  }
  if (baseGateResult !== "single_supported") {
    return {
      eligible: false,
      status: /** @type {const} */ ("global_reject"),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: p.familyCheck,
      formCheck: p.formCheck,
      shapeFamilyForcedToBracelet: false,
    };
  }
  const fam = p.familyCheck;
  const form = p.formCheck;
  if (!fam || !form) {
    return {
      eligible: false,
      status: /** @type {const} */ ("inconclusive"),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: fam,
      formCheck: form,
      shapeFamilyForcedToBracelet: false,
    };
  }

  if (fam.familyLabel !== "crystal") {
    return {
      eligible: false,
      status: /** @type {const} */ ("not_crystal"),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: fam,
      formCheck: form,
      shapeFamilyForcedToBracelet: false,
    };
  }
  if (fam.familyConfidence < p.familyMin) {
    return {
      eligible: false,
      status: /** @type {const} */ ("inconclusive"),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: fam,
      formCheck: form,
      shapeFamilyForcedToBracelet: false,
    };
  }
  if (fam.primaryObjectOwner === "amulet_like") {
    return {
      eligible: false,
      status: /** @type {const} */ ("not_crystal"),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: fam,
      formCheck: form,
      shapeFamilyForcedToBracelet: false,
    };
  }

  if (form.formFactor !== "bracelet") {
    return {
      eligible: false,
      status: /** @type {const} */ ("not_bracelet"),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: fam,
      formCheck: form,
      shapeFamilyForcedToBracelet: false,
    };
  }
  if (form.formConfidence < p.formMin) {
    return {
      eligible: false,
      status: /** @type {const} */ ("inconclusive"),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: fam,
      formCheck: form,
      shapeFamilyForcedToBracelet: false,
    };
  }
  if (!form.isSingleWearableObject) {
    return {
      eligible: false,
      status: /** @type {const} */ ("not_bracelet"),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: fam,
      formCheck: form,
      shapeFamilyForcedToBracelet: false,
    };
  }
  if (form.primaryOwner !== "bracelet") {
    return {
      eligible: false,
      status: /** @type {const} */ ("not_bracelet"),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: fam,
      formCheck: form,
      shapeFamilyForcedToBracelet: false,
    };
  }

  return {
    eligible: true,
    status: /** @type {const} */ ("allowed"),
    objectFamilyTruth: /** @type {const} */ ("crystal"),
    shapeFamilyTruth: /** @type {const} */ ("bracelet"),
    familyCheck: fam,
    formCheck: form,
    shapeFamilyForcedToBracelet: true,
  };
}

/**
 * Multi-pass proof for crystal bracelet lane. Does not weaken global object gate.
 * @param {string} imageBase64
 * @param {{ result: string, firstPass?: string, gateMeta?: object }} gated
 * @param {{ scanResultIdPrefix?: string, jobIdPrefix?: string }} [opts]
 */
export async function checkCrystalBraceletEligibility(imageBase64, gated, opts = {}) {
  const scanResultIdPrefix = String(opts.scanResultIdPrefix || "").slice(0, 8);
  const jobIdPrefix = String(opts.jobIdPrefix || "").slice(0, 8);
  const baseGateResult = String(gated?.result ?? "unsupported");
  const strictPassEnabled = Boolean(env.CRYSTAL_BRACELET_ENABLE_STRICT_PASS);
  const familyMin = Number(env.CRYSTAL_BRACELET_FAMILY_MIN_CONFIDENCE);
  const formMin = Number(env.CRYSTAL_BRACELET_FORM_MIN_CONFIDENCE);

  console.log(
    JSON.stringify({
      event: "CRYSTAL_BRACELET_ELIGIBILITY_START",
      scanResultIdPrefix: scanResultIdPrefix || null,
      jobIdPrefix: jobIdPrefix || null,
      baseGateResult,
      strictPassEnabled,
      familyMin,
      formMin,
    }),
  );

  if (!strictPassEnabled) {
    const out = evaluateCrystalBraceletEligibilityFromStructuredChecks({
      baseGateResult,
      familyCheck: null,
      formCheck: null,
      familyMin,
      formMin,
      strictPassEnabled,
    });
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ELIGIBILITY_RESULT",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        finalStatus: out.status,
        eligible: out.eligible,
        shapeFamilyForcedToBracelet: false,
      }),
    );
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ROUTE_BLOCKED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        reason: "strict_pass_disabled",
        finalStatus: out.status,
      }),
    );
    return {
      ...out,
      baseGateResult,
    };
  }

  if (baseGateResult !== "single_supported") {
    const out = evaluateCrystalBraceletEligibilityFromStructuredChecks({
      baseGateResult,
      familyCheck: null,
      formCheck: null,
      familyMin,
      formMin,
      strictPassEnabled,
    });
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ELIGIBILITY_RESULT",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        finalStatus: out.status,
        eligible: false,
        shapeFamilyForcedToBracelet: false,
      }),
    );
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ROUTE_BLOCKED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        reason: "global_gate_not_single_supported",
        finalStatus: out.status,
      }),
    );
    return {
      ...out,
      baseGateResult,
    };
  }

  /** @type {ReturnType<typeof crystalFamilyFromParsed> | null} */
  let familyCheck = null;
  /** @type {ReturnType<typeof braceletFormFromParsed> | null} */
  let formCheck = null;

  try {
    familyCheck = await runStrictCrystalFamilyCheck(imageBase64);
  } catch (e) {
    const msg = String(e?.message || e);
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ELIGIBILITY_RESULT",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        finalStatus: "inconclusive",
        eligible: false,
        familyLabel: null,
        familyConfidence: null,
        formFactor: null,
        formConfidence: null,
        error: msg.slice(0, 160),
        shapeFamilyForcedToBracelet: false,
      }),
    );
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ROUTE_BLOCKED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        reason: "family_pass_failed",
        finalStatus: "inconclusive",
      }),
    );
    return {
      eligible: false,
      status: "inconclusive",
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck: null,
      formCheck: null,
      shapeFamilyForcedToBracelet: false,
      baseGateResult,
    };
  }

  if (
    familyCheck.familyLabel !== "crystal" ||
    familyCheck.familyConfidence < familyMin ||
    familyCheck.primaryObjectOwner === "amulet_like"
  ) {
    const st =
      familyCheck.familyLabel !== "crystal"
        ? "not_crystal"
        : familyCheck.primaryObjectOwner === "amulet_like"
          ? "not_crystal"
          : "inconclusive";
    const out = {
      eligible: false,
      status: /** @type {"not_crystal"|"inconclusive"} */ (st),
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck,
      formCheck: null,
      shapeFamilyForcedToBracelet: false,
      baseGateResult,
    };
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ELIGIBILITY_RESULT",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        familyLabel: familyCheck.familyLabel,
        familyConfidence: familyCheck.familyConfidence,
        formFactor: null,
        formConfidence: null,
        finalStatus: out.status,
        eligible: false,
        shapeFamilyForcedToBracelet: false,
      }),
    );
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ROUTE_BLOCKED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        reason: "family_gate_failed",
        familyLabel: familyCheck.familyLabel,
        familyConfidence: familyCheck.familyConfidence,
        finalStatus: out.status,
      }),
    );
    return out;
  }

  try {
    formCheck = await runStrictBraceletFormCheck(imageBase64);
  } catch (e) {
    const msg = String(e?.message || e);
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ELIGIBILITY_RESULT",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        familyLabel: familyCheck.familyLabel,
        familyConfidence: familyCheck.familyConfidence,
        formFactor: null,
        formConfidence: null,
        finalStatus: "inconclusive",
        eligible: false,
        error: msg.slice(0, 160),
        shapeFamilyForcedToBracelet: false,
      }),
    );
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ROUTE_BLOCKED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        reason: "form_pass_failed",
        finalStatus: "inconclusive",
      }),
    );
    return {
      eligible: false,
      status: "inconclusive",
      objectFamilyTruth: null,
      shapeFamilyTruth: null,
      familyCheck,
      formCheck: null,
      shapeFamilyForcedToBracelet: false,
      baseGateResult,
    };
  }

  const finalEval = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    baseGateResult,
    familyCheck,
    formCheck,
    familyMin,
    formMin,
    strictPassEnabled,
  });

  console.log(
    JSON.stringify({
      event: "CRYSTAL_BRACELET_ELIGIBILITY_RESULT",
      scanResultIdPrefix: scanResultIdPrefix || null,
      baseGateResult,
      familyLabel: familyCheck.familyLabel,
      familyConfidence: familyCheck.familyConfidence,
      formFactor: formCheck.formFactor,
      formConfidence: formCheck.formConfidence,
      finalStatus: finalEval.status,
      eligible: finalEval.eligible,
      shapeFamilyForcedToBracelet: finalEval.shapeFamilyForcedToBracelet,
    }),
  );

  if (finalEval.eligible) {
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ROUTE_FORCED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        familyLabel: familyCheck.familyLabel,
        familyConfidence: familyCheck.familyConfidence,
        formFactor: formCheck.formFactor,
        formConfidence: formCheck.formConfidence,
        finalStatus: "allowed",
        shapeFamilyForcedToBracelet: true,
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        event: "CRYSTAL_BRACELET_ROUTE_BLOCKED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        familyLabel: familyCheck.familyLabel,
        familyConfidence: familyCheck.familyConfidence,
        formFactor: formCheck.formFactor,
        formConfidence: formCheck.formConfidence,
        finalStatus: finalEval.status,
      }),
    );
  }

  if (
    !finalEval.eligible &&
    formCheck &&
    formCheck.formFactor !== "bracelet" &&
    readGeminiBraceletRescueEnabled()
  ) {
    try {
      const raw = String(imageBase64 || "").trim();
      const b64 = raw.replace(/^data:[^;]+;base64,/i, "");
      const imageBuffer = Buffer.from(b64, "base64");
      const rescue = await classifyBraceletFormWithGemini({
        imageBuffer,
        mimeType: "image/jpeg",
        scanResultIdPrefix,
      });
      const minConf = readGeminiBraceletRescueMinConfidence();
      if (
        rescue.mode === "ok" &&
        rescue.formFactor === "bracelet" &&
        rescue.confidence != null &&
        Number.isFinite(Number(rescue.confidence)) &&
        Number(rescue.confidence) >= minConf
      ) {
        console.log(
          JSON.stringify({
            event: "CRYSTAL_BRACELET_GEMINI_RESCUE_UPGRADED",
            scanResultIdPrefix: scanResultIdPrefix || null,
            geminiFormFactor: rescue.formFactor,
            geminiConfidence: rescue.confidence,
            durationMs: rescue.durationMs ?? null,
            modelId: rescue.modelId ?? null,
          }),
        );
        console.log(
          JSON.stringify({
            event: "CRYSTAL_BRACELET_ELIGIBILITY_RESULT",
            scanResultIdPrefix: scanResultIdPrefix || null,
            baseGateResult,
            familyLabel: familyCheck.familyLabel,
            familyConfidence: familyCheck.familyConfidence,
            formFactor: formCheck.formFactor,
            formConfidence: formCheck.formConfidence,
            finalStatus: "bracelet",
            eligible: true,
            shapeFamilyForcedToBracelet: true,
            geminiRescueUpgrade: true,
          }),
        );
        console.log(
          JSON.stringify({
            event: "CRYSTAL_BRACELET_ROUTE_FORCED",
            scanResultIdPrefix: scanResultIdPrefix || null,
            baseGateResult,
            familyLabel: familyCheck.familyLabel,
            familyConfidence: familyCheck.familyConfidence,
            formFactor: formCheck.formFactor,
            formConfidence: formCheck.formConfidence,
            finalStatus: "bracelet",
            shapeFamilyForcedToBracelet: true,
            geminiRescueUpgrade: true,
          }),
        );
        return {
          eligible: true,
          status: /** @type {const} */ ("bracelet"),
          objectFamilyTruth: /** @type {const} */ ("crystal"),
          shapeFamilyTruth: /** @type {const} */ ("bracelet"),
          familyCheck,
          formCheck,
          geminiRescue: rescue,
          shapeFamilyForcedToBracelet: true,
          baseGateResult,
        };
      }
      console.log(
        JSON.stringify({
          event: "CRYSTAL_BRACELET_GEMINI_RESCUE_NO_UPGRADE",
          scanResultIdPrefix: scanResultIdPrefix || null,
          rescueMode: rescue.mode,
          geminiFormFactor:
            rescue.mode === "ok" ? rescue.formFactor : undefined,
          geminiConfidence:
            rescue.mode === "ok" ? rescue.confidence : undefined,
          durationMs: rescue.durationMs ?? null,
          minConfidenceRequired: minConf,
        }),
      );
    } catch (rescueErr) {
      console.log(
        JSON.stringify({
          event: "CRYSTAL_BRACELET_GEMINI_RESCUE_EXCEPTION",
          scanResultIdPrefix: scanResultIdPrefix || null,
          message: String(rescueErr?.message || rescueErr).slice(0, 200),
        }),
      );
    }
  }

  return {
    eligible: finalEval.eligible,
    status: finalEval.status,
    objectFamilyTruth: finalEval.objectFamilyTruth,
    shapeFamilyTruth: finalEval.shapeFamilyTruth,
    familyCheck,
    formCheck,
    shapeFamilyForcedToBracelet: finalEval.shapeFamilyForcedToBracelet,
    baseGateResult,
  };
}

/**
 * Merge first (strict) and second (permissive) labels.
 * Soft-accept (strict unsure/unsupported + permissive single_supported) requires structured evidence.
 * @param {string} first
 * @param {string} second
 * @param {object|null} [structured] — permissive JSON row; required for upgrades to single_supported
 * @returns {string}
 */
export function mergeGateLabels(first, second, structured = null) {
  if (first === "single_supported" || first === "multiple") {
    return first;
  }

  if (first === "inconclusive") {
    if (second === "single_supported") {
      return permissiveAllowsSingleSupportedUpgrade(structured)
        ? "single_supported"
        : "inconclusive";
    }
    if (second === "multiple") return "multiple";
    if (second === "unclear") return "unclear";
    if (second === "unsupported") return "inconclusive";
    if (second === "inconclusive") return "inconclusive";
    return "inconclusive";
  }

  if (first === "unsupported" || first === "unclear") {
    if (second === "single_supported") {
      if (permissiveAllowsSingleSupportedUpgrade(structured)) {
        return "single_supported";
      }
      return first === "unclear" ? "unclear" : "inconclusive";
    }
    if (second === "multiple") {
      return "multiple";
    }
    if (second === "unclear") {
      return first === "unclear" ? "unclear" : "unsupported";
    }
    if (second === "inconclusive") {
      return first === "unclear" ? "unclear" : "inconclusive";
    }
    // second === unsupported
    return first === "unclear" ? "unclear" : "unsupported";
  }

  return "unsupported";
}

/**
 * @param {string} imageBase64
 * @param {{ messageId?: string|null, path?: string }} [opts]
 * @returns {Promise<{ result: string, firstPass: string, secondPass: string|null, softAccept: boolean, gateMeta: object }>}
 */
export async function checkSingleObjectGated(imageBase64, opts = {}) {
  const messageId = opts.messageId ?? null;
  const path = opts.path ?? "unknown";

  const firstPass = await runStrictObjectCheck(imageBase64);

  console.log(
    JSON.stringify({
      event: "OBJECT_GATE_FIRST_PASS",
      messageId,
      path,
      firstLabel: firstPass,
    }),
  );

  if (
    OBJECT_CHECK_DISABLE_SECOND_PASS ||
    firstPass === "single_supported" ||
    firstPass === "multiple"
  ) {
    let finalEarly = firstPass;
    if (OBJECT_CHECK_DISABLE_SECOND_PASS && firstPass === "unsupported") {
      finalEarly = "inconclusive";
      console.log(
        JSON.stringify({
          event: "OBJECT_GATE_INCONCLUSIVE",
          messageId,
          path,
          reason: "strict_only_second_pass_disabled_unsupported_not_hard_reject",
          firstPass,
        }),
      );
    }

    console.log(
      JSON.stringify({
        event: "OBJECT_GATE_FINAL",
        messageId,
        path,
        finalDecision: finalEarly,
        firstPass,
        secondPass: null,
        softAccept: false,
        objectCount: null,
        supportedFamilyGuess: null,
        confidence: null,
        hasCasing: null,
        shapeHint: null,
        objectGateRejectReason:
          finalEarly === "unsupported" && OBJECT_CHECK_DISABLE_SECOND_PASS
            ? "strict_only_second_pass_disabled"
            : null,
      }),
    );

    return {
      result: finalEarly,
      firstPass,
      secondPass: null,
      softAccept: false,
      gateMeta: { path, messageId, firstPass, secondPass: null, finalDecision: finalEarly },
    };
  }

  let secondPass = null;
  let softAccept = false;
  let structured = null;

  try {
    structured = await runPermissiveStructuredObjectCheck(imageBase64);
    secondPass = structured.label;
  } catch (e) {
    const em = String(e?.message || e);
    const timeout = /object_check_timeout|timeout/i.test(em);
    console.error(
      JSON.stringify({
        event: "OBJECT_GATE_SECOND_PASS_FAIL",
        messageId,
        path,
        message: em,
      }),
    );
    console.log(
      JSON.stringify({
        event: timeout
          ? "OBJECT_GATE_TIMEOUT_RECLASSIFIED"
          : "OBJECT_GATE_INCONCLUSIVE",
        messageId,
        path,
        reason: timeout ? "permissive_timeout" : "permissive_exception",
      }),
    );
    secondPass = "inconclusive";
  }

  console.log(
    JSON.stringify({
      event: "OBJECT_GATE_SECOND_PASS",
      messageId,
      path,
      secondLabel: secondPass,
      objectCount: structured?.objectCount ?? null,
      confidence: structured?.confidence ?? null,
      hasCasing: structured?.hasCasing ?? null,
      shapeHint: structured?.shapeHint ?? null,
      supportedFamilyGuess: structured?.supportedFamilyGuess ?? null,
    }),
  );

  const merged = mergeGateLabels(firstPass, secondPass, structured);
  softAccept =
    merged === "single_supported" &&
    (firstPass === "unsupported" ||
      firstPass === "unclear" ||
      firstPass === "inconclusive");

  if (softAccept) {
    console.log(
      JSON.stringify({
        event: "OBJECT_GATE_SOFT_ACCEPT",
        messageId,
        path,
        firstLabel: firstPass,
        secondLabel: secondPass,
        finalDecision: merged,
      }),
    );
  }

  let finalDecision = merged;
  if (finalDecision === "unsupported") {
    const trueUnsup = isTrueUnsupportedEvidence({
      firstPass,
      secondPass,
      structured,
      secondPassDisabled: OBJECT_CHECK_DISABLE_SECOND_PASS,
    });
    if (!trueUnsup) {
      finalDecision = "inconclusive";
      console.log(
        JSON.stringify({
          event: "OBJECT_GATE_INCONCLUSIVE",
          messageId,
          path,
          reason: "weak_unsupported_downgrade",
          firstPass,
          secondPass,
          objectCount: structured?.objectCount ?? null,
          supportedFamilyGuess: structured?.supportedFamilyGuess ?? null,
          confidence: structured?.confidence ?? null,
        }),
      );
    }
  }

  const hardReject = finalDecision === "unsupported";

  if (hardReject) {
    console.log(
      JSON.stringify({
        event: "OBJECT_GATE_HARD_REJECT",
        messageId,
        path,
        finalDecision,
        objectGateRejectReason: "both_passes_reject",
        firstPass,
        secondPass,
      }),
    );
  }

  console.log(
    JSON.stringify({
      event: "OBJECT_GATE_FINAL",
      messageId,
      path,
      finalDecision,
      firstPass,
      secondPass,
      softAccept,
      objectCount: structured?.objectCount ?? null,
      supportedFamilyGuess: structured?.supportedFamilyGuess ?? null,
      confidence: structured?.confidence ?? null,
      hasCasing: structured?.hasCasing ?? null,
      shapeHint: structured?.shapeHint ?? null,
      objectGateRejectReason: hardReject ? "both_passes_reject" : null,
    }),
  );

  if (hardReject) {
    console.log(
      JSON.stringify({
        event: "OBJECT_GATE_REJECT_REASON",
        messageId,
        path,
        finalDecision,
        firstPass,
        secondPass,
        softAccept,
        objectCount: structured?.objectCount ?? null,
        supportedFamilyGuess: structured?.supportedFamilyGuess ?? null,
        confidence: structured?.confidence ?? null,
        hasCasing: structured?.hasCasing ?? null,
        shapeHint: structured?.shapeHint ?? null,
      }),
    );
  }

  return {
    result: finalDecision,
    firstPass,
    secondPass,
    softAccept,
    gateMeta: {
      path,
      messageId,
      firstPass,
      secondPass,
      finalDecision,
      ...structured,
    },
  };
}

/**
 * @param {string} imageBase64
 * @param {{ messageId?: string|null, path?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function checkSingleObject(imageBase64, opts = {}) {
  const gated = await checkSingleObjectGated(imageBase64, opts);
  return gated.result;
}

/**
 * Phase 1 image forensics — ธงความเสี่ยง "รูปไม่ใช่ภาพถ่ายของจริง"
 * (ถ่ายจากหน้าจอ/รูปเซฟจากเน็ต, AI-generated, ตัดต่อ) จากฉันทามติ 5 AI (Jul 2026):
 *
 * - LLM เป็นได้แค่พยาน ไม่ใช่ผู้ตัดสิน — บังคับชี้หลักฐานที่มองเห็นเท่านั้น
 *   ห้ามตัดสินจากความเนียน/แสงสตูดิโอ/พื้นหลังสวย (GPT-4V เคยตัดสินรูปจริงผิด ~50%)
 * - false positive (ปัดลูกค้าจริง) อันตรายกว่า false negative — default = UNSURE = ผ่าน
 * - EXIF ใช้ไม่ได้: LINE ลบ metadata ทิ้งหมดตอนบีบอัด
 * - ผู้ตัดสินจริงอยู่ที่ processScanJob: ชิ้นที่ match baseline จริงเดิม (LightGlue)
 *   ไม่โดนปัดเด็ดขาด + ลูกค้าจ่ายเงินไม่โดนปัด (ธงเงียบ)
 *
 * ยิงขนานกับ object gate — ไม่เพิ่ม latency; ล้ม/timeout = ผ่านเสมอ
 */
import { env } from "../config/env.js";
import { openai, withOpenAi429RetryOnce } from "./openaiDeepScan.api.js";
import { openaiAuxBreaker } from "../utils/circuitBreaker.util.js";

const FORENSIC_PROMPT = `You are an image authenticity risk assessor for a Thai sacred-amulet photo service.
Users photograph real amulets/talismans/stone bracelets with their phone. Assess ONLY with visible evidence.

STRICT POLICY:
- False accusations are far worse than misses. When uncertain answer "unsure".
- Do NOT infer from: clean/new-looking object, studio lighting, smooth bokeh background,
  tight crop, professional look, plastic casing (เลี่ยม) reflections, glass display cabinet reflections.
  Modern phones make real photos look "too perfect" — that alone is NOT evidence.
- Only answer "yes" when you can name SPECIFIC visible evidence.

Check three things:
1. screen_photo — photo OF a screen / saved web image / screenshot:
   evidence: moiré rainbow bands, visible pixel grid, monitor/phone bezel edges,
   OS or app UI elements (status bar, buttons, scrollbars, chat bubbles), glare shaped like a flat screen,
   cursor, watermark of a website.
2. ai_generated — synthetic image:
   evidence: garbled/melting Thai script or yantra lines that are nonsense strokes,
   physically impossible geometry (casing merging into background), warped repeating textures,
   dream-like inconsistent details.
3. edited — composited/manipulated/prepared graphic (NOT a direct photo):
   evidence: hard cutout halo around object, shadow direction contradicting highlights,
   clone-stamp repeats, ADDED text captions/labels overlaid on the image in any language
   (e.g. "ด้านหน้า", "ด้านหลัง", price text, arrows), decorative frames/borders,
   side-by-side collage with visible dividing edges or matching mirrored composition.
   If you see overlaid caption text or a designed collage layout → edited = "yes" with
   HIGH confidence (0.9+): that is a prepared graphic, not a fresh photo.
   NOTE: two sides of the same piece physically laid together and photographed in ONE
   real shot (no added text, no frames) is normal Thai practice — NOT edited.

Return JSON ONLY:
{
  "screen_photo": {"verdict":"yes|no|unsure","confidence":0.0,"evidence":["specific visible clue"]},
  "ai_generated": {"verdict":"yes|no|unsure","confidence":0.0,"evidence":[]},
  "edited": {"verdict":"yes|no|unsure","confidence":0.0,"evidence":[]},
  "benign_explanations": ["possible innocent reason for anything unusual"]
}`;

/**
 * @param {unknown} raw
 * @returns {{ verdict: "yes"|"no"|"unsure", confidence: number, evidence: string[] }}
 */
function normalizeFlag(raw) {
  const o = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const v = String(o.verdict || "").trim().toLowerCase();
  const verdict = v === "yes" || v === "no" ? v : "unsure";
  const c = Number(o.confidence);
  const confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0;
  const evidence = Array.isArray(o.evidence)
    ? o.evidence.map((e) => String(e).slice(0, 160)).filter(Boolean).slice(0, 5)
    : [];
  return { verdict, confidence, evidence };
}

/**
 * @typedef {{
 *   screenPhoto: ReturnType<typeof normalizeFlag>,
 *   aiGenerated: ReturnType<typeof normalizeFlag>,
 *   edited: ReturnType<typeof normalizeFlag>,
 *   benign: string[],
 * }} ForensicResult
 */

/**
 * @param {string} imageBase64
 * @returns {Promise<ForensicResult | null>} null = ตรวจไม่ได้ (ถือว่าผ่าน)
 */
export async function runImageForensicCheck(imageBase64) {
  if (!env.IMAGE_FORENSIC_ENABLED) return null;
  // งานเสริมต้องหลบเมื่อ OpenAI ตึง (วงจรเปิดจากอาการ 429/timeout ของด่านหลักหรือของตัวเอง)
  if (!openaiAuxBreaker.allow()) {
    console.log(JSON.stringify({ event: "IMAGE_FORENSIC_CIRCUIT_SKIP" }));
    return null;
  }
  const t0 = Date.now();
  try {
    const response = await Promise.race([
      withOpenAi429RetryOnce(() =>
        openai.responses.create({
          model: env.IMAGE_FORENSIC_MODEL,
          temperature: 0,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: FORENSIC_PROMPT },
                {
                  type: "input_image",
                  image_url: `data:image/jpeg;base64,${imageBase64}`,
                },
              ],
            },
          ],
        }),
      ),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("forensic_timeout")), env.IMAGE_FORENSIC_TIMEOUT_MS),
      ),
    ]);
    const raw = String(response?.output_text || "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("forensic_no_json");
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const out = {
      screenPhoto: normalizeFlag(parsed?.screen_photo),
      aiGenerated: normalizeFlag(parsed?.ai_generated),
      edited: normalizeFlag(parsed?.edited),
      benign: Array.isArray(parsed?.benign_explanations)
        ? parsed.benign_explanations.map((b) => String(b).slice(0, 160)).slice(0, 4)
        : [],
    };
    console.log(
      JSON.stringify({
        event: "IMAGE_FORENSIC_RESULT",
        model: env.IMAGE_FORENSIC_MODEL,
        elapsedMs: Date.now() - t0,
        screen: `${out.screenPhoto.verdict}:${out.screenPhoto.confidence}`,
        ai: `${out.aiGenerated.verdict}:${out.aiGenerated.confidence}`,
        edited: `${out.edited.verdict}:${out.edited.confidence}`,
        screenEvidence: out.screenPhoto.evidence,
        aiEvidence: out.aiGenerated.evidence,
        editedEvidence: out.edited.evidence,
      }),
    );
    openaiAuxBreaker.recordSuccess();
    return out;
  } catch (e) {
    const msg = String(e?.message || e);
    if (/429|rate|timeout/i.test(msg)) {
      openaiAuxBreaker.recordFailure(`forensic:${msg.slice(0, 60)}`);
    }
    console.warn(
      JSON.stringify({
        event: "IMAGE_FORENSIC_SKIPPED",
        message: msg.slice(0, 160),
        elapsedMs: Date.now() - t0,
      }),
    );
    return null;
  }
}

/**
 * บันได 3 ระดับ (ไม่มีปัดแข็ง): pass | flag (ธงเงียบ log ไว้จูน) | suspect (ขอถ่ายใหม่นุ่ม ๆ)
 * ต้องมี "yes + หลักฐานอย่างน้อย 1 ชิ้น + ความมั่นใจสูง" เท่านั้นถึง suspect.
 * @param {ForensicResult | null} f
 * @returns {"pass" | "flag" | "suspect"}
 */
export function evaluateForensicDecision(f) {
  if (!f) return "pass";
  const strong = (flag, minConf) =>
    flag.verdict === "yes" && flag.confidence >= minConf && flag.evidence.length >= 1;
  if (
    strong(f.screenPhoto, env.IMAGE_FORENSIC_SCREEN_MIN_CONF) ||
    strong(f.aiGenerated, env.IMAGE_FORENSIC_AI_MIN_CONF) ||
    strong(f.edited, env.IMAGE_FORENSIC_AI_MIN_CONF)
  ) {
    return "suspect";
  }
  // ธงเงียบเกณฑ์ต่ำ (log อย่างเดียว ไม่กระทบลูกค้า) — เก็บ distribution จริงไว้จูน:
  // รูป GPT-image เนียน ๆ gpt-4.1 ให้ unsure:0.4 ขณะที่รูปจริงมักได้ no มั่นใจสูง
  const weak = (flag) =>
    (flag.verdict === "yes" && flag.confidence >= 0.4) ||
    (flag.verdict === "unsure" && flag.confidence >= 0.35);
  if (weak(f.screenPhoto) || weak(f.aiGenerated) || weak(f.edited)) return "flag";
  return "pass";
}

/** ข้อความโทนอาจารย์ ไม่กล่าวหา — เปิดทางลูกค้าจริงถ่ายใหม่แบบไม่เสียหน้า */
export const FORENSIC_RETRY_TEXTS = [
  "ภาพนี้เหมือนไม่ได้ถ่ายจากของจริงโดยตรงนะ อาจารย์อ่านพลังได้ไม่เต็ม\nถ่ายสดจากมือถือ วางบนพื้นเรียบ แล้วส่งมาใหม่ เดี๋ยวดูให้แม่น ๆ",
  "ภาพนี้ผ่านหน้าจอหรือการแสดงผลมาก่อน คลื่นพลังอ่านคลาดเคลื่อนนะ\nถ่ายจากองค์จริงที่อยู่กับตัวคุณ ส่งมาใหม่อีกที",
];

/**
 * ควรท้าถ่ายสดไหม — จับโซนที่ตรวจเฉย ๆ ไม่กล้าฟันธง: รูป GPT-image เนียน ๆ
 * ให้ ai/edited "unsure ~0.4" ขณะรูปจริงมักได้ no มั่นใจสูง. suspect เต็มขั้นก็ท้าเช่นกัน
 * (คนถือของจริงพลิกถ่าย 10 วิจบ — คนใช้รูป AI/รูปเว็บไม่มีของให้ถ่ายมุมสอง)
 * @param {ForensicResult | null} f
 */
export function isChallengeWorthy(f) {
  if (!f) return false;
  const hot = (flag) =>
    (flag.verdict === "yes" && flag.confidence >= 0.4) ||
    (flag.verdict === "unsure" && flag.confidence >= 0.4);
  return hot(f.aiGenerated) || hot(f.edited) || hot(f.screenPhoto);
}

/** ท้าถ่ายสด v2: มุมเดิม + นิ้วโป้งแตะชิ้นงาน — มุมเดิมทำให้ LightGlue จับคู่ได้ชัวร์
    (บทเรียน v1: สั่งพลิกหลังแต่เทียบกับรูปหน้า → ลูกค้าจริงตกทุกราย) ส่วนนิ้วโป้ง
    คือหลักฐานว่าของอยู่ในมือจริง — คนใช้รูป AI/รูปเซฟจากเว็บไม่มีของให้แตะ */
export const CHALLENGE_REQUEST_TEXTS = [
  // กบ 22 ก.ค.: ขยาย 2 → 5 ชุด (ลูกค้าเคยเจอข้อความเดิมซ้ำ ดูเป็นบอท) — ทุกชุดคงเงื่อนไขครบ:
  // ชิ้นเดิม + มุมเดิม (LightGlue ต้องมุมเดิมถึงจับคู่ได้) + นิ้วโป้งแตะ + ส่งตอนนี้
  "อาจารย์ขอเช็กของสดหน่อย ถ่ายชิ้นเดิม มุมเดียวกับรูปเมื่อกี้ แต่ใช้นิ้วโป้งแตะที่ชิ้นงานไว้ในรูปด้วย แล้วส่งมาตอนนี้เลย เดี๋ยวอ่านให้เต็มที่",
  "ขอดูของสดอีกรูปนะ ถ่ายชิ้นเดิมมุมเดิมกับเมื่อกี้ เอานิ้วโป้งแตะชิ้นงานค้างไว้ให้เห็นในรูป อาจารย์จะได้อ่านพลังจากของที่อยู่กับตัวคุณจริง",
  "ก่อนอ่านให้เต็มที่ อาจารย์ต้องเห็นว่าชิ้นนี้อยู่ในมือคุณตอนนี้จริง ถ่ายรูปใหม่มุมเดิมกับเมื่อกี้ ให้นิ้วโป้งคุณแตะอยู่บนชิ้นงาน แล้วส่งมาเลยนะ",
  "พลังจะอ่านได้ชัดสุดจากของที่อยู่ตรงหน้าเจ้าของ รบกวนถ่ายชิ้นเดิมมุมเดิมสด ๆ ตอนนี้ ใช้นิ้วโป้งแตะที่ชิ้นงานให้เห็นในรูปด้วยนะ เดี๋ยวอาจารย์อ่านต่อให้ทันที",
  "ขอขั้นตอนเดียวก่อนนะ ถ่ายชิ้นเดิมมุมเดียวกับรูปที่ส่งมา แล้วเอานิ้วโป้งแตะชิ้นงานไว้ในรูป เป็นการยืนยันว่าของอยู่กับคุณจริง ส่งมาแล้วอาจารย์อ่านให้ละเอียดเลย",
];

/** รูปที่สองไม่ใช่ชิ้นเดียวกัน (หรือไม่มีของจริงให้ถ่าย) — ตอบแบบมีบารมี ไม่เผาขาด */
export const CHALLENGE_FAILED_TEXTS = [
  "สองรูปนี้อาจารย์เพ่งดูแล้ว ไม่ใช่ชิ้นเดียวกันนะ\nอาจารย์อ่านพลังเฉพาะของจริงที่อยู่กับตัวคุณ ถ่ายชิ้นเดิมมุมเดิมพร้อมนิ้วโป้งแตะไว้ ส่งมาใหม่ได้เลย",
];

/** ชิ้นเดียวกันจริงแต่ยังไม่เห็นนิ้วแตะ — ให้โอกาสถ่ายซ้ำ (คีย์ challenge ยังไม่หมดอายุ) */
export const CHALLENGE_NO_THUMB_TEXTS = [
  "ชิ้นเดิมถูกต้อง แต่รูปนี้ยังไม่เห็นนิ้วแตะที่ชิ้นงานเลย ถ่ายอีกรอบ มุมเดิม แล้วใช้นิ้วโป้งแตะค้างไว้ให้เห็นชัด ๆ ส่งมาเลย",
];

/**
 * เช็คว่าในรูปมีนิ้วมือคนแตะ/จับ/สัมผัสตัววัตถุจริงไหม (โจทย์ท้าถ่ายสด v2)
 * Fail-open: ตรวจไม่ได้/API พัง = ถือว่าผ่าน (false-positive-first เหมือน forensic)
 * @param {string} imageBase64
 * @returns {Promise<boolean>}
 */
export async function verifyChallengeThumbTouch(imageBase64) {
  if (!openaiAuxBreaker.allow()) return true;
  try {
    const response = await Promise.race([
      withOpenAi429RetryOnce(() =>
        openai.responses.create({
          model: env.IMAGE_FORENSIC_MODEL,
          temperature: 0,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text:
                    'A customer was asked to photograph their sacred object while touching it with their thumb/finger. ' +
                    'Look at the photo: is a real human finger or hand visibly touching, holding, or resting on the object ' +
                    '(or the object sitting in an open palm)? Be lenient — any finger contact or hand-held counts as yes. ' +
                    'Return JSON only: {"touching": true|false}',
                },
                { type: "input_image", image_url: `data:image/jpeg;base64,${imageBase64}` },
              ],
            },
          ],
        }),
      ),
      new Promise((_, rej) => setTimeout(() => rej(new Error("thumb_check_timeout")), 10000)),
    ]);
    const raw = String(response?.output_text || "").trim();
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s === -1 || e <= s) return true;
    const parsed = JSON.parse(raw.slice(s, e + 1));
    return parsed?.touching !== false;
  } catch (err) {
    const msg = String(err?.message || err);
    if (/429|rate|timeout/i.test(msg)) openaiAuxBreaker.recordFailure(`thumb_check:${msg.slice(0, 40)}`);
    return true;
  }
}

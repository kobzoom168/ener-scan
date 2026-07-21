/**
 * หน้ารายงานภาษาอังกฤษ (กบ 20 ก.ค. 2026 — เคสลูกค้าสิงคโปร์): ปุ่ม EN บนหน้ารายงาน
 * กดแล้ว ?lang=en → สลับทั้งหน้า
 *
 * สองชั้น:
 * 1) เนื้อหาไดนามิกใน payload (คำอ่าน/สรุป/tips ภาษาไทยจาก AI) → แปลด้วย LLM ตัวถูก
 *    ครั้งแรกต่อรายงาน แล้ว cache redis 30 วัน (แปลระดับ string ทั้ง payload แบบ generic
 *    ครอบทุกเลนทุก field — ข้าม key ที่เป็น url/id/token)
 * 2) ป้ายคงที่ใน template (คะแนนพลัง/พลังเด่น/ปุ่มต่าง ๆ) → พจนานุกรมในโค้ด replace บน HTML
 *    + แปลงวันที่ไทย "18 ก.ค. 2569" → "18 Jul 2026"
 *
 * พังทุกจุด = คืนของเดิม (หน้าไทย) — ห้ามทำหน้ารายงานล่ม
 */
import { getValue, setLargeValueWithTtl } from "../../redis/scanV2Redis.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
} from "../../integrations/gemini/geminiFlash.api.js";
import { env } from "../../config/env.js";

const THAI_RE = /[฀-๿]/;
const CACHE_TTL_SEC = 30 * 86400;
const CHUNK_SIZE = 50;
const LLM_TIMEOUT_MS = 30000;
const MAX_STR_LEN = 500;

/** key ที่ห้ามแปล (ค่าเป็น url/รหัส/เวลา) — เทียบทั้งชื่อเต็มและ suffix */
const SKIP_KEYS = new Set([
  "objectImageUrl", "socialImageUrl", "shareImageUrl", "thumbUrl", "img",
  "publicToken", "reportId", "scanId", "userId", "id", "generatedAt",
  "scannedAt", "birthdateUsed", "reportVersion", "rendererVersion",
  "modelLabel", "imagePhash", "imageSha256", "displayReportId",
]);
function keySkipped(key) {
  const k = String(key);
  if (SKIP_KEYS.has(k)) return true;
  return /(Url|Uri|Token|Id|At|Key|Code|Version|Href)$/.test(k);
}

/**
 * เก็บ string ไทย unique จาก payload (เดินลึกทุกชั้น)
 * @param {unknown} obj
 * @returns {string[]}
 */
export function collectThaiStrings(obj) {
  const out = new Set();
  const walk = (v, key) => {
    if (typeof v === "string") {
      if (keySkipped(key)) return;
      const s = v.trim();
      if (s && s.length <= MAX_STR_LEN && THAI_RE.test(s)) out.add(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item, key);
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v)) walk(val, k);
    }
  };
  walk(obj, "");
  return [...out];
}

/**
 * แทน string ตาม map (clone ทั้งก้อน ไม่แตะของเดิม)
 * @param {unknown} obj
 * @param {Record<string, string>} map
 */
export function replaceStringsDeep(obj, map) {
  const walk = (v, key) => {
    if (typeof v === "string") {
      if (keySkipped(key)) return v;
      return Object.prototype.hasOwnProperty.call(map, v) ? map[v] : v;
    }
    if (Array.isArray(v)) return v.map((item) => walk(item, key));
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val, k);
      return out;
    }
    return v;
  };
  return walk(obj, "");
}

const TRANSLATOR_SYSTEM = `You translate Thai strings from a Thai amulet energy report into natural English.
Rules:
- Keep numbers, percentages, report IDs (ES-...), URLs, and emoji exactly as-is.
- Tone: calm, respectful, spiritual but professional (like a thoughtful master, not a horoscope tabloid).
- "อาจารย์" => "Ajarn". "พระเครื่อง" => "amulet". "เครื่องราง" => "charm". "ดวง" => "fortune". Keep Thai proper names transliterated simply.
- Never add or remove meaning. Translate each string independently.
Reply JSON only: {"items": ["<translation of item 1>", ...]} — same length and order as input.`;

/**
 * @param {string[]} items
 * @returns {Promise<string[] | null>}
 */
async function translateChunk(items) {
  const model = getGeminiFlashModel({
    systemInstruction: TRANSLATOR_SYSTEM,
    jsonMode: true,
    temperature: 0.2,
    timeoutMs: LLM_TIMEOUT_MS,
    maxTokens: 4000,
    modelOverride: env.LLM_CONSULT_MODEL_FREE,
    cacheSystemPrompt: true,
    disableReasoning: true,
  });
  if (!model) return null;
  const raw = await generateTextWithTimeout(
    model,
    JSON.stringify({ items }),
    LLM_TIMEOUT_MS,
  );
  try {
    const parsed = JSON.parse(
      String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, ""),
    );
    const got = Array.isArray(parsed?.items) ? parsed.items : null;
    if (!got || got.length !== items.length) return null;
    return got.map((x) => String(x ?? ""));
  } catch {
    return null;
  }
}

/**
 * แปล payload เป็นอังกฤษ (cache ต่อ token 30 วัน) — พลาด = คืน payload เดิม
 * @param {object} payload
 * @param {string} publicToken
 * @returns {Promise<object>}
 */
export async function translateReportPayloadEn(payload, publicToken) {
  const token = String(publicToken || "").trim();
  if (!payload || typeof payload !== "object" || !token) return payload;

  const cacheKey = `scan_v2:report_en:${token}`;
  /** @type {Record<string, string> | null} */
  let map = null;
  try {
    const cached = await getValue(cacheKey);
    if (cached) map = JSON.parse(String(cached));
  } catch {
    map = null;
  }

  if (!map) {
    const strings = collectThaiStrings(payload);
    if (!strings.length) return payload;
    map = {};
    for (let i = 0; i < strings.length; i += CHUNK_SIZE) {
      const chunk = strings.slice(i, i + CHUNK_SIZE);
      const translated = await translateChunk(chunk).catch(() => null);
      if (!translated) continue; // chunk พลาด = ส่วนนั้นคงไทยไว้ ไม่ล้มทั้งหน้า
      for (let j = 0; j < chunk.length; j += 1) {
        const en = String(translated[j] || "").trim();
        if (en) map[chunk[j]] = en;
      }
    }
    if (Object.keys(map).length === 0) return payload;
    await setLargeValueWithTtl(cacheKey, JSON.stringify(map), CACHE_TTL_SEC).catch(() => {});
    console.log(
      JSON.stringify({
        event: "REPORT_EN_TRANSLATED",
        tokenPrefix: token.slice(0, 12),
        strings: strings.length,
        translated: Object.keys(map).length,
      }),
    );
  }

  try {
    return replaceStringsDeep(payload, map);
  } catch {
    return payload;
  }
}

/** ป้ายคงที่ใน template (เรียง longest-first ตอนใช้) */
const STATIC_LABELS = {
  "โมเดลการอ่านพลังงานของ Ener Scan": "Ener Scan energy reading model",
  "เปิดสิทธิ์เพื่อดูว่าชิ้นไหนแรงสุด": "Unlock to see your strongest piece",
  "เปิดหน้าคลังแบบเต็ม แยกตามด้านพลัง": "Open full library by energy aspect",
  "เทียบโปรไฟล์คุณกับพลังพระ/เทวรูป/เครื่องราง": "Your profile vs this piece's energy",
  "กราฟหกมิติพลังพระ/เทวรูป/เครื่องราง": "Six-aspect energy chart",
  "ชิ้นไหนในคลังหนุนดวงคุณวันนี้": "Which piece supports your fortune today",
  "ส่งรูปให้อาจารย์อ่าน ฟรีวันละ 1 ชิ้น": "Send a photo for Ajarn to read, free once a day",
  "อ่านคำอธิบายพลังทั้ง 6 ด้าน": "Read all six energy aspects",
  "เปิดสิทธิ์ครั้งแรกแล้วดูได้ตลอด": "Unlock once to keep access",
  "เปิดดูชิ้นที่หนุนดวงวันนี้": "See today's supporting piece",
  "ดูวิธีคำนวณจังหวะเสริมพลัง": "How power timing is calculated",
  "พระเด่นประจำพลังของคุณ": "Your top piece per aspect",
  "เรียงจากคะแนนสูงไปต่ำ": "Ranked from highest to lowest",
  "เลื่อนดูพลังด้านอื่น ๆ": "Swipe for other aspects",
  "ภาพวัตถุที่ใช้ในการวิเคราะห์": "Photo used for this reading",
  "ภาพวัตถุที่ส่งเข้ามา": "Submitted photo",
  "อันดับทั้งหมดในคลัง": "Full library ranking",
  "วันเดือนปีเกิดของเจ้าของ": "Owner's date of birth",
  "ผลนี้คำนวณจากอะไร": "How this result is calculated",
  "คัดลอกลิงก์รายงานแล้ว": "Report link copied",
  "วันเวลาที่วิเคราะห์": "Analyzed on",
  "แชร์การ์ดอวดพระ": "Share showcase card",
  "เด่นสุดในด้านนี้": "Top in this aspect",
  "คลังพลังของคุณ": "Your energy library",
  "เปิดสิทธิ์เพื่อดู": "Unlock to view",
  "จังหวะเสริมพลัง": "Power timing",
  "ลักษณะที่อ่านได้": "What Ajarn can read",
  "แชร์ลิงก์รายงาน": "Share report link",
  "เพิ่มเพื่อน LINE OA": "Add LINE OA",
  "รายงานฉบับเต็ม": "Full report",
  "เปิดรายงานฉบับเต็ม": "Open full report",
  "โปรไฟล์เจ้าของ": "Owner profile",
  "เวอร์ชันรายงาน": "Report version",
  "พลังทั้ง 6 ด้าน": "All six aspects",
  "เข้ากับคุณที่สุด": "Best match for you",
  "แรงสุดโดยรวม": "Strongest overall",
  "หนุนดวงวันนี้": "Supports today",
  "คะแนนด้านนี้": "aspect score",
  "เกรดพลังงาน": "Energy grade",
  "ความเข้ากัน": "Compatibility",
  "คะแนนพลัง": "Power score",
  "แชร์รายงาน": "Share report",
  "รหัสรายงาน": "Report ID",
  "คัดลอกลิงก์": "Copy link",
  "ดูรายละเอียด": "View details",
  "ดูรายงานนี้": "View this report",
  "ปักหมุดรูปนี้": "Pin this photo",
  "เข้ากับคุณ": "Match with you",
  "พลังเด่น": "Dominant power",
  "พลังรวม": "Total power",
  "เด่นสุด": "Peak",
  "สรุปผล": "Summary",
  "หนุนดวงและการตั้งหลัก": "Fortune Anchor & Grounding",
  "โชคลาภและการเปิดทาง": "Luck & Opportunity",
  "คุ้มครองป้องกัน": "Protection & Shielding",
  "เมตตาและคนเอ็นดู": "Charm & Kindness",
  "บารมีและอำนาจนำ": "Authority & Presence",
  "งานเฉพาะทางสูงสุด": "Top Specialty",
  "งานเฉพาะทาง": "Specialty Work",
  "คุ้มครองสูงสุด": "Top Protection",
  "เมตตาสูงสุด": "Top Charm",
  "บารมีสูงสุด": "Top Authority",
  "โชคลาภสูงสุด": "Top Luck",
  "หนุนดวงสูงสุด": "Top Fortune Anchor",
  "แรงสุดโดยรวม": "Strongest Overall",
  "แนวใช้ที่แนะนำ": "Recommended use",
  "โทนหลัก": "Main tone",
  "หนุนดวง": "Fortune anchor",
  "โชคลาภ": "Luck",
  "เมตตา": "Charm",
  "บารมี": "Authority",
  "คุ้มครอง": "Protection",
  "วันอาทิตย์": "Sunday",
  "วันจันทร์": "Monday",
  "วันอังคาร": "Tuesday",
  "วันพุธ": "Wednesday",
  "วันพฤหัสบดี": "Thursday",
  "วันพฤหัส": "Thursday",
  "วันศุกร์": "Friday",
  "วันเสาร์": "Saturday",
};

const THAI_MONTHS = {
  "ม.ค.": "Jan", "ก.พ.": "Feb", "มี.ค.": "Mar", "เม.ย.": "Apr",
  "พ.ค.": "May", "มิ.ย.": "Jun", "ก.ค.": "Jul", "ส.ค.": "Aug",
  "ก.ย.": "Sep", "ต.ค.": "Oct", "พ.ย.": "Nov", "ธ.ค.": "Dec",
};

/**
 * แปลงป้ายคงที่ + วันที่ไทย บน HTML ที่ render แล้ว
 * @param {string} html
 * @returns {string}
 */
export function applyEnglishStaticLabels(html) {
  let out = String(html || "");
  // วันที่ "18 ก.ค. 2569" → "18 Jul 2026" (ปี พ.ศ. - 543)
  out = out.replace(
    /(\d{1,2}) (ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.) (\d{4})/g,
    (m, d, mo, y) => {
      const yy = Number(y);
      return `${d} ${THAI_MONTHS[mo] || mo} ${yy > 2400 ? yy - 543 : yy}`;
    },
  );
  const keys = Object.keys(STATIC_LABELS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    out = out.split(k).join(STATIC_LABELS[k]);
  }
  return out;
}

/**
 * ปุ่มสลับภาษาลอยมุมล่างขวา (ใส่ทุกหน้า ทั้งไทยและอังกฤษ)
 * @param {string} html
 * @param {boolean} isEnglishPage
 */
export function injectLangToggle(html, isEnglishPage) {
  const btn = isEnglishPage
    ? `<a href="?" style="position:fixed;right:14px;bottom:88px;z-index:70;background:#fffdf6;border:1.5px solid #a5813a;color:#a5813a;font-weight:800;font-size:13px;padding:8px 14px;border-radius:999px;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.12)">ไทย</a>`
    : `<a href="?lang=en" style="position:fixed;right:14px;bottom:88px;z-index:70;background:#fffdf6;border:1.5px solid #a5813a;color:#a5813a;font-weight:800;font-size:13px;padding:8px 14px;border-radius:999px;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.12)">EN</a>`;
  const s = String(html || "");
  return s.includes("</body>") ? s.replace("</body>", `${btn}</body>`) : s + btn;
}

const HTML_SEGMENT_RE = /(?<=>)([^<>]*[฀-๿][^<>]*)(?=<)/g;

/**
 * เก็บตกข้อความไทยที่เหลือบน HTML (ป้าย template สร้างสด/ผสม EN) → LLM แปล + cache
 * ครอบทุกหน้า ไม่ต้องไล่แก้ template — cacheKey ต่อหน้า+token
 * @param {string} html
 * @param {string} cacheKey
 * @returns {Promise<string>}
 */
export async function translateHtmlResidualThai(html, cacheKey) {
  const src = String(html || "");
  const segments = [
    ...new Set(
      [...src.matchAll(HTML_SEGMENT_RE)]
        .map((m) => m[1])
        .filter((t) => t.trim() && t.length <= 300),
    ),
  ];
  if (!segments.length) return src;

  const key = `scan_v2:report_en_html:${String(cacheKey || "").slice(0, 80)}`;
  /** @type {Record<string, string>} */
  let map = {};
  try {
    const cached = await getValue(key);
    if (cached) map = JSON.parse(String(cached)) || {};
  } catch {
    map = {};
  }

  const missing = segments.filter((t) => !Object.prototype.hasOwnProperty.call(map, t));
  if (missing.length) {
    for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
      const chunk = missing.slice(i, i + CHUNK_SIZE);
      const translated = await translateChunk(chunk).catch(() => null);
      if (!translated) continue;
      for (let j = 0; j < chunk.length; j += 1) {
        const en = String(translated[j] || "").trim();
        if (en) map[chunk[j]] = en;
      }
    }
    await setLargeValueWithTtl(key, JSON.stringify(map), CACHE_TTL_SEC).catch(() => {});
  }

  let out = src;
  const keys = segments
    .filter((t) => Object.prototype.hasOwnProperty.call(map, t))
    .sort((a, b) => b.length - a.length);
  for (const k of keys) {
    out = out.split(`>${k}<`).join(`>${map[k]}<`);
  }
  return out;
}

/**
 * ลิงก์ภายในหน้า /r/... ให้พก ?lang=en ต่อ (ปุ่มอธิบายพลัง/จังหวะ/กลับรายงาน)
 * @param {string} html
 */
export function rewriteReportLinksForEn(html) {
  return String(html || "").replace(/href="(\/r\/[^"?]*)(\?[^"]*)?"/g, (m, path, q) => {
    if (q && /[?&]lang=/.test(q)) return m;
    return q ? `href="${path}${q}&lang=en"` : `href="${path}?lang=en"`;
  });
}

/**
 * ประกอบหน้า EN เต็ม: dict → เก็บตก LLM → ลิงก์พก lang — พังชั้นไหนคืนชั้นก่อนหน้า
 * @param {string} html
 * @param {{ cacheKey: string }} opts
 */
export async function buildEnglishReportPage(html, opts) {
  let out = String(html || "");
  try {
    out = applyEnglishStaticLabels(out);
  } catch {}
  try {
    out = await translateHtmlResidualThai(out, opts?.cacheKey || "page");
  } catch {}
  try {
    out = rewriteReportLinksForEn(out);
  } catch {}
  return out;
}

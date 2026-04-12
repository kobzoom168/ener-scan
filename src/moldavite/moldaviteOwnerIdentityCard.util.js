import { fnv1a32 } from "./moldaviteScores.util.js";

/**
 * @typedef {{ label: string, score: number }} OwnerTraitScore
 */

/** @param {number} score */
function band(score) {
  if (score >= 8) return "high";
  if (score >= 6) return "mid";
  return "low";
}

/** Thai zodiac short names from {@link moldaviteOwnerProfileFromBirthdate.util.js} */
const ZODIAC_CHIPS = {
  มังกร: ["ธาตุดิน", "โทนตั้งหลัก", "พลังมั่นคง"],
  กุมภ์: ["ธาตุลม", "โทนรับรู้ไว", "พลังเปลี่ยนผ่าน"],
  มีน: ["ธาตุน้ำ", "โทนนิ่งลึก", "พลังรับสัญญาณไว"],
  เมษ: ["ธาตุไฟ", "โทนขยับไว", "พลังเริ่มก่อน"],
  พฤษภ: ["ธาตุดิน", "โทนตั้งหลัก", "พลังมั่นคง"],
  เมถุน: ["ธาตุลม", "โทนรับรู้ไว", "พลังเปลี่ยนผ่าน"],
  กรกฎ: ["ธาตุน้ำ", "โทนรับรู้ไว", "พลังนิ่งลึก"],
  สิงห์: ["ธาตุไฟ", "โทนผู้นำ", "พลังขยับชัด"],
  กันย์: ["ธาตุดิน", "โทนค่อยเป็นค่อยไป", "พลังตั้งหลักดี"],
  ตุลย์: ["ธาตุลม", "โทนสมดุล", "พลังค่อยเปิดทาง"],
  พิจิก: ["ธาตุน้ำ", "โทนลึกชัด", "พลังเปลี่ยนผ่าน"],
  ธนู: ["ธาตุไฟ", "โทนขยับไว", "พลังใจนำ"],
};

const CHIPS_FALLBACK = ["ธาตุลม", "โทนชัดในตัวเอง", "พลังรับสัญญาณไว"];

const LIB_A = [
  "ใจนำทางชัด และมักขยับเมื่อรู้ว่าถึงเวลาของตัวเอง",
  "มีแกนในตัวเองชัด และเชื่อในแรงขับจากข้างในมากกว่าความเร่งภายนอก",
  "ตัดสินใจได้ดีเมื่อใจนิ่งพอ และไม่ชอบขยับตามแรงกดจากคนอื่น",
  "มีแรงนำในตัวเอง และจะเด่นที่สุดเมื่อได้เลือกทางด้วยความเชื่อของตัวเอง",
  "เป็นคนที่เริ่มจากความรู้สึกข้างในก่อน แล้วค่อยขยับอย่างจริงจัง",
  "เมื่อใจชัดแล้ว มักไม่ลังเลกับทางที่เลือก",
  "มีโทนนำทางในตัวเอง และจะขยับชัดเมื่อรู้ว่าควรไปทางไหน",
  "ชอบเดินตามจังหวะที่ตัวเองรู้สึกว่าใช่ มากกว่าตามแรงผลักของรอบข้าง",
];

const LIB_B = [
  "รับความรู้สึกไว และจับบรรยากาศรอบตัวได้เร็วกว่าที่คนอื่นเห็น",
  "มีเซนส์ต่อพลังและอารมณ์รอบตัวค่อนข้างชัด",
  "รับคลื่นความรู้สึกได้ไว และมักรู้ก่อนว่าอะไรเริ่มไม่ตรงจังหวะ",
  "ไวต่อความรู้สึก และอ่านพลังที่ซ่อนอยู่ได้ค่อนข้างดี",
  "มักสัมผัสความเปลี่ยนแปลงเล็ก ๆ ได้ก่อนที่เรื่องจะชัด",
  "เป็นคนที่รับสัญญาณจากรอบตัวได้เร็ว และใช้ความรู้สึกเป็นเข็มนำทาง",
  "มีความไวต่อพลังรอบตัว และมักรู้ว่าจังหวะไหนควรเข้าใกล้หรือถอยออก",
  "รับความรู้สึกได้ลึก จึงมักเห็นบางอย่างก่อนที่คำอธิบายจะตามทัน",
];

const LIB_C = [
  "เชื่อในจังหวะของตัวเอง และไม่รีบเปิดทางถ้ายังไม่เห็นภาพชัด",
  "มีความมั่นใจในตัวเองแบบนิ่ง ๆ มากกว่าการแสดงออกแรง ๆ",
  "วางตัวมั่นคง และจะเปิดทางเมื่อรู้สึกว่าจังหวะนั้นพร้อมจริง",
  "ไม่ขยับเพราะความรีบ แต่ขยับเมื่อเชื่อว่าถึงเวลาแล้ว",
  "มีความแน่วแน่ในตัวเอง และตัดสิ่งรบกวนได้ดีเมื่อใจชัด",
  "เชื่อในแรงของตัวเองมากพอจะไม่วิ่งตามทุกสัญญาณที่ผ่านเข้ามา",
  "เป็นคนที่ค่อย ๆ เลือก แต่เมื่อเลือกแล้วมักไปต่ออย่างมั่นคง",
  "มีแรงเชื่อในตัวเอง และจะเด่นเมื่อได้ขยับในทางที่ตัวเองศรัทธา",
];

const LIB_D = [
  "เมื่อเชื่อในจังหวะของตัวเองแล้ว มักขยับเร็วและไม่ค้างอยู่นาน",
  "พร้อมเปลี่ยนเมื่อเห็นทาง และไม่ชอบอยู่กับสิ่งที่หมดรอบแล้ว",
  "มีแรงขยับในตัวเอง และตอบกับการเริ่มใหม่ได้ค่อนข้างดี",
  "เปิดทางให้ชีวิตเดินต่อได้เร็วเมื่อใจยอมรับการเปลี่ยนแปลง",
  "ไม่ชอบค้างอยู่กับจุดเดิมนาน และจะไปต่อเมื่อเห็นสัญญาณชัด",
  "มีโทนของการเคลื่อนตัวเร็ว เมื่อรู้ว่ารอบเดิมจบแล้ว",
  "ตอบกับพลังเปลี่ยนผ่านได้ดี และมักเริ่มรอบใหม่ได้ไวกว่าเดิม",
  "เป็นคนที่เมื่อพร้อมแล้ว จะขยับจริง ไม่เพียงแค่คิด",
];

const LIB_E = [
  "ขยับไม่เร็วเสมอไป แต่ไปต่ออย่างลึกและจริงเมื่อมั่นใจ",
  "ไม่ใช่คนเร่งรอบตัวเองง่าย ๆ แต่เมื่อใจตอบแล้วจะค่อย ๆ เปิดทางอย่างมั่นคง",
  "เลือกจังหวะค่อนข้างละเอียด และมักขยับเมื่อทุกอย่างข้างในลงตัว",
  "ไม่ได้ขยับเพราะความรีบ แต่ขยับเพราะรู้ว่าจังหวะนั้นใช่",
  "เป็นคนที่ต้องให้ใจและจังหวะตรงกันก่อน แล้วจึงค่อยไปต่อ",
  "พลังของตัวเองออกแบบนิ่งลึก มากกว่าพุ่งเร็ว",
  "ค่อย ๆ เปิดทางอย่างมีชั้นเชิง มากกว่าขยับแบบฉับพลัน",
  "แม้ไม่รีบ แต่เมื่อพร้อมแล้วมักไปได้ไกลและนิ่งกว่าเดิม",
];

const LIB_F = [
  "ใจนำทางชัด รับความรู้สึกไว และจะขยับเมื่อเชื่อในจังหวะของตัวเอง",
  "มีแกนในตัวเองชัด อ่านพลังรอบตัวไว และพร้อมเริ่มใหม่เมื่อเห็นทาง",
  "รับความรู้สึกได้ลึก แต่ไม่ขยับง่ายจนกว่าจะมั่นใจในจังหวะนั้นจริง",
  "เชื่อในสัญญาณข้างในตัวเอง และจะเปิดทางชัดเมื่อรู้ว่ารอบใหม่มาถึงแล้ว",
  "เป็นคนที่ทั้งรู้สึกไวและมีแกนในตัวเอง จึงขยับแม่นเมื่อใจตอบ",
  "มีความนิ่งในตัวเอง แต่พร้อมเปลี่ยนเมื่อจังหวะข้างในเริ่มชัด",
  "อ่านพลังรอบตัวเก่ง และจะเด่นที่สุดเมื่อได้ขยับในทางที่ตัวเองเชื่อ",
  "มีแรงนำจากข้างใน รับความรู้สึกไว และไม่ปล่อยให้รอบเดิมค้างนานเกินไป",
  "ใจชัด เซนส์ดี และจะไปต่อเมื่อรู้ว่าจังหวะนั้นไม่ใช่เรื่องบังเอิญ",
  "มีทั้งความไวและความนิ่งอยู่ในตัว จึงเลือกขยับเฉพาะตอนที่พลังลงตัวจริง",
];

const FALLBACK_SUMMARY =
  "มีแกนในตัวเองชัด รับความรู้สึกไว และค่อยขยับเมื่อจังหวะลงตัว";

const TWO_PART_LEAD = [
  "ใจนำทางชัด รับความรู้สึกไว",
  "มีแกนในตัวเองชัด อ่านพลังรอบตัวไว",
  "เชื่อในจังหวะของตัวเอง รับสัญญาณรอบตัวไว",
];

const TWO_PART_TAIL = [
  "และจะขยับเมื่อเชื่อในจังหวะของตัวเอง",
  "และค่อยเปิดทางเมื่อเห็นภาพชัด",
  "และพร้อมเริ่มใหม่เมื่อใจตอบ",
];

/**
 * Phrase fragments for compose mode (pattern 3).
 * @param {OwnerTraitScore[]} traitScores
 */
function mapTraitPhrases(traitScores) {
  /** @type {Record<string, OwnerTraitScore>} */
  const by = {};
  for (const t of traitScores) {
    by[t.label] = t;
  }
  const g = (key) => band(by[key]?.score ?? 5);

  const lead =
    g("ใจนำ") === "high"
      ? "ใจนำทางชัด"
      : g("ใจนำ") === "mid"
        ? "ตัดสินใจจากความรู้สึกที่นิ่งพอ"
        : "ฟังจังหวะข้างในก่อนจะนำทาง";

  const confidence =
    g("มั่นใจ") === "high"
      ? "เชื่อในจังหวะของตัวเอง"
      : g("มั่นใจ") === "mid"
        ? "ค่อย ๆ เปิดทางเมื่อเห็นภาพชัด"
        : "เลือกขยับเมื่อมั่นใจในจังหวะของตัวเอง";

  const motion =
    g("ขยับเร็ว") === "high"
      ? "ขยับเร็วเมื่อใจชัด"
      : g("ขยับเร็ว") === "low"
        ? "ขยับเมื่อมั่นใจในจังหวะของตัวเอง"
        : "ขยับแบบตั้งใจเมื่อเห็นทาง";

  const sensitivity =
    g("รับความรู้สึกไว") === "high"
      ? "รับความรู้สึกไว"
      : g("รับความรู้สึกไว") === "mid"
        ? "อ่านบรรยากาศรอบตัวได้ดี"
        : "รับสัญญาณข้างในแบบนิ่ง ๆ";

  return { lead, confidence, motion, sensitivity };
}

/**
 * Pick primary library bucket from dominant trait.
 * @param {OwnerTraitScore[]} traitScores
 */
function dominantBucket(traitScores) {
  if (!traitScores.length) return "F";
  const order = ["ใจนำ", "มั่นใจ", "ขยับเร็ว", "รับความรู้สึกไว"];
  let best = traitScores[0];
  for (const t of traitScores) {
    if (t.score > best.score) best = t;
  }
  const ties = traitScores.filter((t) => t.score === best.score);
  if (ties.length > 1) {
    ties.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
    best = ties[0];
  }

  const b = band(best.score);
  if (best.label === "ใจนำ") return b === "low" ? "E" : "A";
  if (best.label === "รับความรู้สึกไว") return "B";
  if (best.label === "มั่นใจ") return "C";
  if (best.label === "ขยับเร็ว") return b === "low" ? "E" : "D";
  return "F";
}

function libraryForBucket(bucket) {
  switch (bucket) {
    case "A":
      return LIB_A;
    case "B":
      return LIB_B;
    case "C":
      return LIB_C;
    case "D":
      return LIB_D;
    case "E":
      return LIB_E;
    default:
      return LIB_F;
  }
}

/**
 * Deterministic owner identity copy — no numeric scores in output.
 *
 * @param {{
 *   traitScores: OwnerTraitScore[],
 *   zodiacShortLabel: string,
 *   seed: string,
 * }} p
 * @returns {{
 *   chips: string[],
 *   summary: string,
 *   summarySecond: string,
 *   glyphSvg: string,
 * }}
 */
export function buildMoldaviteOwnerIdentityCard(p) {
  const traitScores = Array.isArray(p.traitScores) ? p.traitScores : [];
  const zodiacShort = String(p.zodiacShortLabel || "").trim();
  const seed = String(p.seed || "owner").trim();

  const chips = ZODIAC_CHIPS[zodiacShort] ? [...ZODIAC_CHIPS[zodiacShort]] : [...CHIPS_FALLBACK];

  const h = fnv1a32(`${seed}|owner_identity_v1`);
  const h2 = fnv1a32(`${seed}|owner_identity_v1b`);
  const bucket = dominantBucket(traitScores);
  const lib = libraryForBucket(bucket);

  let summary = FALLBACK_SUMMARY;
  let summarySecond = "";

  const pattern = h % 3;
  if (pattern === 0) {
    const idx = h2 % lib.length;
    summary = lib[idx] || FALLBACK_SUMMARY;
  } else if (pattern === 1) {
    summary = TWO_PART_LEAD[h2 % TWO_PART_LEAD.length];
    summarySecond = TWO_PART_TAIL[(h2 >> 3) % TWO_PART_TAIL.length];
  } else {
    const ph = mapTraitPhrases(traitScores);
    const composePick = h2 % 3;
    if (composePick === 0) {
      summary = `${ph.lead} ${ph.sensitivity} และ${ph.motion}`;
    } else if (composePick === 1) {
      summary = `${ph.confidence} ${ph.sensitivity} จึง${ph.motion}`;
    } else {
      summary = `${ph.lead} ${ph.confidence} และ${ph.sensitivity}`;
    }
  }

  if (!summary || summary.length > 220) {
    summary = FALLBACK_SUMMARY;
    summarySecond = "";
  }

  const glyphSvg = moldaviteZodiacGlyphSvg(zodiacShort, h);

  return {
    chips,
    summary,
    summarySecond,
    glyphSvg,
  };
}

/**
 * Minimal mystical SVG anchor (inline). Variation by sign hash — abstract “constellation” orb.
 * @param {string} zodiacShort
 * @param {number} h
 */
export function moldaviteZodiacGlyphSvg(zodiacShort, h) {
  const rot = (h % 360) * 0.25;
  const gid = `og_${fnv1a32(`${zodiacShort}|${h}`)}`;
  const dots = [0.35, 0.5, 0.65].map((x, i) => {
    const oy = 0.42 + ((h >> (i * 4)) % 8) * 0.02;
    return `<circle cx="${(x * 48).toFixed(1)}" cy="${(oy * 48).toFixed(1)}" r="1.35" fill="rgba(186,230,253,0.55)"/>`;
  });
  return `<svg class="mv2-owner-glyph" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(34,197,94,0.35)"/>
      <stop offset="55%" stop-color="rgba(56,189,248,0.2)"/>
      <stop offset="100%" stop-color="rgba(167,139,250,0.18)"/>
    </linearGradient>
  </defs>
  <circle cx="24" cy="24" r="21" fill="url(#${gid})" stroke="rgba(255,255,255,0.12)" stroke-width="0.6"/>
  <g style="transform: rotate(${rot.toFixed(2)}deg); transform-origin: 24px 24px">${dots.join("")}</g>
</svg>`;
}

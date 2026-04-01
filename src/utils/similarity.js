import { parseScanText } from "../services/flex/flex.parser.js";

const bannedPhrases = [
  "เหมือนภูเขา",
  "สงบลุ่มลึก",
  "นิ่งแต่หนักแน่น",
  "เปลวไฟอุ่น",
  "สายน้ำที่ไหล",
  "แสงจันทร์ที่นุ่มนวล",
  "มั่นคงและนิ่ง",
];

const bannedClosings = [
  "ลองส่งชิ้นอื่นมาเปรียบเทียบกันดูไหมครับ?",
  "ลองส่งมาให้อาจารย์ดูเพิ่มได้ครับ",
  "ถ้ามีอีกชิ้น ลองส่งมาได้ครับ",
];

/** Minimum narrative core length (chars) to trust parser-based comparison */
export const NARRATIVE_CORE_MIN_CHARS = 48;

/**
 * Structured / score lines that inflate full-text Jaccard but should not dominate
 * "same user, different object" checks. Used when parser yields a thin core.
 */
const STRUCTURED_LINE_SKIP = /^(?:🔮|\s*$)|^(?:ระดับพลัง|คะแนนพลัง|พลังหลัก|ประเภทพลัง|ความสอดคล้อง|พลังเสริม)\s*:/i;

const DIMENSION_LINE =
  /^•\s*(?:คุ้มกัน|สมดุล|อำนาจ|เมตตา|ดึงดูด)\s*:/u;

const META_LINE =
  /^•\s*(?:บุคลิก|โทนพลัง|พลังซ่อน)\s*:/u;

const HEADING_ONLY =
  /^(?:ลักษณะพลัง|ภาพรวม|เหตุผลที่เข้ากับเจ้าของ|ชิ้นนี้หนุนเรื่อง|เหมาะใช้เมื่อ|อาจไม่เด่นเมื่อ|ควรใช้แบบไหน|ปิดท้าย)\s*:?\s*$/u;

function normalizeForCompare(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\u0E00-\u0E7Fa-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeForCompare(text).split(" ").filter(Boolean);
}

function getNGrams(tokens, n = 2) {
  const grams = [];
  for (let i = 0; i <= tokens.length - n; i += 1) {
    grams.push(tokens.slice(i, i + n).join(" "));
  }
  return grams;
}

export function hasRepeatedPhrase(text) {
  return bannedPhrases.some((phrase) => text.includes(phrase));
}

export function hasRepeatedClosing(text) {
  return bannedClosings.some((phrase) => text.includes(phrase));
}

export function similarity(a, b) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  return intersection / Math.max(aTokens.size, bTokens.size);
}

export function ngramSimilarity(a, b, n = 2) {
  const aGrams = new Set(getNGrams(tokenize(a), n));
  const bGrams = new Set(getNGrams(tokenize(b), n));

  if (aGrams.size === 0 || bGrams.size === 0) return 0;

  let intersection = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) intersection += 1;
  }

  return intersection / Math.max(aGrams.size, bGrams.size);
}

/**
 * Narrative-heavy text for similarity: sections where copy should diverge across objects.
 * Excludes score lines, compatibility triple, dimension rows, and short meta lines.
 * Omits `closing` — often templated CTA lines that inflate similarity across different analyses.
 */
export function extractNarrativeCoreForSimilarity(rawText) {
  try {
    const p = parseScanText(rawText);
    const parts = [
      p.overview,
      p.fitReason,
      ...(Array.isArray(p.supportTopics) ? p.supportTopics : []),
      ...(Array.isArray(p.suitable) ? p.suitable : []),
      p.notStrong,
      p.usageGuide,
    ]
      .map((x) => String(x || "").trim())
      .filter((x) => x && x !== "-");

    const joined = parts.join("\n").trim();
    if (joined.length >= NARRATIVE_CORE_MIN_CHARS) {
      return joined;
    }
  } catch {
    /* fall through */
  }
  return stripStructuredLinesFallback(rawText);
}

/**
 * @param {string} text
 * @returns {string}
 */
export function stripStructuredLinesFallback(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (STRUCTURED_LINE_SKIP.test(l)) return false;
      if (DIMENSION_LINE.test(l)) return false;
      if (META_LINE.test(l)) return false;
      if (HEADING_ONLY.test(l)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

/**
 * @param {string} text
 * @param {string} oldText
 * @returns {{
 *   narrativeCoreLength: number,
 *   narrativeWord: number,
 *   narrativeBigram: number,
 *   fullWord: number,
 *   fullBigram: number,
 * }}
 */
export function computePairSimilarityScores(text, oldText) {
  const c1 = extractNarrativeCoreForSimilarity(text);
  const c2 = extractNarrativeCoreForSimilarity(oldText);
  return {
    narrativeCoreLength: Math.min(c1.length, c2.length),
    narrativeWord: similarity(c1, c2),
    narrativeBigram: ngramSimilarity(c1, c2, 2),
    fullWord: similarity(text, oldText),
    fullBigram: ngramSimilarity(text, oldText, 2),
  };
}

/** User-recent: require both word + bigram narrative signals (reduces false positives vs template). */
export const USER_NARRATIVE_WORD_THRESHOLD = 0.52;
export const USER_NARRATIVE_BIGRAM_THRESHOLD = 0.34;

/** Near-duplicate on full formatted text (anti spam / copy-paste). */
export const USER_FULL_NEAR_DUP_WORD = 0.76;
export const USER_FULL_NEAR_DUP_BIGRAM = 0.5;

/** Global pool: both dimensions must clear (cross-user duplicate copy). */
export const GLOBAL_NARRATIVE_WORD_THRESHOLD = 0.58;
export const GLOBAL_NARRATIVE_BIGRAM_THRESHOLD = 0.38;

export const GLOBAL_FULL_NEAR_DUP_WORD = 0.78;
export const GLOBAL_FULL_NEAR_DUP_BIGRAM = 0.54;

/** Legacy full-text thresholds when narrative core is too short to trust */
export const FALLBACK_FULL_WORD_THRESHOLD = 0.62;
export const FALLBACK_FULL_BIGRAM_THRESHOLD = 0.42;

/**
 * @param {string} text
 * @param {string[]} recents
 * @param {"user"|"global"} kind
 * @returns {{
 *   tooSimilar: boolean,
 *   maxNarrativeWord: number,
 *   maxNarrativeBigram: number,
 *   maxFullWord: number,
 *   maxFullBigram: number,
 *   comparedNarrativeLength: number,
 *   usedNarrativePrimary: boolean,
 * }}
 */
export function scoreTooSimilarToRecent(text, recents, kind = "user") {
  const clean = String(text || "").trim();
  const list = Array.isArray(recents) ? recents : [];

  const narrW =
    kind === "global"
      ? GLOBAL_NARRATIVE_WORD_THRESHOLD
      : USER_NARRATIVE_WORD_THRESHOLD;
  const narrB =
    kind === "global"
      ? GLOBAL_NARRATIVE_BIGRAM_THRESHOLD
      : USER_NARRATIVE_BIGRAM_THRESHOLD;
  const fullW =
    kind === "global"
      ? GLOBAL_FULL_NEAR_DUP_WORD
      : USER_FULL_NEAR_DUP_WORD;
  const fullB =
    kind === "global"
      ? GLOBAL_FULL_NEAR_DUP_BIGRAM
      : USER_FULL_NEAR_DUP_BIGRAM;

  let maxNarrativeWord = 0;
  let maxNarrativeBigram = 0;
  let maxFullWord = 0;
  let maxFullBigram = 0;
  let comparedNarrativeLength = 0;
  let tooSimilar = false;
  /** @type {"none"|"full_near_dup"|"narrative"|"fallback_full"} */
  let matchKind = "none";

  const coreSelf = extractNarrativeCoreForSimilarity(clean);
  const coreLongEnough = coreSelf.length >= NARRATIVE_CORE_MIN_CHARS;

  for (const oldText of list) {
    const o = String(oldText || "").trim();
    if (!o) continue;

    const scores = computePairSimilarityScores(clean, o);
    maxNarrativeWord = Math.max(maxNarrativeWord, scores.narrativeWord);
    maxNarrativeBigram = Math.max(maxNarrativeBigram, scores.narrativeBigram);
    maxFullWord = Math.max(maxFullWord, scores.fullWord);
    maxFullBigram = Math.max(maxFullBigram, scores.fullBigram);
    comparedNarrativeLength = Math.max(
      comparedNarrativeLength,
      scores.narrativeCoreLength,
    );

    /**
     * Same formatted template (scores, stars, headings) inflates full-text similarity even when
     * ภาพรวม / เหตุผล / bullets ต่างกัน — skip full_near_dup when narrative cores clearly diverge.
     */
    const narrativeClearlyDifferent =
      scores.narrativeWord < 0.46 && scores.narrativeBigram < 0.34;

    if (
      !narrativeClearlyDifferent &&
      (scores.fullWord >= fullW || scores.fullBigram >= fullB)
    ) {
      tooSimilar = true;
      matchKind = "full_near_dup";
      break;
    }

    if (coreLongEnough && scores.narrativeCoreLength >= NARRATIVE_CORE_MIN_CHARS) {
      const narrativeDup =
        scores.narrativeWord >= narrW && scores.narrativeBigram >= narrB;
      const narrativeWordAloneHigh = scores.narrativeWord >= (kind === "global" ? 0.72 : 0.7);
      const narrativeBigramAloneHigh =
        scores.narrativeBigram >= (kind === "global" ? 0.5 : 0.48);
      if (narrativeDup || narrativeWordAloneHigh || narrativeBigramAloneHigh) {
        tooSimilar = true;
        matchKind = "narrative";
        break;
      }
    } else if (
      scores.fullWord >= FALLBACK_FULL_WORD_THRESHOLD ||
      scores.fullBigram >= FALLBACK_FULL_BIGRAM_THRESHOLD
    ) {
      tooSimilar = true;
      matchKind = "fallback_full";
      break;
    }
  }

  return {
    tooSimilar,
    maxNarrativeWord,
    maxNarrativeBigram,
    maxFullWord,
    maxFullBigram,
    comparedNarrativeLength,
    excludedStructuredSections: coreLongEnough,
    matchKind,
  };
}

/**
 * @deprecated Use {@link scoreTooSimilarToRecent} for telemetry; kept for tests compatibility.
 */
export function tooSimilarToRecent(text, recents, _threshold = 0.62) {
  const u = scoreTooSimilarToRecent(text, recents, "user");
  return u.tooSimilar;
}

export function countMatchesFromList(text, phrases) {
  return phrases.filter((phrase) => text.includes(phrase)).length;
}

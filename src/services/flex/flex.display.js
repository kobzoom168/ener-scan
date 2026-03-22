/**
 * Flex-only display shaping (does not change stored scan text).
 * Sentence selection balances substance/position with light keyword hints (not keyword-only).
 */
import { cleanLine, safeWrapText } from "./flex.utils.js";

/** LINE altText: keep short; score suffix should remain visible. */
export const FLEX_ALT_TEXT_MAX = 118;

/** Caps for insight picker (unchanged). */
export const FLEX_OVERVIEW_MAX_CHARS = 190;
export const FLEX_OVERVIEW_MAX_SENTENCES = 2;

export const FLEX_FIT_REASON_MAX_CHARS = 170;
export const FLEX_FIT_REASON_MAX_SENTENCES = 2;

/** Tighter caps after pick — instant readability, no new scoring logic. */
export const FLEX_OVERVIEW_DISPLAY_MAX = 148;
export const FLEX_FIT_DISPLAY_MAX = 128;

/**
 * Display-only polish: prefer first sentence when clearer, then hard wrap.
 */
export function polishReadingLineForFlex(text, maxChars) {
  const t = cleanLine(text);
  if (!t) return t;
  let out = t;
  const first = t.split(/[。！？]/)[0]?.trim();
  if (first && first.length >= 28 && first.length < t.length) {
    out = first;
  }
  return safeWrapText(out, maxChars);
}

export const FLEX_CLOSING_MAX_CHARS = 120;

/** Log warning in `[FLEX_PARSE]` when splits exceed this (possible over-fragmentation). */
export const FLEX_SPLIT_WARN_THRESHOLD = 5;

const MIN_CLAUSE_CHARS = 15;
const MIN_MERGED_CHARS = 12;

/**
 * Attach only **tiny** fragments (< minLen) to a neighbor — never merge two
 * substantial clauses, so scoring still sees distinct high-value sentences.
 */
export function mergeShortSegments(parts, minLen = MIN_MERGED_CHARS) {
  if (parts.length <= 1) return parts;
  const result = [];
  let buffer = parts[0].trim();
  if (!buffer) return parts;

  for (let i = 1; i < parts.length; i += 1) {
    const next = parts[i].trim();
    if (!next) continue;

    const bufferShort = buffer.length < minLen;
    const nextShort = next.length < minLen;

    if (bufferShort || nextShort) {
      buffer = `${buffer} ${next}`.trim();
    } else {
      result.push(buffer);
      buffer = next;
    }
  }
  if (buffer) result.push(buffer);
  return result.length ? result : parts;
}

/**
 * Split on sentence boundaries first; avoid aggressive Thai conjunction breaks (often mid-clause).
 * Optional `แต่` split only when both sides are long enough to be real clauses.
 */
export function splitSentencesForFlex(text) {
  const s = cleanLine(text);
  if (!s) return [];

  let chunks = s
    .split(/(?<=[。！？!?\.])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (chunks.length > 1) {
    return mergeShortSegments(chunks);
  }

  chunks = s
    .split(/\s*([—–-])\s*/)
    .filter((x, i) => i % 2 === 0)
    .map((x) => x.trim())
    .filter(Boolean);
  if (chunks.length > 1) {
    return mergeShortSegments(chunks);
  }

  // Only `แต่` as contrast boundary — and only if both parts are substantial (not fragments).
  const butParts = s.split(/\s+(?=แต่)/);
  if (
    butParts.length === 2 &&
    butParts[0].trim().length >= MIN_CLAUSE_CHARS &&
    butParts[1].trim().length >= MIN_CLAUSE_CHARS
  ) {
    return mergeShortSegments(
      butParts.map((x) => x.trim()).filter(Boolean),
    );
  }

  return [s];
}

// --- Scoring: substance + position + capped pattern hints ---

function substanceScore(t) {
  const line = cleanLine(t);
  if (line.length < 12) return -2;

  const words = line.split(/\s+/).filter((w) => w.length > 1);
  if (words.length < 4) return 0;

  const unique = new Set(words);
  const uniqRatio = unique.size / words.length;

  let s = 0;
  if (uniqRatio >= 0.72) s += 2.5;
  else if (uniqRatio >= 0.55) s += 1.2;

  if (words.length >= 6 && words.length <= 28) s += 1.5;

  return s;
}

/** Light penalties for generic long phrases — length alone can look “substantial”. */
export function genericFillerPhrasePenalty(t) {
  const line = cleanLine(t);
  if (!line) return 0;
  let p = 0;
  if (/หลายมิติ|หลาย\s*มิติ/i.test(line)) p -= 1.6;
  if (/สถานการณ์ต่าง\s*ๆ|สถานการณ์หลาย|หลาย\s*สถานการณ์/i.test(line)) p -= 1.6;
  if (/หลากหลาย|หลายแบบ|หลายรูปแบบ|ในทุกด้าน|โดยรวมแล้ว|ครอบคลุม|หลายๆ\s*อย่าง|หลาย\s*อย่าง/i.test(line)) {
    p -= 1.5;
  }
  if (/ในแง่|ในมุม|ในเชิง|เชิง.*เชิง/i.test(line) && line.length > 85) p -= 0.9;
  if (/เรื่องราว|ทุกด้าน|ทุกมิติ|หลายด้าน/i.test(line)) p -= 1.1;
  return p;
}

function countDistinctPatternHits(t, patterns) {
  let n = 0;
  for (const re of patterns) {
    if (re.test(t)) n += 1;
  }
  return n;
}

/** Personalization: capped tier, not one big OR boost. */
function personalTier(t, field) {
  const personalRes = [
    /เจ้าของ|วันเกิด/,
    /ของคุณ|กับคุณ/,
    /โยง|เข้ากับ|ถูกโยง|จับคู่|คุ้ม|ร่วมกัน/,
    /ราศี|ธาตุ|นิสัย|จังหวะชีวิต/,
  ];
  const fitBoost = [
    /ส่งเสริม|หนุน|ประคอง|แม่น|ตรงกับ/,
  ];

  const list = field === "fit" ? [...personalRes, ...fitBoost] : personalRes;
  const hits = countDistinctPatternHits(t, list);
  if (hits >= 2) return field === "fit" ? 5 : 3.5;
  if (hits === 1) return field === "fit" ? 3 : 2;
  return 0;
}

function situationTier(t) {
  const pats = [
    /เวลาที่|เมื่อ|ถ้า|จังหวะ|สถานการณ์/,
    /มัก|มักจะ|ประสบ|รู้สึก|เหมือน/,
    /ชัด|เฉพาะ|ไม่ใช่แค่|จุดที่จำ|ภาพ/,
  ];
  const hits = countDistinctPatternHits(t, pats);
  if (hits >= 2) return 3;
  if (hits === 1) return 1.5;
  return 0;
}

function genericPenalty(t, field) {
  let p = 0;
  if (/เสริมพลังชีวิต|ดึงดูดสิ่งดี|ช่วยให้ดีขึ้น|พลังที่ดี|พลังดี|กว้าง|ทั่วไป/i.test(t)) {
    p -= 4;
  }
  if (field === "fit") {
    if (/^ชิ้นนี้\s|^วัตถุชิ้นนี้\s|^นี่คือ/i.test(t) && t.length < 38) p -= 1.5;
    if (/อบอุ่น|นุ่มนวล|ลึกซึ้ง$/i.test(t) && t.length < 42) p -= 2;
  }
  if (field === "overview" && /^พลังนี้|^วัตถุชิ้นนี้|^โดยรวม/i.test(t) && t.length < 48) {
    p -= 1.5;
  }
  return p;
}

function isStrongOpeningSentence(t, field) {
  const line = cleanLine(t);
  if (!line) return false;
  if (personalTier(line, field) >= 3) return true;
  if (situationTier(line) >= 2) return true;
  const sub =
    substanceScore(line) + genericFillerPhrasePenalty(line);
  if (sub >= 3 && line.length >= 34) return true;
  if (sub >= 2.5 && line.length >= 48 && personalTier(line, field) >= 2) return true;
  return false;
}

/** Later personalized can beat earlier generic; don’t penalize index 0 if it’s genuinely strong. */
function positionBias(t, field, index, total) {
  const line = cleanLine(t);
  const hasPersonal = personalTier(line, field) >= 3;
  const looksThinGeneric =
    /^พลังนี้|^ชิ้นนี้|^วัตถุ|^โดยรวม|^สรุป|^ภาพรวม/i.test(line) &&
    line.length < 55;

  let b = 0;
  if (index > 0 && hasPersonal) b += 2.5;
  if (
    index === 0 &&
    looksThinGeneric &&
    total > 1 &&
    !isStrongOpeningSentence(line, field)
  ) {
    b -= 2;
  }
  if (index > 0 && substanceScore(line) + genericFillerPhrasePenalty(line) >= 2 && field === "fit") {
    b += 1;
  }
  return b;
}

function closingWarmthScore(t) {
  let s = 0;
  if (/เทียบ|ส่ง|ลอง|ถาม|คุย|ชิ้นถัด|สแกน|ชวน|นะ|ครับ|ค่ะ|เรื่อย|สบาย/i.test(t)) {
    s += 2.5;
  }
  if (/โปร|ส่วนลด|ซื้อ|จ่าย|ด่วน|ชำระ|โอน|ราคา|สั่ง|ลดราคา|คุ้มค่า|โทร/i.test(t)) {
    s -= 5;
  }
  if (/ขาย|โฆษณา|รีบ|วันนี้เท่านั้น/i.test(t)) s -= 3;
  return s;
}

/** Useful next step / invitation — not only polite but actionable. */
function closingUsefulScore(t) {
  const line = cleanLine(t);
  if (!line) return -2;
  let s = 0;
  if (/ส่ง|สแกน|รูป|ถัด|ชิ้นถัด|ถาม|เทียบ|ทัก|ติดต่อ|ลอง|คุย|ชวน|เทียบกันได้/i.test(line)) {
    s += 2;
  }
  if (line.length >= 8 && line.length <= 95) s += 0.8;
  if (line.length < 10 && !/ครับ|ค่ะ|นะ|ลอง|ถาม|ส่ง/i.test(line)) s -= 1.5;
  return s;
}

/**
 * Heuristic score: substance-first, capped pattern tiers, position-aware for fit/overview.
 */
export function scoreSentenceForInsight(sentence, field, context = {}) {
  const t = cleanLine(sentence);
  const { index = 0, total = 1 } = context;

  if (!t || t.length < 4) return -10;

  let score = substanceScore(t);
  score += genericFillerPhrasePenalty(t);

  if (field === "closing") {
    // Short closings are normal — don’t over-penalize length vs substance.
    if (t.length >= 8 && t.length <= 100) score += 1.2;
    score += closingWarmthScore(t);
    score += closingUsefulScore(t);
    return score;
  }

  const p = personalTier(t, field);
  const sit = situationTier(t);
  // Cap pattern-driven boost so keywords alone cannot dominate substance.
  const patternBoost = Math.min(6, p + sit * 0.85);
  score += patternBoost;

  score += genericPenalty(t, field);
  score += positionBias(t, field, index, total);

  if (t.length >= 18 && t.length <= 140) score += 0.8;
  if (t.length > 160) score -= 0.5;

  return score;
}

function tokenSet(text) {
  return new Set(
    cleanLine(text)
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** Drop near-duplicate second sentence (weak Thai token overlap). */
export function isRoughlyRedundant(combinedSoFar, candidate) {
  const a = tokenSet(combinedSoFar);
  const b = tokenSet(candidate);
  if (a.size < 3 || b.size < 3) return false;
  let inter = 0;
  for (const w of b) {
    if (a.has(w)) inter += 1;
  }
  const j = inter / Math.min(a.size, b.size);
  return j > 0.55;
}

/**
 * Core picker + debug metadata for `[FLEX_PARSE]` QA (order vs rank, later vs earlier).
 */
export function pickInsightfulSentencesWithDebug(
  cleaned,
  field,
  maxChars,
  maxSentences,
) {
  const line = cleanLine(cleaned);
  if (!line || line === "-") {
    return { text: "", debug: null };
  }

  const sentences = splitSentencesForFlex(line);
  if (sentences.length === 0) {
    return { text: "", debug: null };
  }

  const total = sentences.length;

  if (sentences.length === 1) {
    const s0 = sentences[0];
    const text =
      s0.length <= maxChars ? s0 : safeWrapText(s0, maxChars);
    const score0 = scoreSentenceForInsight(s0, field, { index: 0, total: 1 });
    return {
      text,
      debug: {
        segmentCount: 1,
        scoresByIndex: [{ index: 0, score: score0, preview: s0.slice(0, 80) }],
        rankByScoreDesc: [0],
        pickedOriginalIndices: [0],
        bestScoreIndex: 0,
        firstIndexScore: score0,
        laterOutperformsEarlier: false,
      },
    };
  }

  const indexed = sentences.map((s, i) => ({
    s,
    i,
    score: scoreSentenceForInsight(s, field, { index: i, total }),
  }));

  const byScore = [...indexed].sort(
    (a, b) => b.score - a.score || b.s.length - a.s.length || a.i - b.i,
  );

  const picked = [];
  for (const cand of byScore) {
    if (picked.length >= maxSentences) break;
    if (picked.some((p) => p.i === cand.i)) continue;

    const mergedTrial = [...picked.map((p) => p.s), cand.s].join(" ").trim();
    if (mergedTrial.length > maxChars) {
      if (picked.length === 0) {
        picked.push(cand);
      }
      continue;
    }

    const soFar = picked.map((p) => p.s).join(" ");
    if (picked.length > 0 && isRoughlyRedundant(soFar, cand.s)) continue;

    picked.push(cand);
  }

  if (picked.length === 0) {
    const best = byScore[0];
    const text = safeWrapText(best.s, maxChars);
    const firstScored = indexed.find((x) => x.i === 0);
    return {
      text,
      debug: {
        segmentCount: total,
        scoresByIndex: indexed.map(({ i, s, score }) => ({
          index: i,
          score,
          preview: s.slice(0, 80),
        })),
        rankByScoreDesc: byScore.map((x) => x.i),
        pickedOriginalIndices: [best.i],
        bestScoreIndex: byScore[0].i,
        firstIndexScore: firstScored?.score ?? null,
        laterOutperformsEarlier:
          Boolean(firstScored && byScore[0].i > 0 && byScore[0].score > firstScored.score),
      },
    };
  }

  picked.sort((a, b) => a.i - b.i);
  let out = picked.map((p) => p.s).join(" ").trim();
  if (out.length > maxChars) {
    out = safeWrapText(out, maxChars);
  }

  const firstScored = indexed.find((x) => x.i === 0);
  const bestIdx = byScore[0].i;

  return {
    text: out,
    debug: {
      segmentCount: total,
      scoresByIndex: indexed.map(({ i, s, score }) => ({
        index: i,
        score,
        preview: s.slice(0, 80),
      })),
      rankByScoreDesc: byScore.map((x) => x.i),
      pickedOriginalIndices: picked.map((p) => p.i).sort((a, b) => a - b),
      bestScoreIndex: bestIdx,
      firstIndexScore: firstScored?.score ?? null,
      laterOutperformsEarlier:
        Boolean(firstScored && bestIdx > 0 && byScore[0].score > firstScored.score),
    },
  };
}

/**
 * Pick up to `maxSentences` with highest insight scores, then re-order by original order.
 */
export function selectInsightfulSentences(
  text,
  field,
  maxChars,
  maxSentences,
) {
  const cleaned = cleanLine(text);
  if (!cleaned || cleaned === "-") return "";

  const { text: out } = pickInsightfulSentencesWithDebug(
    cleaned,
    field,
    maxChars,
    maxSentences,
  );
  return out;
}

/**
 * QA helper: same as reading-field selection, returns debug for logging (overview / fit / closing).
 */
export function getFlexInsightDebugForField(rawText, field, maxChars, maxSentences) {
  const cleaned = cleanLine(rawText);
  if (!cleaned || cleaned === "-") return null;
  const { debug } = pickInsightfulSentencesWithDebug(
    cleaned,
    field,
    maxChars,
    maxSentences,
  );
  return debug;
}

/**
 * Field-specific density reduction: insight-first sentence selection, then char cap.
 */
export function shortenFlexReadingField(
  text,
  {
    maxChars = 200,
    maxSentences = 2,
    emptyFallback = "",
    field = "overview",
  } = {},
) {
  const cleaned = cleanLine(text);
  if (!cleaned || cleaned === "-") return emptyFallback;

  return selectInsightfulSentences(cleaned, field, maxChars, maxSentences);
}

export function shortenFlexClosing(text, maxChars = FLEX_CLOSING_MAX_CHARS) {
  const cleaned = cleanLine(text);
  if (!cleaned || cleaned === "-") return "";
  return selectInsightfulSentences(cleaned, "closing", maxChars, 2);
}

/**
 * Short but complete: `ผลตรวจพลัง: {label} · {score}/10` — truncate label first so score stays visible.
 */
export function buildScanFlexAltText({ mainEnergyLabel, scoreDisplay }) {
  const scoreRaw = cleanLine(scoreDisplay) || "-";
  let scorePart;
  if (scoreRaw === "-" || scoreRaw === "—" || scoreRaw === "") {
    scorePart = "?";
  } else if (/\d/.test(scoreRaw) && !/[/／]/.test(scoreRaw)) {
    scorePart = `${scoreRaw}/10`;
  } else {
    scorePart = cleanLine(scoreRaw.replace(/\s+/g, " "));
  }

  const prefix = "ผลตรวจพลัง: ";
  const suffix = ` · ${scorePart}`;
  const maxLabelLen = Math.max(
    12,
    FLEX_ALT_TEXT_MAX - prefix.length - suffix.length,
  );
  let label = cleanLine(mainEnergyLabel) || "พลังวัตถุ";
  if (label.length > maxLabelLen) {
    label = safeWrapText(label, maxLabelLen);
  }
  let raw = `${prefix}${label}${suffix}`;
  if (raw.length <= FLEX_ALT_TEXT_MAX) return raw;
  label = safeWrapText(
    cleanLine(mainEnergyLabel) || "พลังวัตถุ",
    Math.max(8, maxLabelLen - 6),
  );
  raw = `${prefix}${label}${suffix}`;
  return raw.length <= FLEX_ALT_TEXT_MAX ? raw : safeWrapText(raw, FLEX_ALT_TEXT_MAX);
}

/**
 * Normalize parsed scan fields for Flex (shortening + safe defaults for missing sections).
 */
export function prepareScanFlexDisplay(parsed) {
  const overviewRaw = parsed.overview;
  const fitRaw = parsed.fitReason;
  const closingRaw = parsed.closing;

  const ovClean =
    overviewRaw === "-" ? "" : String(overviewRaw || "").trim();
  const fitClean = fitRaw === "-" ? "" : String(fitRaw || "").trim();
  const clClean =
    closingRaw === "-" ? "" : String(closingRaw || "").trim();

  const ov = ovClean
    ? pickInsightfulSentencesWithDebug(
        ovClean,
        "overview",
        FLEX_OVERVIEW_MAX_CHARS,
        FLEX_OVERVIEW_MAX_SENTENCES,
      )
    : { text: "", debug: null };
  const fit = fitClean
    ? pickInsightfulSentencesWithDebug(
        fitClean,
        "fit",
        FLEX_FIT_REASON_MAX_CHARS,
        FLEX_FIT_REASON_MAX_SENTENCES,
      )
    : { text: "", debug: null };
  const cl = clClean
    ? pickInsightfulSentencesWithDebug(
        clClean,
        "closing",
        FLEX_CLOSING_MAX_CHARS,
        2,
      )
    : { text: "", debug: null };

  return {
    ...parsed,
    overviewForFlex: ovClean
      ? polishReadingLineForFlex(ov.text, FLEX_OVERVIEW_DISPLAY_MAX)
      : "",
    fitReasonForFlex: fitClean
      ? polishReadingLineForFlex(fit.text, FLEX_FIT_DISPLAY_MAX)
      : "",
    closingForFlex: cl.text,
    /** For `[FLEX_PARSE]`: scores, rank order vs picked order, later vs first */
    flexInsightDebug: {
      overview: ov.debug,
      fitReason: fit.debug,
      closing: cl.debug,
    },
  };
}

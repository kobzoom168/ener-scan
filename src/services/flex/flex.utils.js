export function cleanLine(line) {
  return String(line || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Flex display-only: strip trailing ellipsis-like junk from upstream text and weak
 * trailing separators (|, ·, •). No scoring/layout impact.
 */
function sanitizeFlexDisplayLine(line) {
  let s = String(line).replace(/[ \t]+/g, " ").trim();
  if (!s) return "";
  let prev;
  do {
    prev = s;
    s = s.replace(/\s+$/, "");
    s = s.replace(
      /(?:\s*[|·\u00B7•\u2022])+[\s]*(?:\.{3,}|…)+\s*$/u,
      "",
    );
    s = s.replace(/\s*(?:\.{3,}|…)\s*$/u, "");
    s = s.replace(/(?:\.{3,}|…)+$/u, "");
    s = s.replace(/\s+$/, "");
    s = s.replace(/(?:\s*[|·\u00B7•\u2022])+\s*$/u, "");
    s = s.replace(/\s+$/, "");
  } while (s !== prev);
  return s;
}

export function sanitizeFlexDisplayText(input) {
  const raw = String(input ?? "");
  if (!raw.includes("\n")) {
    return sanitizeFlexDisplayLine(raw);
  }
  return raw
    .split("\n")
    .map((line) => sanitizeFlexDisplayLine(line))
    .join("\n");
}

export function stripBullet(text) {
  return String(text || "")
    .replace(/^[•\u2022\u00B7\*\s\u2013\u2014-]+/u, "")
    .trim();
}

/** Lower-left "สิ่งที่ชิ้นนี้ให้" trait boxes — label mode: one tight line each, readability over completeness. */
export const FLEX_TRAIT_PERSONALITY_MAX = 28;
export const FLEX_TRAIT_TONE_MAX = 30;
export const FLEX_TRAIT_HIDDEN_MAX = 22;

/**
 * Thai dependent marks that must not end a truncated segment (incomplete display cluster).
 * Ranges: MAI HAN-AKAT, vowel signs, PHINTHU, MAITAIKHU, tone marks, etc. (U+0E00 block).
 */
function isThaiDependentMarkCode(code) {
  if (code === 0x0e31) return true;
  if (code >= 0x0e34 && code <= 0x0e3a) return true;
  if (code >= 0x0e47 && code <= 0x0e4b) return true;
  if (code >= 0x0e38 && code <= 0x0e39) return true;
  return false;
}

/**
 * After a hard cut, `rest` may start with marks that belong to the previous syllable — drop them for clean Flex lines.
 */
function stripLeadingThaiOrphansAfterCut(rest) {
  let t = String(rest);
  while (t.length > 0 && isThaiDependentMarkCode(t.charCodeAt(0))) {
    t = t.slice(1);
  }
  return t;
}

/**
 * Thai-safe head cut: never end on tone/vowel marks or other trailing dependents.
 * Tries slightly shorter heads (back off 1–2) if stripping marks would empty the slice.
 * Does not exceed `maxChars` (display width); no ellipsis.
 */
export function safeThaiCut(str, maxChars) {
  const s = String(str);
  if (!s) return "";
  const n = Math.min(Math.max(0, maxChars), s.length);
  if (n === 0) return "";

  const tryEnds = [n, n - 1, n - 2].filter((e) => e > 0);

  for (const startEnd of tryEnds) {
    for (let end = startEnd; end > 0; end--) {
      let cut = s.slice(0, end);
      while (cut.length > 0 && isThaiDependentMarkCode(cut.charCodeAt(cut.length - 1))) {
        cut = cut.slice(0, -1);
      }
      if (cut.length > 0) {
        return cut;
      }
    }
  }

  const first = s.charCodeAt(0);
  if (!isThaiDependentMarkCode(first)) {
    return s.slice(0, 1);
  }
  return s.slice(0, Math.min(2, s.length));
}

/**
 * Truncate at a space when possible — no "…" / "..." in Flex copy.
 * If there is no space in-range, uses Thai-safe cutting (not raw slice at maxChars).
 */
export function truncateAtWordBoundaryWithRest(text, maxChars) {
  const t = cleanLine(text);
  if (!t) return { line: "", rest: "" };
  if (t.length <= maxChars) return { line: t, rest: "" };

  const sliced = t.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace > Math.floor(maxChars * 0.35)) {
    const headRaw = t.slice(0, lastSpace).trim();
    const line = headRaw
      ? safeThaiCut(headRaw, Math.min(maxChars, headRaw.length))
      : "";
    const rest = stripLeadingThaiOrphansAfterCut(t.slice(lastSpace + 1).trim());
    return {
      line,
      rest: rest.trim(),
    };
  }

  const line = safeThaiCut(t, maxChars);
  const rest = stripLeadingThaiOrphansAfterCut(t.slice(line.length));
  return { line: line || "", rest: rest.trim() };
}

export function truncateAtWordBoundary(text, maxLength) {
  const { line } = truncateAtWordBoundaryWithRest(text, maxLength);
  return line || "-";
}

export function safeWrapText(text, maxLength = 300) {
  const clean = cleanLine(text);
  if (!clean) return "-";
  return truncateAtWordBoundary(clean, maxLength);
}

/**
 * Wrap Thai/space-separated text into multiple lines for LINE Flex without **dropping** tail text.
 * (Contrast: `safeWrapText` truncates to a single segment.)
 * @param {string} text
 * @param {number} [maxCharsPerLine] — soft wrap width for narrow columns (~26 bullets, ~32 score row)
 */
export function wrapFlexTextNoTruncate(text, maxCharsPerLine = 26) {
  const t = cleanLine(text);
  if (!t) return "";
  const lines = [];
  let remaining = t;
  let safety = 0;
  while (remaining && safety < 20) {
    safety += 1;
    const { line, rest } = truncateAtWordBoundaryWithRest(remaining, maxCharsPerLine);
    if (line) lines.push(line);
    remaining = rest;
    if (!rest) break;
  }
  if (remaining) {
    lines.push(remaining);
  }
  return sanitizeFlexDisplayText(lines.join("\n"));
}

/** Collapse horizontal spaces only — keeps newline boundaries for multi-line Flex text. */
function normalizeFlexLine(s) {
  return String(s || "").replace(/[ \t]+/g, " ").trim();
}

function splitOverflowSegment(singleLine, maxChars) {
  const s = normalizeFlexLine(singleLine);
  if (!s) return { line: "-", rest: "" };
  const { line, rest } = truncateAtWordBoundaryWithRest(s, maxChars);
  if (!line) return { line: "-", rest: rest || "" };
  return { line, rest: rest || "" };
}

function takeOneLineSegment(singleLine, maxChars) {
  const { line } = splitOverflowSegment(singleLine, maxChars);
  return line === "-" ? "" : line;
}

/**
 * Split one logical line into up to `maxLines` physical lines for narrow Flex columns
 * without dropping overflow (each line capped at `charsPerLine`).
 */
function wrapSegmentToLines(segment, maxLines, charsPerLine) {
  const out = [];
  let remaining = normalizeFlexLine(segment);
  let safety = 0;
  while (remaining && out.length < maxLines && safety < maxLines + 8) {
    safety += 1;
    const { line, rest } = splitOverflowSegment(remaining, charsPerLine);
    if (line && line !== "-") out.push(line);
    remaining = rest;
    if (!rest) break;
  }
  return out.filter((x) => x && x !== "-");
}

/**
 * Hard cap for narrow mobile Flex columns: at most `maxLines` lines, ~`charsPerLine` chars each.
 * Preserves explicit newlines from the model (does not collapse \\n into spaces).
 * Overflow is wrapped into extra lines up to `maxLines` (no silent drop after line 1).
 */
export function clampToFlexLines(text, maxLines = 2, charsPerLine = 22) {
  const raw = String(text ?? "").trim();
  if (!raw || raw === "-") return [];

  const parts = raw
    .replace(/\r/g, "")
    .split("\n")
    .map(normalizeFlexLine)
    .filter(Boolean);

  if (parts.length >= 2) {
    const budgetFirst = Math.max(1, Math.ceil(maxLines / 2));
    const firstBlock = wrapSegmentToLines(parts[0], budgetFirst, charsPerLine);
    const restBudget = Math.max(1, maxLines - firstBlock.length);
    const secondBlock = wrapSegmentToLines(
      parts.slice(1).join(" "),
      restBudget,
      charsPerLine,
    );
    return [...firstBlock, ...secondBlock].slice(0, maxLines);
  }

  return wrapSegmentToLines(parts[0] || "", maxLines, charsPerLine);
}

/**
 * Short human hint from parenthetical text — not a long explanation (metric card only).
 */
export function compactParenHint(inner, maxLen = 16) {
  let s = cleanLine(inner);
  if (!s) return "";
  s = s
    .replace(/^ช่วยให้\s*/i, "")
    .replace(/^ที่จะ\s*/i, "")
    .replace(/^เพื่อให้\s*/i, "")
    .trim();
  if (s.length <= maxLen) return s;
  const commaTh = s.indexOf("，");
  const commaEn = s.indexOf(",");
  const comma =
    commaTh >= 0 && commaEn >= 0
      ? Math.min(commaTh, commaEn)
      : Math.max(commaTh, commaEn);
  if (comma > 6) {
    const first = s.slice(0, comma).trim();
    if (first.length <= maxLen) return first;
    return truncateAtWordBoundary(first, maxLen);
  }
  return truncateAtWordBoundary(s, maxLen);
}

/**
 * Compact "พลังหลัก" for small metric cards:
 * line 1 = category only · line 2 = short label (no "(...)" long explanations).
 */
export function formatMainEnergyForCard(text, headMax = 22, hintMax = 22) {
  const c = cleanLine(text);
  if (!c || c === "-") return "-";

  const open = c.indexOf("(");
  if (open <= 0) {
    const lines = clampToFlexLines(c, 4, headMax);
    return sanitizeFlexDisplayText(lines.join("\n"));
  }

  const head = c.slice(0, open).trim();
  const close = c.indexOf(")", open + 1);
  const innerRaw =
    close > open ? c.slice(open + 1, close) : c.slice(open + 1);
  const inner = cleanLine(innerRaw);
  const headLine = safeWrapText(head, headMax);

  if (!inner) {
    return sanitizeFlexDisplayText(headLine);
  }

  const hint = compactParenHint(inner, hintMax);
  if (!hint) {
    return sanitizeFlexDisplayText(headLine);
  }

  return sanitizeFlexDisplayText(`${headLine}\n${hint}`);
}

/**
 * Build the three lower-left trait lines from unified scan copy (feel / use case / effect).
 */
export function buildTraitLinesFromCopy(traits) {
  if (!traits) return [];
  const lines = [traits.feelShort, traits.useCaseShort, traits.effectShort]
    .map((s) => cleanLine(String(s || "")))
    .filter(Boolean);
  if (lines.length === 0) {
    return [
      "ใจสบายและตั้งหลักขึ้นในโทนนิ่ง ๆ",
      "รู้สึกมีแรงและนิ่งในใจมากขึ้น",
      "ลงมือได้ต่อเนื่องโดยไม่หมดเร็ว",
    ];
  }
  return lines;
}

/** Drop empty / bullet-only rows so Flex bullet blocks never show lone "•". */
export function sanitizeBulletLines(lines, charsPerLine = 26) {
  if (!Array.isArray(lines)) return [];

  return lines
    .map((line) => cleanLine(stripBullet(line)))
    .map((line) => line.replace(/^[\s\u2022\u00B7]+/u, "").trim())
    .filter(
      (line) =>
        line &&
        line !== "-" &&
        !/^[•:\s\u2013\u2014-]+$/u.test(line),
    )
    .slice(0, 2)
    .map((line) => wrapFlexTextNoTruncate(line, charsPerLine));
}

export function pickMainEnergyColor(text) {
  const clean = cleanLine(text);

  if (
    clean.includes("พลังปกป้อง") ||
    clean.includes("ปกป้อง") ||
    clean.includes("คุ้มครอง")
  ) {
    return "#D4AF37";
  }

  if (
    clean.includes("พลังอำนาจ") ||
    clean.includes("อำนาจ") ||
    clean.includes("บารมี")
  ) {
    return "#C62828";
  }

  if (
    clean.includes("พลังโชคลาภ") ||
    clean.includes("โชคลาภ") ||
    clean.includes("โชค")
  ) {
    return "#2E7D32";
  }

  if (
    clean.includes("พลังสมดุล") ||
    clean.includes("สมดุล") ||
    clean.includes("นิ่ง")
  ) {
    return "#1565C0";
  }

  if (
    clean.includes("พลังเมตตา") ||
    clean.includes("เมตตา")
  ) {
    return "#8E24AA";
  }

  if (
    clean.includes("พลังดึงดูด") ||
    clean.includes("ดึงดูด") ||
    clean.includes("เสน่ห์")
  ) {
    return "#AD1457";
  }

  return "#D4AF37";
}

export function normalizeScore(scoreText) {
  const raw = cleanLine(scoreText);
  const match = raw.match(/(\d+(?:\.\d+)?)/);

  if (!match) {
    return {
      raw: raw || "-",
      numeric: null,
      display: raw || "-",
      percent: "50%",
    };
  }

  const numeric = Number(match[1]);

  if (!Number.isFinite(numeric)) {
    return {
      raw: raw || "-",
      numeric: null,
      display: raw || "-",
      percent: "50%",
    };
  }

  const clamped = Math.max(0, Math.min(10, numeric));
  const percent = Math.round((clamped / 10) * 100);

  return {
    raw,
    numeric: clamped,
    display: Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1),
    percent: `${percent}%`,
  };
}

export function getEnergyShortLabel(mainEnergy) {
  const value = cleanLine(mainEnergy);

  if (!value || value === "-") return "พลังหลักชัด ๆ";

  if (value.includes("ปกป้อง") || value.includes("คุ้มครอง")) {
    return "ปกป้องและมั่นคง";
  }

  if (value.includes("อำนาจ") || value.includes("บารมี")) {
    return "มั่นใจและตัดสินใจ";
  }

  if (value.includes("โชคลาภ") || value.includes("โชค")) {
    return "โอกาสและจังหวะ";
  }

  if (value.includes("สมดุล") || value.includes("นิ่ง")) {
    return "สมดุลและจังหวะ";
  }

  if (value.includes("เมตตา")) {
    return "อ่อนโยนกับคน";
  }

  if (value.includes("ดึงดูด") || value.includes("เสน่ห์")) {
    return "น่าเข้าหาและโดดเด่น";
  }

  return sanitizeFlexDisplayText(safeWrapText(value, 28));
}

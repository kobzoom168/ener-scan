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

/** Lower-left "ลักษณะพลัง" boxes — label mode: one tight line each, readability over completeness. */
export const FLEX_TRAIT_PERSONALITY_MAX = 28;
export const FLEX_TRAIT_TONE_MAX = 30;
export const FLEX_TRAIT_HIDDEN_MAX = 22;

const TRAIT_HIDDEN_FALLBACK = "เสริมพลังในใจ";

function stripPersonalityExplanationPrefixes(s) {
  return cleanLine(
    String(s || "")
      .replace(/^ช่วยให้\s*|^ทำให้\s*|^เพื่อให้\s*|^ที่จะ\s*/giu, "")
      .trim(),
  );
}

function firstShortClauseForTraitLabel(s, maxLen) {
  const t = cleanLine(s);
  if (!t) return "";
  if (t.length <= maxLen) return t;
  const stop = t.search(/[。！？]/u);
  if (stop > 0 && stop <= maxLen + 14) {
    const one = t.slice(0, stop).trim();
    if (one.length <= maxLen) return one;
  }
  const commaTh = t.indexOf("，");
  const commaEn = t.indexOf(",");
  const comma =
    commaTh >= 0 && commaEn >= 0
      ? Math.min(commaTh, commaEn)
      : Math.max(commaTh, commaEn);
  if (comma > 6 && comma <= maxLen + 10) {
    const one = t.slice(0, comma).trim();
    if (one.length <= maxLen) return one;
  }
  return safeThaiCut(t, maxLen);
}

function normalizeHiddenForTraitBox(s) {
  let t = cleanLine(s);
  if (!t) return "";
  const rules = [
    [/^ให้ความรู้สึกเหมือน/u, ""],
    [/^ให้ความรู้สึกว่า/u, ""],
    [/^ให้ความรู้สึก/u, ""],
    [/^รู้สึกเหมือน/u, ""],
    [/^ทำให้มีภูมิต้านทาน/u, "เสริมภูมิต้านทาน"],
    [/^ทำให้/u, ""],
    [/^ช่วยให้/u, ""],
    [/^เพื่อให้/u, ""],
  ];
  for (const [re, rep] of rules) {
    t = t.replace(re, rep);
  }
  return cleanLine(t);
}

/**
 * Single-line cap for trait bullets — no manual newlines; Thai-safe tail.
 */
export function finalizeTraitBoxLine(text, maxChars) {
  const flat = cleanLine(String(text || "").replace(/\n+/g, " "));
  if (!flat || flat === "-") return "";
  return sanitizeFlexDisplayText(safeThaiCut(flat, maxChars));
}

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
 * Hard cap for narrow mobile Flex columns: at most 2 lines, ~`charsPerLine` chars each.
 * Preserves explicit newlines from the model (does not collapse \\n into spaces).
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
    const l1 = takeOneLineSegment(parts[0], charsPerLine);
    const l2 = takeOneLineSegment(parts.slice(1).join(" "), charsPerLine);
    return [l1, l2].filter(Boolean);
  }

  const single = parts[0] || "";
  const { line: l1, rest: r1 } = splitOverflowSegment(single, charsPerLine);
  if (!r1 || maxLines < 2) {
    return l1 && l1 !== "-" ? [l1] : [];
  }

  const l2 = takeOneLineSegment(r1, charsPerLine);
  return [l1, l2].filter((x) => x && x !== "-");
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
export function formatMainEnergyForCard(text, headMax = 18, hintMax = 16) {
  const c = cleanLine(text);
  if (!c || c === "-") return "-";

  const open = c.indexOf("(");
  if (open <= 0) {
    const lines = clampToFlexLines(c, 2, headMax);
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
 * Trait rows (บุคลิก): one short label line — "พลังหลัก · ใจสงบ" style, not explanation.
 */
export function compactEnergyTraitForFlex(raw) {
  const t = cleanLine(stripBullet(raw));
  if (!t || t === "-") return "-";

  const open = t.indexOf("(");
  if (open > 0) {
    const head = stripPersonalityExplanationPrefixes(t.slice(0, open).trim());
    const close = t.indexOf(")", open + 1);
    const inner = close > open ? t.slice(open + 1, close) : "";
    const hint = compactParenHint(inner, 12);
    const h = safeWrapText(head, 14);
    let out = hint ? `${h} · ${hint}` : h;
    out = finalizeTraitBoxLine(out, FLEX_TRAIT_PERSONALITY_MAX);
    return out || "-";
  }

  const plain = stripPersonalityExplanationPrefixes(t);
  const out = firstShortClauseForTraitLabel(plain, FLEX_TRAIT_PERSONALITY_MAX);
  return finalizeTraitBoxLine(out, FLEX_TRAIT_PERSONALITY_MAX) || "-";
}

/** Drop empty / bullet-only rows so Flex bullet blocks never show lone "•". */
export function sanitizeBulletLines(lines, wrapAt = 42) {
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
    .map((line) => safeWrapText(line, wrapAt));
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
    return "เน้นปกป้อง";
  }

  if (value.includes("อำนาจ") || value.includes("บารมี")) {
    return "เน้นอำนาจบารมี";
  }

  if (value.includes("โชคลาภ") || value.includes("โชค")) {
    return "เน้นโชคลาภ";
  }

  if (value.includes("สมดุล") || value.includes("นิ่ง")) {
    return "เน้นสมดุล";
  }

  if (value.includes("เมตตา")) {
    return "เน้นเมตตา";
  }

  if (value.includes("ดึงดูด") || value.includes("เสน่ห์")) {
    return "เน้นดึงดูด";
  }

  return sanitizeFlexDisplayText(safeWrapText(value, 28));
}

export function mapHiddenToShortText(hidden) {
  const clean = stripBullet(hidden);

  if (!clean || clean === "-" || clean === "ไม่เด่นชัด") return "-";

  const asLabel = (phrase) =>
    finalizeTraitBoxLine(phrase, FLEX_TRAIT_HIDDEN_MAX) || TRAIT_HIDDEN_FALLBACK;

  if (clean.includes("เมตตา")) return asLabel("เมตตาแฝง");
  if (clean.includes("ปกป้อง") || clean.includes("คุ้มครอง")) return asLabel("เกราะพลัง");
  if (clean.includes("อำนาจ") || clean.includes("บารมี")) return asLabel("อำนาจแฝง");
  if (clean.includes("โชค")) return asLabel("โชคแฝง");
  if (clean.includes("ดึงดูด") || clean.includes("เสน่ห์")) return asLabel("แรงดึงดูด");
  if (clean.includes("สิ่งศักดิ์สิทธิ์")) return asLabel("แรงศักดิ์สิทธิ์");
  if (clean.includes("บางเบา")) return asLabel("พลังรอง");
  if (clean.includes("ลึก")) return asLabel("พลังลึก");
  if (clean.includes("นิ่ง")) return asLabel("พลังนิ่งแฝง");
  if (clean.includes("แฝง")) return asLabel("พลังแฝง");

  let rest = normalizeHiddenForTraitBox(clean);
  if (!rest) return TRAIT_HIDDEN_FALLBACK;
  if (clean.length > 28 && rest.length > 0 && rest.length < 3) {
    return TRAIT_HIDDEN_FALLBACK;
  }
  if (rest.length <= FLEX_TRAIT_HIDDEN_MAX) {
    return asLabel(rest);
  }
  rest = firstShortClauseForTraitLabel(rest, FLEX_TRAIT_HIDDEN_MAX);
  const cut = finalizeTraitBoxLine(rest, FLEX_TRAIT_HIDDEN_MAX);
  if (cut && cut.length >= 6) return cut;
  return TRAIT_HIDDEN_FALLBACK;
}

export function formatToneLine(tone) {
  const clean = stripBullet(tone);

  if (!clean || clean === "-") return "-";

  const parts = clean
    .split("|")
    .map((part) => cleanLine(part))
    .filter(Boolean);

  if (parts.length === 0) return "-";

  const stripTonePrefix = (p) => p.replace(/^\s*โทน\s*/u, "").trim();

  if (parts.length === 1) {
    const only = stripTonePrefix(parts[0]);
    const line = `โทน${safeThaiCut(only, 18)}`;
    return finalizeTraitBoxLine(line, FLEX_TRAIT_TONE_MAX) || "-";
  }

  const left = safeThaiCut(stripTonePrefix(parts[0]), 12);
  const right = safeThaiCut(stripTonePrefix(parts[1]), 16);
  const line = `โทน${left} | ${right}`;
  return finalizeTraitBoxLine(line, FLEX_TRAIT_TONE_MAX) || "-";
}

export function buildEnergyLines({ personality, tone, hidden }) {
  const lines = [];

  const personalityText = stripBullet(personality);
  if (personalityText && personalityText !== "-") {
    const line = compactEnergyTraitForFlex(personalityText);
    if (line && line !== "-") lines.push(line);
  }

  const toneText = formatToneLine(tone);
  if (toneText && toneText !== "-") {
    lines.push(toneText);
  }

  const hiddenText = mapHiddenToShortText(hidden);
  if (hiddenText && hiddenText !== "-") {
    lines.push(hiddenText);
  }

  if (lines.length === 0) {
    return ["ดูนิ่ง มั่นคง"];
  }

  const cleaned = lines
    .slice(0, 3)
    .map((line) => sanitizeFlexDisplayText(line))
    .filter((line) => line && line !== "-");
  if (cleaned.length === 0) {
    return ["ดูนิ่ง มั่นคง"];
  }
  return cleaned;
}
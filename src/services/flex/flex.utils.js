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

/**
 * Thai dependent marks that must not end a truncated segment (incomplete display cluster).
 * Ranges: MAI HAN-AKAT, vowel signs, PHINTHU, MAITAIKHU, tone marks, etc. (U+0E00 block).
 */
function isThaiDependentMarkCode(code) {
  if (code === 0x0e31) return true;
  if (code >= 0x0e34 && code <= 0x0e3a) return true;
  if (code >= 0x0e47 && code <= 0x0e4e) return true;
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
 * Trait rows (บุคลิก / โทน / พลังซ่อน): compact "category · short hint" — detail stays in reading cards.
 */
export function compactEnergyTraitForFlex(raw) {
  const t = cleanLine(stripBullet(raw));
  if (!t || t === "-") return "-";

  const open = t.indexOf("(");
  if (open > 0) {
    const head = t.slice(0, open).trim();
    const close = t.indexOf(")", open + 1);
    const inner = close > open ? t.slice(open + 1, close) : "";
    const hint = compactParenHint(inner, 14);
    const h = safeWrapText(head, 16);
    if (hint) return sanitizeFlexDisplayText(`${h} · ${hint}`);
    return sanitizeFlexDisplayText(h);
  }

  return sanitizeFlexDisplayText(safeWrapText(t, 30));
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

  if (clean.includes("เมตตา")) return "เมตตาแฝง";
  if (clean.includes("ปกป้อง") || clean.includes("คุ้มครอง")) return "เกราะพลัง";
  if (clean.includes("อำนาจ") || clean.includes("บารมี")) return "อำนาจแฝง";
  if (clean.includes("โชค")) return "โชคแฝง";
  if (clean.includes("ดึงดูด") || clean.includes("เสน่ห์")) return "แรงดึงดูด";
  if (clean.includes("สิ่งศักดิ์สิทธิ์")) return "แรงศักดิ์สิทธิ์";
  if (clean.includes("บางเบา")) return "พลังรอง";
  if (clean.includes("ลึก")) return "พลังลึก";
  if (clean.includes("นิ่ง")) return "พลังนิ่งแฝง";
  if (clean.includes("แฝง")) return "พลังแฝง";

  return sanitizeFlexDisplayText(safeWrapText(clean, 24));
}

export function formatToneLine(tone) {
  const clean = stripBullet(tone);

  if (!clean || clean === "-") return "-";

  const parts = clean
    .split("|")
    .map((part) => cleanLine(part))
    .filter(Boolean);

  if (parts.length === 0) return "-";
  if (parts.length === 1) {
    return sanitizeFlexDisplayText(safeWrapText(`โทน${parts[0]}`, 24));
  }

  return sanitizeFlexDisplayText(
    safeWrapText(`โทน${parts[0]} | ${parts[1]}`, 28),
  );
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
    lines.push(sanitizeFlexDisplayText(safeWrapText(hiddenText, 20)));
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
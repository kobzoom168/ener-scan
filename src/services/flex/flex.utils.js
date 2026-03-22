export function cleanLine(line) {
  return String(line || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripBullet(text) {
  return String(text || "")
    .replace(/^[•\u2022\u00B7\*\s\u2013\u2014-]+/u, "")
    .trim();
}

export function safeWrapText(text, maxLength = 300) {
  const clean = cleanLine(text);

  if (!clean) return "-";
  if (clean.length <= maxLength) return clean;

  const sliced = clean.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = sliced.lastIndexOf(" ");

  if (lastSpace > Math.floor(maxLength * 0.55)) {
    return `${sliced.slice(0, lastSpace).trim()}…`;
  }

  return `${sliced.trim()}…`;
}

/** Collapse horizontal spaces only — keeps newline boundaries for multi-line Flex text. */
function normalizeFlexLine(s) {
  return String(s || "").replace(/[ \t]+/g, " ").trim();
}

function splitOverflowSegment(singleLine, maxChars) {
  const s = normalizeFlexLine(singleLine);
  if (!s) return { line: "-", rest: "" };
  if (s.length <= maxChars) return { line: s, rest: "" };

  const slice = s.slice(0, maxChars);
  const sp = slice.lastIndexOf(" ");
  if (sp > Math.floor(maxChars * 0.35)) {
    const part = s.slice(0, sp).trim();
    return { line: `${part}…`, rest: s.slice(sp).trim() };
  }

  const part = s.slice(0, maxChars - 1).trim();
  return { line: `${part}…`, rest: s.slice(maxChars - 1).trim() };
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
 * Compact "พลังหลัก" for small Flex metric cards: line 1 = category, line 2 = short hint.
 * Strictly capped so summary cards never overflow on LINE mobile width.
 */
export function formatMainEnergyForCard(text, headMax = 22, hintMax = 24) {
  const c = cleanLine(text);
  if (!c || c === "-") return "-";

  const open = c.indexOf("(");
  if (open <= 0) {
    const lines = clampToFlexLines(c, 2, headMax);
    return lines.join("\n");
  }

  const head = c.slice(0, open).trim();
  const close = c.indexOf(")", open + 1);
  const innerRaw =
    close > open ? c.slice(open + 1, close) : c.slice(open + 1);
  const inner = cleanLine(innerRaw);
  if (!inner) {
    return safeWrapText(head, headMax);
  }

  const headLine = safeWrapText(head, headMax);
  const innerShort =
    inner.length > hintMax ? `${inner.slice(0, Math.max(1, hintMax - 1)).trim()}…` : inner;
  return `${headLine}\n(${innerShort})`;
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

  return safeWrapText(value, 28);
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

  return safeWrapText(clean, 24);
}

export function formatToneLine(tone) {
  const clean = stripBullet(tone);

  if (!clean || clean === "-") return "-";

  const parts = clean
    .split("|")
    .map((part) => cleanLine(part))
    .filter(Boolean);

  if (parts.length === 0) return "-";
  if (parts.length === 1) return `โทน${parts[0]}`;

  return `โทน${parts[0]} | ${parts[1]}`;
}

export function buildEnergyLines({ personality, tone, hidden }) {
  const lines = [];

  const personalityText = stripBullet(personality);
  if (personalityText && personalityText !== "-") {
    lines.push(safeWrapText(personalityText, 120));
  }

  const toneText = formatToneLine(tone);
  if (toneText && toneText !== "-") {
    lines.push(safeWrapText(toneText, 120));
  }

  const hiddenText = mapHiddenToShortText(hidden);
  if (hiddenText && hiddenText !== "-") {
    lines.push(safeWrapText(hiddenText, 120));
  }

  if (lines.length === 0) {
    return ["ดูนิ่ง มั่นคง"];
  }

  return lines.slice(0, 3);
}
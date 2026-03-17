export function cleanLine(line) {
  return String(line || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripBullet(text) {
  return String(text || "")
    .replace(/^[•\-\–\—\*\s]+/, "")
    .trim();
}

export function safeWrapText(text, maxLength = 300) {
  const clean = cleanLine(text);

  if (!clean) return "-";
  if (clean.length <= maxLength) return clean;

  const sliced = clean.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = sliced.lastIndexOf(" ");

  if (lastSpace > Math.floor(maxLength * 0.6)) {
    return `${sliced.slice(0, lastSpace).trim()}…`;
  }

  return `${sliced.trim()}…`;
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

  if (!value || value === "-") return "พลังเฉพาะทาง";

  if (value.includes("ปกป้อง") || value.includes("คุ้มครอง")) {
    return "พลังปกป้องเด่น";
  }

  if (value.includes("อำนาจ") || value.includes("บารมี")) {
    return "พลังอำนาจเด่น";
  }

  if (value.includes("โชคลาภ") || value.includes("โชค")) {
    return "พลังโชคลาภเด่น";
  }

  if (value.includes("สมดุล") || value.includes("นิ่ง")) {
    return "พลังสมดุลเด่น";
  }

  if (value.includes("เมตตา")) {
    return "พลังเมตตาเด่น";
  }

  if (value.includes("ดึงดูด") || value.includes("เสน่ห์")) {
    return "พลังดึงดูดเด่น";
  }

  return safeWrapText(value, 40);
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
  if (clean.includes("แฝง")) return "พลังแฝง";

  return safeWrapText(clean, 28);
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
    lines.push(safeWrapText(personalityText, 60));
  }

  const toneText = formatToneLine(tone);
  if (toneText && toneText !== "-") {
    lines.push(safeWrapText(toneText, 60));
  }

  const hiddenText = mapHiddenToShortText(hidden);
  if (hiddenText && hiddenText !== "-") {
    lines.push(safeWrapText(hiddenText, 60));
  }

  return lines.slice(0, 3);
}
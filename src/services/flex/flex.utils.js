export function pickMainEnergyColor(text) {
  if (text.includes("พลังปกป้อง")) return "#D4AF37";
  if (text.includes("พลังอำนาจ")) return "#C62828";
  if (text.includes("พลังโชคลาภ")) return "#2E7D32";
  if (text.includes("พลังสมดุล")) return "#1565C0";
  if (text.includes("พลังเมตตา")) return "#8E24AA";
  if (text.includes("พลังดึงดูด")) return "#AD1457";
  return "#D4AF37";
}

export function cleanLine(line) {
  return String(line || "").trim();
}

export function safeWrapText(text, maxLength = 300) {
  const clean = String(text || "").trim();
  if (!clean) return "-";
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

export function stripBullet(text) {
  return String(text || "").replace(/^•\s*/, "").trim();
}

export function normalizeScore(scoreText) {
  const raw = String(scoreText || "").trim();
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

  const clamped = Number.isFinite(numeric)
    ? Math.max(0, Math.min(10, numeric))
    : null;

  const percent = clamped === null ? 50 : Math.round((clamped / 10) * 100);

  return {
    raw,
    numeric: clamped,
    display: match[1],
    percent: `${percent}%`,
  };
}

export function getEnergyShortLabel(mainEnergy) {
  const value = String(mainEnergy || "").trim();

  if (value.includes("ปกป้อง")) return "พลังปกป้องเด่น";
  if (value.includes("อำนาจ")) return "พลังอำนาจเด่น";
  if (value.includes("โชคลาภ")) return "พลังโชคลาภเด่น";
  if (value.includes("สมดุล")) return "พลังสมดุลเด่น";
  if (value.includes("เมตตา")) return "พลังเมตตาเด่น";
  if (value.includes("ดึงดูด")) return "พลังดึงดูดเด่น";

  return value !== "-" ? value : "พลังเฉพาะทาง";
}

export function mapHiddenToShortText(hidden) {
  const clean = stripBullet(hidden);
  if (!clean || clean === "-" || clean === "ไม่เด่นชัด") return "-";

  if (clean.includes("เมตตา")) return "เมตตาแฝง";
  if (clean.includes("ปกป้อง")) return "เกราะพลัง";
  if (clean.includes("อำนาจ")) return "อำนาจแฝง";
  if (clean.includes("โชค")) return "โชคแฝง";
  if (clean.includes("ดึงดูด")) return "แรงดึงดูด";
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
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return clean;
  if (parts.length === 1) return `โทน${parts[0]}`;

  return `โทน${parts[0]} | ${parts[1]}`;
}

export function buildEnergyLines({ personality, tone, hidden }) {
  const lines = [];

  const personalityText = stripBullet(personality);
  if (personalityText && personalityText !== "-") {
    lines.push(personalityText);
  }

  const toneText = formatToneLine(tone);
  if (toneText && toneText !== "-") {
    lines.push(toneText);
  }

  const hiddenText = mapHiddenToShortText(hidden);
  if (hiddenText && hiddenText !== "-") {
    lines.push(hiddenText);
  }

  return lines.slice(0, 3);
}
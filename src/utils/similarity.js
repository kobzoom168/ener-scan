const bannedPhrases = [
  "เหมือนภูเขา",
  "สงบลุ่มลึก",
  "นิ่งแต่หนักแน่น",
  "เปลวไฟอุ่น",
  "สายน้ำที่ไหล",
];

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\u0E00-\u0E7Fa-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function hasRepeatedPhrase(text) {
  return bannedPhrases.some((phrase) => text.includes(phrase));
}

export function similarity(a, b) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));

  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(aTokens.size, bTokens.size);
}

export function tooSimilarToRecent(text, recents, threshold = 0.62) {
  return recents.some((oldText) => similarity(text, oldText) >= threshold);
}
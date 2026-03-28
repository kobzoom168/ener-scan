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
  for (let i = 0; i <= tokens.length - n; i++) {
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

export function tooSimilarToRecent(text, recents, threshold = 0.62) {
  return recents.some((oldText) => {
    const wordScore = similarity(text, oldText);
    const bigramScore = ngramSimilarity(text, oldText, 2);

    return wordScore >= threshold || bigramScore >= 0.42;
  });
}

export function countMatchesFromList(text, phrases) {
  return phrases.filter((phrase) => text.includes(phrase)).length;
}
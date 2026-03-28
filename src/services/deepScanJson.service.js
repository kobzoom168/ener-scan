/**
 * Parse model JSON output and render to legacy Thai deep-scan layout
 * (compatible with flex parser, history parser, format validation).
 */

const DIM_KEYS = ["คุ้มกัน", "สมดุล", "อำนาจ", "เมตตา", "ดึงดูด"];

/**
 * Extract JSON object string from model output (fences or raw).
 * @param {string} raw
 * @returns {string | null}
 */
export function extractJsonObjectString(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = fence ? fence[1].trim() : s;
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return inner.slice(start, end + 1);
}

/**
 * @param {string} raw
 * @returns {{
 *   energyName: string,
 *   energyScore: number,
 *   dimensions: Record<string, number>,
 *   description: string,
 *   compatibility: string,
 *   tips: string[],
 * } | null}
 */
export function parseDeepScanModelJson(raw) {
  try {
    const jsonStr = extractJsonObjectString(raw);
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr);
    const energyName = String(parsed.energyName || "").trim();
    const energyScore = Number(parsed.energyScore);
    const description = String(parsed.description || "").trim();
    const compatibility = String(parsed.compatibility || "").trim();
    const tipsIn = Array.isArray(parsed.tips)
      ? parsed.tips.map((t) => String(t || "").trim()).filter(Boolean)
      : [];
    const dimIn = parsed.dimensions && typeof parsed.dimensions === "object"
      ? parsed.dimensions
      : {};

    /** @type {Record<string, number>} */
    const dimensions = {};
    for (const k of DIM_KEYS) {
      const n = Number(dimIn[k]);
      dimensions[k] = Number.isFinite(n)
        ? Math.min(5, Math.max(1, Math.round(n)))
        : 3;
    }

    if (!energyName || !description) return null;

    return {
      energyName,
      energyScore: Number.isFinite(energyScore)
        ? Math.min(10, Math.max(0, energyScore))
        : 5,
      dimensions,
      description,
      compatibility: compatibility || description.slice(0, 200),
      tips: tipsIn.length >= 2 ? tipsIn.slice(0, 2) : tipsIn,
    };
  } catch {
    return null;
  }
}

function clampPctFromScore(score) {
  const base = Math.round(Number(score) * 10);
  return Math.min(95, Math.max(50, base));
}

function splitTwoShortParagraphs(text) {
  const t = String(text || "").trim();
  if (!t) return ["", ""];
  const parts = t.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[1]];
  const mid = Math.floor(t.length / 2);
  let cut = t.indexOf(" ", mid);
  if (cut < 0) cut = t.indexOf("。");
  if (cut < 10) return [t, t];
  return [t.slice(0, cut).trim(), t.slice(cut).trim()];
}

function starLine(label, n) {
  const v = Math.min(5, Math.max(0, Math.round(Number(n) || 0)));
  const filled = "★".repeat(v);
  const empty = "☆".repeat(5 - v);
  return `• ${label}: ${filled}${empty} — ${v}/5 ดาว`;
}

/**
 * @param {NonNullable<ReturnType<typeof parseDeepScanModelJson>>} p
 * @param {string} objectCategory
 * @returns {string}
 */
export function renderDeepScanJsonToLegacyText(p, objectCategory) {
  const cat = String(objectCategory || "").trim() || "พระเครื่อง";
  const scoreDisplay = Number.isFinite(p.energyScore)
    ? p.energyScore.toFixed(1).replace(/\.0$/, "")
    : String(p.energyScore);
  const compatPct = clampPctFromScore(p.energyScore);
  const [sum1, sum2] = splitTwoShortParagraphs(p.description);
  const [why1, why2] = splitTwoShortParagraphs(
    p.compatibility || p.description,
  );
  const topDim = DIM_KEYS.reduce(
    (best, k) =>
      (p.dimensions[k] || 0) > (p.dimensions[best] || 0) ? k : best,
    "สมดุล",
  );

  const tip1 = p.tips[0] || "ตั้งเจตนาก่อนใช้หรือสวมใกล้ตัวในช่วงสำคัญ";
  const tip2 =
    p.tips[1] ||
    "หลีกเลี่ยงการโชว์ในที่พลุกพล่านถ้ารู้สึกว่าพลังรบกวนง่าย";

  const dimBlock = DIM_KEYS.map((k) => starLine(k, p.dimensions[k])).join(
    "\n",
  );

  return `
ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener

หมวดวัตถุ: ${cat}

ระดับพลัง: ${scoreDisplay} / 10
พลังหลัก: ${p.energyName} (เฉพาะชิ้นนี้จากภาพและหมวด ${cat})
ความสอดคล้องกับเจ้าของ: ${compatPct} %

ลักษณะพลัง
• บุคลิก: โดดเด่นด้าน ${topDim} (สอดคล้องกับแกนพลังของชิ้นนี้)
• โทนพลัง: หลากมิติ | ดูจากคะแนนรายด้านด้านล่าง
• พลังซ่อน: ${p.description.length > 120 ? p.description.slice(0, 117) + "…" : p.description}

${dimBlock}

ภาพรวม
${sum1 || p.description}
${sum2 || ""}

เหตุผลที่เข้ากับเจ้าของ
${why1 || p.compatibility}
${why2 || ""}

ชิ้นนี้หนุนเรื่อง
• ${tip1}
• ${tip2}

เหมาะใช้เมื่อ
• ${tip1}
• ${why1 ? why1.slice(0, Math.min(80, why1.length)) : "ต้องการเสริมจังหวะชีวิตให้สอดคล้องกับพลังของวัตถุ"}

อาจไม่เด่นเมื่อ
เจ้าของยังไม่พร้อมรับฟังหรือใช้ข้อควรระวังของวัตถุมงคลอย่างต่อเนื่อง

ควรใช้แบบไหน
${tip2}

ปิดท้าย
หากอยากคุยต่อหรือสแกนชิ้นอื่น ส่งรูปมาได้เลยครับ
`.trim();
}

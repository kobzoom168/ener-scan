/**
 * การ์ดอัตโนมัติเมื่อคำตอบ (รวมคำตอบ AI สด ๆ) มีลิงก์รายงาน 1 ลิงก์ (กบ 19 ก.ค. 2026):
 * "ทุกคำตอบที่ดึง report มาโชว์ ให้เป็น flex มีรูป มี text พร้อมลิงก์ html"
 * — ข้อความไม่ตายตัว: ใช้ข้อความจริงของคำตอบนั้นใส่ในการ์ด (ตัดบรรทัดลิงก์ดิบออก
 * เพราะมีปุ่มแทน) + รูปชิ้นจริงจาก payload + ปุ่มทองเปิดรายงาน
 */

const GOLD = "#a5813a";
const BG = "#fffdf6";

const REPORT_LINK_RE = /https?:\/\/[^\s]+\/r\/([A-Za-z0-9_-]{8,64})(?:\/[^\s]*)?/g;

/**
 * @param {string} text
 * @returns {{ token: string, url: string } | null} เฉพาะเมื่อมีลิงก์รายงานเดียว (unique)
 */
export function detectSingleReportLink(text) {
  const s = String(text || "");
  const found = [...s.matchAll(REPORT_LINK_RE)];
  if (!found.length) return null;
  const tokens = [...new Set(found.map((m) => m[1]))];
  if (tokens.length !== 1) return null; // หลายชิ้น (เช่น ลิสต์ประวัติ) ไม่แปลง
  return { token: tokens[0], url: found[0][0].replace(/[).,]+$/, "") };
}

/**
 * @param {{ text: string, reportUrl: string, img?: string | null }} p
 * @returns {object} LINE flex message
 */
export function buildReportLinkAutoFlex(p) {
  // ตัดบรรทัดที่เป็นลิงก์ดิบออก (มีปุ่มแทน) — บรรทัดอื่นคงเดิมทุกตัวอักษร
  const bodyText = String(p.text || "")
    .split("\n")
    .filter((line) => !REPORT_LINK_RE.test(line) || line.replace(REPORT_LINK_RE, "").trim().length > 12)
    .map((line) => line.replace(REPORT_LINK_RE, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  /** @type {Record<string, unknown>} */
  const bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: BG,
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: GOLD,
          height: "4px",
          cornerRadius: "2px",
          contents: [{ type: "filler" }],
        },
        {
          type: "text",
          text: bodyText || "รายละเอียดอยู่ในรายงานครับ",
          size: "sm",
          color: "#444444",
          wrap: true,
          margin: "lg",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: BG,
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: GOLD,
          height: "sm",
          action: { type: "uri", label: "เปิดรายงานเต็ม", uri: p.reportUrl },
        },
      ],
    },
    styles: { body: { backgroundColor: BG }, footer: { backgroundColor: BG } },
  };
  if (p.img && /^https:\/\//i.test(String(p.img))) {
    bubble.hero = {
      type: "image",
      url: String(p.img),
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    };
  }
  return { type: "flex", altText: String(p.text || "").slice(0, 380), contents: bubble };
}

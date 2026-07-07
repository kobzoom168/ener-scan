/**
 * ฮวงจุ้ยจากรูป (สายมู ecosystem, Phase 1) — armed-mode flow:
 * user taps the LIFF service row (sends "ดูฮวงจุ้ยห้อง") or types a ฮวงจุ้ย
 * keyword → mode armed for a short window → the NEXT image routes to the
 * feng-shui reader instead of the scan pipeline, then the mode clears.
 * Free while staging (teaser for the scan/consult funnel).
 */
import { analyzeFengShui } from "./fengShuiAnalyze.service.js";
import { getImageBufferFromLineMessage } from "./image.service.js";

const FENGSHUI_MODE_TTL_MS = 15 * 60 * 1000;

/** userId → armed-until epoch ms (in-memory; single-process like session.store) */
const fengShuiArmedUntil = new Map();

/** Explicit command only — short message whose gist is ฮวงจุ้ย (not mid-sentence chatter). */
export function isFengShuiCommandText(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 25) return false;
  return t.includes("ฮวงจุ้ย") || t.includes("ดูพลังบ้าน") || t.includes("ดูพลังห้อง");
}

export function armFengShuiMode(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  fengShuiArmedUntil.set(uid, Date.now() + FENGSHUI_MODE_TTL_MS);
}

export function isFengShuiModeArmed(userId) {
  const uid = String(userId || "").trim();
  const until = fengShuiArmedUntil.get(uid);
  if (!until) return false;
  if (Date.now() > until) {
    fengShuiArmedUntil.delete(uid);
    return false;
  }
  return true;
}

export function clearFengShuiMode(userId) {
  fengShuiArmedUntil.delete(String(userId || "").trim());
}

export const FENGSHUI_INTRO_TEXT =
  "🏠 ได้เลยครับ อาจารย์ดูพลังพื้นที่ให้\n" +
  "📷 ถ่ายรูปห้องหรือมุมที่อยากให้ดู ส่งมาได้เลย\n" +
  "✨ ถ่ายมุมกว้าง แสงสว่างหน่อย จะอ่านได้ชัดครับ";

export const FENGSHUI_FAIL_TEXT =
  "ขอโทษทีครับ รอบนี้อาจารย์อ่านรูปไม่สำเร็จ\n📷 ลองส่งรูปเดิมมาอีกครั้งได้เลยครับ";

/**
 * Download the LINE image and produce the Thai feng-shui reading.
 * @param {{ client: any, messageId: string }} p
 * @returns {Promise<string>} reading text (throws on failure)
 */
export async function runFengShuiReadingFromLineImage({ client, messageId }) {
  const buffer = await getImageBufferFromLineMessage(client, messageId);
  const reading = await analyzeFengShui({
    imageBase64: buffer.toString("base64"),
    mimeType: "image/jpeg",
    mode: "room",
  });
  if (!reading) throw new Error("fengshui_empty_reading");
  return reading;
}

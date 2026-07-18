/**
 * ส่งข้อความเข้า Telegram (กบ 19 ก.ค. 2026 — รายงานตรวจแชทรายวัน)
 * ใช้ bot เดียวกับ ener-ai: env TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 * ข้อความยาวตัดเป็นก้อนละ ~3900 ตัวอักษร (ลิมิต Telegram 4096) ส่งเรียงลำดับ
 */

const TELEGRAM_CHUNK_CHARS = 3900;

function readTelegramConfig() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  return token && chatId ? { token, chatId } : null;
}

export function isTelegramConfigured() {
  return readTelegramConfig() != null;
}

/**
 * ตัดข้อความยาวตามขอบบรรทัด (ไม่หั่นกลางบรรทัดถ้าเลี่ยงได้)
 * @param {string} text
 * @returns {string[]}
 */
export function chunkTelegramText(text) {
  const s = String(text || "").trim();
  if (!s) return [];
  if (s.length <= TELEGRAM_CHUNK_CHARS) return [s];
  const chunks = [];
  let buf = "";
  for (const line of s.split("\n")) {
    const candidate = buf ? `${buf}\n${line}` : line;
    if (candidate.length > TELEGRAM_CHUNK_CHARS && buf) {
      chunks.push(buf);
      buf = line;
    } else if (candidate.length > TELEGRAM_CHUNK_CHARS) {
      // บรรทัดเดียวยาวเกินก้อน — หั่นดิบ
      for (let i = 0; i < line.length; i += TELEGRAM_CHUNK_CHARS) {
        chunks.push(line.slice(i, i + TELEGRAM_CHUNK_CHARS));
      }
      buf = "";
    } else {
      buf = candidate;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

/**
 * @param {string} text plain text (ไม่ใช้ markdown — กัน escape พังกับข้อความลูกค้า)
 * @returns {Promise<{ ok: boolean, reason?: string, parts?: number }>}
 */
export async function sendTelegramText(text) {
  const cfg = readTelegramConfig();
  if (!cfg) return { ok: false, reason: "not_configured" };
  const parts = chunkTelegramText(text);
  if (!parts.length) return { ok: false, reason: "empty" };

  for (let i = 0; i < parts.length; i++) {
    const res = await fetch(
      `https://api.telegram.org/bot${cfg.token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text: parts[i],
          disable_web_page_preview: true,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(
        JSON.stringify({
          event: "TELEGRAM_SEND_FAILED",
          part: i + 1,
          of: parts.length,
          status: res.status,
          body: body.slice(0, 200),
        }),
      );
      return { ok: false, reason: `http_${res.status}`, parts: i };
    }
  }
  console.log(
    JSON.stringify({ event: "TELEGRAM_SEND_OK", parts: parts.length }),
  );
  return { ok: true, parts: parts.length };
}

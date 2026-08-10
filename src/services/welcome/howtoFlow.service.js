/**
 * การ์ดกติกา/ขั้นตอนตอน add เพื่อนใหม่ (กบ 8 ส.ค. 2026): รูป Flow 5 ขั้น
 * (ส่งรูป → แอดมินรับ+ขอรายละเอียด → ส่งให้อาจารย์ → อาจารย์อ่าน 1-3 นาที → รับผล+เสียง)
 * + ปุ่ม "เข้าใจแล้ว" — แบบนุ่ม: ไม่ล็อกการสแกน (ส่งรูปมาเลยก็ถือว่าเข้าใจโดยพฤติกรรม)
 * บันทึก ack ไว้เป็นหลักฐานว่ารับทราบกติกา
 */
import { tryDedupeOnce } from "../../redis/scanV2Redis.js";

const HOWTO_URL = () =>
  String(
    process.env.HOWTO_FLOW_IMAGE_URL ||
      "https://pub-66a3e24b05f44d809106818ceb606936.r2.dev/brand/flow-howto-v3.png",
  ).trim();

export function buildHowtoFlowFlex() {
  return {
    type: "flex",
    altText: "ขั้นตอนให้อาจารย์อ่านพลัง ง่าย ๆ 5 ขั้นครับ",
    contents: {
      type: "bubble",
      size: "mega",
      hero: {
        type: "image",
        url: HOWTO_URL(),
        size: "full",
        aspectRatio: "1024:1560",
        aspectMode: "fit",
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0c241a",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#B8871B",
            height: "sm",
            action: { type: "message", label: "เข้าใจแล้ว เริ่มเลย", text: "เข้าใจแล้ว" },
          },
        ],
      },
    },
  };
}

/** ปุ่ม "เข้าใจแล้ว" — คืน true = จัดการแล้ว */
export async function maybeHandleHowtoAck({ client, event, userId, text }) {
  if (String(text || "").trim() !== "เข้าใจแล้ว") return false;
  try {
    await tryDedupeOnce(`howto:ack:${userId}`, 366 * 86400);
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "เยี่ยมครับ ส่งรูปชิ้นแรกมาได้เลย ฟรีวันละ 1 ชิ้นครับ 🙏",
    });
    console.log(JSON.stringify({ event: "HOWTO_ACK", lineUserIdPrefix: String(userId).slice(0, 8) }));
  } catch {
    /* ignore */
  }
  return true;
}

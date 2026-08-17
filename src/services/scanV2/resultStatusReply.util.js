/**
 * คำตอบคำถาม "ผลออกยัง" จากสถานะ scan job จริง — pure (Codex 17 ส.ค. รอบ 2):
 * exhaustive switch ทุกสถานะ · unknown ห้าม claim ว่าผลออก · ไม่มีคำสัญญาเวลา
 * ("ใกล้เสร็จ"/"ไม่เกิน 1 นาที" — คิว/LINE อาจช้ากว่านั้น) · delivered ใช้เฉพาะ
 * report token ที่ผูกกับ job นั้น (ห้ามลิงก์ล่าสุดของ user — อาจเป็นรายงานเก่า)
 *
 * @param {{ status: string, jobReportToken?: string | null, baseUrl?: string }} p
 * @returns {{ reply: string, claimsDelivered: boolean }}
 */
export function resolveResultStatusReply({ status, jobReportToken = null, baseUrl = "" }) {
  const st = String(status || "").trim();
  const base = String(baseUrl || "").replace(/\/+$/, "");

  if (st === "queued" || st === "processing" || st === "claimed") {
    return {
      reply: "รูปอยู่ในคิวอาจารย์แล้วครับ กำลังอ่านอยู่ เสร็จเมื่อไหร่ผลจะเด้งเข้าแชทนี้เลยครับ",
      claimsDelivered: false,
    };
  }
  if (st === "delivery_queued") {
    return {
      reply: "อาจารย์อ่านเสร็จแล้วครับ ระบบกำลังส่งผลเข้าแชทนี้ ถ้าสักพักยังไม่เข้า ทักมาได้เลยครับ",
      claimsDelivered: false,
    };
  }
  if (st === "delivered" || st === "completed") {
    return {
      reply: jobReportToken
        ? `ผลออกแล้วครับ เปิดดูรายงานเต็มได้ที่นี่เลย\n${base}/r/${jobReportToken}`
        : "ผลส่งเข้าแชทนี้แล้วครับ เลื่อนดูการ์ดผลด้านบน หรือกดเมนู ดูผลเก่า ก็ได้ครับ",
      claimsDelivered: true,
    };
  }
  if (st === "failed") {
    return {
      reply:
        "รอบที่แล้วระบบอ่านสะดุดครับ ขออภัยด้วย\n\nรบกวนส่งรูปเดิมมาใหม่อีกครั้ง เดี๋ยวผมส่งให้อาจารย์ดูทันทีครับ",
      claimsDelivered: false,
    };
  }
  if (st === "cancelled") {
    return {
      reply: "รอบที่แล้วถูกยกเลิกไปครับ ส่งรูปมาใหม่ได้เลย เดี๋ยวผมส่งให้อาจารย์ดูครับ",
      claimsDelivered: false,
    };
  }
  // สถานะไม่รู้จัก — ห้ามบอกว่าผลออกแล้ว (Codex: unknown ต้องไม่ถูกถือว่าสำเร็จ)
  return {
    reply:
      "ขอเช็คสถานะรอบล่าสุดให้ก่อนครับ ถ้าผลยังไม่เข้าแชทนี้ รบกวนส่งรูปมาใหม่ได้เลย เดี๋ยวผมส่งให้อาจารย์ดูครับ",
    claimsDelivered: false,
  };
}

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
      reply: "อาจารย์อ่านเสร็จแล้วครับ ผมกำลังส่งผลเข้าแชทนี้ ถ้าสักพักยังไม่เข้า ทักมาได้เลยครับ",
      claimsDelivered: false,
    };
  }
  if (st === "completed") {
    // Codex รอบ 3: dedup path ตั้ง completed ก่อน outbound ถูกส่ง — ห้าม claim ว่าส่งแล้ว
    return {
      reply: "อาจารย์อ่านเสร็จแล้วครับ ผมกำลังเตรียมส่งผลเข้าแชทนี้ ถ้าสักพักยังไม่เข้า ทักมาได้เลยครับ",
      claimsDelivered: false,
    };
  }
  if (st === "delivered") {
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
        "รอบที่แล้วรูปนี้อ่านไม่สำเร็จครับ ขออภัยด้วย\n\nรบกวนส่งรูปเดิมมาใหม่อีกครั้ง เดี๋ยวผมส่งให้อาจารย์ดูทันทีครับ",
      claimsDelivered: false,
    };
  }
  if (st === "cancelled") {
    return {
      reply: "รอบที่แล้วถูกยกเลิกไปครับ ส่งรูปมาใหม่ได้เลย เดี๋ยวผมส่งให้อาจารย์ดูครับ",
      claimsDelivered: false,
    };
  }
  // สถานะไม่รู้จัก — ห้าม claim ว่าผลออก ห้ามชวนส่งซ้ำ และห้ามสัญญา follow-up
  // ที่ไม่มี owner จริง (Codex รอบ 4: "จะแจ้งในแชทนี้" ไม่มี worker/คนตามให้จริง)
  return {
    reply:
      "สถานะรอบล่าสุดยังตรวจไม่ครบครับ ตอนนี้ยังไม่ต้องส่งรูปซ้ำ ลองเช็กสถานะอีกครั้งในอีกสักครู่ได้เลยครับ",
    claimsDelivered: false,
  };
}

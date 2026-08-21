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
      reply: "อยู่ในคิว กำลังอ่าน",
      claimsDelivered: false,
    };
  }
  if (st === "delivery_queued") {
    return {
      reply: "อ่านเสร็จแล้ว กำลังส่งผล",
      claimsDelivered: false,
    };
  }
  if (st === "completed") {
    // Codex รอบ 3: dedup path ตั้ง completed ก่อน outbound ถูกส่ง — ห้าม claim ว่าส่งแล้ว
    return {
      reply: "อ่านเสร็จแล้ว กำลังเตรียมส่งผล",
      claimsDelivered: false,
    };
  }
  if (st === "delivered") {
    return {
      reply: jobReportToken
        ? `ผลออกแล้ว\n${base}/r/${jobReportToken}`
        : "ผลส่งแล้ว เลื่อนดูการ์ดด้านบน",
      claimsDelivered: true,
    };
  }
  if (st === "failed") {
    return {
      reply:
        "รอบที่แล้วอ่านไม่สำเร็จ ส่งรูปเดิมมาใหม่",
      claimsDelivered: false,
    };
  }
  if (st === "cancelled") {
    return {
      reply: "รอบที่แล้วถูกยกเลิก ส่งรูปใหม่ได้",
      claimsDelivered: false,
    };
  }
  // สถานะไม่รู้จัก — ห้าม claim ว่าผลออก ห้ามชวนส่งซ้ำ และห้ามสัญญา follow-up
  // ที่ไม่มี owner จริง (Codex รอบ 4: "จะแจ้งในแชทนี้" ไม่มี worker/คนตามให้จริง)
  return {
    reply:
      "ยังตรวจสถานะไม่ครบ ไม่ต้องส่งรูปซ้ำ",
    claimsDelivered: false,
  };
}

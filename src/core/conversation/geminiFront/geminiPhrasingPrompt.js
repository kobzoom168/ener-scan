export const GEMINI_PHRASING_SYSTEM = `คุณคือแอดมินของ Ener Scan ในแชท LINE (ผู้ชาย เรียกตัวเองว่า ผม)
Persona 2 ชั้น: แอดมิน (คุณ) รับเรื่อง ค่าครู สิทธิ์ สลิป วิธีใช้ · อาจารย์ เป็นคนอ่านพลังเท่านั้น
คุณไม่ใช่อาจารย์ ห้ามตีความพลัง ทำนาย หรืออ่านคลื่นเอง

โทนบังคับ (กบ 21 ส.ค. 2026 — กติกาเดียว ไม่มีข้อยกเว้น):
- ห้ามใช้คำว่า ครับ ค่ะ นะ จ้า ในทุกข้อความ
- ตอบแข็ง ตรง สั้น ถามอะไรตอบสิ่งนั้น ถ้าคำเดียวพอ ให้ตอบคำเดียว
- ห้ามขอบคุณกลับ ห้ามสาธุกลับ ห้ามชม ห้ามปลอบ ห้ามอวย ห้ามให้กำลังใจ
- ห้ามแนะนำเพิ่มถ้าลูกค้าไม่ได้ถาม ห้ามชวนคุยต่อ ห้ามปิดท้ายด้วยคำชวน
- ห้ามถามกลับ เว้นแต่ขาดข้อมูลที่จำเป็นต่อขั้นตอนถัดไปจริง ๆ
- ลูกค้าพิมพ์วนเรื่องที่ยืนยันไปแล้ว = ไม่ต้องตอบซ้ำ ตอบสั้นที่สุดหรือไม่ตอบ
- ห้ามอีโมจิ ห้ามเครื่องหมายขีดคั่น (— – หรือ - ) ห้ามเครื่องหมายคำพูดครอบคำ
- ห้ามพูดคำว่า AI บอท โปรแกรม ระบบ เกี่ยวกับตัวเองหรือบริการ
- ห้ามสำนวนคอลเซ็นเตอร์ (ขออภัยในความไม่สะดวก ยินดีให้บริการ รับทราบ เข้าใจแล้ว)
- ห้ามเล่นมุก ห้าม 555 ห้ามแซวลูกค้า

ความยาว:
- ตอบทั่วไป 1 ประโยค ไม่เกิน 40 ตัวอักษร บรรทัดเดียว
- ถ้ามีขั้นตอนที่ลูกค้าต้องทำ ไม่เกิน 2 บรรทัด และบอกขั้นตอนเดียว
- ห้ามหัวข้อ ห้าม bullet ห้ามเมนู ห้ามรายการตัวเลือก

ข้อเท็จจริง:
- พูดได้เฉพาะสิ่งที่อยู่ใน allowedFacts เท่านั้น
- ห้ามแต่งราคา จำนวนสิทธิ์ สถานะการจ่าย คะแนน เปอร์เซ็นต์ ชื่อวัด รุ่น ปี เนื้อวัสดุ
- ไม่มีข้อมูลยืนยัน ให้ตอบว่า ยังไม่มีข้อมูลยืนยัน จึงระบุไม่ได้

เงิน:
- เรื่องเงินเป็นหน้าที่คุณ (อาจารย์ไม่พูดเรื่องเงิน) ใช้ตัวเลขจาก allowedFacts เท่านั้น
- ตัวอย่างรูปแบบ: ค่าครู 49 บาท โอนแล้วแนบสลิปในแชตนี้
- ห้ามเชียร์ขาย ห้ามถามว่าสนใจไหม ห้ามเสนอแพ็กถ้าลูกค้าไม่ได้ถาม
- ยกเว้นเดียว: อยู่ในสถานะ paywall แล้วเท่านั้น จึงบอกราคาและขั้นตอนจ่ายได้ตรง ๆ

ห้ามพิมพ์ซ้ำคำเดิมกับ recent_bot_replies ถ้าสถานการณ์เดิมซ้ำ ให้พูดสั้นลงกว่าเดิม
ตอบเฉพาะข้อความที่จะส่งให้ลูกค้าเท่านั้น ห้ามอธิบายเหตุผล`;


/**
 * @param {{
 *   allowedFacts: Record<string, unknown>,
 *   nextStep: string,
 *   replyStyle: string,
 *   userText: string,
 *   conversationHistory?: { role: string, text: string }[],
 * }} p
 */
export function buildPhrasingUserPrompt(p) {
  const truth =
    p.allowedFacts &&
    typeof p.allowedFacts === "object" &&
    p.allowedFacts.server_context &&
    typeof p.allowedFacts.server_context === "object" &&
    "truth" in p.allowedFacts.server_context
      ? p.allowedFacts.server_context.truth
      : null;
  const noProgressStreak =
    truth &&
    typeof truth === "object" &&
    truth !== null &&
    "no_progress_streak" in truth &&
    Number.isFinite(Number(truth.no_progress_streak))
      ? Math.max(0, Math.floor(Number(truth.no_progress_streak)))
      : 0;

  const recentBotReplies = Array.isArray(p.conversationHistory)
    ? p.conversationHistory
        .filter((m) => m && m.role === "bot" && String(m.text || "").trim())
        .map((m) => String(m.text).trim().slice(0, 200))
        .slice(-4)
    : [];

  return [
    "Compose the reply using:",
    JSON.stringify(
      {
        allowedFacts: p.allowedFacts,
        nextStep: p.nextStep,
        reply_style: p.replyStyle,
        no_progress_streak: noProgressStreak,
        recent_bot_replies: recentBotReplies,
        user_text: String(p.userText || "").slice(0, 400),
      },
      null,
      0,
    ),
  ].join("\n");
}

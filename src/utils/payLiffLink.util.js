/**
 * ลิงก์เข้า LIFF หน้าเลือกแพ็กจ่ายโดยตรง (?view=pay เปิด picker ทันทีหลัง init)
 * คืน "" เมื่อยังไม่ผูก LIFF_ID (เช่น prod ก่อนสร้าง LIFF app) — ผู้เรียกต้องข้ามบรรทัด/ปุ่มนั้นเอง
 */
export function getPayLiffUrl() {
  const liffId = String(process.env.LIFF_ID || "").trim();
  return liffId ? `https://liff.line.me/${liffId}?view=pay` : "";
}

/**
 * บรรทัดชวนกดเข้าหน้าจ่าย — ปิดถาวรตามกบ (12 ก.ค.): จ่ายในแชทจบในจอเดียว
 * (LIFF ต้องแคป QR สลับแอป ถ้าเผลอปิดก่อนอัพสลิปหาทางกลับยาก)
 * หน้า LIFF ?view=pay ยังใช้ได้สำหรับคนที่เข้าเอง แค่ไม่ยัดลิงก์ในแชท
 */
export function buildPayLiffLine() {
  return "";
}

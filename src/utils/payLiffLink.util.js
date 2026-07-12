/**
 * ลิงก์เข้า LIFF หน้าเลือกแพ็กจ่ายโดยตรง (?view=pay เปิด picker ทันทีหลัง init)
 * คืน "" เมื่อยังไม่ผูก LIFF_ID (เช่น prod ก่อนสร้าง LIFF app) — ผู้เรียกต้องข้ามบรรทัด/ปุ่มนั้นเอง
 */
export function getPayLiffUrl() {
  const liffId = String(process.env.LIFF_ID || "").trim();
  return liffId ? `https://liff.line.me/${liffId}?view=pay` : "";
}

/** บรรทัดชวนกดเข้าหน้าจ่าย ("" เมื่อไม่มี LIFF) — ใช้ต่อท้ายข้อความ paywall/QR */
export function buildPayLiffLine() {
  const url = getPayLiffUrl();
  return url ? `หรือแตะเปิดหน้าจ่ายได้เลย 👉 ${url}` : "";
}

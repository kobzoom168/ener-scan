/**
 * บล็อก "คลังของฉัน" สำหรับผู้ชมที่ยังพิสูจน์ความเป็นเจ้าของไม่ได้ (Codex 26 ก.ย. 2026)
 *
 * กติกา: เจ้าของดูของเดิมครบทุกโหมดโดยไม่ต้องจ่าย · แต่ลิงก์แชร์ไม่ใช่ owner proof
 * → guest เห็นเฉพาะรายงานที่แชร์ ไม่มีข้อมูลคลังในหน้า และได้ทาง "ยืนยันผ่าน LINE"
 *   (LIFF ยืนยันตัวตน → cookie เจ้าของ → กลับมาหน้าคลัง) — ห้ามพาไปหน้าจ่ายเงิน
 * ไม่มีข้อมูลคลังใด ๆ ถูกส่งมาใน HTML สำหรับ guest (ไม่ใช่การเบลอด้วย CSS)
 */
export function ownerVaultCtaHtml({ ownerVerifyUrl, laneWordTh = "คลัง", cssPrefix = "ovc" } = {}) {
  const href = String(ownerVerifyUrl || "").trim();
  if (!href) return "";
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return `
    <section class="${cssPrefix}" aria-labelledby="${cssPrefix}-h" data-owner-vault-cta="1">
      <style>
        .${cssPrefix}{margin:1rem 0;padding:1rem 1.1rem;border:1px solid rgba(201,162,77,.45);border-radius:16px;background:rgba(201,162,77,.07)}
        .${cssPrefix} h2{margin:0 0 .35rem;font-size:1.05rem}
        .${cssPrefix} p{margin:0 0 .7rem;font-size:.86rem;line-height:1.5;opacity:.85}
        .${cssPrefix}-btn{display:block;text-align:center;text-decoration:none;font-weight:800;padding:.7rem 1rem;border-radius:999px;background:linear-gradient(135deg,#d4af37,#b8871b);color:#1a1408}
      </style>
      <h2 id="${cssPrefix}-h">${esc(laneWordTh)}ของฉัน</h2>
      <p>รายงานนี้เปิดจากลิงก์ที่แชร์ได้ ถ้าคุณเป็นเจ้าของ ยืนยันผ่าน LINE เพื่อเปิด${esc(laneWordTh)}และอันดับทั้งหมดของคุณ — ไม่ต้องซื้อแพ็ก</p>
      <a class="${cssPrefix}-btn" href="${esc(href)}" rel="nofollow">เปิด${esc(laneWordTh)}ของฉัน · ยืนยันผ่าน LINE</a>
    </section>`;
}

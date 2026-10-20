/**
 * ผลลัพธ์งาน "แจ้งลูกค้าหลังไม่อนุมัติ" ให้ Telegram / Admin / sweep ตัดสินใจด้วยเกณฑ์เดียวกัน (Codex รอบ 4, 20 ต.ค. 2026)
 *  - ล้าง reject_notify_pending (mark queued) ได้เฉพาะเมื่อ: มีแถว outbound จริง และ (แถวยังมีชีวิต/ส่งแล้ว หรือ แถวค้าง failed/dead แต่ **ส่งต่อให้แอดมินสำเร็จ/เข้าคิวถาวรแล้ว**)
 *  - แถวค้าง + แจ้งแอดมินสูญหาย (lost) → คง pending ให้ sweep ลองแจ้งแอดมินใหม่ (ไม่สร้างข้อความลูกค้าใหม่ ไม่ requeue DLQ)
 *  - ไม่มีโมดูลภายนอก (ใช้ในเทสต์ได้ตรง ๆ)
 */

/** แปลงผล sendAdminAlert → "sent" | "queued" | "lost" (deduped = เคยส่ง/เข้าคิวแล้วในหน้าต่าง dedupe = ถือว่าส่งต่องานแล้ว) */
export function adminAlertStateFromResult(r) {
  if (!r || typeof r !== "object") return "lost";
  if (r.ok === true) return "sent";
  if (r.skipped === "deduped") return "sent";
  if (r.queued === true) return "queued";
  return "lost";
}

export const REJECT_NOTIFY_STATES = Object.freeze([
  "unconfirmed",        // ไม่มีแถว outbound ที่ยืนยันได้ (enqueue คืนไม่มี id) → ห้าม mark
  "queued",             // สร้างแถวใหม่เข้าคิวแล้ว
  "deduped_live",       // มีแถวเดิมอยู่ในคิว/ส่งแล้ว (queued/sending/retry_wait/sent) ไม่สร้างซ้ำ
  "stuck_alert_sent",   // แถวเดิม failed/dead · แจ้งแอดมินสำเร็จ → หยุดวนได้
  "stuck_alert_queued", // แถวเดิม failed/dead · เข้าคิวแจ้งแอดมินถาวรแล้ว → หยุดวนได้
  "stuck_alert_lost",   // แถวเดิม failed/dead · แจ้งแอดมินไม่สำเร็จ → คง pending (retry เฉพาะการแจ้งแอดมิน)
]);

/**
 * @param {{ id?: string|null, status?: string, deduped?: boolean, stuck?: boolean, adminAlert?: string }|null|undefined} r ผลจาก enqueueRejectNotify
 * @returns {{ state: string, markable: boolean, customerQueued: boolean, adminAlert: string|null, outboundStatus: string|null }}
 */
export function rejectNotifyOutcome(r) {
  const outboundStatus = r?.status ? String(r.status) : null;
  if (!r?.id) return { state: "unconfirmed", markable: false, customerQueued: false, adminAlert: null, outboundStatus };
  if (!r.stuck) return { state: r.deduped ? "deduped_live" : "queued", markable: true, customerQueued: true, adminAlert: null, outboundStatus };
  const adminAlert = ["sent", "queued", "lost"].includes(String(r.adminAlert)) ? String(r.adminAlert) : "lost";
  return { state: `stuck_alert_${adminAlert}`, markable: adminAlert !== "lost", customerQueued: false, adminAlert, outboundStatus };
}

/** ข้อความสำหรับผู้กด (Telegram/Admin log) — แยก "ลูกค้าเข้าคิว / ข้อความลูกค้าค้าง / แจ้งแอดมินสำเร็จ / เข้าคิวแจ้งแอดมิน / แจ้งแอดมินไม่สำเร็จ" ชัดเจน */
export function rejectNotifyOperatorText(outcome, { already = false } = {}) {
  const o = outcome || { state: "unconfirmed" };
  const stuckHead = `ข้อความแจ้งลูกค้าค้าง (outbound ${o.outboundStatus || "failed/dead"} ก่อนหน้า) ระบบไม่สร้างซ้ำ`;
  switch (o.state) {
    case "queued": return already ? "รายการนี้ถูกปฏิเสธไปแล้วก่อนหน้านี้ — เข้าคิวแจ้งลูกค้าที่ค้างอยู่ให้แล้ว (ยังไม่ยืนยันว่าส่งถึง)" : "เข้าคิวแจ้งลูกค้าทาง LINE แล้ว (ยังไม่ยืนยันว่าส่งถึง)";
    case "deduped_live": return already ? `รายการนี้ถูกปฏิเสธไปแล้วก่อนหน้านี้ — ข้อความแจ้งลูกค้ามีในคิว/ส่งแล้วอยู่ก่อน (${o.outboundStatus || "-"}) ไม่สร้างซ้ำ` : `ข้อความแจ้งลูกค้ามีในคิว/ส่งแล้วอยู่ก่อน (${o.outboundStatus || "-"}) ไม่สร้างซ้ำ`;
    case "stuck_alert_sent": return `${already ? "รายการนี้ถูกปฏิเสธไปแล้วก่อนหน้านี้ — " : ""}${stuckHead} — แจ้งแอดมินสำเร็จแล้ว ให้คนตรวจที่หน้า Admin/DLQ`;
    case "stuck_alert_queued": return `${already ? "รายการนี้ถูกปฏิเสธไปแล้วก่อนหน้านี้ — " : ""}${stuckHead} — เข้าคิวแจ้งแอดมินแล้ว (ยังไม่ยืนยันว่าแอดมินได้รับ)`;
    case "stuck_alert_lost": return `${already ? "รายการนี้ถูกปฏิเสธไปแล้วก่อนหน้านี้ — " : ""}${stuckHead} — แจ้งแอดมินไม่สำเร็จ ระบบจะลองแจ้งแอดมินใหม่เอง (ไม่สร้างข้อความลูกค้าใหม่ ไม่กระทบสถานะรายการ)`;
    default: return already ? "รายการนี้ถูกปฏิเสธไปแล้วก่อนหน้านี้ — เข้าคิวแจ้งลูกค้าที่ค้างไม่สำเร็จ ระบบจะลองเข้าคิวใหม่เอง" : "เข้าคิวแจ้งลูกค้าไม่สำเร็จ — ระบบจะลองเข้าคิวใหม่เองภายในไม่กี่นาที (ไม่กระทบสถานะรายการ)";
  }
}

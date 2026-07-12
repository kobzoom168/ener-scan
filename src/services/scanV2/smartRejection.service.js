/**
 * Smart rejection — ข้อความปัดรูปที่ "รู้เรื่องราว" แทนประโยคสำเร็จรูป 2 แบบสลับวน
 * (บทเรียน 12 ก.ค.: ลูกค้าโดนปัด 8-9 รอบด้วยประโยคเดิมจนหัวเสีย "พอแล้ว...เออ")
 *
 * บันไดตามจำนวนครั้งที่โดนปัดใน 2 ชม.ล่าสุด (redis counter):
 *   ครั้ง 1-2  → LLM แต่งคำแนะนำเฉพาะเหตุ (แสง/เบลอ/หลายชิ้น) โทนอาจารย์
 *   ครั้ง 3-4  → เปลี่ยนวิธีแนะนำ (วางพื้นเรียบ/แตะโฟกัส/ถอยกล้อง) + ให้กำลังใจ
 *   ครั้ง ≥5   → หยุดวน: อาจารย์รับไปดูเอง + แจ้งเตือนกบทาง LINE (admin escalation)
 *
 * Fail-open ทุกจุด: LLM พัง/ช้า → ใช้ข้อความสำเร็จรูปเดิม
 */
import { env } from "../../config/env.js";
import { openai, withOpenAi429RetryOnce } from "../openaiDeepScan.api.js";
import { incrementCounterWithTtl, clearDedupeKey } from "../../redis/scanV2Redis.js";
import { openaiAuxBreaker } from "../../utils/circuitBreaker.util.js";

const REJECT_COUNT_TTL_SEC = 7200;

/** นับครั้งที่โดนปัด (รวมทุกเหตุผล) — คืนลำดับครั้งปัจจุบัน */
export async function bumpRejectionCount(lineUserId) {
  try {
    return await incrementCounterWithTtl(
      `scan_v2:reject_streak:${String(lineUserId).trim()}`,
      REJECT_COUNT_TTL_SEC,
    );
  } catch {
    return 1;
  }
}

/** สแกนสำเร็จ = ล้างสตรีค (คนละเหตุการณ์แล้ว) */
export function clearRejectionCount(lineUserId) {
  clearDedupeKey(`scan_v2:reject_streak:${String(lineUserId).trim()}`).catch(() => {});
}

/** ครั้งที่ ≥5: อาจารย์รับไปดูเอง + เตือนกบ (LINE push หา ADMIN_LINE_USER_ID) */
export const ESCALATION_TEXT =
  "เอางี้ อาจารย์ขอรับรูปชุดนี้ไปเพ่งเองแบบละเอียดเลย ไม่ต้องถ่ายใหม่แล้ว\nรอสักครู่ใหญ่ ๆ เดี๋ยวอาจารย์ตามผลมาบอกเอง";

/**
 * แจ้งกบว่าลูกค้าติดหล่ม (best-effort)
 * @param {*} client LINE client
 */
export async function notifyAdminRejectionStreak(client, lineUserId, attempt, reason) {
  try {
    const adminId = String(process.env.ADMIN_LINE_USER_ID || "").trim();
    if (!adminId || !client) return;
    await client.pushMessage(adminId, {
      type: "text",
      text: `⚠️ ลูกค้า ${String(lineUserId).slice(0, 10)}… รูปโดนปัด ${attempt} ครั้งติด (${String(reason).slice(0, 40)})\nอาจารย์บอกเขาว่าจะรับไปดูเอง — เข้าไปช่วยเช็คใน OA หน่อย`,
    });
  } catch {
    /* best-effort */
  }
}

const REASON_HINTS = {
  unclear: "ภาพมืด/เบลอ/ไกลเกิน ระบบมองวัตถุไม่ชัด",
  inconclusive: "ระบบอ่านภาพไม่ออกชัดเจน (สัญญาณก้ำกึ่ง)",
  multiple: "ในภาพมีวัตถุหลายชิ้นปนกัน",
  unsupported: "วัตถุในภาพไม่ใช่ประเภทที่รับดู (พระ/เครื่องราง/หิน/กำไล)",
};

/**
 * แต่งข้อความปัดรูปด้วย LLM ที่รู้บริบท — คืน null เมื่อทำไม่ได้ (ผู้เรียกใช้ fallback เดิม)
 * @param {{ reasonKind: string, attempt: number, gateMeta?: object | null }} p
 * @returns {Promise<string | null>}
 */
export async function generateSmartRejectionText(p) {
  if (!env.SMART_REJECTION_ENABLED) return null;
  if (!openaiAuxBreaker.allow()) return null; // quota ตึง → อย่าเพิ่มภาระ ใช้ fallback เดิม
  const attempt = Math.max(1, Number(p.attempt) || 1);
  const hint = REASON_HINTS[String(p.reasonKind)] || String(p.reasonKind || "อ่านภาพไม่ผ่าน");
  const escalatePhase = attempt >= 3;
  try {
    const shape =
      typeof p.gateMeta?.shapeHint === "string" && p.gateMeta.shapeHint !== "unknown"
        ? `ระบบพอเห็นทรงวัตถุ: ${p.gateMeta.shapeHint}. `
        : "";
    const prompt = [
      "คุณคือ 'อาจารย์' ผู้อ่านพลังพระเครื่องในแชท LINE กำลังบอกลูกค้าว่ารูปที่เพิ่งส่งมายังอ่านไม่ได้",
      `สาเหตุจากระบบ: ${hint}. ${shape}นี่คือครั้งที่ ${attempt} ที่รูปของลูกค้าคนนี้ไม่ผ่านติดต่อกัน`,
      escalatePhase
        ? "ลูกค้าเริ่มเหนื่อยแล้ว: ห้ามพูดซ้ำแนวเดิม ให้เปลี่ยนวิธีช่วยแบบเจาะจง (เช่น วางบนกระดาษขาว ถอยกล้องออกนิด แตะจอให้โฟกัสที่องค์ก่อนถ่าย ปิดแฟลช) และให้กำลังใจสั้น ๆ ว่าใกล้ได้แล้ว"
        : "แนะนำวิธีถ่ายใหม่แบบเจาะจงกับสาเหตุ สั้น กระชับ",
      "กติกาการพูด: โทนอาจารย์ใจดีมีบารมี ภาษาพูด ไม่ทางการ ไม่ขอโทษ ไม่ใช้คำว่า ระบบ/AI/บอท ห้ามใช้คำวัยรุ่นอย่าง สู้ๆ/เย้/ไฟต์โตะ (อาจารย์ให้กำลังใจแบบผู้ใหญ่ เช่น ใกล้ได้แล้ว อีกนิดเดียว)",
      "ห้ามเกิน 3 บรรทัด ไม่ใส่อีโมจิ ไม่มีเครื่องหมายคำพูด ตอบเฉพาะข้อความที่จะส่งให้ลูกค้าเท่านั้น",
    ].join("\n");
    const res = await Promise.race([
      withOpenAi429RetryOnce(() =>
        openai.responses.create({
          model: env.SMART_REJECTION_MODEL,
          temperature: 0.7,
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        }),
      ),
      new Promise((_, rej) => setTimeout(() => rej(new Error("smart_reject_timeout")), 6000)),
    ]);
    const text = String(res?.output_text || "").trim().replace(/^["']|["']$/g, "");
    if (!text || text.length < 15 || text.length > 500) return null;
    if (/\b(AI|bot)\b|บอท|ระบบอัตโนมัติ|ขอโทษ|ขออภัย/i.test(text)) return null; // กันหลุดบท
    console.log(
      JSON.stringify({
        event: "SMART_REJECTION_TEXT",
        attempt,
        reasonKind: String(p.reasonKind),
        chars: text.length,
      }),
    );
    return text;
  } catch (e) {
    const msg = String(e?.message || e);
    if (/429|rate|timeout/i.test(msg)) openaiAuxBreaker.recordFailure(`smart_reject:${msg.slice(0, 40)}`);
    return null;
  }
}

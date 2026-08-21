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
  "รับรูปชุดนี้ไว้อ่านแล้ว ไม่ต้องถ่ายใหม่";

/**
 * แจ้งกบว่าลูกค้าติดหล่ม (best-effort)
 * @param {*} client LINE client
 */
export async function notifyAdminRejectionStreak(client, lineUserId, attempt, reason) {
  try {
    const adminId = String(process.env.ADMIN_LINE_USER_ID || "").trim();
    if (!adminId || !client) return;
    await client.pushMessage(adminId, { /* tone-exempt: admin_telegram */
      type: "text",
      text: `⚠️ ลูกค้า ${String(lineUserId).slice(0, 10)}… รูปโดนปัด ${attempt} ครั้งติด (${String(reason).slice(0, 40)})\nอาจารย์บอกเขาว่าจะรับไปดูเอง — เข้าไปช่วยเช็คใน OA หน่อย`, /* tone-exempt: admin_telegram */
    });
  } catch {
    /* best-effort */
  }
}

const REASON_HINTS = {
  unclear: "ภาพมืด/เบลอ/ไกลเกิน ระบบมองวัตถุไม่ชัด",
  inconclusive: "ระบบอ่านภาพไม่ออกชัดเจน (สัญญาณก้ำกึ่ง)",
  multiple: "ในภาพมีวัตถุหลายชิ้นปนกัน",
  unsupported: "วัตถุในภาพไม่ใช่ประเภทที่รับดู (พระ/เทวรูป/รูปปั้นสายมู/เครื่องราง/หิน/กำไล)",
};

/**
 * แต่งข้อความปัดรูปด้วย LLM ที่รู้บริบท — คืน null เมื่อทำไม่ได้ (ผู้เรียกใช้ fallback เดิม)
 * @param {{ reasonKind: string, attempt: number, gateMeta?: object | null, imageDark?: boolean }} p
 * @returns {Promise<string | null>}
 */
export async function generateSmartRejectionText(p) {
  if (!env.SMART_REJECTION_ENABLED) return null;
  if (!openaiAuxBreaker.allow()) return null; // quota ตึง → อย่าเพิ่มภาระ ใช้ fallback เดิม
  {
    // P0-6: งบเรียกโมเดลที่ลูกค้าเห็นต่อเทิร์น ≤2 ใช้ร่วมกับ consult/phrasing/clarifier
    const { getCustomerAiBudget } = await import("../../core/telemetry/turnAiChain.js");
    const budget = getCustomerAiBudget(2);
    if (budget && budget.attempted >= budget.max) {
      console.log(JSON.stringify({ event: "LLM_TURN_BUDGET_EXHAUSTED", callSite: "smart_rejection" }));
      return null;
    }
    if (budget) budget.attempted += 1;
  }
  const attempt = Math.max(1, Number(p.attempt) || 1);
  // กบ 19 ก.ค. (เคสคุณปิติรูปมืด): รูปมืดจริงให้บอกเรื่องแสงตรง ๆ สั้น ๆ ก่อนเหตุอื่น
  const hint = p.imageDark
    ? "รูปมืดเกินไป มองแทบไม่เห็นตัวชิ้นงาน"
    : REASON_HINTS[String(p.reasonKind)] || String(p.reasonKind || "อ่านภาพไม่ผ่าน");
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
        ? "ลูกค้าเริ่มเหนื่อยแล้ว: ห้ามพูดซ้ำแนวเดิม ให้เปลี่ยนวิธีช่วยแบบเจาะจง (เช่น วางบนกระดาษขาว ถอยกล้องออกนิด แตะจอให้โฟกัสที่ตัววัตถุก่อนถ่าย ปิดแฟลช) และให้กำลังใจสั้น ๆ ว่าใกล้ได้แล้ว" /* tone-exempt: llm_prompt */
        : p.imageDark
          ? "บอกสั้นที่สุดว่ารูปมืดไปมองไม่เห็น ขอถ่ายใหม่ให้สว่างขึ้น เปิดไฟหรือถ่ายใกล้หน้าต่างก็ได้"
          : "แนะนำวิธีถ่ายใหม่แบบเจาะจงกับสาเหตุ สั้น กระชับ",
      "กติกาการพูด: โทนอาจารย์ใจดีมีบารมี ภาษาพูด ไม่ทางการ ไม่ขอโทษ ไม่ใช้คำว่า ระบบ/AI/บอท ห้ามใช้คำวัยรุ่นอย่าง สู้ๆ/เย้/ไฟต์โตะ (อาจารย์ให้กำลังใจแบบผู้ใหญ่ เช่น ใกล้ได้แล้ว อีกนิดเดียว) ห้ามใช้คำว่า องค์/องค์พระ ให้เรียกว่า ชิ้น หรือ ตัววัตถุ (ของอาจเป็นกำไลหรือหินก็ได้)",
      "ตอบสั้นแบบคนพิมพ์แชทจริง 1 ถึง 2 ประโยคจบ (ตัวอย่างความยาวที่ดี: ขอภาพสว่างกว่านี้หน่อย มองไม่เห็น) ไม่ใส่อีโมจิ ไม่มีเครื่องหมายคำพูด ห้ามใช้เครื่องหมายขีดคั่นประโยค (— – หรือ -) คนจริงไม่พิมพ์แบบนั้น ตอบเฉพาะข้อความที่จะส่งให้ลูกค้าเท่านั้น", /* tone-exempt: llm_prompt */
    ].join("\n");
    const res = await Promise.race([
      withOpenAi429RetryOnce(() =>
        openai.responses.create({
          user: "smartRejection",
          model: env.SMART_REJECTION_MODEL,
          temperature: 0.7,
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        }),
      ),
      new Promise((_, rej) => setTimeout(() => rej(new Error("smart_reject_timeout")), 12000)),
    ]);
    let text = String(res?.output_text || "").trim().replace(/^["']|["']$/g, "");
    // โมเดลตระกูล Claude ชอบใส่หัวข้อ/ตัวหนา markdown — ล้างออกก่อนส่งเข้า LINE
    text = text
      .replace(/^\s*(?:\*\*[^\n]*\*\*|#+[^\n]*)\s*\n/gm, "")
      .replace(/\*\*/g, "")
      .replace(/[—–]/g, " ")
      .replace(/[ \t]-[ \t]/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (!text || text.length < 15 || text.length > 500) return null;
    if (/\b(AI|bot)\b|บอท|ระบบ|ขอโทษ|ขออภัย/i.test(text)) return null; // กันหลุดบท
    // เฟส 2: ข้อความนี้ลูกค้าเห็น → ผ่าน contract กลาง · ไม่มีรายงาน = อ้างพลัง/เลข/วัดไม่ได้
    // ผิด = คืน null ให้ deterministic copy เดิมทำงาน (fail-closed ไม่ส่งของที่ถูก reject)
    {
      const { checkLlmCustomerOutput } = await import(
        "../../core/conversation/llmOutputContract.util.js"
      );
      const res = checkLlmCustomerOutput({
        text,
        userIntent: "image_rejected",
        userAskedAdvice: true, // ลูกค้าส่งรูปไม่ผ่าน = ต้องบอกวิธีถ่ายใหม่
        requiredNextAction: true,
        expectedRole: "admin",
        allowQuestion: false,
        evidence: {},
      });
      if (!res.ok) {
        console.log(
          JSON.stringify({
            event: "LLM_TONE_REJECTED",
            callSite: "smart_rejection",
            replyType: "image_rejected",
            violations: res.violations,
            evidencePresent: false,
          }),
        );
        return null;
      }
    }
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

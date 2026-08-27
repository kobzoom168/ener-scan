/**
 * Consult pre-send guard chain with ONE shared regenerate budget (flow-role rอบสอง, Codex #4/#6)
 *
 * เดิม: role retry + money retry + tone retry แยกกัน → primary + 3 regenerate ได้
 * ตอนนี้: primary 1 ครั้ง → รวมทุก guard (role / money / tone / forbidden word) → ผิด →
 * regenerate ได้ "รวมสูงสุด 1 ครั้ง" ด้วย directive รวมทุกเหตุผล → ยังผิด → deterministic
 * fallback ตาม guard ที่ผิด (ห้ามส่งของที่ reject ห้ามเงียบ) · ไม่ใช่ sanitizer ไม่แตะโทน
 *
 * pure: รับ generate/checks เป็น deps เพื่อ behavior test ได้ (assert model calls ≤ 2)
 */
import {
  evaluateMoneyGuard,
  evaluateToneGuard,
  resolveToneGuardedText,
  NEUTRAL_RECOVERY_FALLBACK,
} from "./personaRole.util.js";
import { checkAjarnVoice, ajarnRoleSafeFallback } from "./consultRoleRoute.util.js";

/** คำต้องห้ามใน customer-visible (owner 26 ส.ค.: "ระบบ") — โมเดลทวนจาก context ได้ */
export const FORBIDDEN_CUSTOMER_WORD_RE = /ระบบ/u;

/**
 * ตรวจทุก guard บนข้อความเดียว
 * @returns {{ ok: boolean, reasons: string[], role: {ok:boolean, reason:string|null}, money: {ok:boolean, reason?:string}, tone: {ok:boolean, match?:string}, forbidden: boolean }}
 */
export function evaluateConsultGuards(text, { routedRole = null, moneyCtx = {} } = {}) {
  const t = String(text || "");
  const role = routedRole === "ajarn" ? checkAjarnVoice(t) : { ok: true, reason: null };
  const money = evaluateMoneyGuard(t, moneyCtx);
  const tone = evaluateToneGuard(t);
  const forbidden = FORBIDDEN_CUSTOMER_WORD_RE.test(t);
  const reasons = [];
  if (!role.ok) reasons.push(`role:${role.reason}`);
  if (!money.ok) reasons.push(`money:${money.reason || "unknown"}`);
  if (!tone.ok) reasons.push(`tone:${tone.match || ""}`);
  if (forbidden) reasons.push("forbidden_word:ระบบ");
  return { ok: reasons.length === 0, reasons, role, money, tone, forbidden };
}

/** directive รวมทุกเหตุผล (ต่อท้าย prompt เดิม ไม่รื้อ) */
export function buildRegenerateDirective(v, { roleDirective = "" } = {}) {
  const parts = [];
  if (roleDirective) parts.push(roleDirective);
  if (!v.role.ok) {
    parts.push(
      v.role.reason === "handoff_phrase"
        ? "คำตอบก่อนหน้าผิดบท: บอกให้ส่งให้อาจารย์ทั้งที่อาจารย์คือคนตอบ — ตอบใหม่เป็นเสียงอาจารย์ล้วน"
        : "คำตอบก่อนหน้าผิดบท: พูดเป็น ผม/แอดมิน — ตอบใหม่เป็นเสียงอาจารย์ล้วน ห้ามใช้คำว่า ผม",
    );
  }
  if (!v.money.ok) {
    parts.push(
      v.money.reason === "unsolicited"
        ? "คำตอบก่อนหน้าผิดกติกาใหญ่: พูดเรื่องเงิน/ค่าครู/สิทธิ์ทั้งที่ลูกค้าไม่ได้ถาม — ตอบใหม่โดยตัดเรื่องเงิน/ค่าครู/สิทธิ์/แพ็กออกทั้งหมด"
        : "คำตอบก่อนหน้าผิดกติกาใหญ่: พูดเรื่องเงินโดยไม่ใช่เสียงแอดมิน — ส่วนเงินต้องเป็นเสียงแอดมิน (ผม) หรือตัดออก",
    );
  }
  if (!v.tone.ok) {
    parts.push(`คำตอบก่อนหน้าผิดกติกาโทน: มีคำชม/ปลอบต้องห้าม ("${v.tone.match}") — ตอบใหม่โดยไม่ใช้คำตัดสินเชิงชมและไม่ปลอบ`);
  }
  if (v.forbidden) parts.push("คำตอบก่อนหน้ามีคำว่า ระบบ — ห้ามใช้คำนี้กับลูกค้าเด็ดขาด ตอบใหม่โดยไม่มีคำนี้");
  return parts.join(" · ");
}

/**
 * @param {{
 *   generate: (directive: string|null) => Promise<string|null>,   // เรียกโมเดล (นับทุกครั้ง)
 *   postProcess?: (text: string) => Promise<string>,               // guardStaleNoImageClaim/entitlement/links (deterministic)
 *   routedRole?: "ajarn"|"admin"|null,
 *   roleDirective?: string,
 *   moneyCtx?: { userMoneyIntent?: boolean, inPaymentState?: boolean },
 *   hasReport?: boolean,
 *   maxRegenerate?: number,                                        // default 1 (รวมทุก guard)
 *   maxModelCalls?: number,                                        // P0-3: งบรวมของเทิร์นที่เหลือ (primary+regenerate ≤ นี้) · 0 = ห้ามยิงเลย
 *   log?: (event: string, data: object) => void,
 * }} p
 * @returns {Promise<{ outcome: "sent"|"defer_payment"|"empty"|"budget_exhausted", text: string|null, modelCalls: number, guardOutcome: string, reasons: string[] }>}
 */
export async function runConsultGuardChain(p) {
  const log = p.log || ((e, d) => console.warn(JSON.stringify({ event: e, ...d })));
  const post = p.postProcess || (async (t) => t);
  // งบรวม: primary 1 + regenerate ≤ maxRegenerate แต่ไม่เกิน maxModelCalls (งบเทิร์นที่เหลือจริง)
  const maxCalls = Number.isFinite(p.maxModelCalls) ? Math.max(0, Math.floor(p.maxModelCalls)) : Infinity;
  const maxRegen = Math.min(Number.isFinite(p.maxRegenerate) ? p.maxRegenerate : 1, Math.max(0, maxCalls - 1));
  if (maxCalls <= 0) {
    log("CONSULT_GUARD_BUDGET_EXHAUSTED", { maxModelCalls: maxCalls });
    return { outcome: "budget_exhausted", text: null, modelCalls: 0, guardOutcome: "budget_exhausted", reasons: [] };
  }
  let modelCalls = 0;
  const gen = async (directive) => {
    modelCalls += 1;
    const out = await p.generate(directive);
    return out ? String(out).slice(0, 1800) : null;
  };

  const primary = await gen(p.roleDirective || null);
  if (!primary) return { outcome: "empty", text: null, modelCalls, guardOutcome: "no_primary", reasons: [] };
  let text = await post(primary);
  let v = evaluateConsultGuards(text, { routedRole: p.routedRole, moneyCtx: p.moneyCtx });
  if (v.ok) return { outcome: "sent", text, modelCalls, guardOutcome: "primary_ok", reasons: [] };

  log("CONSULT_GUARD_BLOCKED", { attempt: 1, reasons: v.reasons, sample: text.slice(0, 120) });
  let regenerated = 0;
  while (!v.ok && regenerated < maxRegen) {
    regenerated += 1;
    const retry = await gen(buildRegenerateDirective(v, { roleDirective: p.roleDirective }));
    if (retry) {
      const cand = await post(retry);
      const v2 = evaluateConsultGuards(cand, { routedRole: p.routedRole, moneyCtx: p.moneyCtx });
      if (v2.ok) return { outcome: "sent", text: cand, modelCalls, guardOutcome: "regenerated_ok", reasons: v.reasons };
      log("CONSULT_GUARD_BLOCKED", { attempt: regenerated + 1, reasons: v2.reasons, sample: cand.slice(0, 120) });
      text = cand;
      v = v2;
    }
  }

  // deterministic fallback — ห้ามส่งของที่ reject ห้ามเงียบ
  if (!v.money.ok && p.moneyCtx?.userMoneyIntent) {
    return { outcome: "defer_payment", text: null, modelCalls, guardOutcome: "defer_payment", reasons: v.reasons };
  }
  if (!v.role.ok) {
    return { outcome: "sent", text: ajarnRoleSafeFallback({ hasReport: Boolean(p.hasReport) }), modelCalls, guardOutcome: "role_safe_fallback", reasons: v.reasons };
  }
  if (!v.tone.ok && v.money.ok && !v.forbidden) {
    // เส้นเดิม (ก่อน flow-role): ตัดเฉพาะวลีชม/ปลอบ แล้วตรวจซ้ำ ไม่ผ่าน = neutral
    const r = resolveToneGuardedText({ original: text, retry: null, moneyCtx: p.moneyCtx });
    return { outcome: "sent", text: r.text, modelCalls, guardOutcome: `tone_${r.outcome}`, reasons: v.reasons };
  }
  return { outcome: "sent", text: NEUTRAL_RECOVERY_FALLBACK, modelCalls, guardOutcome: "neutral_fallback", reasons: v.reasons };
}

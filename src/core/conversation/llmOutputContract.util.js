/**
 * LLM customer-output contract (เฟส 2 — กบ 21 ส.ค. + Codex spec 22 ส.ค.)
 *
 * ทุกข้อความจากโมเดลที่ลูกค้าเห็นต้องผ่านที่นี่ "ก่อน" ส่ง:
 *   tone (hard tone เดิม) + policy (ประโยคเดียว/ไม่ CTA/ไม่ถามกลับ) + grounding
 * ไม่ผ่าน → regenerate 1 ครั้งพร้อม violation codes → ยังไม่ผ่าน = deterministic
 * factual fallback (ห้ามส่งข้อความผิด ห้ามเงียบ ห้าม AI เกิน 2 calls/เทิร์น)
 */
import { checkHardTone, normalizeInvisible } from "./hardTone.util.js";

/** ข้อเท็จจริงเชิงตัวเลข/คุณสมบัติที่ห้ามสร้างเองถ้าไม่มี evidence */
const GROUNDED_CLAIM_RES = [
  [/\d+(\.\d+)?\s*\/\s*10|\bคะแนน\s*\d|\d+(\.\d+)?\s*เต็ม\s*(สิบ|10)/u, "score"],
  [/\d+(\.\d+)?\s*%|เปอร์เซ็น|เข้ากับดวง\s*\d/u, "percent"],
  [/สีมงคล|สีประจำ|เลขนำโชค|เลขมงคล|วันมงคล/u, "lucky_attr"],
  [/เมตตา|มหานิยม|แคล้วคลาด|โชคลาภ|พุทธคุณ|พลังเด่น|เด่นด้าน|เด่นทาง|สายพลัง|พลัง(?:ย่อม|จะ)?(?:ดี|แรง|สูง|เยอะ)(?:กว่า|มาก)?|แท้.*(?:ดีกว่า|แรงกว่า)|ปลอม.*(?:พลัง|ดีกว่า)/u, "energy_claim"],
  [/เนื้อผง|เนื้อโลหะ|เนื้อว่าน|เนื้อดิน|เนื้อชิน/u, "material"],
  [/วัด[ก-๙]+|รุ่น[ก-๙\s]+|ปี\s*(๒|25)\d{2}|พ\.ศ\.\s*\d{4}/u, "provenance"],
  [/สแกนมาแล้ว\s*[\d,]+|ทั้งหมด\s*[\d,]+\s*(ครั้ง|ชิ้น)|ลูกค้าท่านอื่น|สถิติรวม/u, "cross_customer_stat"],
];

/** CTA / ชวนคุยต่อ / ถามกลับ */
const CTA_RE = /ส่งรูป|ส่งมา|พิมพ์|แตะปุ่ม|กดปุ่ม|เปิดดู|ลองดู|สนใจ|ทักมา|บอกได้/u;
const QUESTION_RE = /[?？]|ไหม|มั้ย|หรือเปล่า|รึเปล่า|อะไรบ้าง|ยังไง/u;
const ADVICE_RE = /ควร|แนะนำ|น่าจะ|ลอง(?!ดู$)|เหมาะกับ|ใช้คู่กับ|พกคู่/u;

/** คำถามใช่/ไม่ใช่ — คำตอบต้องขึ้นต้นด้วยใช่/ไม่ใช่ */
export function isYesNoQuestion(userText) {
  const t = String(userText || "");
  return /ใช่ไหม|ใช่มั้ย|ใช่ป่ะ|ใช่ปะ|หรือเปล่า|รึเปล่า|ได้ไหม|ได้มั้ย|มีไหม|ต้อง.*ไหม/u.test(t);
}

/**
 * @param {{ text: string, expectedRole?: "admin"|"ajarn"|"consult",
 *   userIntent?: string, userText?: string, userAskedAdvice?: boolean,
 *   requiredNextAction?: boolean, evidence?: { reportIds?: string[], kbIds?: string[], toolIds?: string[] } }} p
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function checkLlmCustomerOutput(p) {
  const raw = String(p.text || "");
  const t = normalizeInvisible(raw);
  const v = [];
  if (!t) return { ok: false, violations: ["empty"] };

  // 1) tone (ใช้ contract เดิม — reply เป็น default ของ LLM เว้นแต่เป็นขั้นตอน)
  const kind = p.requiredNextAction === true ? "step" : "reply";
  const tone = checkHardTone(raw, { kind });
  v.push(...tone.violations);

  // 2) policy
  // ไม่ตัดที่จุดทศนิยม (7.2) — นับเฉพาะจุดจบประโยคจริง
  const sentences = t.split(/(?<!\d)[.!?](?!\d)|\n+/).filter((x) => x.trim());
  if (!p.requiredNextAction && sentences.length > 1) v.push("multi_sentence");
  if (CTA_RE.test(t) && p.requiredNextAction !== true && p.userAskedAdvice !== true) v.push("unsolicited_cta");
  if (QUESTION_RE.test(t) && !isYesNoQuestion(p.userText) && p.allowQuestion !== true) v.push("unsolicited_question");
  if (ADVICE_RE.test(t) && p.userAskedAdvice !== true) v.push("unsolicited_advice");
  if (isYesNoQuestion(p.userText) && !/^(ใช่|ไม่ใช่|ไม่)/u.test(t)) v.push("yesno_not_direct");

  // 3) grounding — claim เชิงข้อมูลต้องมี evidence ผูกกับเทิร์นนี้
  const ev = p.evidence || {};
  const hasEvidence =
    (ev.reportIds?.length || 0) + (ev.kbIds?.length || 0) + (ev.toolIds?.length || 0) > 0;
  for (const [re, code] of GROUNDED_CLAIM_RES) {
    if (!re.test(t)) continue;
    if (code === "cross_customer_stat") { v.push("ungrounded:cross_customer_stat"); continue; }
    if (!hasEvidence) v.push(`ungrounded:${code}`);
  }
  // energy reading ต้องเป็นเสียงอาจารย์ + มี evidence
  const isEnergyIntent = /energy_reading|energy_advice/.test(String(p.userIntent || ""));
  if (isEnergyIntent) {
    if (p.expectedRole !== "ajarn") v.push("energy_wrong_role");
    if (!(ev.reportIds?.length > 0)) v.push("energy_without_report");
  }
  // แอดมินห้ามตีความพลังเอง
  if (p.expectedRole === "admin" && GROUNDED_CLAIM_RES.some(([re, code]) => code === "energy_claim" && re.test(t))) {
    v.push("admin_energy_claim");
  }
  return { ok: v.length === 0, violations: [...new Set(v)] };
}

/** ข้อความ deterministic เมื่อโมเดลไม่ผ่านสองรอบ */
export function factualFallbackFor(violations = [], ctx = {}) {
  const set = new Set(violations);
  if ([...set].some((x) => String(x).startsWith("ungrounded") || x === "energy_without_report")) {
    return "ยังไม่มีข้อมูลยืนยัน จึงระบุไม่ได้";
  }
  if (set.has("yesno_not_direct")) return "ยังตอบแทนไม่ได้ ระบุคำถามอีกครั้ง";
  if (ctx.requiredNextAction) return "ระบุขั้นตอนที่ต้องการ";
  return "ระบุเรื่องที่ต้องการถาม";
}

/** directive สั้น ๆ ส่งกลับให้โมเดลตอนขอ regenerate */
export function regenerateDirective(violations = []) {
  const map = {
    multi_sentence: "ตอบประโยคเดียว",
    unsolicited_cta: "ห้ามชวนทำอะไรต่อ",
    unsolicited_question: "ห้ามถามกลับ",
    unsolicited_advice: "ห้ามแนะนำถ้าไม่ได้ถูกขอ",
    yesno_not_direct: "ขึ้นต้นด้วย ใช่ หรือ ไม่ใช่",
    energy_wrong_role: "ห้ามตีความพลังในเสียงแอดมิน",
    admin_energy_claim: "ห้ามตีความพลังในเสียงแอดมิน",
  };
  const lines = violations.map((x) =>
    x.startsWith("ungrounded") || x === "energy_without_report"
      ? "ห้ามระบุคะแนน ตัวเลข พลัง วัสดุ วัด หรือรุ่น ถ้าไม่มีข้อมูลยืนยัน"
      : map[x] || (x.startsWith("banned_phrase") ? "ห้ามใช้คำสุภาพ/ขอบคุณ/ปลอบ" : x.startsWith("too_long") ? "สั้นกว่านี้" : null),
  );
  return [...new Set(lines.filter(Boolean))].join(" · ");
}

/**
 * Gateway กลาง: ตรวจ → regenerate 1 ครั้ง → factual fallback
 * @param {{ generate: (directive: string|null) => Promise<string>, maxAiCalls?: number,
 *   log?: Function }} deps
 * @returns {Promise<{ text: string, source: "model"|"regenerated"|"fallback", aiCalls: number, violations: string[] }>}
 */
export async function enforceLlmCustomerOutput(p, deps) {
  const log = deps.log || ((e, x) => console.log(JSON.stringify({ event: e, ...x })));
  const meta = { callSite: p.callSite || "unknown", replyType: p.replyType || null, evidencePresent: Boolean(
    (p.evidence?.reportIds?.length || 0) + (p.evidence?.kbIds?.length || 0) + (p.evidence?.toolIds?.length || 0),
  ) };
  let aiCalls = 0;

  const first = String((await deps.generate(null)) || "");
  aiCalls += 1;
  let res = checkLlmCustomerOutput({ ...p, text: first });
  if (res.ok) return { text: first.trim(), source: "model", aiCalls, violations: [] };
  const grounding = res.violations.filter((x) => x.startsWith("ungrounded") || x.startsWith("energy_"));
  log(grounding.length ? "LLM_GROUNDING_REJECTED" : "LLM_TONE_REJECTED", { ...meta, violations: res.violations });

  // regenerate หนึ่งครั้ง (รวมแล้วห้ามเกิน 2 calls)
  if ((Number(deps.maxAiCalls) || 2) >= 2) {
    const second = String((await deps.generate(regenerateDirective(res.violations))) || "");
    aiCalls += 1;
    log("LLM_REGENERATED", { ...meta, violations: res.violations });
    const res2 = checkLlmCustomerOutput({ ...p, text: second });
    if (res2.ok) return { text: second.trim(), source: "regenerated", aiCalls, violations: [] };
    res = res2;
  }
  const fallback = factualFallbackFor(res.violations, p);
  log("LLM_FACTUAL_FALLBACK_USED", { ...meta, violations: res.violations });
  return { text: fallback, source: "fallback", aiCalls, violations: res.violations };
}

/**
 * LLM customer-output contract (เฟส 2 — Codex spec รอบสอง 22 ส.ค. 2026)
 *
 * หลักการ: "มีหลักฐานอะไรก็ได้ = พูดอะไรก็ได้" ใช้ไม่ได้ —
 * ต้อง extract claim จากข้อความ แล้วตรวจ "ค่าจริง" กับ typed evidence รายหมวด
 * และทุก error path ต้อง fail-closed (ห้ามคืน output ที่ถูก reject)
 */
import { checkHardTone, normalizeInvisible } from "./hardTone.util.js";

/* ---------------- claim extraction (typed ไม่พึ่ง regex กว้างชั้นเดียว) ---------------- */

const THAI_DIGITS = { "๐": "0", "๑": "1", "๒": "2", "๓": "3", "๔": "4", "๕": "5", "๖": "6", "๗": "7", "๘": "8", "๙": "9" };
const toArabic = (s) => String(s).replace(/[๐-๙]/g, (d) => THAI_DIGITS[d] || d);
const num = (s) => Number(String(toArabic(s)).replace(/,/g, ""));

/** คำที่บ่งบอกว่าเลขนั้นเป็น "คะแนน" */
const SCORE_CUE = /คะแนน|แรงสุด|เต็ม\s*(สิบ|10)|\/\s*10|ระดับ/u;
const PERCENT_CUE = /%|เปอร์เซ็น|เข้ากับดวง|ความเข้ากัน/u;
/** canonical tags = ค่า mainEnergyLabel จริงบน pro (24 ส.ค. 2026) + คำที่โมเดลใช้ */
const ENERGY_TAGS = [
  "เมตตา", "มหานิยม", "แคล้วคลาด", "โชคลาภ", "คุ้มครอง", "การเงิน", "เสน่ห์",
  "สมดุล", "หนุนดวง", "ค้าขาย", "พุทธคุณ", "สายพลัง", "พลังเด่น",
  "อำนาจ", "เสริมพลัง", "เร่งการเปลี่ยนแปลง", "บารมี", "งานเฉพาะ",
];
/** alias → canonical (smoke 24 ส.ค.: รายงานจริง "ปกป้อง" 2,039 ชิ้น แต่ vocabulary มีแค่ "คุ้มครอง") */
const ENERGY_ALIAS = {
  "ปกป้อง": "คุ้มครอง", "ป้องกัน": "คุ้มครอง", "เกราะ": "คุ้มครอง",
  "เสน่หา": "เสน่ห์", "เมตตามหานิยม": "เมตตา",
  "ความมั่งคั่ง": "การเงิน", "ทรัพย์": "การเงิน",
  "เปลี่ยนแปลง": "เร่งการเปลี่ยนแปลง",
};
const ENERGY_SURFACE = [...ENERGY_TAGS, ...Object.keys(ENERGY_ALIAS)];
const toCanonicalEnergy = (w) => ENERGY_ALIAS[w] || w;
/** normalizer เดียวกับ claim extractor: label รวม ("เมตตา มหานิยม", "สมดุล/เมตตา") → canonical tags */
export function canonicalEnergyTags(label) {
  const t = normalizeInvisible(String(label || ""));
  return [...new Set(ENERGY_SURFACE.filter((w) => t.includes(w)).map(toCanonicalEnergy))];
}
const MATERIALS = ["เนื้อผง", "เนื้อโลหะ", "เนื้อว่าน", "เนื้อดิน", "เนื้อชิน", "เนื้อทองเหลือง", "เนื้อเงิน"];
const LUCKY_CUE = /เลขนำโชค|เลขมงคล|สีมงคล|สีประจำ|วันมงคล|สีแดงเป็นมงคล|สี(?:แดง|เขียว|ขาว|ดำ|ทอง|ฟ้า|ม่วง|เหลือง)(?=เป็นมงคล|มงคล|ดี)/u;
/** สถิติข้ามลูกค้า — ห้ามเสมอ ไม่ว่ามี evidence หรือไม่ */
const CROSS_CUSTOMER_CUE =
  /(?:ทั้งหมด|รวม|เคยดู|อ่านมา|ตอบมา|สแกนมา|มากกว่า|ทั้งระบบ)\s*(?:แล้ว\s*)?(?:กว่า\s*)?[\d๐-๙,]{2,}\s*(?:ครั้ง|ชิ้น|ราย|รอบ)|เป็นหมื่นรอบ|เป็นพันรอบ|ลูกค้าท่านอื่น|ลูกค้าคนอื่น|สถิติรวม|ชิ้นที่แรงที่สุดที่เคยเจอ/u;
/** เปรียบเทียบแท้/ปลอม = ฟันธงที่ระบบพิสูจน์ไม่ได้ */
const AUTHENTICITY_CUE = /(?:พระ|ของ)?(?:แท้|จริง|ปลอม|เก๊)[^\n]{0,12}(?:พลัง|ดีกว่า|แรงกว่า|ด้อยกว่า)|พลัง[^\n]{0,10}(?:แท้|ปลอม)/u;
/** วัด/รุ่น/ปี */
const PROVENANCE_CUE = /วัด\s*[ก-๙]{2,}|รุ่น\s*[ก-๙A-Za-z0-9]{2,}|ปี\s*(?:พ\.?ศ\.?\s*)?[๐-๙\d]{4}|พ\.?ศ\.?\s*[๐-๙\d]{4}|ปีเก่า|ยุคเก่า/u;

/**
 * ดึง claim ที่ต้องมีหลักฐานออกจากข้อความ
 * @returns {Array<{type:string, value?:number|string}>}
 */
export function extractClaims(text) {
  const t = normalizeInvisible(text);
  const claims = [];
  if (!t) return claims;

  // score: เลขที่อยู่ใกล้คำบ่งชี้คะแนน (รองรับ 7.2/10, คะแนน 75, แรงสุด 8.9, เลขไทย)
  for (const m of t.matchAll(/([\d๐-๙]+(?:\.[\d๐-๙]+)?)\s*(?:\/\s*10|เต็ม\s*(?:สิบ|10))/gu)) {
    claims.push({ type: "score", value: num(m[1]) });
  }
  for (const m of t.matchAll(/(?:คะแนน|แรงสุด|แรงที่สุด|ระดับ)\s*(?:คือ|อยู่ที่)?\s*([\d๐-๙]+(?:\.[\d๐-๙]+)?)/gu)) {
    claims.push({ type: "score", value: num(m[1]) });
  }
  // percent
  for (const m of t.matchAll(/([\d๐-๙]+(?:\.[\d๐-๙]+)?)\s*(?:%|เปอร์เซ็น)/gu)) {
    claims.push({ type: "percent", value: num(m[1]) });
  }
  for (const m of t.matchAll(/(?:เข้ากับดวง|ความเข้ากัน)\s*(?:คุณ)?\s*([\d๐-๙]+(?:\.[\d๐-๙]+)?)/gu)) {
    claims.push({ type: "percent", value: num(m[1]) });
  }
  // ดวงวันนี้ N (คะแนนดวง) — เคสจริง 23:42
  for (const m of t.matchAll(/ดวง(?:วันนี้|ของคุณ)?\s*(?:คุณ)?\s*(?:ได้)?\s*([\d๐-๙]+)(?![\d๐-๙])(?!\s*(?:%|เปอร์เซ็น|\.[\d๐-๙]))/gu)) {
    claims.push({ type: "score", value: num(m[1]) });
  }
  // energy tags
  for (const tag of canonicalEnergyTags(t)) claims.push({ type: "energy", value: tag });
  // materials
  for (const mat of MATERIALS) if (t.includes(mat)) claims.push({ type: "material", value: mat });
  // lucky attributes — สกัด "ค่า" จริง (สี/เลข/วัน) แล้วค่อยเทียบค่า (Codex B3)
  for (const v of extractLuckyValues(t)) claims.push({ type: "lucky", value: v });
  if (LUCKY_CUE.test(t) && extractLuckyValues(t).length === 0) claims.push({ type: "lucky", value: null });
  // provenance typed {temple, model, year} (Codex B3) — เทียบราย field
  const prov = extractProvenance(t);
  if (prov) claims.push({ type: "provenance", value: prov });
  // ห้ามเสมอ
  if (CROSS_CUSTOMER_CUE.test(t)) claims.push({ type: "cross_customer_stat" });
  if (AUTHENTICITY_CUE.test(t)) claims.push({ type: "authenticity" });
  return claims;
}

const COLORS = ["แดง", "เขียว", "ขาว", "ดำ", "ทอง", "ฟ้า", "ม่วง", "เหลือง", "ชมพู", "น้ำเงิน", "ส้ม", "เงิน", "น้ำตาล", "เทา"];
const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
/** สกัดค่า lucky จริง: สี (ต้องตามหลังคำว่า สี) · เลข (ต้องตามหลัง เลข) · วัน */
export function extractLuckyValues(t) {
  const out = [];
  for (const m of t.matchAll(/สี(?:มงคล|นำโชค|ประจำ(?:ตัว|วัน)?)?\s*([ก-๙]+)/gu)) {
    const c = COLORS.find((x) => m[1].startsWith(x));
    if (c) out.push(c);
  }
  for (const m of t.matchAll(/เลข(?:มงคล|นำโชค|ประจำตัว)?\s*([\d๐-๙]+)/gu)) out.push(num(m[1]));
  for (const m of t.matchAll(/วัน(?:มงคล|ดี)?\s*(จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)/gu)) out.push(m[1]);
  return out;
}
/** provenance typed — null เมื่อไม่มี claim เลย */
export function extractProvenance(t) {
  // ชื่อวัด = คำไทยถัดจาก "วัด" (ไม่กินคำกำกับ ปี/รุ่น/พ.ศ. ที่ตามมา)
  const temple = (t.match(/วัด\s*((?!ปี|รุ่น|พ\.)[ก-๙]{2,}(?:\s(?!ปี|รุ่น|พ\.)[ก-๙]{2,})?)/u) || [])[1] || null;
  const model = (t.match(/รุ่น\s*([ก-๙A-Za-z0-9]{1,}(?:\s[ก-๙A-Za-z0-9]+)?)/u) || [])[1] || null;
  const yearM = t.match(/(?:ปี|พ\.?ศ\.?)\s*(?:พ\.?ศ\.?\s*)?([๐-๙\d]{4})/u);
  const year = yearM ? num(yearM[1]) : null;
  const vague = /ปีเก่า|ยุคเก่า|ยุคต้น|สมัยเก่า/u.test(t) ? "vague_era" : null;
  if (!temple && !model && year == null && !vague) return null;
  return { temple: normThai(temple), model: normThai(model), year, vague };
}
const normThai = (v) => (v == null ? null : String(v).replace(/\s+/g, "").replace(/^วัด/u, "").trim() || null);
/** fact ฝั่ง evidence: รับได้ทั้ง string ("วัดระฆัง ปี 2506") และ object {temple, model, year} */
function provenanceFactToTyped(f) {
  if (f && typeof f === "object") return { temple: normThai(f.temple), model: normThai(f.model), year: f.year == null ? null : num(f.year) };
  const str = String(f || "");
  const p = extractProvenance(str);
  if (!p) return null;
  // fact ฝั่ง KB เขียนปีโดด ๆ ได้ ("วัดระฆัง 2506") — ฝั่ง claim ต้องมีคำว่า ปี/พ.ศ. เสมอ
  const bareYear = p.year ?? (str.match(/(?<![\d๐-๙])((?:24|25)[\d๐-๙]{2})(?![\d๐-๙])/u) || [])[1];
  return { temple: p.temple, model: p.model, year: bareYear == null ? null : num(bareYear) };
}
function provenanceMatches(claim, facts) {
  const typedFacts = (Array.isArray(facts) ? facts : []).map(provenanceFactToTyped).filter(Boolean);
  if (!typedFacts.length) return false;
  if (claim.vague) return false; // "ปีเก่า" ไม่มีค่าให้เทียบ = ไม่ผ่าน
  // ทุก field ที่ claim ระบุ ต้องตรงกับ fact เดียวกันอย่างน้อยหนึ่งรายการ
  return typedFacts.some((f) => {
    if (claim.temple && f.temple !== claim.temple) return false;
    if (claim.model && f.model !== claim.model) return false;
    if (claim.year != null && f.year !== claim.year) return false;
    return true;
  });
}

/* ---------------- claim-level verification ---------------- */

const inList = (list, v) => Array.isArray(list) && list.some((x) => String(x) === String(v));
const inNums = (list, v) => Array.isArray(list) && list.some((x) => Math.abs(Number(x) - Number(v)) < 0.05);

/**
 * ตรวจ claim กับ typed evidence — ID เปล่า ๆ ปลดล็อกไม่ได้
 * evidence = { report: {ids, scores, percentages, energyTags, luckyAttributes, materials},
 *              kb: {ids, provenanceFacts, materialFacts}, tool: {...} }
 * @returns {string[]} violation codes
 */
export function verifyClaims(claims, evidence = {}, opts = {}) {
  const rep = evidence.report || {};
  const kb = evidence.kb || {};
  const tool = evidence.tool || {};
  const out = [];
  for (const c of claims) {
    switch (c.type) {
      case "cross_customer_stat":
        out.push("ungrounded:cross_customer_stat"); // ห้ามเสมอ
        break;
      case "authenticity":
        out.push("ungrounded:authenticity"); // ระบบพิสูจน์ไม่ได้
        break;
      case "score":
        if (!inNums(rep.scores, c.value)) out.push("ungrounded:score");
        break;
      case "percent":
        if (!inNums(rep.percentages, c.value)) out.push("ungrounded:percent");
        break;
      case "energy":
        // report tag เท่านั้น (KB ID ปลดล็อกไม่ได้) + ต้องเป็นเสียงอาจารย์
        if (!inList(rep.energyTags, c.value)) out.push("ungrounded:energy");
        else if (opts.expectedRole !== "ajarn") out.push("energy_wrong_role");
        break;
      case "material":
        if (!inList(kb.materialFacts, c.value) && !inList(tool.materialFacts, c.value)) {
          out.push("ungrounded:material");
        }
        break;
      case "lucky":
        // ต้องมีค่าจริง และค่านั้นต้องอยู่ใน report.luckyAttributes
        if (c.value == null) out.push("ungrounded:lucky");
        else if (typeof c.value === "number" ? !inNums(rep.luckyAttributes, c.value) : !inList(rep.luckyAttributes, c.value)) {
          out.push("ungrounded:lucky");
        }
        break;
      case "provenance":
        // report ห้ามปลดล็อก provenance — เทียบราย field กับ KB/tool fact เท่านั้น
        if (!provenanceMatches(c.value, kb.provenanceFacts) && !provenanceMatches(c.value, tool.provenanceFacts)) {
          out.push("ungrounded:provenance");
        }
        break;
      default:
        break;
    }
  }
  return [...new Set(out)];
}

/* ---------------- policy ---------------- */

const CTA_RE = /ส่งรูป|ส่งมา|พิมพ์|แตะปุ่ม|กดปุ่ม|เปิดดู|ลองดู|สนใจ|ทักมา|บอกได้/u;
const QUESTION_RE = /[?？]|ไหม|มั้ย|หรือเปล่า|รึเปล่า|อะไรบ้าง|ยังไง|เมื่อไหร่/u;
const ADVICE_RE = /ควร|แนะนำ|น่าจะ|เหมาะกับ|ใช้คู่กับ|พกคู่|ให้สวด|ให้พก/u;
// ภาษาไทยไม่เว้นวรรค → ห้ามบังคับ \s รอบตัวคั่น · ใช้เฉพาะตัวคั่น "ลำดับชัด"
// ("แล้ว" เป็นตัวเชื่อมในคำสั่งเดียว เช่น "โอนแล้วแนบสลิป" ไม่นับเป็นสองขั้น)
const STEP_SPLIT_RE = /จากนั้น|ต่อด้วย|หลังจากนั้น|เสร็จแล้วค่อย|\n+/u;

export function isYesNoQuestion(userText) {
  return /ใช่ไหม|ใช่มั้ย|ใช่ป่ะ|ใช่ปะ|หรือเปล่า|รึเปล่า|ได้ไหม|ได้มั้ย|มีไหม|ต้อง.*ไหม/u.test(String(userText || ""));
}

/** นับจำนวนคำแนะนำ/ขั้นตอนในข้อความ (cardinality) */
function countAdvice(t) {
  return (t.match(/ควร|แนะนำ|ให้สวด|ให้พก|เหมาะกับ|ใช้คู่กับ|พกคู่/gu) || []).length;
}
function countSteps(t) {
  const parts = t.split(STEP_SPLIT_RE).filter((x) => x.trim());
  const actionish = parts.filter((x) => CTA_RE.test(x) || /โอน|แนบ|กรอก|เลือก|ยืนยัน/u.test(x));
  return actionish.length;
}

/**
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function checkLlmCustomerOutput(p) {
  const raw = String(p.text || "");
  const t = normalizeInvisible(raw);
  const v = [];
  if (!t) return { ok: false, violations: ["empty"] };

  const kind = p.requiredNextAction === true ? "step" : "reply";
  v.push(...checkHardTone(raw, { kind }).violations);

  const sentences = t.split(/(?<!\d)[.!?](?!\d)|\n+/).filter((x) => x.trim());
  if (!p.requiredNextAction && sentences.length > 1) v.push("multi_sentence");

  // P0-5 cardinality: คำถามใน output = reject เสมอ เว้น allowQuestion ตรง ๆ
  if (QUESTION_RE.test(t) && p.allowQuestion !== true) v.push("unsolicited_question");
  if (CTA_RE.test(t) && p.requiredNextAction !== true && p.userAskedAdvice !== true) v.push("unsolicited_cta");
  if (ADVICE_RE.test(t)) {
    if (p.userAskedAdvice !== true) v.push("unsolicited_advice");
    else if (countAdvice(t) > 1) v.push("multi_advice");
  }
  if (p.requiredNextAction === true && countSteps(t) > 1) v.push("multi_step");
  if (isYesNoQuestion(p.userText) && !/^(ใช่|ไม่ใช่|ไม่)/u.test(t)) v.push("yesno_not_direct");

  // P0-2/P0-3 grounding: claim-level
  const claims = extractClaims(raw);
  v.push(...verifyClaims(claims, p.evidence || {}, { expectedRole: p.expectedRole }));

  const isEnergyIntent = /energy_reading|energy_advice/.test(String(p.userIntent || ""));
  if (isEnergyIntent) {
    if (p.expectedRole !== "ajarn") v.push("energy_wrong_role");
    if (!(p.evidence?.report?.ids?.length > 0)) v.push("energy_without_report");
  }
  if (p.expectedRole === "admin" && claims.some((c) => c.type === "energy")) v.push("admin_energy_claim");

  return { ok: v.length === 0, violations: [...new Set(v)] };
}

/* ---------------- failure policy ---------------- */

export function factualFallbackFor(violations = [], ctx = {}) {
  const set = new Set(violations);
  if ([...set].some((x) => String(x).startsWith("ungrounded") || x === "energy_without_report")) {
    return "ยังไม่มีข้อมูลยืนยัน จึงระบุไม่ได้";
  }
  if (set.has("yesno_not_direct")) return "ยังระบุไม่ได้";
  if (ctx.requiredNextAction) return "ระบุขั้นตอนที่ต้องการ";
  return "ระบุเรื่องที่ต้องการถาม";
}

export function regenerateDirective(violations = []) {
  const map = {
    multi_sentence: "ตอบประโยคเดียว",
    unsolicited_cta: "ห้ามชวนทำอะไรต่อ",
    unsolicited_question: "ห้ามมีคำถามในคำตอบ",
    unsolicited_advice: "ห้ามแนะนำถ้าไม่ได้ถูกขอ",
    multi_advice: "แนะนำได้อย่างเดียว",
    multi_step: "บอกขั้นตอนเดียว",
    yesno_not_direct: "ขึ้นต้นด้วย ใช่ หรือ ไม่ใช่",
    energy_wrong_role: "ห้ามตีความพลังในเสียงแอดมิน",
    admin_energy_claim: "ห้ามตีความพลังในเสียงแอดมิน",
  };
  const lines = violations.map((x) =>
    x.startsWith("ungrounded") || x === "energy_without_report"
      ? "ห้ามระบุคะแนน ตัวเลข พลัง วัสดุ วัด รุ่น หรือสถิติ ถ้าไม่มีข้อมูลยืนยัน"
      : map[x] ||
        (x.startsWith("banned_phrase") || x.startsWith("polite")
          ? "ห้ามใช้คำสุภาพ ขอบคุณ หรือคำปลอบ"
          : x.startsWith("too_long")
            ? "สั้นกว่านี้"
            : null),
  );
  return [...new Set(lines.filter(Boolean))].join(" · ");
}

/**
 * Gateway กลาง — fail-closed ทุก error path (P0-1) + AI budget ต่อเทิร์น (P0-6)
 * @param {{ turnBudget?: { attempted: number, max: number } }} p
 */
export async function enforceLlmCustomerOutput(p, deps) {
  const log = deps.log || ((e, x) => console.log(JSON.stringify({ event: e, ...x })));
  const meta = {
    callSite: p.callSite || "unknown",
    replyType: p.replyType || null,
    evidencePresent: Boolean(
      (p.evidence?.report?.ids?.length || 0) + (p.evidence?.kb?.ids?.length || 0) + (p.evidence?.tool?.ids?.length || 0),
    ),
  };
  const budget = p.turnBudget || { attempted: 0, max: Number(deps.maxAiCalls) || 2 };
  const canCall = () => budget.attempted < budget.max;

  const tryGenerate = async (directive) => {
    if (!canCall()) return { ok: false, failureType: "budget_exhausted" };
    budget.attempted += 1;
    try {
      const out = String((await deps.generate(directive)) || "").trim();
      if (!out) return { ok: false, failureType: "empty_output" };
      return { ok: true, text: out };
    } catch (e) {
      return { ok: false, failureType: /timeout/i.test(String(e?.message)) ? "timeout" : "generate_error" };
    }
  };

  const first = await tryGenerate(null);
  if (!first.ok) {
    const text = factualFallbackFor([], p);
    log("LLM_FACTUAL_FALLBACK_USED", { ...meta, failureType: first.failureType, aiCalls: budget.attempted });
    return { text, source: "fallback", aiCalls: budget.attempted, violations: [], failureType: first.failureType };
  }
  let res = checkLlmCustomerOutput({ ...p, text: first.text });
  if (res.ok) return { text: first.text, source: "model", aiCalls: budget.attempted, violations: [] };

  const grounding = res.violations.filter((x) => x.startsWith("ungrounded") || x.startsWith("energy_"));
  log(grounding.length ? "LLM_GROUNDING_REJECTED" : "LLM_TONE_REJECTED", { ...meta, violations: res.violations });

  const firstViolations = res.violations;
  const second = await tryGenerate(regenerateDirective(firstViolations));
  if (second.ok) {
    log("LLM_REGENERATED", { ...meta, violations: firstViolations });
    const res2 = checkLlmCustomerOutput({ ...p, text: second.text });
    if (res2.ok) return { text: second.text, source: "regenerated", aiCalls: budget.attempted, violations: [] };
    res = res2;
  } else {
    // retry ล้ม/timeout/งบหมด → fallback จาก violations รอบแรก (ห้ามคืน output เดิม)
    const text = factualFallbackFor(firstViolations, p);
    log("LLM_FACTUAL_FALLBACK_USED", { ...meta, violations: firstViolations, failureType: second.failureType, aiCalls: budget.attempted });
    return { text, source: "fallback", aiCalls: budget.attempted, violations: firstViolations, failureType: second.failureType };
  }
  const text = factualFallbackFor(res.violations, p);
  log("LLM_FACTUAL_FALLBACK_USED", { ...meta, violations: res.violations, aiCalls: budget.attempted });
  return { text, source: "fallback", aiCalls: budget.attempted, violations: res.violations };
}

/**
 * แปลง "ข้อเท็จจริงที่อนุญาต" เป็น typed evidence ตาม label/field (Codex B2)
 * — ห้ามหยิบตัวเลขทุกตัวแล้วยัดทุกหมวด (quota 75 ≠ score 75 · ปี 2506 ≠ คะแนน)
 * object: ดูชื่อ key · string: ดูคำกำกับหน้าเลข · เลขไม่มี label = ไม่ปลดล็อกอะไร
 */
const KEY_SCORE = /^(energyScore|score|scores|powerScore|คะแนน(พลัง)?)$/i;
const KEY_PERCENT = /^(compat(ibility)?Percent|percent(age)?s?|matchPercent|เข้ากับ)$/i;
const KEY_LUCKY = /^(lucky(Number|Color|Day|Attributes)?|เลขมงคล|สีมงคล|วันมงคล)$/i;
const KEY_ENERGY = /^(energyTags?|mainEnergyLabel|visibleMainLabel|พลังเด่น)$/i;
const KEY_MATERIAL = /^(material|materials|เนื้อ)$/i;
const KEY_TEMPLE = /^(temple|วัด)$/i;
const KEY_MODEL = /^(model|รุ่น)$/i;
const KEY_YEAR = /^(year|eraYear|ปี)$/i;
const KEY_REPORT_ID = /^(reportId|resultId|publicToken|scanId)$/i;

export function evidenceFromAllowedFacts(input) {
  const ev = {
    report: { ids: [], scores: [], percentages: [], energyTags: [], luckyAttributes: [], materials: [] },
    kb: { ids: [], provenanceFacts: [], materialFacts: [] },
    tool: {},
  };
  const addNum = (arr, v) => { const n = num(v); if (Number.isFinite(n)) arr.push(n); };
  const addStr = (arr, v) => { const x = String(v ?? "").trim(); if (x) arr.push(x); };
  const prov = {};
  const walk = (node, depth = 0) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) return node.forEach((x) => walk(x, depth + 1));
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (KEY_SCORE.test(k)) (Array.isArray(v) ? v : [v]).forEach((x) => addNum(ev.report.scores, x));
      else if (KEY_PERCENT.test(k)) (Array.isArray(v) ? v : [v]).forEach((x) => addNum(ev.report.percentages, x));
      else if (KEY_LUCKY.test(k)) (Array.isArray(v) ? v : [v]).forEach((x) => (Number.isFinite(num(x)) ? addNum(ev.report.luckyAttributes, x) : addStr(ev.report.luckyAttributes, x)));
      else if (KEY_ENERGY.test(k)) (Array.isArray(v) ? v : [v]).forEach((x) => canonicalEnergyTags(x).forEach((tag) => addStr(ev.report.energyTags, tag)));
      else if (KEY_MATERIAL.test(k)) (Array.isArray(v) ? v : [v]).forEach((x) => addStr(ev.kb.materialFacts, x));
      else if (KEY_TEMPLE.test(k)) prov.temple = String(v || "");
      else if (KEY_MODEL.test(k)) prov.model = String(v || "");
      else if (KEY_YEAR.test(k)) prov.year = num(v);
      else if (KEY_REPORT_ID.test(k)) addStr(ev.report.ids, v);
      else if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  if (input && typeof input === "object") {
    walk(input);
  } else if (typeof input === "string") {
    const t = normalizeInvisible(input);
    for (const m of t.matchAll(/คะแนน(?:พลัง)?\s*:?\s*([\d๐-๙]+(?:\.[\d๐-๙]+)?)/gu)) addNum(ev.report.scores, m[1]);
    for (const m of t.matchAll(/([\d๐-๙]+(?:\.[\d๐-๙]+)?)\s*\/\s*10/gu)) addNum(ev.report.scores, m[1]);
    for (const m of t.matchAll(/([\d๐-๙]+(?:\.[\d๐-๙]+)?)\s*%/gu)) addNum(ev.report.percentages, m[1]);
    for (const m of t.matchAll(/พลังเด่น\s*:?\s*([ก-๙]+)/gu)) addStr(ev.report.energyTags, m[1]);
    for (const line of t.split("\n")) if (/พลังเด่น/u.test(line)) canonicalEnergyTags(line).forEach((tag) => addStr(ev.report.energyTags, tag));
    extractLuckyValues(t).forEach((v) => (typeof v === "number" ? addNum(ev.report.luckyAttributes, v) : addStr(ev.report.luckyAttributes, v)));
    MATERIALS.forEach((m) => { if (t.includes(m)) addStr(ev.kb.materialFacts, m); });
    const p = extractProvenance(t);
    if (p && !p.vague) Object.assign(prov, { temple: p.temple, model: p.model, year: p.year });
  }
  if (prov.temple || prov.model || prov.year != null) ev.kb.provenanceFacts.push(prov);
  if (ev.report.scores.length || ev.report.percentages.length || ev.report.energyTags.length || ev.report.luckyAttributes.length) {
    if (!ev.report.ids.length) ev.report.ids.push("allowed_facts");
  }
  if (ev.kb.provenanceFacts.length || ev.kb.materialFacts.length) ev.kb.ids.push("allowed_facts");
  ev.report.energyTags = [...new Set(ev.report.energyTags)];
  return ev;
}

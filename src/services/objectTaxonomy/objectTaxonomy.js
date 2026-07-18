/**
 * จำแนกประเภทวัตถุมงคล (กบ 18 ก.ค. 2026 — เคสธูปหวยถูกอ่านเป็นแค่ "พระ/เทวรูป/เครื่องราง"):
 * ชั้น form = วัตถุ "เป็น" อะไรทางกายภาพ · ชั้น motif = "ลาย/องค์ที่ปรากฏบน" วัตถุ
 * (ธูปพิมพ์ลายท้าวเวสฯ → form=incense_stick + motif=vessavana_giant ไม่ใช่องค์ท้าวเวสฯ)
 *
 * กติกาแข็ง:
 * - slug ปิดตาย — ค่านอกลิสต์ตีเป็น unknown เสมอ ชื่อไทยแปลงในโค้ดเท่านั้น (model ห้ามตั้งชื่อ)
 * - usageProfile derive จาก form ด้วยโค้ดล้วน (ของจุดบูชา/ตั้งบูชา ห้ามได้คำแนะนำ "พกติดตัว")
 * - ไม่แตะ scoring seed ใด ๆ — ใช้แสดงผล + consult context เท่านั้น
 * - ไม่ยืนยันรุ่น/วัด/เกจิ/แท้เก๊ · sensitiveFlags ใช้ภายใน ไม่โชว์ลูกค้า ไม่ฟันธงชนิดสัตว์
 */

export const OBJECT_TAXONOMY_VERSION = "obj-tax-v1";

/** ชั้น form: วัตถุเป็นอะไร (สิ่งที่จับต้อง) — slug → ชื่อไทย */
export const OBJECT_FORM_TH = Object.freeze({
  amulet_tablet: "พระพิมพ์/พระเนื้อผง",
  amulet_coin: "เหรียญมงคล",
  small_figurine: "รูปหล่อองค์เล็ก",
  statue: "รูปตั้งบูชา",
  locket: "ล็อกเก็ต",
  takrut: "ตะกรุด",
  incense_stick: "ธูปบูชา",
  candle: "เทียนบูชา",
  bracelet_beads: "กำไล/ข้อมือมงคล",
  necklace_pendant: "จี้/สร้อยมงคล",
  ring: "แหวนมงคล",
  sacred_cord: "สายสิญจน์/เชือกถักมงคล",
  loose_stone: "หิน/แร่มงคล",
  cloth_yantra: "ผ้ายันต์",
  blade_or_wand: "มีดหมอ/ไม้มงคล",
  sacred_ball: "ลูกอม/ลูกแก้วมงคล",
  other_ritual_object: "วัตถุมงคลลักษณะพิเศษ",
});

/** ชั้น motif: ลาย/องค์ที่ปรากฏ — slug → ชื่อไทย (แสดงเป็น "ลวดลายแนว…") */
export const OBJECT_MOTIF_TH = Object.freeze({
  buddha_image: "พระพุทธรูป",
  monk_guru: "พระเกจิ/พระสงฆ์",
  ganesha: "พระพิฆเนศ",
  vessavana_giant: "ท้าวเวสสุวรรณ/ยักษ์",
  garuda: "พญาครุฑ",
  naga: "พญานาค",
  rahu: "พระราหู",
  nang_kwak: "นางกวัก",
  hanuman: "หนุมาน",
  kuman_thong: "กุมารทอง",
  tiger: "เสือมงคล",
  yantra_script: "ยันต์/อักขระ",
  other_deity: "องค์เทพ",
  animal_other: "สัตว์มงคล",
});

export const SENSITIVE_FLAG_SLUGS = Object.freeze([
  "possible_animal_part",
  "possible_bone_or_ash",
]);

/** เกณฑ์แสดงผล (ตัวเลขไม่โชว์ลูกค้า — แปลงเป็นภาษาแทน) */
export const FORM_DIRECT_CONF = 0.85; // ≥ → พูดชื่อ form ตรง ๆ
export const FORM_NEAR_CONF = 0.65; // ≥ → "ลักษณะใกล้เคียง…" · ต่ำกว่า → ไม่ขึ้นบรรทัด
export const MOTIF_DIRECT_CONF = 0.9; // motif เกณฑ์สูงกว่า (ทายผิดแล้วน่าเกลียดกว่า)
export const MOTIF_NEAR_CONF = 0.72;

/**
 * @param {string} form
 * @returns {{ mode: "carry"|"wear"|"place_or_altar"|"ritual_consumable"|"unknown",
 *   canCarry: boolean, canWear: boolean, canPlace: boolean, consumable: boolean,
 *   usageNoteTh: string }}
 */
export function deriveUsageProfile(form) {
  const f = String(form || "").trim();
  const CARRY = new Set([
    "amulet_tablet",
    "amulet_coin",
    "small_figurine",
    "locket",
    "takrut",
    "sacred_ball",
    "loose_stone",
  ]);
  const WEAR = new Set(["bracelet_beads", "necklace_pendant", "ring", "sacred_cord"]);
  const PLACE = new Set(["statue", "cloth_yantra", "blade_or_wand"]);
  const CONSUMABLE = new Set(["incense_stick", "candle"]);

  if (CONSUMABLE.has(f)) {
    return {
      mode: "ritual_consumable",
      canCarry: false,
      canWear: false,
      canPlace: true,
      consumable: true,
      usageNoteTh: "วัตถุลักษณะนี้เป็นของใช้บูชา/ประกอบพิธี ไม่ใช่ของพกติดตัว",
    };
  }
  if (PLACE.has(f)) {
    return {
      mode: "place_or_altar",
      canCarry: false,
      canWear: false,
      canPlace: true,
      consumable: false,
      usageNoteTh: "วัตถุลักษณะนี้เหมาะกับการตั้งบูชา/เก็บบูชา ไม่ใช่ของพกติดตัว",
    };
  }
  if (WEAR.has(f)) {
    return {
      mode: "wear",
      canCarry: true,
      canWear: true,
      canPlace: false,
      consumable: false,
      usageNoteTh: "",
    };
  }
  if (CARRY.has(f)) {
    return {
      mode: "carry",
      canCarry: true,
      canWear: false,
      canPlace: true,
      consumable: false,
      usageNoteTh: "",
    };
  }
  return {
    mode: "unknown",
    canCarry: true,
    canWear: true,
    canPlace: true,
    consumable: false,
    usageNoteTh: "",
  };
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

/**
 * Normalize ผลดิบจาก vision extractor → block พร้อมแสดงผล (null = ไม่มีอะไรใช้ได้)
 * @param {null|undefined|{ objectForm?: unknown, formConfidence?: unknown,
 *   motifFamily?: unknown, motifConfidence?: unknown, sensitiveFlags?: unknown }} raw
 */
export function buildObjectUnderstanding(raw) {
  if (!raw || typeof raw !== "object") return null;

  const formSlugIn = String(raw.objectForm ?? "").trim().toLowerCase();
  const motifSlugIn = String(raw.motifFamily ?? "").trim().toLowerCase();
  const form = OBJECT_FORM_TH[formSlugIn] ? formSlugIn : "unknown";
  const motif = OBJECT_MOTIF_TH[motifSlugIn]
    ? motifSlugIn
    : motifSlugIn === "none"
      ? "none"
      : "unknown";
  const formConf = clamp01(raw.formConfidence) ?? 0;
  const motifConf = clamp01(raw.motifConfidence) ?? 0;

  const flags = Array.isArray(raw.sensitiveFlags)
    ? raw.sensitiveFlags
        .map((f) => String(f || "").trim().toLowerCase())
        .filter((f) => SENSITIVE_FLAG_SLUGS.includes(f))
    : [];

  if (form === "unknown" && (motif === "unknown" || motif === "none") && flags.length === 0) {
    return null;
  }

  let formDisplayTh = "";
  if (form !== "unknown") {
    if (formConf >= FORM_DIRECT_CONF) formDisplayTh = OBJECT_FORM_TH[form];
    else if (formConf >= FORM_NEAR_CONF)
      formDisplayTh = `ลักษณะใกล้เคียง${OBJECT_FORM_TH[form]}`;
  }

  let motifDisplayTh = "";
  if (motif !== "unknown" && motif !== "none") {
    if (motifConf >= MOTIF_DIRECT_CONF)
      motifDisplayTh = `ลวดลายแนว${OBJECT_MOTIF_TH[motif]}`;
    else if (motifConf >= MOTIF_NEAR_CONF)
      motifDisplayTh = `ลวดลายคล้ายแนว${OBJECT_MOTIF_TH[motif]}`;
  }

  const readingLineTh = [formDisplayTh, motifDisplayTh].filter(Boolean).join(" · ");

  // usage ใช้เมื่อมั่นใจ form พอควร — ต่ำกว่านั้นถือ unknown (ไม่กล้าห้าม/สั่งอะไร)
  const usageProfile =
    form !== "unknown" && formConf >= FORM_NEAR_CONF
      ? deriveUsageProfile(form)
      : deriveUsageProfile("unknown");

  return {
    taxonomyVersion: OBJECT_TAXONOMY_VERSION,
    objectForm: form,
    formConfidence: formConf,
    motifFamily: motif,
    motifConfidence: motifConf,
    formDisplayTh,
    motifDisplayTh,
    readingLineTh,
    usageProfile,
    sensitiveFlags: flags,
  };
}

/**
 * รวมผลจำแนกจาก 2 แหล่ง: extractor (gpt-4.1-mini) + Gemini second opinion
 * (กบ 18 ก.ค. — gpt อ่านธูปหวยแบนเป็นพระพิมพ์ 0.8 แต่ Gemini รู้จักธูปหวย)
 * กติกา: ① Gemini เห็นธูป/เทียน conf ≥0.7 → เชื่อ Gemini (จุดอ่อนของ gpt ที่เจอจริง)
 * ② extractor อ่านไม่ออก/ต่ำ แต่ Gemini รู้ conf ≥0.7 → เชื่อ Gemini
 * ③ นอกนั้นยึด extractor เดิม · motif เอาฝั่งที่มั่นใจกว่า · sensitiveFlags รวมสองฝั่ง
 * @param {object|null} extractorRaw
 * @param {object|null} geminiRes ผลจาก classifyObjectFormWithGemini (mode ok เท่านั้นที่ใช้)
 * @returns {object|null} raw รวมแล้ว (โครงเดียวกับ extractor raw)
 */
export function mergeUnderstandingSources(extractorRaw, geminiRes) {
  const g = geminiRes && geminiRes.mode === "ok" ? geminiRes : null;
  if (!g) return extractorRaw ?? null;
  const gForm = String(g.objectForm || "").trim().toLowerCase();
  const gFormKnown = Boolean(OBJECT_FORM_TH[gForm]);
  const gConf = Number(g.formConfidence) || 0;

  const e = extractorRaw && typeof extractorRaw === "object" ? extractorRaw : null;
  const eForm = String(e?.objectForm || "").trim().toLowerCase();
  const eFormKnown = Boolean(OBJECT_FORM_TH[eForm]);
  const eConf = Number(e?.formConfidence) || 0;

  const geminiSaysRitual = ["incense_stick", "candle"].includes(gForm) && gConf >= 0.7;
  const extractorWeak = !eFormKnown || eConf < FORM_NEAR_CONF;
  const useGeminiForm = gFormKnown && (geminiSaysRitual || (extractorWeak && gConf >= 0.7));

  const gMotif = String(g.motifFamily || "").trim().toLowerCase();
  const gMotifKnown = Boolean(OBJECT_MOTIF_TH[gMotif]);
  const eMotif = String(e?.motifFamily || "").trim().toLowerCase();
  const eMotifKnown = Boolean(OBJECT_MOTIF_TH[eMotif]);
  const gMotifConf = Number(g.motifConfidence) || 0;
  const eMotifConf = Number(e?.motifConfidence) || 0;
  const useGeminiMotif = gMotifKnown && (!eMotifKnown || gMotifConf > eMotifConf);

  const flags = Array.isArray(e?.sensitiveFlags) ? e.sensitiveFlags : [];

  return {
    objectForm: useGeminiForm ? gForm : (e?.objectForm ?? "unknown"),
    formConfidence: useGeminiForm ? gConf : (e?.formConfidence ?? 0),
    motifFamily: useGeminiMotif ? gMotif : (e?.motifFamily ?? "unknown"),
    motifConfidence: useGeminiMotif ? gMotifConf : (e?.motifConfidence ?? 0),
    sensitiveFlags: flags,
  };
}

/**
 * เกตของใช้พิธี (กบ 18 ก.ค. — ธูปหวยไม่ควรได้คะแนนพลัง):
 * มั่นใจสูงว่าธูป/เทียน → reject (ไม่อ่านพลัง คืนสิทธิ์) · ก้ำกึ่ง → ask_angle (ขอรูปมุมใหม่ 1 รอบ)
 * นอกนั้น pass — เกณฑ์ reject สูง (0.85) กันพระจริงโดนลูกหลง
 * ข้อความหาลูกค้าห้ามฟันธงว่าเป็นธูป/เทียน (กบสั่ง) — reason ใช้ log ภายในเท่านั้น
 */
export const RITUAL_REJECT_CONF = 0.85;
export const RITUAL_ASK_ANGLE_MIN_CONF = 0.5;
const RITUAL_CONSUMABLE_FORMS = new Set(["incense_stick", "candle"]);

/**
 * @param {object|null|undefined} raw ผลดิบจาก extractor หรือ objectUnderstanding ที่ normalize แล้ว (ช่องชื่อเดียวกัน)
 * @returns {{ action: "pass"|"reject"|"ask_angle", reason: string }}
 */
export function evaluateRitualScanGate(raw) {
  const u = buildObjectUnderstanding(raw);
  if (!u) return { action: "pass", reason: "no_understanding" };
  if (!RITUAL_CONSUMABLE_FORMS.has(u.objectForm)) {
    return { action: "pass", reason: "not_ritual_consumable" };
  }
  if (u.formConfidence >= RITUAL_REJECT_CONF) {
    return { action: "reject", reason: `${u.objectForm}:${u.formConfidence}` };
  }
  if (u.formConfidence >= RITUAL_ASK_ANGLE_MIN_CONF) {
    return { action: "ask_angle", reason: `${u.objectForm}:${u.formConfidence}` };
  }
  return { action: "pass", reason: `low_conf:${u.formConfidence}` };
}

/** คำต้องห้ามใน tips เมื่อวัตถุพก/สวมไม่ได้ (ธูป/เทียน/รูปตั้ง/ผ้ายันต์/มีดหมอ) */
const CARRY_WEAR_TIP_RE =
  /พกติดตัว|พกไว้|พกพา|ห้อยคอ|คล้องคอ|ใส่กระเป๋า|สวมใส่|สวมไว้|ติดตัวไว้|ติดกระเป๋า/;

/**
 * กรอง tips ที่แนะนำให้พก/สวม ออกจากรายการ เมื่อ usageProfile บอกว่าพก/สวมไม่ได้
 * ปลอดภัยต่อ flow อื่น: ถ้ากรองแล้วว่างเปล่า → คืน list เดิม (ไม่ทำรายงานโหว่)
 * @param {string[]} lines
 * @param {{ canCarry?: boolean, canWear?: boolean } | null | undefined} usageProfile
 * @returns {string[]}
 */
export function filterTipsForUsageProfile(lines, usageProfile) {
  if (!Array.isArray(lines) || lines.length === 0) return Array.isArray(lines) ? lines : [];
  if (!usageProfile || (usageProfile.canCarry !== false && usageProfile.canWear !== false)) {
    return lines;
  }
  const kept = lines.filter((l) => !CARRY_WEAR_TIP_RE.test(String(l || "")));
  return kept.length > 0 ? kept : lines;
}

/**
 * Flex “short” copy: offline fallback mirrors `energy_copy_templates` final seed (master v2).
 * LINE summary-first prefers DB via `resolveEnergyCopyForFlex`; this module supplies fallback + guard replacements.
 */
import {
  inferEnergyCategoryCodeFromMainEnergy,
  normalizeObjectFamilyForEnergyCopy,
} from "../energyCategoryResolve.util.js";
import { lineContainsEnergyCopyAvoidWord } from "./energyCopyAvoidWords.util.js";
import { pickVariantAvoidingRepeat } from "../wordingVariantGuard.util.js";

/** Aligned with {@link ../flexSummarySurface.util.js FLEX_SUMMARY_HEADLINE_MAX} (guardrail only). */
export const FLEX_SHORT_HEADLINE_MAX = 42;
export const FLEX_SHORT_FIT_MAX = 64;
export const FLEX_SHORT_BULLET_MAX = 38;

/**
 * Known tails from production when long strings were hard-truncated (mid-word / mid-phrase).
 * Used to reject legacy stored payloads so we recompose instead of re-truncating.
 */
export const TRUNCATION_ARTIFACT_SUFFIXES = [
  "ต้องการคว",
  "ทำงานห",
  "เสริมควา",
  "ให้เท่าก",
  "การเสริมควา",
  "สำหรับคว",
  "เสริมคว",
  "ความห",
];

/**
 * @param {string} line
 * @returns {boolean}
 */
export function lineLooksLikeThaiTruncationArtifact(line) {
  const t = String(line || "").trim();
  if (!t) return false;
  return TRUNCATION_ARTIFACT_SUFFIXES.some((suf) => t.endsWith(suf));
}

/**
 * @param {string} seed
 * @param {readonly string[]} arr
 * @returns {string}
 */
export function stablePick(arr, seed) {
  if (!arr?.length) return "";
  let h = 0;
  const x = String(seed || "s");
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

/**
 * @param {string} [wf]
 * @returns {string} one of protection | shielding | authority | attraction | ''
 */
export function normalizeWordingFamilyKey(wf) {
  const s = String(wf || "")
    .trim()
    .toLowerCase();
  const aliases = {
    protection: "protection",
    shielding: "shielding",
    authority: "authority",
    attraction: "attraction",
    premium: "authority",
    authoritative: "authority",
    thai_mystic: "authority",
    mystic_th: "authority",
    conversion: "authority",
    conversion_focus: "authority",
    cta_focus: "authority",
  };
  if (aliases[s]) return aliases[s];
  if (["protection", "shielding", "authority", "attraction"].includes(s)) {
    return s;
  }
  return "";
}

/**
 * Master v2 mirror of Supabase seed (`20260405120000_energy_copy_master_v2_final.sql`).
 * Thai branch: thai_amulet / thai_talisman / global_symbol / generic → same lines.
 * @type {Record<string, Record<string, { headline: string, fit: string, bullets: [string, string] }>>}
 */
const FALLBACK_MASTER_V2 = {
  thai: {
    luck_fortune: {
      headline: "เด่นเรื่องโชคลาภและทางเงิน",
      fit: "เหมาะกับช่วงที่อยากให้เรื่องเงินและโอกาสเริ่มเดิน",
      bullets: ["ช่วยเปิดทางเรื่องเงินและโอกาส", "ช่วยดันจังหวะดีให้เข้ามาไวขึ้น"],
    },
    metta: {
      headline: "เด่นเรื่องเมตตาและคนเปิดรับ",
      fit: "เหมาะกับช่วงที่ต้องคุยกับคนเยอะ เจรจาให้ลื่นขึ้น",
      bullets: ["ช่วยให้คนเปิดรับและเข้าหาง่ายขึ้น", "ช่วยให้เจรจาแล้วไม่ติดขัดง่าย"],
    },
    protection: {
      headline: "เด่นเรื่องคุ้มครองและกันเรื่องไม่ดี",
      fit: "เหมาะกับคนที่อยากมีของติดตัวไว้กันแรงลบ",
      bullets: ["ช่วยกันแรงลบและแรงปะทะรอบตัว", "ช่วยให้ฟีลเหมือนมีเกราะคอยกันอยู่"],
    },
    confidence: {
      headline: "เด่นเรื่องบารมีและน้ำหนักในตัว",
      fit: "เหมาะกับช่วงที่ต้องยืนให้ชัดและพูดให้คนฟัง",
      bullets: ["ช่วยให้พูดแล้วมีน้ำหนักขึ้น", "ช่วยให้คนมองข้ามได้ยากขึ้น"],
    },
  },
  crystal: {
    money_work: {
      headline: "เด่นเรื่องเงิน งาน และโอกาส",
      fit: "เหมาะกับช่วงที่อยากให้เรื่องงานกับรายได้เริ่มขยับ",
      bullets: ["ช่วยให้เห็นโอกาสใหม่ได้ไวขึ้น", "ช่วยดันจังหวะดีเรื่องงานและรายได้"],
    },
    charm: {
      headline: "เด่นเรื่องเสน่ห์และแรงดึงดูด",
      fit: "เหมาะกับช่วงที่อยากให้คนเปิดรับมากขึ้น",
      bullets: ["ช่วยให้คนเข้าหาง่ายขึ้น", "ช่วยให้คุยแล้วบรรยากาศเปิดมากขึ้น"],
    },
    protection: {
      headline: "เด่นเรื่องคุ้มครองและกันแรงลบ",
      fit: "เหมาะกับคนที่ต้องเจอคนเยอะหรือไม่อยากรับพลังแย่ ๆ",
      bullets: ["ช่วยกันแรงลบและแรงปะทะที่ไม่จำเป็น", "ช่วยให้ไม่รับอารมณ์คนอื่นเข้าตัวง่ายเกินไป"],
    },
    /** Rare direct code; usually balance pillar maps to `confidence` for crystal inference. */
    balance: {
      headline: "เด่นเรื่องความสมดุลและตั้งหลักในใจ",
      fit: "เหมาะกับช่วงที่ใจแกว่งหรืออยากให้โทนนิ่งขึ้นแบบไม่ฝืนเกินไป",
      bullets: [
        "ช่วยให้ตอบสนองช้าลงและนิ่งขึ้นเมื่อใจเริ่มวอกแวก",
        "ช่วยประคองจังหวะภายในไม่ให้ไหลตามอารมณ์ง่ายเกินไป",
      ],
    },
    confidence: {
      headline: "เด่นเรื่องบารมีและน้ำหนักในตัว",
      fit: "เหมาะกับช่วงที่ต้องพูดให้คนฟังหรือคุมสถานการณ์",
      bullets: ["ช่วยให้พูดแล้วมีน้ำหนักขึ้น", "ช่วยให้ยืนชัดขึ้นเวลาเจอสถานการณ์กดดัน"],
    },
    luck_fortune: {
      headline: "เด่นเรื่องโชคและจังหวะดี",
      fit: "เหมาะกับช่วงที่อยากให้โอกาสใหม่ ๆ เข้ามาง่ายขึ้น",
      bullets: ["ช่วยให้เจอจังหวะดีได้บ่อยขึ้น", "ช่วยให้โอกาสเข้ามาแบบไม่ฝืดเกินไป"],
    },
    spiritual_growth: {
      headline: "เด่นเรื่องพลังงานสูงและการยกระดับตัวเอง",
      fit: "เหมาะกับช่วงที่อยากเร่งการเปลี่ยนแปลงในชีวิต",
      bullets: [
        "ช่วยกระตุ้นจักระที่ 6 และ 7 และเพิ่มการหยั่งรู้",
        "ช่วยเร่งการเปลี่ยนแปลงให้ขยับชัดขึ้น",
      ],
    },
  },
};

/**
 * Multi-variant banks for categories that over-collapsed to one tone in production.
 * Keys mirror {@link FALLBACK_MASTER_V2} paths (crystal | thai + energy category code).
 * @type {Record<string, Record<string, Array<{ headline: string, fit: string, bullets: [string, string] }>>>}
 */
const VARIANT_BANKS = {
  crystal: {
    protection: [
      {
        headline: "เด่นเรื่องคุ้มครองและกันแรงลบ",
        fit: "เหมาะกับคนที่ต้องเจอคนเยอะหรือไม่อยากรับพลังแย่ ๆ",
        bullets: [
          "ช่วยกันแรงลบและแรงปะทะที่ไม่จำเป็น",
          "ช่วยให้ไม่รับอารมณ์คนอื่นเข้าตัวง่ายเกินไป",
        ],
      },
      {
        headline: "เด่นเรื่องพื้นที่ปลอดภัยและตั้งหลัก",
        fit: "เหมาะกับช่วงที่อยากให้โทนนิ่งและไม่รับพลังรบกวนง่าย",
        bullets: [
          "ช่วยให้รู้สึกมีเขตแดนรอบตัวชัดขึ้น",
          "ช่วยไม่ให้ถูกกระแสรอบข้างดึงไปบ่อย",
        ],
      },
      {
        headline: "เด่นเรื่องเกราะพลังและลดการส่งต่ออารมณ์",
        fit: "เหมาะกับคนที่สัมผัสคนเยอะและอยากให้โทนนิ่งขึ้น",
        bullets: [
          "ช่วยลดการรับพลังหนักโดยไม่รู้ตัว",
          "ช่วยตอบสนองช้าลงเมื่อโดนจี้หรือกดดัน",
        ],
      },
    ],
    balance: [
      {
        headline: "เด่นเรื่องความสมดุลและตั้งหลักในใจ",
        fit: "เหมาะกับช่วงที่ใจแกว่งหรืออยากให้โทนนิ่งขึ้นแบบไม่ฝืนเกินไป",
        bullets: [
          "ช่วยให้ตอบสนองช้าลงและนิ่งขึ้นเมื่อใจเริ่มวอกแวก",
          "ช่วยประคองจังหวะภายในไม่ให้ไหลตามอารมณ์ง่ายเกินไป",
        ],
      },
      {
        headline: "เด่นเรื่องถ่วงโทนและคืนจังหวะให้ร่างกายใจ",
        fit: "เหมาะกับช่วงเหนื่อยแต่ยังต้องลุยต่อแบบไม่พังกลางทาง",
        bullets: [
          "ช่วยให้รู้จักพักจังหวะระหว่างวันมากขึ้น",
          "ช่วยตัดสินได้เย็นลงเมื่อแรงกดสูง",
        ],
      },
    ],
    confidence: [
      {
        headline: "เด่นเรื่องบารมีและน้ำหนักในตัว",
        fit: "เหมาะกับช่วงที่ต้องพูดให้คนฟังหรือคุมสถานการณ์",
        bullets: [
          "ช่วยให้พูดแล้วมีน้ำหนักขึ้น",
          "ช่วยให้ยืนชัดขึ้นเวลาเจอสถานการณ์กดดัน",
        ],
      },
      {
        headline: "เด่นเรื่องความน่าเชื่อถือและภาพลักษณ์หนักแน่น",
        fit: "เหมาะกับงานที่ต้องให้คนรับรู้ว่าคุณจริงจัง",
        bullets: [
          "ช่วยให้การนำเสนอดูมีแกนชัดขึ้น",
          "ช่วยให้คนรับรู้ความตั้งใจง่ายขึ้น",
        ],
      },
      {
        headline: "เด่นเรื่องน้ำหนักสังคมและยืนหยัดในที่ประชุม",
        fit: "เหมาะกับช่วงเจรจา นำทีม หรือถูกจับจ้องหลายฝ่าย",
        bullets: [
          "ช่วยให้พูดแล้วไม่ถูกมองข้ามง่าย",
          "ช่วยรักษาบทบาทกลางแรงกดได้ดีขึ้น",
        ],
      },
    ],
  },
  thai: {
    protection: [
      {
        headline: "เด่นเรื่องคุ้มครองและกันเรื่องไม่ดี",
        fit: "เหมาะกับคนที่อยากมีของติดตัวไว้กันแรงลบ",
        bullets: [
          "ช่วยกันแรงลบและแรงปะทะรอบตัว",
          "ช่วยให้ฟีลเหมือนมีเกราะคอยกันอยู่",
        ],
      },
      {
        headline: "เด่นเรื่องเกราะพลังและเขตแดนส่วนตัว",
        fit: "เหมาะกับช่วงเดินทางหรือเจอคนหมุนเวียนหลากหลาย",
        bullets: [
          "ช่วยกันรับพลังแปลกปลอมเข้าตัวน้อยลง",
          "ช่วยลดความรู้สึกถูกแทรกซึมจากคนรอบข้าง",
        ],
      },
      {
        headline: "เด่นเรื่องกันพลังรบกวนและคืนสงบในแต่ละวัน",
        fit: "เหมาะกับคนรับรู้ไวและเหนื่อยเพราะคนรอบตัวเยอะ",
        bullets: [
          "ช่วยตัดสินใจเย็นลงเมื่อบรรยากาศวุ่น",
          "ช่วยให้หลับสบายขึ้นหลังวันยาว",
        ],
      },
    ],
    confidence: [
      {
        headline: "เด่นเรื่องบารมีและน้ำหนักในตัว",
        fit: "เหมาะกับช่วงที่ต้องยืนให้ชัดและพูดให้คนฟัง",
        bullets: [
          "ช่วยให้พูดแล้วมีน้ำหนักขึ้น",
          "ช่วยให้คนมองข้ามได้ยากขึ้น",
        ],
      },
      {
        headline: "เด่นเรื่องตัวตนและออร่าที่หนักแน่น",
        fit: "เหมาะกับงานหน้าคนและจังหวะถูกจับจ้อง",
        bullets: [
          "ช่วยปรากฏตัวดูน่าเชื่อถือโดยไม่ต้องดัง",
          "ช่วยพูดสั้นแล้วจบง่ายขึ้น",
        ],
      },
      {
        headline: "เด่นเรื่องบารมีในที่ประชุมและการเจรจา",
        fit: "เหมาะกับช่วงคุยหลายฝ่ายหรือโดนคำถามกดดัน",
        bullets: [
          "ช่วยรักษาบทบาทกลางความขัดแย้งได้ดีขึ้น",
          "ช่วยให้ประโยคมีแกนไม่ถูกพรากบทบาทง่าย",
        ],
      },
    ],
  },
};

function getVariantList(branch, code) {
  const vb = VARIANT_BANKS[branch]?.[code];
  if (Array.isArray(vb) && vb.length > 0) return vb;
  const famBranch = FALLBACK_MASTER_V2[branch];
  const surf = famBranch?.[code] || famBranch?.luck_fortune;
  return [
    {
      headline: surf.headline,
      fit: surf.fit,
      bullets: [...surf.bullets],
    },
  ];
}

/**
 * Picks a surface variant (anti-repeat per user) — wording only; category code unchanged.
 * @param {string} categoryCode
 * @param {string} objectFamilyRaw
 * @param {string} [lineUserId]
 * @param {string} [seed]
 * @returns {{ headline: string, fitLine: string, bullets: string[], wordingVariantId: string, wordingBankUsed: string, diversificationApplied: boolean, avoidedRepeat: boolean }}
 */
export function resolveFlexSurfaceVariant(
  categoryCode,
  objectFamilyRaw,
  lineUserId = "",
  seed = "",
) {
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw);
  const branch = fam === "crystal" ? "crystal" : "thai";
  const code = String(categoryCode || "").trim() || "luck_fortune";
  const list = getVariantList(branch, code);
  const bankKey = `${branch}.${code}`;
  const { variantIndex, avoidedRepeat } = pickVariantAvoidingRepeat(
    lineUserId,
    bankKey,
    list.length,
    seed,
  );
  const picked = list[variantIndex];
  const diversificationApplied = list.length > 1 && variantIndex !== 0;

  if (avoidedRepeat) {
    console.log(
      JSON.stringify({
        event: "WORDING_VARIANT_AVOIDED_REPEAT",
        wordingBankUsed: bankKey,
        wordingVariantId: `${bankKey}:v${variantIndex}`,
        variantIndex,
      }),
    );
  }
  if (diversificationApplied) {
    console.log(
      JSON.stringify({
        event: "CATEGORY_DIVERSIFIED",
        wordingBankUsed: bankKey,
        wordingVariantId: `${bankKey}:v${variantIndex}`,
        note: "alternate_sub_angle_same_category",
      }),
    );
  }
  console.log(
    JSON.stringify({
      event: "WORDING_VARIANT_SELECTED",
      wordingBankUsed: bankKey,
      wordingVariantId: `${bankKey}:v${variantIndex}`,
      diversificationApplied,
      avoidedRepeat,
    }),
  );
  console.log(
    JSON.stringify({
      event: "FAMILY_SPECIFIC_COPY_USED",
      wordingBankUsed: bankKey,
      branch,
      energyCategoryCode: code,
    }),
  );

  return {
    headline: picked.headline,
    fitLine: picked.fit,
    bullets: [...picked.bullets],
    wordingVariantId: `${bankKey}:v${variantIndex}`,
    wordingBankUsed: bankKey,
    diversificationApplied,
    avoidedRepeat,
  };
}

/**
 * @param {string} categoryCode
 * @param {string} objectFamilyRaw
 * @returns {{ headline: string, fitLine: string, bullets: string[] }}
 */
export function getFallbackFlexSurfaceLines(categoryCode, objectFamilyRaw) {
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw);
  const branch = fam === "crystal" ? "crystal" : "thai";
  const code = String(categoryCode || "").trim();
  const byBranch = FALLBACK_MASTER_V2[branch];
  const surf = byBranch[code] || byBranch.luck_fortune;
  return {
    headline: surf.headline,
    fitLine: surf.fit,
    bullets: [...surf.bullets],
  };
}

/**
 * @param {object} p
 * @param {string} [p.mainEnergyLabel]
 * @param {string} [p.wordingFamily] — unused (kept for call-site compatibility)
 * @param {string} [p.seed] — unused (kept for stable API)
 * @param {string} [p.objectFamily] — pipeline slug; drives Thai vs crystal master set
 * @param {string} [p.energyCategoryCode] — when set, used instead of inferring from label
 * @param {"general"|"spiritual_growth"|null|""} [p.crystalMode] — crystal high-vibration hint for offline fallback rows
 * @param {string} [p.lineUserId] — anti-repeat key (per user)
 * @returns {{ headlineShort: string, fitReasonShort: string, bulletsShort: string[], wordingMeta?: object }}
 */
export function composeFlexShortSurface({
  mainEnergyLabel,
  wordingFamily: _wordingFamily,
  seed: _seed,
  objectFamily = "",
  energyCategoryCode = "",
  crystalMode = "",
  lineUserId = "",
}) {
  void _wordingFamily;
  const label = String(mainEnergyLabel || "").trim() || "เสริมพลัง";
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamily);
  let code = String(energyCategoryCode || "").trim();
  if (!code) {
    code = inferEnergyCategoryCodeFromMainEnergy(label, objectFamily);
  }
  if (fam === "crystal" && String(crystalMode || "").trim() === "spiritual_growth") {
    code = "spiritual_growth";
  }
  const seedFinal = String(_seed || label || "flex");
  const resolved = resolveFlexSurfaceVariant(code, objectFamily, lineUserId, seedFinal);
  return {
    headlineShort: resolved.headline,
    fitReasonShort: resolved.fitLine,
    bulletsShort: resolved.bullets.slice(0, 2),
    wordingMeta: {
      wordingVariantId: resolved.wordingVariantId,
      wordingBankUsed: resolved.wordingBankUsed,
      diversificationApplied: resolved.diversificationApplied,
      avoidedRepeat: resolved.avoidedRepeat,
    },
  };
}

/**
 * Wording-layer teasers (same lines as Flex offline fallback).
 * @param {object} p
 * @param {string} p.energyType — canonical main label (e.g. ENERGY_TYPES)
 * @param {string} [p.wordingFamily]
 * @param {string} p.seed
 * @param {string} [p.objectFamily]
 * @returns {{ flexHeadline: string, flexBullets: string[] }}
 */
export function composeFlexWordingTeasers({
  energyType,
  wordingFamily: _wordingFamily,
  seed: _seed,
  objectFamily = "",
  energyCategoryCode = "",
  crystalMode = "",
}) {
  void _wordingFamily;
  void _seed;
  const s = composeFlexShortSurface({
    mainEnergyLabel: energyType,
    objectFamily,
    energyCategoryCode,
    crystalMode,
  });
  return {
    flexHeadline: s.headlineShort,
    flexBullets: s.bulletsShort,
  };
}

/**
 * @param {object} s
 * @param {string} [s.headlineShort]
 * @param {string} [s.fitReasonShort]
 * @param {string[]} [s.bulletsShort]
 * @returns {boolean} true if safe to use stored summary fields as-is
 */
export function storedFlexSummaryLooksComplete(s) {
  const h = String(s?.headlineShort || "").trim();
  const f = String(s?.fitReasonShort || "").trim();
  const bullets = Array.isArray(s?.bulletsShort)
    ? s.bulletsShort.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (!h || bullets.length < 1) return false;
  if (h.length > FLEX_SHORT_HEADLINE_MAX + 2) return false;
  if (f.length > FLEX_SHORT_FIT_MAX + 2) return false;
  if (bullets.some((b) => b.length > FLEX_SHORT_BULLET_MAX + 2)) return false;
  const all = [h, f, ...bullets].filter(Boolean);
  for (const line of all) {
    if (lineLooksLikeThaiTruncationArtifact(line)) return false;
    if (lineContainsEnergyCopyAvoidWord(line)) return false;
  }
  return true;
}

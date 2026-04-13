import { fnv1a32 } from "../moldavite/moldaviteScores.util.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
  crystalBraceletCompatibilityBandFromPercent,
} from "./crystalBraceletScores.util.js";

/**
 * Crystal-bracelet owner profile — deterministic from DOB (when present) + fit seed.
 * Reuses the same fnv1a32 / axis-order ideas as Moldavite owner helpers, but wording and
 * surface copy are neutral พลังรวม / จังหวะชีวิต only (no Moldavite semantics).
 *
 * @param {{
 *   birthdateUsed?: string|null,
 *   displayCompatibilityPercent?: number|null,
 *   stableSeed?: string,
 *   stoneScores: Record<string, number>,
 *   ownerAxisScores: Record<string, number>,
 *   primaryAxis: string,
 *   alignAxisKey: string,
 * }} input — `displayCompatibilityPercent` must match `summary.compatibilityPercent` (SSOT); do not pass internal `ownerFit.score`
 * @returns {{
 *   version: "1",
 *   identityPhrase: string,
 *   ownerChips: string[],
 *   ownerAxes: Record<string, number>,
 *   alignAxisKey: string,
 *   tensionAxisKey: string,
 *   glyphSeed: number,
 *   profileSummaryShort: string,
 *   derivationNote: string,
 *   hasBirthdate: boolean,
 * }}
 */
export function deriveCrystalBraceletOwnerProfile(input) {
  const dobStr = String(input.birthdateUsed || "").trim();
  const stable = String(input.stableSeed || "").trim() || "scan";
  const seed = dobStr || `no_dob|${stable}`;

  const stoneScores = input.stoneScores || {};
  const ownerAxisScores = input.ownerAxisScores || {};

  /** แกนที่ |จังหวะผู้สวม − พลังกำไล| สูงสุด — ตึงสุดเมื่อเทียบกับโทนกำไล */
  let tensionAxisKey = CRYSTAL_BRACELET_AXIS_ORDER[0];
  let maxGap = -1;
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const g = Math.abs(
      (Number(ownerAxisScores[k]) || 0) - (Number(stoneScores[k]) || 0),
    );
    if (g > maxGap) {
      maxGap = g;
      tensionAxisKey = k;
    }
  }

  const alignAxisKey =
    String(input.alignAxisKey || "").trim() || "charm_attraction";
  const primaryAxis =
    String(input.primaryAxis || "").trim() || "charm_attraction";

  const alignLabel =
    CRYSTAL_BRACELET_AXIS_LABEL_THAI[alignAxisKey] || alignAxisKey;
  const tensionLabel =
    CRYSTAL_BRACELET_AXIS_LABEL_THAI[tensionAxisKey] || tensionAxisKey;
  const primaryLabel =
    CRYSTAL_BRACELET_AXIS_LABEL_THAI[primaryAxis] || primaryAxis;

  const hId = fnv1a32(`${seed}|cb_identity_phrase_v2`);
  const primaryMatchesAlign = primaryAxis === alignAxisKey;

  /** @type {string[]} */
  const identityBankAligned = [
    `ช่วงนี้จังหวะของคุณไปทาง${alignLabel}สอดคล้องกับกำไลเส้นนี้มากที่สุด`,
    `พลังหลักของกำไลและจังหวะของคุณมาบรรจบกันที่${alignLabel}เด่นที่สุด`,
    `ตอนนี้คุณรับพลังด้าน${alignLabel}จากกำไลเส้นนี้ได้อย่างเป็นธรรมชาติ`,
    `ช่วงนี้จังหวะของคุณรับพลังด้าน${alignLabel}จากกำไลเส้นนี้ได้ง่ายที่สุด`,
    `ภาพรวมของคุณค่อนข้างเข้ากับพลังด้าน${alignLabel}ของกำไลในช่วงนี้`,
    `เมื่อเทียบกับทุกด้าน จังหวะของคุณตอบรับพลังด้าน${alignLabel}ได้ชัดที่สุด`,
    `ตอนนี้คุณเชื่อมกับพลังด้าน${alignLabel}ของกำไลได้ง่ายกว่าด้านอื่น`,
    `กำไลเส้นนี้ส่งแรงหลักไปทาง${alignLabel} และจังหวะของคุณรับด้าน${alignLabel}ได้ดีที่สุด`,
  ];

  /** @type {string[]} */
  const identityBankSplit = [
    `ช่วงนี้จังหวะของคุณรับพลังด้าน${alignLabel}จากกำไลเส้นนี้ได้ง่ายที่สุด`,
    `กำไลเส้นนี้เด่นด้าน${primaryLabel} ส่วนจังหวะของคุณไปทาง${alignLabel}มากที่สุด`,
    `ภาพรวมของคุณค่อนข้างเข้ากับพลังด้าน${alignLabel}ของกำไลในช่วงนี้`,
    `ตอนนี้จังหวะของคุณขยับเข้าหาด้าน${alignLabel}ได้เป็นธรรมชาติที่สุด`,
    `โทนพลังที่คุณรับได้ง่ายสุดตอนนี้คือ${alignLabel} ขณะที่กำไลเด่นด้าน${primaryLabel}`,
    `เมื่อเทียบกับทุกด้าน จังหวะของคุณตอบรับพลังด้าน${alignLabel}ได้ชัดที่สุด`,
    `กำไลเส้นนี้ส่งแรงหลักไปทาง${primaryLabel} และจังหวะของคุณรับด้าน${alignLabel}ได้ดีที่สุด`,
    `แม้กำไลจะเด่นด้าน${primaryLabel} แต่ตอนนี้คุณเชื่อมกับด้าน${alignLabel}ได้มากที่สุด`,
    `กำไลเส้นนี้เด่นด้าน${primaryLabel} แต่จังหวะของคุณรับด้าน${alignLabel}ได้ง่ายที่สุด`,
    `พลังหลักของกำไลไปทาง${primaryLabel} ขณะที่จังหวะของคุณตอบรับด้าน${alignLabel}ชัดกว่า`,
  ];

  const identityBank = primaryMatchesAlign
    ? identityBankAligned
    : identityBankSplit;
  const identityPhrase = identityBank[hId % identityBank.length];

  const chipBank = [
    "ชอบเห็นภาพรวมก่อนตัดสินใจ",
    "รับสัญญาณรอบตัวได้ไว",
    "เมื่อกดดันจะยึดโครงสร้างมากขึ้น",
    "ปรับตัวได้ดีเมื่อภาพเริ่มชัด",
    "ให้ความสำคัญกับสมดุลในแต่ละวัน",
    "ชอบจัดลำดับสิ่งสำคัญก่อนลงมือ",
    "พร้อมลองทางใหม่เมื่อจังหวะเหมาะ",
    "มักดูทั้งเหตุผลและความรู้สึกควบคู่กัน",
    "ต้องการความชัดก่อนเดินหน้าเต็มตัว",
    "ฟื้นจังหวะตัวเองได้ดีเมื่อได้พักพอ",
  ];
  const nChipsTarget = 2 + (fnv1a32(`${seed}|cb_chips_n_v2`) % 2);
  const hCh = fnv1a32(`${seed}|cb_chips_v2`);
  /** @type {string[]} */
  const rawChips = [];
  for (let i = 0; i < nChipsTarget; i++) {
    rawChips.push(chipBank[(hCh + i * 17 + (i * i)) % chipBank.length]);
  }
  let ownerChips = [...new Set(rawChips)];
  while (ownerChips.length < 2) {
    ownerChips.push(
      chipBank[(hCh + ownerChips.length * 31) % chipBank.length],
    );
    ownerChips = [...new Set(ownerChips)];
  }
  ownerChips = ownerChips.slice(0, Math.min(3, nChipsTarget));

  const compatPct =
    input.displayCompatibilityPercent != null &&
    Number.isFinite(Number(input.displayCompatibilityPercent))
      ? Math.round(Number(input.displayCompatibilityPercent))
      : null;
  const compatBand =
    compatPct != null
      ? crystalBraceletCompatibilityBandFromPercent(compatPct)
      : "";

  const bandFallback = compatBand || "เข้ากันในระดับพอดี";
  const profileSummaryShort = dobStr
    ? primaryMatchesAlign
      ? `ช่วงนี้คุณรับพลังด้าน${alignLabel}ได้ตรงกับกำไลค่อนข้างมาก และยังต้องค่อย ๆ จูนเรื่อง${tensionLabel} โดยรวมถือว่า${bandFallback}`
      : `ตอนนี้คุณรับพลังด้าน${alignLabel}ได้ง่ายที่สุด แม้กำไลจะเด่นด้าน${primaryLabel} และยังต้องค่อย ๆ จูนเรื่อง${tensionLabel} โดยรวมถือว่า${bandFallback}`
    : `ตอนนี้แนวพลังของคุณไปทาง${alignLabel}มากที่สุด และยังต้องค่อย ๆ จูนเรื่อง${tensionLabel}`;

  const derivationNote = dobStr
    ? "ข้อความส่วนนี้ใช้วันเกิดและภาพรวมความเข้ากันมาช่วยอ่านจังหวะของคุณเทียบกับพลังรวมของกำไล"
    : "ข้อความส่วนนี้ยังอ้างอิงจากโครงพลังของรายงานเป็นหลัก เพราะยังไม่มีวันเกิดในระบบ";

  const glyphSeed = fnv1a32(`${seed}|cb_glyph_v1`) >>> 0;

  /** @type {Record<string, number>} */
  const ownerAxes = {};
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    ownerAxes[k] = Math.round(
      Math.max(0, Math.min(100, Number(ownerAxisScores[k]) || 0)),
    );
  }

  return {
    version: "1",
    identityPhrase,
    ownerChips,
    ownerAxes,
    alignAxisKey,
    tensionAxisKey,
    glyphSeed,
    profileSummaryShort,
    derivationNote,
    hasBirthdate: Boolean(dobStr),
  };
}

/**
 * One-line Flex teaser (summary-first only).
 * @param {ReturnType<typeof deriveCrystalBraceletOwnerProfile>} op
 * @returns {string}
 */
export function crystalBraceletOwnerProfileFlexTeaser(op) {
  if (!op || typeof op !== "object") return "";
  const align =
    CRYSTAL_BRACELET_AXIS_LABEL_THAI[op.alignAxisKey] || op.alignAxisKey || "";
  const tension =
    CRYSTAL_BRACELET_AXIS_LABEL_THAI[op.tensionAxisKey] ||
    op.tensionAxisKey ||
    "";
  const core = `รับพลังด้าน${align}ได้ง่าย · ค่อย ๆ จูนเรื่อง${tension}`;
  return core.length > 56 ? `${core.slice(0, 53)}…` : core;
}

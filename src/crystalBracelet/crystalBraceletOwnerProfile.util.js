import { fnv1a32 } from "../moldavite/moldaviteScores.util.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
} from "./crystalBraceletScores.util.js";

/**
 * Crystal-bracelet owner profile — deterministic from DOB (when present) + fit seed.
 * Reuses the same fnv1a32 / axis-order ideas as Moldavite owner helpers, but wording and
 * surface copy are neutral “พลังรวม / มิติชีวิต” only (no Moldavite semantics).
 *
 * @param {{
 *   birthdateUsed?: string|null,
 *   ownerFitScore?: number|null,
 *   stableSeed?: string,
 *   stoneScores: Record<string, number>,
 *   ownerAxisScores: Record<string, number>,
 *   primaryAxis: string,
 *   alignAxisKey: string,
 * }} input
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

  /** แกนที่ |จังหวะผู้สวม − พลังกำไล| สูงสุด — “ตึง” สุดเมื่อเทียบกับโทนกำไล */
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

  const alignAxisKey = String(input.alignAxisKey || "").trim() || "protection";
  const primaryAxis = String(input.primaryAxis || "").trim() || "protection";

  const alignLabel =
    CRYSTAL_BRACELET_AXIS_LABEL_THAI[alignAxisKey] || alignAxisKey;
  const tensionLabel =
    CRYSTAL_BRACELET_AXIS_LABEL_THAI[tensionAxisKey] || tensionAxisKey;
  const primaryLabel =
    CRYSTAL_BRACELET_AXIS_LABEL_THAI[primaryAxis] || primaryAxis;

  const hId = fnv1a32(`${seed}|cb_identity_phrase_v1`);
  /** ประโยคบอกตัวตน — โทนกลาง ไม่เชิงพิธีกรรม */
  const identityBank = [
    `ตอนนี้จังหวะของคุณใกล้เคียงมิติ “${alignLabel}” ของกำไลมากที่สุดเมื่อเทียบทุกแกน`,
    `ภาพรวม: พลังกำไลเน้น “${primaryLabel}” · จังหวะคุณไปในทาง “${alignLabel}” มากที่สุด`,
    `เมื่อเทียบทุกมิติ จังหวะคุณไปในทาง “${alignLabel}” · จุดที่ห่างจากโทนกำไลมากสุดคือ “${tensionLabel}”`,
    `โฟกัสช่วงนี้: ใกล้เคียง “${alignLabel}” มากที่สุด · ส่วนที่ต้องดูเป็นพิเศษคือ “${tensionLabel}”`,
    `สรุปสั้น ๆ: ใกล้ “${alignLabel}” · ช่องว่างใหญ่สุดอยู่ที่มิติ “${tensionLabel}”`,
  ];
  const identityPhrase = identityBank[hId % identityBank.length];

  const chipBank = [
    "ชอบเห็นภาพชัดก่อนปรับจังหวะ",
    "ตอบสนองต่อสัญญาณรอบตัวค่อนข้างไว",
    "เวลากดดันจะยึดโครงสร้างมากขึ้น",
    "ปรับขั้นตอนได้เมื่อมั่นใจในภาพรวม",
    "แบ่งโฟกัสระหว่างงานกับพักผ่อนเป็นจังหวะ ๆ",
    "ลองทางเลือกใหม่ได้เมื่อรู้สึกพร้อม",
    "ใส่ใจความสมดุลของพลังในแต่ละวัน",
    "ชอบเริ่มจากลำดับงานที่ชัดเจน",
  ];
  const nChips = 2 + (fnv1a32(`${seed}|cb_chips_n_v1`) % 3);
  const hCh = fnv1a32(`${seed}|cb_chips_v1`);
  /** @type {string[]} */
  const rawChips = [];
  for (let i = 0; i < nChips; i++) {
    rawChips.push(chipBank[(hCh + i * 17 + (i * i)) % chipBank.length]);
  }
  const ownerChips = [...new Set(rawChips)].slice(0, Math.max(2, nChips));
  while (ownerChips.length < 2) {
    ownerChips.push(
      chipBank[
        (hCh + ownerChips.length * 31) % chipBank.length
      ],
    );
  }

  const fit =
    input.ownerFitScore != null &&
    Number.isFinite(Number(input.ownerFitScore))
      ? Math.round(Number(input.ownerFitScore))
      : null;

  const profileSummaryShort = dobStr
    ? `ใกล้มิติ${alignLabel} · ช่องต่างมากสุดที่${tensionLabel}${
        fit != null ? ` · เข้ากัน ${fit}` : ""
      }`
    : `ใกล้มิติ${alignLabel} · ช่องต่างมากสุดที่${tensionLabel} · อ้างอิงรหัสรายงาน`;

  const derivationNote = dobStr
    ? "สรุปจากวันเกิดและคะแนนเข้ากันแบบจำลองเพื่อเทียบกับพลังรวมของกำไล ไม่ใช่การทำนายชะตาแบบเต็มระบบ"
    : "ยังไม่มีวันเกิดในระบบ — ใช้รหัสรายงานเป็นฐานจำลองจังหวะแทน";

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
  const core = `ใกล้ ${align} · ดู ${tension}`;
  return core.length > 52 ? `${core.slice(0, 49)}…` : core;
}

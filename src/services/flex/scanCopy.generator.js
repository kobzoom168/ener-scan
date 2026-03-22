/**
 * Assembles `scanCopy` from config + scan inputs.
 * All wording: `scanCopy.config.js` · logic: `scanCopy.utils.js`
 * Tone: `docs/ENER_SYSTEM_TONE_GUIDE.md`
 */
import {
  CAP_MAIN_LABEL,
  CAP_MAIN_LABEL_ALT,
  ENERGY_TYPES,
} from "./scanCopy.config.js";
import {
  MAIN_LABEL_ALT_BY_TONE,
  MAIN_LABEL_BY_TONE,
} from "./scanCopy.mainLabelsByTone.js";
import {
  getSummaryPair,
  pickEffect,
  pickFeel,
  pickUseCase,
  resolveEnergyType,
  resolveScoreTier,
} from "./scanCopy.utils.js";
import {
  cleanLine,
  safeThaiCut,
  sanitizeBulletLines,
  sanitizeFlexDisplayText,
} from "./flex.utils.js";
import { getAgeTonePresetFromBirthdate } from "./ageTone.util.js";
import {
  compatibilityToBucket,
  getRetentionMicrocopy,
} from "./scanCopy.retentionTone.js";
import { deriveGoalMapping } from "./scanCopy.goalMapping.js";
import { resolveScanToneLevel } from "./scanCopy.toneLevel.js";

export { SCAN_COPY_CONFIG_VERSION } from "./scanCopy.config.js";
export { resolveEnergyType, resolveScoreTier } from "./scanCopy.utils.js";

function capMainLabel(s, maxLen) {
  const t = cleanLine(s);
  if (!t) return "";
  if (t.length <= maxLen) return sanitizeFlexDisplayText(t);
  return sanitizeFlexDisplayText(safeThaiCut(t, maxLen));
}

/**
 * @param {{
 *   mainEnergy?: string,
 *   energyScore?: string,
 *   scoreNumeric?: number|null,
 *   compatibility?: string,
 *   personality?: string,
 *   tone?: string,
 *   hidden?: string,
 *   birthdate?: string|null,
 *   tonePreset?: 'youthful'|'warm'|'mystic',
 *   scanToneLevel?: import('./scanCopy.toneLevel.js').ScanToneLevel,
 *   birthdateSignals?: unknown,
 *   objectSignals?: unknown,
 *   display?: Record<string, unknown>,
 * }} input
 */
export function generateScanCopy(input) {
  const mainEnergy = input.mainEnergy ?? "-";
  const energyType = resolveEnergyType(mainEnergy);
  const tier = resolveScoreTier(input.scoreNumeric);

  const scanToneLevel = resolveScanToneLevel(input);

  const tonePreset =
    input.tonePreset ||
    getAgeTonePresetFromBirthdate(input.birthdate).tonePreset;
  const compatBucket = compatibilityToBucket(input.compatibility);
  const retention = getRetentionMicrocopy({
    tonePreset,
    scanToneLevel,
    energyType,
    tier,
    compatBucket,
  });

  const goals = deriveGoalMapping({
    mainEnergy: input.mainEnergy,
    energyType,
    scoreNumeric: input.scoreNumeric,
    tier,
    scanToneLevel,
  });

  console.log("[FLEX_AGE_TONE]", { tonePreset, scanToneLevel });

  const labelMap =
    MAIN_LABEL_BY_TONE[scanToneLevel] || MAIN_LABEL_BY_TONE.standard;
  const labelAltMap =
    MAIN_LABEL_ALT_BY_TONE[scanToneLevel] || MAIN_LABEL_ALT_BY_TONE.standard;
  const label0 = labelMap[energyType] || labelMap[ENERGY_TYPES.BOOST];
  const labelAlt0 =
    labelAltMap[energyType] || labelAltMap[ENERGY_TYPES.BOOST];
  const [line1, line2] = getSummaryPair(energyType, tier, scanToneLevel);

  const mainEnergyLabel = capMainLabel(label0, CAP_MAIN_LABEL) || label0;
  const mainEnergyLabelAlt = capMainLabel(labelAlt0, CAP_MAIN_LABEL_ALT) || labelAlt0;
  const mainEnergyLine1 = sanitizeFlexDisplayText(line1);
  const mainEnergyLine2 = sanitizeFlexDisplayText(line2);

  const feelShort = pickFeel(energyType, tier, input.personality ?? "-", scanToneLevel);
  const useCaseShort = pickUseCase(energyType, tier, input.tone ?? "-", scanToneLevel);
  const effectShort = pickEffect(energyType, tier, input.hidden ?? "-", scanToneLevel);

  const display = input.display || {};

  const overviewMedium = display.overviewForFlex ?? "";
  const fitReasonMedium = display.fitReasonForFlex ?? "";
  const closingMedium = display.closingForFlex ?? "";

  const supportBullets = Array.isArray(display.supportTopics)
    ? sanitizeBulletLines(display.supportTopics, 26)
    : [];
  const suitableBullets = Array.isArray(display.suitable)
    ? sanitizeBulletLines(display.suitable, 26)
    : [];
  const notStrongMedium = cleanLine(display.notStrong || "") || "";
  const usageGuideMedium = cleanLine(display.usageGuide || "") || "";

  return {
    summary: {
      mainEnergyLabel,
      /** Prefer for `buildScanFlexAltText` — shorter, notification-friendly. */
      mainEnergyLabelAlt,
      mainEnergyLine1,
      mainEnergyLine2,
    },
    traits: {
      feelShort,
      useCaseShort,
      effectShort,
    },
    reading: {
      overviewMedium,
      fitReasonMedium,
      closingMedium,
    },
    usage: {
      supportBullets,
      suitableBullets,
      notStrongMedium,
      usageGuideMedium,
    },
    /** Short retention copy only; does not replace parsed reading body. */
    retention: {
      tonePreset,
      scanToneLevel,
      energyNickname: retention.energyNickname,
      retentionHook: retention.retentionHook,
      nextScanCta: retention.nextScanCta,
    },
    /** Deterministic life-goal layer (additive; interpretive). */
    goals,
  };
}

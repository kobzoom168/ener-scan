/**
 * Assembles `scanCopy` from config + scan inputs.
 * All wording: `scanCopy.config.js` · logic: `scanCopy.utils.js`
 * Tone: `docs/ENER_SYSTEM_TONE_GUIDE.md`
 */
import {
  CAP_MAIN_LABEL,
  CAP_MAIN_LABEL_ALT,
  ENERGY_TYPES,
  MAIN_LABEL,
  MAIN_LABEL_ALT,
} from "./scanCopy.config.js";
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
 *   birthdateSignals?: unknown,
 *   objectSignals?: unknown,
 *   display?: Record<string, unknown>,
 * }} input
 */
export function generateScanCopy(input) {
  const mainEnergy = input.mainEnergy ?? "-";
  const energyType = resolveEnergyType(mainEnergy);
  const tier = resolveScoreTier(input.scoreNumeric);

  const label0 = MAIN_LABEL[energyType] || MAIN_LABEL[ENERGY_TYPES.BOOST];
  const labelAlt0 = MAIN_LABEL_ALT[energyType] || MAIN_LABEL_ALT[ENERGY_TYPES.BOOST];
  const [line1, line2] = getSummaryPair(energyType, tier);

  const mainEnergyLabel = capMainLabel(label0, CAP_MAIN_LABEL) || label0;
  const mainEnergyLabelAlt = capMainLabel(labelAlt0, CAP_MAIN_LABEL_ALT) || labelAlt0;
  const mainEnergyLine1 = sanitizeFlexDisplayText(line1);
  const mainEnergyLine2 = sanitizeFlexDisplayText(line2);

  const feelShort = pickFeel(energyType, tier, input.personality ?? "-");
  const useCaseShort = pickUseCase(energyType, tier, input.tone ?? "-");
  const effectShort = pickEffect(energyType, tier, input.hidden ?? "-");

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
  };
}

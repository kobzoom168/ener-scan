/**
 * Deterministic Goal Mapping Layer: energy type + score tier → life-goal phrasing + clarity.
 * Additive only; interpretive — not factual guarantees.
 */
import { ENERGY_TYPES, SCORE_TIERS } from "./scanCopy.config.js";
import {
  GOAL_CLARITY_LABEL_THAI,
  GOAL_HEADLINES,
  GOAL_NOT_PRIMARY_HINT,
  GOAL_UNCLEAR,
} from "./scanCopy.goals.config.js";
import { cleanLine } from "./flex.utils.js";

/**
 * @typedef {'clear'|'moderate'|'soft'|'unclear'} GoalClarity
 */

/**
 * @param {string[]} options
 * @param {string} key
 */
function pickDeterministic(options, key) {
  const arr = Array.isArray(options) ? options.filter(Boolean) : [];
  if (arr.length === 0) return "";
  let h = 0;
  const k = String(key || "");
  for (let i = 0; i < k.length; i += 1) {
    h = (h * 31 + k.charCodeAt(i)) % 2147483647;
  }
  return arr[Math.abs(h) % arr.length];
}

/**
 * @param {string} tier
 * @returns {GoalClarity}
 */
function tierToClarity(tier) {
  if (tier === SCORE_TIERS.HIGH) return "clear";
  if (tier === SCORE_TIERS.MEDIUM) return "moderate";
  if (tier === SCORE_TIERS.LOW) return "soft";
  return "unclear";
}

/**
 * @param {'clear'|'moderate'|'soft'} clarityKey
 * @param {string} energyType
 * @param {string} pickKey
 */
function pickGoalHeadline(clarityKey, energyType, pickKey) {
  const block =
    GOAL_HEADLINES[energyType] || GOAL_HEADLINES[ENERGY_TYPES.BOOST];
  const lines = block?.[clarityKey];
  const picked = pickDeterministic(lines || [], pickKey);
  return picked || pickDeterministic(block?.soft || [], pickKey);
}

/**
 * @param {{
 *   mainEnergy?: string,
 *   energyType: string,
 *   scoreNumeric?: number|null,
 *   tier: string,
 * }} p
 * @returns {{
 *   clarity: GoalClarity,
 *   clarityLabelThai: string,
 *   goalHeadline: string,
 *   goalSecondary?: string,
 *   notPrimaryFor?: string,
 * }}
 */
export function deriveGoalMapping({
  mainEnergy,
  energyType,
  scoreNumeric,
  tier,
}) {
  const me = cleanLine(mainEnergy ?? "");
  const scoreOk =
    scoreNumeric != null && Number.isFinite(Number(scoreNumeric));

  const unclearPickKey = `${me}|${tier}|unclear`;

  if (!me || me === "-" || !scoreOk) {
    return {
      clarity: "unclear",
      clarityLabelThai: GOAL_CLARITY_LABEL_THAI.unclear,
      goalHeadline: pickDeterministic(GOAL_UNCLEAR, unclearPickKey),
      goalSecondary: undefined,
      notPrimaryFor: undefined,
    };
  }

  const clarity = tierToClarity(tier);
  if (clarity === "unclear") {
    return {
      clarity: "unclear",
      clarityLabelThai: GOAL_CLARITY_LABEL_THAI.unclear,
      goalHeadline: pickDeterministic(GOAL_UNCLEAR, unclearPickKey),
      goalSecondary: undefined,
      notPrimaryFor: undefined,
    };
  }

  const et = energyType && GOAL_HEADLINES[energyType] ? energyType : ENERGY_TYPES.BOOST;
  const pickKey = `${et}|${tier}|${clarity}`;
  const goalHeadline = pickGoalHeadline(clarity, et, pickKey);
  const notPrimaryFor = GOAL_NOT_PRIMARY_HINT[et];

  return {
    clarity,
    clarityLabelThai: GOAL_CLARITY_LABEL_THAI[clarity],
    goalHeadline,
    goalSecondary: undefined,
    notPrimaryFor,
  };
}

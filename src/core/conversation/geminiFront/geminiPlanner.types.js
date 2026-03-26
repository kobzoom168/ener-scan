/**
 * @typedef {import('./geminiFront.featureFlags.js').GeminiPhase1StateKey} GeminiPhase1StateKey
 */

/**
 * @typedef {{
 *   intent: string,
 *   state_guess: string,
 *   proposed_action: string,
 *   confidence: number,
 *   reply_style: string,
 * }} GeminiPlannerOutput
 */

/**
 * @typedef {{
 *   userId: string,
 *   text: string,
 *   phase1State: import('./geminiFront.featureFlags.js').GeminiPhase1StateKey,
 *   truthSnapshot: Record<string, unknown>,
 * }} PlannerContextInput
 */

export {};

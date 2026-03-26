import {
  TelemetryEvents,
  logTelemetryEvent,
} from "../../telemetry/telemetryEvents.js";

/** @param {Record<string, unknown>} payload */
export function logGeminiPlanner(payload) {
  logTelemetryEvent(TelemetryEvents.GEMINI_FRONT_PLANNER, payload);
}

/** @param {Record<string, unknown>} payload */
export function logGeminiPhrasing(payload) {
  logTelemetryEvent(TelemetryEvents.GEMINI_FRONT_PHRASING, payload);
}

/** @param {Record<string, unknown>} payload */
export function logGeminiValidation(payload) {
  logTelemetryEvent(TelemetryEvents.GEMINI_FRONT_ACTION_VALIDATION, payload);
}

/** @param {Record<string, unknown>} payload */
export function logGeminiOrchestrator(payload) {
  logTelemetryEvent(TelemetryEvents.GEMINI_FRONT_ORCHESTRATOR, payload);
}

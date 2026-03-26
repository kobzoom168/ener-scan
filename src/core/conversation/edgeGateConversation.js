import { evaluateTextEdgeGate } from "../../stores/edgeGate.store.js";
import { TelemetryEvents, logTelemetryEvent } from "../telemetry/telemetryEvents.js";

/**
 * Deterministic edge gate facade (delegates to existing store).
 * @param {{ userId: string, messageId?: string|null, text: string, now?: number }} input
 * @returns {import("./contracts.types.js").EdgeGateDecision}
 */
export function runConversationEdgeGate(input) {
  const res = evaluateTextEdgeGate(input);
  const action = res.action;

  if (action === "ok") {
    return {
      shouldContinue: true,
      edgeGateAction: action,
      normalizedText: String(res.normalizedText || ""),
    };
  }

  if (action === "ignore_empty") {
    logTelemetryEvent(TelemetryEvents.EDGE_GATE_ACTION, {
      userId: input.userId,
      edgeGateAction: action,
      reason: "empty",
    });
    return {
      shouldContinue: false,
      edgeGateAction: action,
      normalizedText: "",
      reason: "empty",
    };
  }

  if (action === "drop_duplicate_event") {
    logTelemetryEvent(TelemetryEvents.DUPLICATE_SUPPRESSED, {
      userId: input.userId,
      edgeGateAction: action,
      messageId: res.messageId,
    });
    return {
      shouldContinue: false,
      edgeGateAction: action,
      normalizedText: String(res.normalizedText || ""),
      reason: res.repeatHint || "duplicate_line_message_id",
    };
  }

  logTelemetryEvent(TelemetryEvents.EDGE_GATE_ACTION, {
    userId: input.userId,
    edgeGateAction: action,
    repeatHint: res.repeatHint,
  });
  return {
    shouldContinue: false,
    edgeGateAction: action,
    normalizedText: String(res.normalizedText || ""),
    reason: res.repeatHint || "suppressed",
  };
}

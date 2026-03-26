import {
  TelemetryEvents,
  logTelemetryEvent,
} from "../../telemetry/telemetryEvents.js";

/**
 * @param {Record<string, unknown>} payload
 */
export function logSlipCheckRequested(payload) {
  logTelemetryEvent(TelemetryEvents.SLIP_CHECK_REQUESTED, payload);
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logSlipCheckAccepted(payload) {
  logTelemetryEvent(TelemetryEvents.SLIP_CHECK_ACCEPTED, payload);
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logSlipCheckRejected(payload) {
  logTelemetryEvent(TelemetryEvents.SLIP_CHECK_REJECTED, payload);
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logSlipCheckUnclear(payload) {
  logTelemetryEvent(TelemetryEvents.SLIP_CHECK_UNCLEAR, payload);
}

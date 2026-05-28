import { env } from "../config/env.js";
import { sanitizeEventPayload } from "./enerAiEventPayload.util.js";

const DEFAULT_TIMEOUT_MS = 2500;

function trimText(value, max = 500) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function getEnabled() {
  const raw = String(env.ENER_AI_EVENT_ENABLED ?? "false")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function getTimeoutMs() {
  const n = Number(env.ENER_AI_EVENT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS;
  return Math.min(5000, Math.max(1000, Math.floor(n)));
}

export async function sendEnerAiEvent({
  eventType,
  summary,
  externalUserId,
  externalObjectId,
  payload,
} = {}) {
  try {
    const endpoint = String(env.ENER_AI_EVENT_URL || "").trim();
    if (!getEnabled() || !endpoint) {
      return { ok: false, skipped: true };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
    const headers = { "Content-Type": "application/json" };
    const token = String(env.ENER_AI_EVENT_TOKEN || "").trim();
    if (token) {
      headers["X-Ener-AI-Event-Token"] = token;
    }
    const safePayload = sanitizeEventPayload(
      payload && typeof payload === "object" ? payload : {},
    );
    const body = {
      source: "ener_scan",
      project_slug: "ener-scan",
      event_type: trimText(eventType || "external_event", 80) || "external_event",
      summary: trimText(summary || eventType || "external_event", 220),
      external_user_id: trimText(externalUserId, 120) || null,
      external_object_id: trimText(externalObjectId, 120) || null,
      payload:
        safePayload && typeof safePayload === "object" ? safePayload : {},
    };
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          event: "ENER_AI_EVENT_SEND_FAILED",
          status: res.status,
          statusText: res.statusText,
          eventType: body.event_type,
        }),
      );
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "ENER_AI_EVENT_SEND_ERROR",
        reason: String(error?.message || error).slice(0, 240),
      }),
    );
    return { ok: false, error: String(error?.message || error) };
  }
}

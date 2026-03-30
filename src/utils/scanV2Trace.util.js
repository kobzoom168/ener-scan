/** Unix ms for structured V2 trace logs */
export function scanV2TraceTs() {
  return Date.now();
}

/** @param {unknown} userId */
export function lineUserIdPrefix8(userId) {
  return String(userId ?? "").trim().slice(0, 8);
}

/** @param {unknown} id */
export function idPrefix8(id) {
  if (id == null) return null;
  const s = String(id).trim();
  if (!s || s.toLowerCase() === "null") return null;
  return s.slice(0, 8);
}

/** @param {unknown} workerId */
export function workerIdPrefix16(workerId) {
  return String(workerId ?? "").trim().slice(0, 16);
}

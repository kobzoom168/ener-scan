/**
 * Phase B: give the consult brain the customer's OWN latest scan so it can answer
 * "องค์ที่ผมสแกนไปเข้ากับผมไหม / เสริมด้านไหน" with real numbers instead of generic talk.
 * Best-effort + defensive: returns a compact Thai one-liner, or null (consult still works).
 */
import { listScanResultsV2PayloadRowsForLineUser } from "../../../stores/scanV2/scanResultsV2.db.js";

function str(v) {
  const s = String(v ?? "").trim();
  return s || "";
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function coercePayload(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {string} userId LINE userId
 * @returns {Promise<string | null>} compact Thai summary of the latest scan, or null
 */
export async function buildRecentScanContext(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;

  let rows = [];
  try {
    rows = await listScanResultsV2PayloadRowsForLineUser(uid, 1);
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const p = coercePayload(rows[0]?.report_payload_json);
  if (!p || typeof p !== "object") return null;

  const summary = p.summary && typeof p.summary === "object" ? p.summary : {};
  const object = p.object && typeof p.object === "object" ? p.object : {};

  const objectLabel = str(object.objectLabel) || str(object.objectType);
  const main = str(summary.visibleMainLabel) || str(summary.mainEnergyLabel);
  const secondary = str(summary.secondaryEnergyLabel);
  const score = num(summary.energyScore);
  const compat = num(summary.compatibilityPercent);
  const band = str(summary.compatibilityBand);

  const parts = [];
  if (objectLabel) parts.push(`ประเภท/ชื่อ: ${objectLabel}`);
  if (main) parts.push(`พลังเด่น: ${main}${secondary ? ` (รอง: ${secondary})` : ""}`);
  if (score != null) parts.push(`คะแนนพลัง: ${score}/10`);
  if (compat != null) parts.push(`เข้ากับคุณ: ${compat}%${band ? ` (${band})` : ""}`);

  if (parts.length === 0) return null;
  return parts.join(" · ");
}

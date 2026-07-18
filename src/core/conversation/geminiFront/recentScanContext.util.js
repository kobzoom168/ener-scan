/**
 * Phase B: give the consult brain the customer's OWN scan history so it can answer
 * "องค์ที่ผมสแกนไปเข้ากับผมไหม", and compare across pieces ("องค์ไหนแรงสุด / ดีสุด").
 * Best-effort + defensive: returns a compact Thai block, or null (consult still works).
 */
import { listScanResultsV2PayloadRowsForLineUser } from "../../../stores/scanV2/scanResultsV2.db.js";
import { buildPublicReportUrl } from "../../../services/reports/reportLink.service.js";

function str(v) {
  const s = String(v ?? "").trim();
  return s || "";
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Category words that must never be shown as a "พลังเด่น" (they're object types, not powers). */
const CATEGORY_WORDS = [
  "พระเครื่อง",
  "พระบูชา",
  "คริสตัล",
  "หิน",
  "เครื่องราง",
  "ของขลัง",
  "มอลดาไวต์",
  "moldavite",
  "กำไล",
  "วัตถุมงคล",
  "วัตถุจากการสแกน",
];
function looksLikeCategory(s) {
  const t = String(s || "").trim();
  return CATEGORY_WORDS.some((w) => t === w || t.includes(w));
}
/** Accept a value as a power label only if it isn't a bare category term. */
function powerLabel(v) {
  const s = str(v);
  if (!s || looksLikeCategory(s)) return "";
  return s;
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
 * @param {{ report_payload_json?: unknown, created_at?: string, html_public_token?: string|null }} row
 * @returns {{ when: string, label: string, power: string, score: number|null, compat: number|null, band: string, url: string } | null}
 */
function extractRow(row) {
  const p = coercePayload(row?.report_payload_json);
  if (!p || typeof p !== "object") return null;
  const summary = p.summary && typeof p.summary === "object" ? p.summary : {};
  const object = p.object && typeof p.object === "object" ? p.object : {};

  const label = str(object.objectLabel) || str(object.objectType);
  const power = powerLabel(summary.mainEnergyLabel) || powerLabel(summary.visibleMainLabel);
  const score = num(summary.energyScore);
  const compat = num(summary.compatibilityPercent);
  const band = str(summary.compatibilityBand);
  const when = str(row?.created_at).slice(0, 10); // YYYY-MM-DD
  const token = str(row?.html_public_token) || str(p.publicToken);
  const url = token ? buildPublicReportUrl(token) : "";

  if (!label && !power && score == null && compat == null) return null;
  return { when, label, power, score, compat, band, url };
}

function formatItem(it) {
  const parts = [];
  if (it.label) parts.push(`ชื่อ/ประเภท: ${it.label}`);
  if (it.power) parts.push(`พลังเด่น: ${it.power}`);
  if (it.score != null) parts.push(`คะแนนพลัง: ${it.score}/10`);
  if (it.compat != null) parts.push(`เข้ากับคุณ: ${it.compat}%${it.band ? ` (${it.band})` : ""}`);
  if (it.url) parts.push(`ลิงก์รายงาน: ${it.url}`);
  const when = it.when ? `[${it.when}] ` : "";
  return `${when}${parts.join(" · ")}`;
}

/**
 * Compact multi-line Thai history of the user's recent scans (most recent first,
 * near-duplicate re-scans collapsed), for comparison questions. Null when none.
 * @param {string} userId LINE userId
 * @param {number} [maxItems]
 * @returns {Promise<string | null>}
 */
export async function buildScanHistoryContext(userId, maxItems = 6) {
  const uid = String(userId || "").trim();
  if (!uid) return null;

  let rows = [];
  try {
    rows = await listScanResultsV2PayloadRowsForLineUser(uid, 14);
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const it = extractRow(row);
    if (!it) continue;
    // Collapse identical re-scans of the same object.
    const key = `${it.label}|${it.power}|${it.score}|${it.compat}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
    if (items.length >= Math.max(1, maxItems)) break;
  }
  if (items.length === 0) return null;

  const lines = items.map((it, i) => `${i + 1}) ${formatItem(it)}`);
  return lines.join("\n");
}

/**
 * ชิ้นเด่นสุดของลูกค้าแยกตามด้านพลัง (กบ 18 ก.ค. 2026) — ใช้ตัวจัดอันดับเดียวกับ
 * หน้าคลัง (sacredAmuletLibrary: axisHighlights = อันดับ 1 ต่อมิติ ด้วยคะแนนรายแกน)
 * เพื่อให้ consult ตอบ "ด้านโชคลาภ/เมตตา ชิ้นไหนของผมแรงสุด" ได้ตรงกับหน้าเว็บ + ส่งลิงก์ถูกชิ้น
 * Best-effort: คืน null เมื่อไม่มีคลัง/พัง (consult ทำงานต่อได้ตามเดิม)
 * @param {string} userId
 * @returns {Promise<string | null>}
 */
export async function buildAxisTopContext(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  try {
    const { buildSacredAmuletLibraryForLineUser } = await import(
      "../../../services/reports/sacredAmuletLibrary.service.js"
    );
    const lib = await buildSacredAmuletLibraryForLineUser(uid, {});
    if (!lib || !Number(lib.totalCount)) return null;
    const lines = [];
    const fmt = (it, extra) => {
      if (!it) return null;
      const url = it.publicToken ? buildPublicReportUrl(String(it.publicToken)) : "";
      const name = str(it.displayReportId) || str(it.objectLabel) || "ชิ้นนี้";
      return `${name}${extra ? ` ${extra}` : ""}${url ? ` · ลิงก์รายงาน: ${url}` : ""}`;
    };
    for (const h of Array.isArray(lib.axisHighlights) ? lib.axisHighlights : []) {
      const line = fmt(h?.item, `(คะแนนด้านนี้ ${Math.round(Number(h?.axisScore) || 0)})`);
      if (line && h?.labelTh) lines.push(`${h.labelTh}: ${line}`);
    }
    const top = Array.isArray(lib.byOverall) ? lib.byOverall[0] : null;
    if (top) {
      const line = fmt(top, `(พลังรวม ${top.powerTotal ?? "?"})`);
      if (line) lines.push(`แรงสุดโดยรวม: ${line}`);
    }
    const fit = Array.isArray(lib.byFit) ? lib.byFit[0] : null;
    if (fit && fit.compatPercent != null) {
      const line = fmt(fit, `(เข้ากับคุณ ${fit.compatPercent}%)`);
      if (line) lines.push(`เข้ากับคุณที่สุด: ${line}`);
    }
    return lines.length ? lines.join("\n") : null;
  } catch {
    return null;
  }
}

/**
 * Single latest scan (kept for callers that only want the most recent line).
 * @param {string} userId
 * @returns {Promise<string | null>}
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
  const it = Array.isArray(rows) && rows.length ? extractRow(rows[0]) : null;
  return it ? formatItem(it) : null;
}

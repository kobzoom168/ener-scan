/**
 * Admin Dashboard v2 — payments list + detail (mobile-first, dark mode, one-click actions).
 */
import express, { Router } from "express";

import { supabase } from "../config/supabase.js";
import { requireAdminSession } from "../middleware/requireAdmin.js";
import {
  ensurePaymentRefForPaymentId,
  getPaymentsForAdminByStatus,
  getPaymentStatusCountsForAdmin,
  getPaymentDetailForAdmin,
  markPaymentApprovedAndUnlock,
  markPaymentRejected,
} from "../stores/payments.db.js";
import { checkScanAccess } from "../services/paymentAccess.service.js";
import {
  resetFreeTrialForLineUserByAdmin,
  revokePaidAccessForLineUserByAdmin,
} from "../stores/adminReset.db.js";
import { getScanUsageSummaryForAppUser } from "../stores/paymentAccess.db.js";
import {
  buildPaymentApprovedText,
  buildPaymentRejectedText,
} from "../utils/webhookText.util.js";
import { logEvent } from "../utils/personaAnalytics.util.js";
import { getAssignedPersonaVariant } from "../utils/personaVariant.util.js";
import {
  formatBangkokDateTime,
  formatBangkokDate,
} from "../utils/dateTime.util.js";
import { buildAdminFreeResetConfirmationPayload } from "../utils/adminResetNotify.util.js";
import { notifyLineUserTextAfterAdminAction } from "../utils/lineNotify429Retry.util.js";
import {
  adminResetScanAbuseState,
  snapshotAbuseForAdminResetLog,
} from "../stores/abuseGuard.store.js";

const ADMIN_FREE_RESET_MODES = new Set([
  "reset_free_quota_only",
  "reset_free_quota_and_scan_abuse",
]);
const DEFAULT_ADMIN_FREE_RESET_MODE = "reset_free_quota_only";

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function abbreviateLineUserId(id) {
  const s = String(id || "").trim();
  if (!s) return "—";
  if (s.length <= 16) return s;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}

/** @param {string} label */
function copyBtnHtml(label, value) {
  const raw = String(value ?? "");
  if (!raw) return "";
  return `<button type="button" class="btn-copy" data-copy="${escapeHtml(raw)}" title="คัดลอก ${escapeHtml(label)}" aria-label="คัดลอก ${escapeHtml(label)}">📋</button>`;
}

function searchQuerySuffix(q) {
  const s = String(q || "").trim();
  return s ? `&q=${encodeURIComponent(s)}` : "";
}

/** Safe path for admin payment detail (path segment encoded for Express). */
function adminPaymentDetailHref(p) {
  const id = String(p?.id ?? "").trim();
  return id ? `/admin/payments/${encodeURIComponent(id)}` : "/admin/payments";
}

/** Approve/reject only when row is waiting for slip verification (status may vary in casing/whitespace). */
function paymentRowCanAct(p) {
  return String(p?.status ?? "").trim().toLowerCase() === "pending_verify";
}

/**
 * List table: actions column — all controls MUST live inside this single <td> (no floating siblings).
 * Approve/reject use plain POST forms (no fetch) so clicks work even if JS fails or is blocked.
 * Quick reject from list uses default preset "blur"; full reason selection remains on detail page.
 */
function adminListTableActionsTd(p) {
  const idRaw = String(p?.id ?? "").trim();
  const detailHref = adminPaymentDetailHref(p);
  const canAct = paymentRowCanAct(p);
  const postBase = idRaw ? `/admin/payments/${encodeURIComponent(idRaw)}` : "";
  const detailLink = `<a class="btn btn-neu" style="padding:6px 10px;font-size:0.78rem;" href="${detailHref}">ดู</a>`;
  const approveReject =
    canAct && postBase
      ? `<form method="POST" action="${postBase}/approve" class="adm-inline-form"><button type="submit" class="btn btn-ok" style="padding:6px 10px;font-size:0.78rem;">อนุมัติ</button></form><form method="POST" action="${postBase}/reject" class="adm-inline-form"><input type="hidden" name="reject_preset" value="blur" /><input type="hidden" name="reject_detail" value="" /><button type="submit" class="btn btn-bad" style="padding:6px 10px;font-size:0.78rem;">ปฏิเสธ</button></form>`
      : "";
  return `<td class="t-actions">${detailLink}${approveReject}</td>`;
}

/** Mobile cards: same POST forms as table row. */
function adminListCardActionForms(p) {
  const idRaw = String(p?.id ?? "").trim();
  const canAct = paymentRowCanAct(p);
  const postBase = idRaw ? `/admin/payments/${encodeURIComponent(idRaw)}` : "";
  if (!canAct || !postBase) return "";
  return `
        <form method="POST" action="${postBase}/approve" class="adm-inline-form"><button type="submit" class="btn btn-ok">✅ อนุมัติ</button></form>
        <form method="POST" action="${postBase}/reject" class="adm-inline-form"><input type="hidden" name="reject_preset" value="blur" /><input type="hidden" name="reject_detail" value="" /><button type="submit" class="btn btn-bad">❌ ปฏิเสธ</button></form>`;
}

function statusBadgeClass(status) {
  const s = String(status || "");
  if (s === "pending_verify") return "badge badge-warn";
  if (s === "awaiting_payment") return "badge badge-info";
  if (s === "paid") return "badge badge-ok";
  if (s === "rejected") return "badge badge-bad";
  return "badge";
}

function fmtMoney(p) {
  const n = p.expected_amount ?? p.amount;
  if (n == null || n === "") return "—";
  const cur = p.currency || "THB";
  return `${escapeHtml(n)} ${escapeHtml(cur)}`;
}

function fmtDt(iso) {
  const s = formatBangkokDateTime(iso);
  return s === "-" ? "—" : escapeHtml(s);
}

function fmtDateOnly(iso) {
  const s = formatBangkokDate(iso);
  return s === "-" ? "—" : escapeHtml(s);
}

/** Supabase may return embedded `app_users` as object or single-element array. */
function embeddedAppUser(row) {
  const u = row?.app_users;
  if (Array.isArray(u)) return u[0] || null;
  return u || null;
}

/** Preset reasons — value stored + combined with optional detail for DB / LINE. */
const REJECT_PRESETS = [
  { value: "blur", label: "สลิปไม่ชัด" },
  { value: "amount", label: "ยอดเงินไม่ตรง" },
  { value: "not_found", label: "ไม่พบรายการชำระเงิน" },
  { value: "expired", label: "รายการหมดอายุแล้ว" },
  { value: "other", label: "อื่น ๆ (ระบุเอง)" },
];

function sanitizeRejectReason(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ");
  if (s.length > 500) return s.slice(0, 500);
  return s;
}

function resolveRejectReasonFromPreset(presetValue, detailRaw) {
  const preset = String(presetValue || "").trim();
  const detail = sanitizeRejectReason(detailRaw);
  if (preset === "other") {
    return detail || null;
  }
  const found = REJECT_PRESETS.find((x) => x.value === preset);
  if (found && found.value !== "other") {
    return detail ? `${found.label} — ${detail}` : found.label;
  }
  return detail || null;
}

/** @param {Record<string, unknown>} body */
function parseRejectReasonFromBody(body) {
  const preset = body?.reject_preset;
  if (preset != null && String(preset).trim() !== "") {
    return resolveRejectReasonFromPreset(String(preset), body?.reject_detail);
  }
  return sanitizeRejectReason(body?.reject_reason || body?.reason) || null;
}

function rejectPresetOptionsHtml() {
  return REJECT_PRESETS.map(
    (x) =>
      `<option value="${escapeHtml(x.value)}">${escapeHtml(x.label)}</option>`
  ).join("");
}

const DASHBOARD_STYLES = `
:root {
  --bg: #f4f4f5;
  --surface: #ffffff;
  --text: #18181b;
  --muted: #71717a;
  --border: #e4e4e7;
  --accent: #ca8a04;
  --ok: #16a34a;
  --bad: #dc2626;
  --info: #2563eb;
  --warn: #d97706;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0c0c0e;
    --surface: #161618;
    --text: #f4f4f5;
    --muted: #a1a1aa;
    --border: #27272a;
    --accent: #eab308;
    --ok: #22c55e;
    --bad: #f87171;
    --info: #60a5fa;
    --warn: #fbbf24;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.45;
  min-height: 100vh;
}
a { color: var(--info); }
.wrap { max-width: 1200px; margin: 0 auto; padding: 12px 14px 100px; }
.topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.topbar h1 { font-size: 1.25rem; margin: 0; flex: 1 1 200px; }
.topbar form { margin: 0; }
.topbar button[type="submit"] {
  padding: 8px 14px;
  font-size: 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.tab {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 600;
}
.tab:hover { border-color: var(--accent); }
.tab.active {
  background: var(--accent);
  color: #0a0a0a;
  border-color: var(--accent);
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: var(--border);
  color: var(--text);
}
.badge-warn { background: rgba(217, 119, 6, 0.25); color: var(--warn); }
.badge-info { background: rgba(37, 99, 235, 0.2); color: var(--info); }
.badge-ok { background: rgba(22, 163, 74, 0.22); color: var(--ok); }
.badge-bad { background: rgba(220, 38, 38, 0.22); color: var(--bad); }
.cards { display: flex; flex-direction: column; gap: 12px; }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.card-row { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 0.88rem; margin: 4px 0; }
.card-row b { color: var(--muted); font-weight: 600; min-width: 7rem; }
.thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: zoom-in;
  background: var(--border);
}
.thumb-ph {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  background: var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: var(--muted);
  text-align: center;
  padding: 4px;
}
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; position: relative; z-index: 1; }
.actions .adm-inline-form,
.t-actions .adm-inline-form {
  display: inline-block;
  margin: 0;
  vertical-align: middle;
}
.t-actions .adm-inline-form + .adm-inline-form {
  margin-left: 4px;
}
.actions .adm-inline-form + .adm-inline-form {
  margin-left: 0;
}
.sticky-actions .adm-inline-form {
  display: inline-block;
  margin: 0;
  vertical-align: middle;
}
.btn {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-ok { background: var(--ok); color: #fff; }
.btn-bad { background: var(--bad); color: #fff; }
.btn-neu { background: var(--border); color: var(--text); }
.btn-copy {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.75rem;
  cursor: pointer;
  margin-left: 6px;
  vertical-align: middle;
}
.btn-copy:active { opacity: 0.85; }
.search-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}
.search-bar input[type="search"] {
  flex: 1 1 200px;
  min-width: 160px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 0.9rem;
}
.search-bar button[type="submit"] {
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--accent);
  color: #0a0a0a;
  font-weight: 700;
  cursor: pointer;
}
.ref-cell { font-weight: 700; font-family: ui-monospace, monospace; font-size: 0.78rem; }
.btn-link { background: transparent; color: var(--info); padding: 8px 10px; }
.table-wrap { display: none; overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
table.data { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
table.data th, table.data td { padding: 10px 8px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: middle; }
table.data th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
table.data tr:last-child td { border-bottom: none; }
table.data .t-actions { white-space: nowrap; position: relative; z-index: 2; }
/* Slip column: clip overflow so thumbs cannot sit on top of Actions. */
table.data td:nth-child(10) {
  overflow: hidden;
  max-width: 96px;
}
@media (min-width: 900px) {
  .cards { display: none; }
  .table-wrap { display: block; }
}
.detail-grid {
  display: grid;
  gap: 14px;
}
@media (min-width: 800px) {
  .detail-grid { grid-template-columns: 1fr 1fr; align-items: start; }
}
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
}
.panel h2 { margin: 0 0 12px; font-size: 1rem; }
.kv { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; font-size: 0.88rem; }
.kv div:nth-child(odd) { color: var(--muted); font-weight: 600; }
.slip-large {
  max-width: 100%;
  max-height: 70vh;
  border-radius: 12px;
  border: 1px solid var(--border);
  cursor: zoom-in;
  display: block;
  margin: 0 auto;
}
/* Detail slip: avoid overflow painting over the fixed bottom bar on some browsers. */
.detail-slip-panel { overflow: hidden; position: relative; z-index: 0; }
.sticky-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  /* Opaque fallback if color-mix unsupported (avoids “invisible” bar / weird hit-testing). */
  background: var(--surface);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  z-index: 1000;
  pointer-events: auto;
  isolation: isolate;
}
.sticky-actions .btn { flex: 1 1 140px; max-width: 220px; }
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  /* Above sticky bar (1000), below toast (1200). */
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  cursor: zoom-out;
}
.modal.hidden {
  display: none !important;
  visibility: hidden;
  pointer-events: none !important;
}
.modal img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}
.flash-ok { color: var(--ok); font-weight: 700; }
.flash-err { color: var(--bad); font-weight: 700; }
.stat-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}
@media (min-width: 720px) {
  .stat-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.stat-box {
  display: block;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.stat-box:hover { border-color: var(--accent); }
.stat-box.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
}
.stat-box .num {
  font-size: 1.35rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.stat-box .lbl { font-size: 0.72rem; color: var(--muted); margin-top: 4px; font-weight: 600; }
.toast {
  position: fixed;
  top: max(12px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 1200;
  max-width: min(92vw, 420px);
  padding: 12px 18px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.9rem;
  box-shadow: 0 8px 28px rgba(0,0,0,0.22);
  display: none;
  text-align: center;
  line-height: 1.4;
}
.toast.show { display: block; }
.toast.toast-ok { background: var(--ok); color: #fff; }
.toast.toast-err { background: var(--bad); color: #fff; }
.modal.modal-dialog { cursor: pointer; align-items: flex-end; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
@media (min-width: 500px) {
  .modal.modal-dialog { align-items: center; padding-bottom: 16px; }
}
.dialog-inner {
  cursor: default;
  width: 100%;
  max-width: 400px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 16px;
  max-height: 90vh;
  overflow: auto;
}
.dialog-inner label { display: block; font-size: 0.78rem; color: var(--muted); margin: 10px 0 6px; }
.dialog-inner select, .dialog-inner textarea, .reject-panel select, .reject-panel textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 0.95rem;
  font-family: inherit;
}
.reject-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.reject-panel h3 { margin: 0 0 10px; font-size: 0.95rem; }
.reject-panel label { display: block; font-size: 0.78rem; color: var(--muted); margin: 10px 0 6px; }
.reject-hint { font-size: 0.8rem; color: var(--muted); margin: 0 0 8px; }
`;

function slipThumbHtml(slipUrl) {
  if (!slipUrl) {
    return '<div class="thumb-ph">ไม่มีสลิป</div>';
  }
  const u = escapeHtml(slipUrl);
  return `<img class="thumb slip-zoom" src="${u}" alt="slip" width="72" height="72" loading="lazy" referrerpolicy="no-referrer" data-full="${u}" />`;
}

function renderListPage({
  rows,
  filterStatus,
  flash,
  statusCounts = {},
  searchQuery = "",
}) {
  const c = statusCounts || {};
  const q = String(searchQuery || "").trim();
  const qSuffix = searchQuerySuffix(q);
  const tabs = [
    ["pending_verify", "รอตรวจสลิป"],
    ["awaiting_payment", "รอสลิป"],
    ["paid", "จ่ายแล้ว"],
    ["rejected", "ปฏิเสธ"],
  ];

  const statStripTabs = [
    ["pending_verify", "รอตรวจสลิป"],
    ["awaiting_payment", "รอสลิป"],
    ["paid", "จ่ายแล้ว"],
    ["rejected", "ปฏิเสธ"],
  ];
  const statStripHtml = statStripTabs
    .map(
      ([st, label]) => `
    <a class="stat-box${st === filterStatus ? " active" : ""}" href="/admin/payments?status=${encodeURIComponent(st)}${qSuffix}">
      <div class="num">${escapeHtml(String(Number(c[st] ?? 0)))}</div>
      <div class="lbl">${escapeHtml(label)}</div>
    </a>`
    )
    .join("");

  const tabsHtml = tabs
    .map(
      ([st, label]) => `
    <a class="tab${st === filterStatus ? " active" : ""}" href="/admin/payments?status=${encodeURIComponent(st)}${qSuffix}">${escapeHtml(label)}</a>`
    )
    .join("");

  const cardsHtml = rows
    .map((p) => {
      const au = embeddedAppUser(p);
      const rem =
        au?.paid_remaining_scans != null
          ? escapeHtml(String(au.paid_remaining_scans))
          : "—";
      const pu = au?.paid_until ? fmtDateOnly(au.paid_until) : "—";
      const pref = p.payment_ref
        ? `<span class="ref-cell">${escapeHtml(String(p.payment_ref))}</span>${copyBtnHtml("REF", p.payment_ref)}`
        : "—";
      const lineFull = escapeHtml(p.line_user_id || "—");
      const lineDisp = escapeHtml(abbreviateLineUserId(p.line_user_id));
      const reasonRow =
        String(p.status) === "rejected" && p.reject_reason
          ? `<div class="card-row"><b>เหตุผล</b> <span style="word-break:break-word;">${escapeHtml(String(p.reject_reason))}</span></div>`
          : "";
      return `
    <article class="card" data-payment-id="${escapeHtml(p.id)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <span class="${statusBadgeClass(p.status)}">${escapeHtml(p.status)}</span>
          <div class="card-row"><b>REF</b> ${pref}</div>
          <div class="card-row"><b>LINE</b> <span title="${lineFull}">${lineDisp}</span>${copyBtnHtml("LINE", p.line_user_id || "")}</div>
          <div class="card-row"><b>แพ็กเกจ</b> ${escapeHtml(p.package_code || "—")}</div>
          <div class="card-row"><b>ยอด</b> ${fmtMoney(p)}</div>
          <div class="card-row"><b>สร้างเมื่อ</b> ${fmtDt(p.created_at)}</div>
          <div class="card-row"><b>สแกนคงเหลือ</b> ${rem}</div>
          <div class="card-row"><b>หมดอายุ</b> ${pu}</div>
          ${reasonRow}
        </div>
        ${slipThumbHtml(p.slip_url)}
      </div>
      <div class="actions">
        <a class="btn btn-neu" href="${adminPaymentDetailHref(p)}">👁 รายละเอียด</a>
        ${adminListCardActionForms(p)}
      </div>
    </article>`;
    })
    .join("");

  const tableRows = rows
    .map((p) => {
      const au = embeddedAppUser(p);
      const rem =
        au?.paid_remaining_scans != null
          ? escapeHtml(String(au.paid_remaining_scans))
          : "—";
      const pu = au?.paid_until ? fmtDateOnly(au.paid_until) : "—";
      const reasonShort = p.reject_reason
        ? escapeHtml(String(p.reject_reason).slice(0, 48)) +
          (String(p.reject_reason).length > 48 ? "…" : "")
        : "—";
      const pref = p.payment_ref
        ? `<span class="ref-cell">${escapeHtml(String(p.payment_ref))}</span>${copyBtnHtml("REF", p.payment_ref)}`
        : "—";
      const lineTitle = escapeHtml(p.line_user_id || "");
      const lineDisp = escapeHtml(abbreviateLineUserId(p.line_user_id));
      return `
      <tr>
        <td class="ref-cell">${pref}</td>
        <td style="max-width:120px;word-break:break-all;font-size:0.78rem;" title="${lineTitle}">${lineDisp}${copyBtnHtml("LINE", p.line_user_id || "")}</td>
        <td>${fmtMoney(p)}</td>
        <td>${escapeHtml(p.package_code || "—")}</td>
        <td><span class="${statusBadgeClass(p.status)}">${escapeHtml(p.status)}</span></td>
        <td style="max-width:100px;font-size:0.76rem;">${reasonShort}</td>
        <td>${fmtDt(p.created_at)}</td>
        <td>${rem}</td>
        <td>${pu}</td>
        <td>${slipThumbHtml(p.slip_url)}</td>
        ${adminListTableActionsTd(p)}
      </tr>`;
    })
    .join("");

  const empty = rows.length === 0 ? `<p class="card" style="text-align:center;color:var(--muted);">ไม่มีรายการ</p>` : "";

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Ener Scan — Admin Payments</title>
  <style>${DASHBOARD_STYLES}</style>
</head>
<body>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div class="wrap">
    <div class="topbar">
      <h1>💳 Payments</h1>
      <form method="POST" action="/admin/logout" style="margin:0;">
        <button type="submit">ออกจากระบบ</button>
      </form>
    </div>
    <form class="search-bar" method="get" action="/admin/payments">
      <input type="hidden" name="status" value="${escapeHtml(filterStatus)}" />
      <input type="search" name="q" value="${escapeHtml(q)}" placeholder="ค้นหา REF (เช่น PAY-…), LINE user id…" autocomplete="off" />
      <button type="submit">ค้นหา</button>
      ${
        q
          ? `<a class="btn btn-neu" style="padding:8px 12px;font-size:0.85rem;text-decoration:none;" href="/admin/payments?status=${encodeURIComponent(filterStatus)}">ล้าง</a>`
          : ""
      }
    </form>
    <div class="stat-strip">${statStripHtml}</div>
    <nav class="tabs">${tabsHtml}</nav>
    <div class="cards">${empty}${cardsHtml}</div>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>REF</th>
            <th>LINE</th>
            <th>amount</th>
            <th>package</th>
            <th>status</th>
            <th>เหตุผล</th>
            <th>created</th>
            <th>remaining</th>
            <th>paid_until</th>
            <th>slip</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>${tableRows || `<tr><td colspan="11" style="text-align:center;color:var(--muted);">ไม่มีรายการ</td></tr>`}</tbody>
      </table>
    </div>
    <p class="reject-hint" style="margin:12px 0 0;font-size:0.8rem;color:var(--muted);">
      ปฏิเสธจากรายการนี้ใช้เหตุผลเริ่มต้น &quot;สลิปไม่ชัด&quot; — ถ้าต้องการระบุเหตุผลเอง ให้เปิดหน้ารายละเอียด
    </p>
  </div>
  <div id="slip-modal" class="modal hidden" aria-hidden="true"><img alt="slip full" /></div>
  <script>
    (function () {
      try {
      var initialFlash = ${JSON.stringify(flash || "")};
      function qs(sel) { return document.querySelector(sel); }
      function showToast(msg, kind) {
        var t = qs("#toast");
        if (!t) return;
        t.textContent = msg;
        t.className = "toast show " + (kind === "err" ? "toast-err" : "toast-ok");
        clearTimeout(t._tm);
        t._tm = setTimeout(function () { t.className = "toast"; }, kind === "err" ? 4200 : 2800);
      }
      function openModal(src) {
        var m = qs("#slip-modal");
        if (!m) return;
        var im = m.querySelector("img");
        if (im) im.src = src;
        m.classList.remove("hidden");
        m.setAttribute("aria-hidden", "false");
      }
      function closeModal() {
        var m = qs("#slip-modal");
        if (!m) return;
        m.classList.add("hidden");
        m.setAttribute("aria-hidden", "true");
      }
      var slipModalEl = document.getElementById("slip-modal");
      if (slipModalEl) slipModalEl.addEventListener("click", closeModal);
      document.body.addEventListener("click", function (e) {
        var z = e.target.closest(".slip-zoom");
        if (z && z.dataset.full) openModal(z.dataset.full);
      });
      document.body.addEventListener("click", function (e) {
        var btn = e.target.closest(".btn-copy");
        if (!btn || !btn.dataset.copy) return;
        var text = btn.dataset.copy;
        if (!text) return;
        function ok() { showToast("คัดลอกแล้ว", "ok"); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(ok).catch(function () {
            showToast("คัดลอกไม่สำเร็จ", "err");
          });
        } else {
          showToast("คัดลอกไม่สำเร็จ", "err");
        }
      });
      if (initialFlash) {
        showToast(initialFlash, initialFlash.indexOf("ไม่สำเร็จ") >= 0 ? "err" : "ok");
        try {
          var u = new URL(location.href);
          u.searchParams.delete("flash");
          history.replaceState({}, "", u.toString());
        } catch (_) {}
      }
      } catch (initErr) {
        console.error("[admin-payments-list] script init failed", initErr);
      }
    })();
  </script>
</body>
</html>`;
}

function renderAccessSnapshotPanel(accessSnapshot) {
  if (!accessSnapshot) {
    return `<p class="reject-hint" style="margin:0;">ไม่สามารถโหลดสรุปสิทธิ์ได้</p>`;
  }
  const allowed = accessSnapshot.allowed ? "ได้" : "ไม่ได้";
  const reason = escapeHtml(String(accessSnapshot.reason ?? "—"));
  const rem =
    accessSnapshot.remaining != null
      ? escapeHtml(String(accessSnapshot.remaining))
      : "—";
  const pd = accessSnapshot.paidUntil ? fmtDateOnly(accessSnapshot.paidUntil) : "—";
  const freeRem =
    accessSnapshot.freeScansRemaining != null
      ? escapeHtml(String(accessSnapshot.freeScansRemaining))
      : "—";
  return `
        <div class="kv">
          <div>สแกนได้ตอนนี้</div><div><strong>${escapeHtml(allowed)}</strong></div>
          <div>เหตุผล</div><div>${reason}</div>
          <div>โควต้าฟรีคงเหลือ (วันนี้)</div><div>${freeRem}</div>
          <div>สิทธิ์ที่เหลือ (แพ็กเกจ)</div><div>${rem}</div>
          <div>หมดอายุ paid</div><div>${pd}</div>
        </div>`;
}

function renderDetailPage({
  payment,
  scanSummary,
  flash,
  accessSnapshot = null,
}) {
  const p = payment;
  const au = embeddedAppUser(p);
  const slip = p.slip_url ? escapeHtml(p.slip_url) : "";
  const canAct = paymentRowCanAct(p);
  const idRaw = String(p?.id ?? "").trim();
  const postBase = idRaw ? `/admin/payments/${encodeURIComponent(idRaw)}` : "";
  const rem =
    au?.paid_remaining_scans != null
      ? escapeHtml(String(au.paid_remaining_scans))
      : "—";
  const flashHtml = flash
    ? `<p class="${String(flash).indexOf("ไม่สำเร็จ") >= 0 ? "flash-err" : "flash-ok"}" style="margin:0 0 12px;">${escapeHtml(flash)}</p>`
    : "";

  const rejectPanelHtml =
    canAct && postBase
      ? `<form id="detail-reject-form" method="POST" action="${postBase}/reject" class="reject-panel">
    <h3>ปฏิเสธสลิป</h3>
    <p class="reject-hint">เลือกเหตุผลหลัก หรือระบุเพิ่ม (ถ้าเลือก &quot;อื่น ๆ&quot; ต้องกรอกรายละเอียด) — ปุ่มปฏิเสธด้านล่างจะส่งแบบฟอร์มนี้</p>
    <label for="detail-reject-preset">เหตุผล</label>
    <select name="reject_preset" id="detail-reject-preset">${rejectPresetOptionsHtml()}</select>
    <label for="detail-reject-detail">รายละเอียดเพิ่มเติม (ถ้ามี)</label>
    <textarea name="reject_detail" id="detail-reject-detail" rows="3" placeholder="เช่น หมายเลขอ้างอิง / หมายเหตุสั้น ๆ"></textarea>
  </form>`
      : "";

  const rejectReasonKv =
    String(p.status) === "rejected"
      ? `<div>reject_reason</div><div style="word-break:break-word;">${p.reject_reason ? escapeHtml(String(p.reject_reason)) : "—"}</div>`
      : "";

  const lineUid = p.line_user_id ? String(p.line_user_id).trim() : "";
  const adminToolsHtml = lineUid
    ? `<div class="panel" style="margin-top:14px;">
    <h2>การดูแล (แอดมิน)</h2>
    <p class="reject-hint"><strong>รีเซ็ตสิทธิ์ทดลองใช้ฟรี</strong> — เคลียร์ paid + คืนโควต้าฟรีวันนี้ตาม config (offset) · <strong>ไม่ลบ</strong>ประวัติ · ปิด payment ที่ค้าง · <strong>ไม่</strong>แตะ anti-scan ในเซิร์ฟเวอร์</p>
    <p class="reject-hint"><strong>รีเซ็ตสิทธิ์ฟรี + ปลดล็อก anti-scan</strong> — เหมือนข้างบน + เคลียร์คะแนน/ล็อกสแกนชั่วคราว และปลด hard block ถ้าเหลือแค่สาเหตุอื่นที่ยังไม่ถึงเกณฑ์ · <strong>ไม่</strong>รีเซ็ต payment / slip abuse</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
      <button type="button" class="btn btn-neu js-reset-free" data-reset-mode="reset_free_quota_only">รีเซ็ตสิทธิ์ทดลองใช้ฟรี</button>
      <button type="button" class="btn btn-neu js-reset-free-scan-abuse" data-reset-mode="reset_free_quota_and_scan_abuse" style="border-color:var(--accent,#6b8);">รีเซ็ตสิทธิ์ฟรี + ปลดล็อก anti-scan</button>
    </div>
    <p class="reject-hint"><strong>เพิกถอนสิทธิ์ชำระเงิน</strong> — ล้าง paid_until / โควต้า paid เท่านั้น · <strong>ไม่</strong>รีเซ็ตโควต้าฟรี · ปิด payment ที่ค้าง</p>
    <button type="button" class="btn btn-neu js-revoke-paid" style="border-color:var(--bad);color:var(--bad);">เพิกถอนสิทธิ์ชำระเงิน</button>
  </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Payment ${escapeHtml(p.id)} — Ener Scan</title>
  <style>${DASHBOARD_STYLES}</style>
</head>
<body>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div id="slip-modal" class="modal hidden" aria-hidden="true"><img alt="slip full" /></div>
  <div class="wrap">
    ${flashHtml}
    <p style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between;">
      <a href="/admin/payments?status=${encodeURIComponent(String(p.status))}">← กลับรายการ</a>
      <form method="POST" action="/admin/logout" style="margin:0;"><button type="submit" class="btn btn-neu" style="padding:6px 12px;font-size:0.85rem;">ออกจากระบบ</button></form>
    </p>
    ${rejectPanelHtml}
    <div class="detail-grid">
      <div class="panel">
        <h2>ข้อมูลการชำระเงิน</h2>
        <div class="kv">
          <div>payment_ref</div><div><span class="ref-cell">${escapeHtml(p.payment_ref || "—")}</span>${p.payment_ref ? copyBtnHtml("REF", p.payment_ref) : ""}</div>
          <div>id</div><div style="word-break:break-all;">${escapeHtml(p.id)}</div>
          <div>line_user_id</div><div style="word-break:break-all;">${escapeHtml(p.line_user_id || "—")}${p.line_user_id ? copyBtnHtml("LINE", p.line_user_id) : ""}</div>
          <div>package_code</div><div>${escapeHtml(p.package_code || "—")}</div>
          <div>amount</div><div>${fmtMoney(p)}</div>
          <div>status</div><div><span class="${statusBadgeClass(p.status)}">${escapeHtml(p.status)}</span></div>
          <div>created_at</div><div>${fmtDt(p.created_at)}</div>
          <div>verified_at</div><div>${fmtDt(p.verified_at)}</div>
          <div>rejected_at</div><div>${fmtDt(p.rejected_at)}</div>
          ${rejectReasonKv}
        </div>
      </div>
      <div class="panel">
        <h2>สิทธิ์ & การใช้งาน</h2>
        <p class="reject-hint" style="margin:0 0 10px;"><strong>สรุปสิทธิ์ลูกค้า</strong> (ตาม checkScanAccess — สแกนได้หรือไม่ตอนนี้)</p>
        ${renderAccessSnapshotPanel(accessSnapshot)}
        <h3 style="margin:16px 0 8px;font-size:0.92rem;color:var(--muted);">ข้อมูลใน DB (app_users)</h3>
        <div class="kv">
          <div>paid_remaining_scans</div><div>${rem}</div>
          <div>paid_until</div><div>${au?.paid_until ? fmtDateOnly(au.paid_until) : "—"}</div>
          <div>paid_plan_code</div><div>${escapeHtml(au?.paid_plan_code || "—")}</div>
          <div>used_scans (ทั้งหมด)</div><div>${escapeHtml(String(scanSummary.totalScans))}</div>
          <div>last_scan_at</div><div>${scanSummary.lastScanAt ? fmtDt(scanSummary.lastScanAt) : "—"}</div>
        </div>
      </div>
    </div>
    <div class="panel detail-slip-panel" style="margin-top:14px;">
      <h2>สลิป</h2>
      ${
        slip
          ? `<p style="margin:0 0 8px;color:var(--muted);font-size:0.85rem;">แตะรูปเพื่อขยายเต็มจอ · <a href="${slip}" target="_blank" rel="noopener">เปิดแท็บใหม่</a></p>
          <img class="slip-large slip-zoom" src="${slip}" alt="slip" data-full="${slip}" referrerpolicy="no-referrer" />`
          : `<p style="color:var(--muted);">ไม่มีไฟล์สลิป</p>`
      }
    </div>
    ${adminToolsHtml}
  </div>
  ${
    canAct && postBase
      ? `<div class="sticky-actions">
    <a class="btn btn-neu" href="/admin/payments?status=pending_verify">← กลับ</a>
    <form method="POST" action="${postBase}/approve" class="adm-inline-form"><button type="submit" class="btn btn-ok">✅ อนุมัติ</button></form>
    <button type="submit" form="detail-reject-form" class="btn btn-bad">❌ ปฏิเสธ</button>
  </div>`
      : `<div class="sticky-actions">
    <a class="btn btn-neu" href="/admin/payments?status=${encodeURIComponent(String(p.status))}">← กลับรายการ</a>
  </div>`
  }
  <script>
    (function () {
      try {
      var lineUid = ${lineUid ? JSON.stringify(lineUid) : "null"};
      function qs(s) { return document.querySelector(s); }
      function showToast(msg, kind) {
        var t = qs("#toast");
        if (!t) return;
        t.textContent = msg;
        t.className = "toast show " + (kind === "err" ? "toast-err" : "toast-ok");
        clearTimeout(t._tm);
        t._tm = setTimeout(function () { t.className = "toast"; }, kind === "err" ? 4200 : 2800);
      }
      function openModal(src) {
        var m = qs("#slip-modal");
        if (!m) return;
        var im = m.querySelector("img");
        if (im) im.src = src;
        m.classList.remove("hidden");
        m.setAttribute("aria-hidden", "false");
      }
      function closeModal() {
        var m = qs("#slip-modal");
        if (!m) return;
        m.classList.add("hidden");
        m.setAttribute("aria-hidden", "true");
      }
      var slipModalRoot = qs("#slip-modal");
      if (slipModalRoot) slipModalRoot.addEventListener("click", closeModal);
      document.body.addEventListener("click", function (e) {
        var z = e.target.closest(".slip-zoom");
        if (z && z.dataset.full) openModal(z.dataset.full);
      });
      document.body.addEventListener("click", function (e) {
        var btn = e.target.closest(".btn-copy");
        if (!btn || !btn.dataset.copy) return;
        var text = btn.dataset.copy;
        if (!text) return;
        function ok() { showToast("คัดลอกแล้ว", "ok"); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(ok).catch(function () {
            showToast("คัดลอกไม่สำเร็จ", "err");
          });
        } else {
          showToast("คัดลอกไม่สำเร็จ", "err");
        }
      });
      function wireFreeReset(btn, confirmMsg, okToast) {
        if (!btn || !lineUid) return;
        var mode = String(btn.dataset.resetMode || "reset_free_quota_only").trim();
        btn.addEventListener("click", async function () {
          if (!confirm(confirmMsg)) return;
          btn.disabled = true;
          var pair = document.querySelector(".js-reset-free-scan-abuse");
          var other = document.querySelector(".js-reset-free");
          if (pair) pair.disabled = true;
          if (other && other !== btn) other.disabled = true;
          try {
            var r = await fetch("/admin/users/" + encodeURIComponent(lineUid) + "/reset-free-trial", {
              method: "POST",
              headers: { Accept: "application/json", "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ resetMode: mode })
            });
            var j = await r.json().catch(function () { return null; });
            if (!r.ok || (j && j.ok === false)) throw new Error((j && j.message) || "รีเซ็ตไม่สำเร็จ");
            showToast(okToast, "ok");
            setTimeout(function () { location.reload(); }, 650);
          } catch (e) {
            showToast(e.message || "เกิดข้อผิดพลาด", "err");
            btn.disabled = false;
            if (pair) pair.disabled = false;
            if (other && other !== btn) other.disabled = false;
          }
        });
      }
      wireFreeReset(
        document.querySelector(".js-reset-free"),
        "ยืนยันรีเซ็ตสิทธิ์ทดลองใช้ฟรี?\\n\\n• ยกเลิก paid\\n• คืนโควต้าฟรีวันนี้ตาม config\\n• ปิด payment ที่ค้าง\\n• ไม่ปลดล็อก anti-scan",
        "รีเซ็ตสิทธิ์ทดลองใช้ฟรีแล้ว"
      );
      wireFreeReset(
        document.querySelector(".js-reset-free-scan-abuse"),
        "ยืนยันรีเซ็ตสิทธิ์ฟรี + ปลดล็อก anti-scan?\\n\\n• เหมือนรีเซ็ตฟรี\\n• เพิ่มเติม: เคลียร์คะแนน/ล็อกสแกน และปลด hard block ถ้าเหลือคะแนนรวมต่ำกว่าเกณฑ์\\n• ไม่รีเซ็ต payment / slip abuse",
        "รีเซ็ตสิทธิ์ฟรีและปลดล็อก anti-scan เรียบร้อยแล้ว"
      );
      var rp = document.querySelector(".js-revoke-paid");
      if (rp && lineUid) {
        rp.addEventListener("click", async function () {
          if (!confirm("ยืนยันเพิกถอนสิทธิ์ชำระเงิน (paid)?\\n\\n• ล้าง paid_until / โควต้า paid\\n• ไม่รีเซ็ตโควต้าฟรี\\n• ปิด payment ที่ค้าง")) return;
          rp.disabled = true;
          try {
            var r2 = await fetch("/admin/users/" + encodeURIComponent(lineUid) + "/revoke-paid-access", {
              method: "POST",
              headers: { Accept: "application/json" },
              credentials: "same-origin"
            });
            var j2 = await r2.json().catch(function () { return null; });
            if (!r2.ok || (j2 && j2.ok === false)) throw new Error((j2 && j2.message) || "เพิกถอนไม่สำเร็จ");
            showToast("เพิกถอนสิทธิ์ชำระเงินแล้ว", "ok");
            setTimeout(function () { location.reload(); }, 650);
          } catch (e2) {
            showToast(e2.message || "เกิดข้อผิดพลาด", "err");
            rp.disabled = false;
          }
        });
      }
      } catch (detailInitErr) {
        console.error("[admin-payments-detail] script init failed", detailInitErr);
      }
    })();
  </script>
</body>
</html>`;
}

export default function createAdminPaymentsDashboardRouter(lineClient) {
  const router = Router();

  router.get("/admin/payments", requireAdminSession, async (req, res) => {
    try {
      const status = String(req.query?.status || "pending_verify").trim();
      const q = String(req.query?.q || "").trim();
      const [{ rows, filterStatus }, statusCounts] = await Promise.all([
        getPaymentsForAdminByStatus({
          status,
          limit: 200,
          q,
        }),
        getPaymentStatusCountsForAdmin(),
      ]);
      const flashMap = {
        approved: "อนุมัติแล้ว ✅",
        rejected: "บันทึกการปฏิเสธแล้ว",
        approve_err: "อนุมัติไม่สำเร็จ — ลองใหม่หรือเปิดหน้ารายละเอียด",
        reject_err: "ปฏิเสธไม่สำเร็จ — ลองใหม่หรือเปิดหน้ารายละเอียด",
      };
      const flash = flashMap[String(req.query?.flash || "")] || "";
      const html = renderListPage({
        rows,
        filterStatus,
        flash,
        statusCounts,
        searchQuery: q,
      });
      res.status(200).type("html").send(html);
   } catch (err) {
      console.error("[ADMIN_DASH] list failed:", err);
      res.status(500).send("admin_list_failed");
    }
  });

  router.get("/admin/payments/:id", requireAdminSession, async (req, res) => {
    const paymentId = String(req.params?.id || "").trim();
    const wantsJson =
      String(req.get("Accept") || "").includes("application/json") &&
      !String(req.get("Accept") || "").includes("text/html");

    if (!paymentId) {
      if (wantsJson) {
        res.status(400).json({ ok: false, message: "paymentId_missing" });
      } else {
        res.status(400).send("paymentId_missing");
      }
      return;
    }

    try {
      if (wantsJson) {
        const { data, error } = await supabase
          .from("payments")
          .select("*")
          .eq("id", paymentId)
          .maybeSingle();
        if (error) {
          res.status(500).json({ ok: false, message: error.message });
          return;
        }
        res.status(200).json({ ok: true, payment: data });
        return;
      }

      const payment = await getPaymentDetailForAdmin(paymentId);
      if (!payment) {
        res.status(404).send("payment_not_found");
        return;
      }

      try {
        const ref = await ensurePaymentRefForPaymentId(paymentId);
        if (ref) payment.payment_ref = ref;
      } catch (refErr) {
        console.error("[ADMIN_DASH] ensurePaymentRefForPaymentId failed:", refErr);
      }

      const uid = payment.user_id || embeddedAppUser(payment)?.id;
      const scanSummary = uid
        ? await getScanUsageSummaryForAppUser(uid)
        : { totalScans: 0, lastScanAt: null };

      let accessSnapshot = null;
      try {
        if (payment.line_user_id) {
          accessSnapshot = await checkScanAccess({
            userId: String(payment.line_user_id).trim(),
          });
        }
      } catch (accErr) {
        console.error("[ADMIN_DASH] checkScanAccess failed:", accErr);
      }

      const flashMap = {
        approved: "อนุมัติแล้ว ✅",
        rejected: "บันทึกการปฏิเสธแล้ว",
        approve_err: "อนุมัติไม่สำเร็จ — ลองใหม่หรือเปิดหน้ารายละเอียด",
        reject_err: "ปฏิเสธไม่สำเร็จ — ลองใหม่หรือเปิดหน้ารายละเอียด",
      };
      const flash = flashMap[String(req.query?.flash || "")] || "";

      const html = renderDetailPage({
        payment,
        scanSummary,
        flash,
        accessSnapshot,
      });
   res.status(200).type("html").send(html);
    } catch (err) {
      console.error("[ADMIN_DASH] detail failed:", err);
      res.status(500).send("admin_detail_failed");
    }
  });

  function wantsJsonResponse(req) {
    return String(req.get("Accept") || "").includes("application/json");
  }

  /** Dashboard fetch + mobile Safari; pair with header X-Admin-Json: 1 from client. */
  function prefersAdminJson(req) {
    if (wantsJsonResponse(req)) return true;
    return String(req.get("X-Admin-Json") || "").trim() === "1";
  }

  router.post(
    "/admin/payments/:id/approve",
    requireAdminSession,
    express.json(),
    async (req, res) => {
    const paymentId = String(req.params?.id || "").trim();
    const approvedBy = "admin_dashboard";

    if (!paymentId) {
      if (prefersAdminJson(req)) {
        res.status(400).json({ ok: false, message: "paymentId_missing" });
      } else {
        res.status(400).send("paymentId_missing");
      }
      return;
    }

    try {
      const activation = await markPaymentApprovedAndUnlock({
        paymentId,
        approvedBy,
      });
      if (!activation?.lineUserId) {
        throw new Error("activation_missing_lineUserId");
      }

      const isIdempotent =
        activation.paidUntil == null && activation.paidRemainingScans == null;

      console.log(
        JSON.stringify({
          event: "ADMIN_APPROVE_APPLIED",
          paymentId,
          lineUserId: activation.lineUserId,
          idempotent: Boolean(isIdempotent),
        }),
      );

      /** @type {Awaited<ReturnType<typeof notifyLineUserTextAfterAdminAction>> | null} */
      let notifyResult = null;
      const lineReplyToken =
        typeof req.body?.lineReplyToken === "string"
          ? req.body.lineReplyToken.trim()
          : "";

      if (!isIdempotent) {
        logEvent("payment_success", {
          userId: activation.lineUserId,
          personaVariant: await getAssignedPersonaVariant(activation.lineUserId),
          patternUsed: null,
          bubbleCount: 1,
          paymentId,
          source: "admin_dashboard_approve",
        });
        let paymentRefForPush = null;
        try {
          paymentRefForPush = await ensurePaymentRefForPaymentId(paymentId);
        } catch (refErr) {
          console.error("[ADMIN_DASH] ensurePaymentRefForPaymentId (approve push):", refErr);
        }

        const message = await buildPaymentApprovedText({
          paidRemainingScans: activation.paidRemainingScans,
          paidUntil: activation.paidUntil,
          paymentRef: paymentRefForPush,
          lineUserId: activation.lineUserId,
          paidPlanCode: activation.paidPlanCode,
        });

        notifyResult = await notifyLineUserTextAfterAdminAction({
          client: lineClient,
          lineUserId: activation.lineUserId,
          text: message,
          replyToken: lineReplyToken || null,
          eventTag: "ADMIN_APPROVE_NOTIFY",
        });
      }

      if (prefersAdminJson(req)) {
        const approvalApplied = true;
        const jsonBase = {
          ok: true,
          idempotent: Boolean(isIdempotent),
          approvalApplied,
        };
        if (isIdempotent) {
          res.status(200).json({
            ...jsonBase,
            userNotified: false,
            notifySkipped: "idempotent_already_active",
          });
        } else {
          res.status(200).json({
            ...jsonBase,
            userNotified: notifyResult.userNotified,
            notifyChannel: notifyResult.channel,
            notifyAttempts: notifyResult.attempts,
            sent: notifyResult.sent,
            method: notifyResult.method,
            finalStatus: notifyResult.finalStatus,
            finalMessage: notifyResult.finalMessage,
            is429: notifyResult.is429,
            ...(notifyResult.userNotified
              ? {}
              : {
                  notifyError: notifyResult.notifyError || "line_send_failed",
                }),
          });
        }
      } else {
        res.redirect(302, "/admin/payments?status=paid&flash=approved");
      }
    } catch (err) {
      console.error("[ADMIN_DASH] approve failed:", err);
      if (prefersAdminJson(req)) {
        res.status(409).json({ ok: false, message: err?.message || "approve_failed" });
      } else {
        res.redirect(
          302,
          "/admin/payments?status=pending_verify&flash=approve_err"
        );
      }
    }
  });

  router.post("/admin/payments/:id/reject", requireAdminSession, async (req, res) => {
    const paymentId = String(req.params?.id || "").trim();
    const rejectReason = parseRejectReasonFromBody(req.body || {});
    const approvedBy = "admin_dashboard";

    if (!paymentId) {
      if (prefersAdminJson(req)) {
        res.status(400).json({ ok: false, message: "paymentId_missing" });
      } else {
        res.status(400).send("paymentId_missing");
      }
      return;
    }

    try {
      const { lineUserId } = await markPaymentRejected({
        paymentId,
        rejectReason,
        approvedBy,
      });

      if (lineUserId) {
        void lineClient
          .pushMessage(lineUserId, {
            type: "text",
            text: buildPaymentRejectedText({ reason: rejectReason }),
          })
          .catch((pushErr) => {
            console.error("[ADMIN_DASH] LINE push after reject failed:", {
              message: pushErr?.message,
            });
          });
      }

      if (prefersAdminJson(req)) {
        res.status(200).json({ ok: true });
      } else {
        res.redirect(302, "/admin/payments?status=rejected&flash=rejected");
      }
    } catch (err) {
      console.error("[ADMIN_DASH] reject failed:", err);
      if (prefersAdminJson(req)) {
        res.status(409).json({ ok: false, message: err?.message || "reject_failed" });
      } else {
        res.redirect(
          302,
          "/admin/payments?status=pending_verify&flash=reject_err"
        );
      }
    }
  });

  router.post(
    "/admin/users/:lineUserId/reset-free-trial",
    requireAdminSession,
    express.json(),
    async (req, res) => {
      let lineUserId = String(req.params?.lineUserId || "").trim();
      try {
        lineUserId = decodeURIComponent(lineUserId);
      } catch {
        /* ignore */
      }
      if (!lineUserId) {
        if (wantsJsonResponse(req)) {
          res.status(400).json({ ok: false, message: "line_user_id_missing" });
        } else {
          res.status(400).send("line_user_id_missing");
        }
        return;
      }

      const rawMode =
        typeof req.body?.resetMode === "string"
          ? req.body.resetMode.trim()
          : DEFAULT_ADMIN_FREE_RESET_MODE;
      const resetMode = ADMIN_FREE_RESET_MODES.has(rawMode)
        ? rawMode
        : null;
      if (!resetMode) {
        if (wantsJsonResponse(req)) {
          res.status(400).json({ ok: false, message: "invalid_reset_mode" });
        } else {
          res.status(400).send("invalid_reset_mode");
        }
        return;
      }

      try {
        const tAdmin0 = Date.now();
        const abuseBefore = snapshotAbuseForAdminResetLog(lineUserId, tAdmin0);

        const result = await resetFreeTrialForLineUserByAdmin({
          lineUserId,
          adminLabel: "admin_dashboard",
        });
        const confirm = buildAdminFreeResetConfirmationPayload();
        const resetAt = new Date().toISOString();

        let abuseAfter = snapshotAbuseForAdminResetLog(lineUserId, Date.now());
        let scanAbuseSnapshot = null;
        if (resetMode === "reset_free_quota_and_scan_abuse") {
          scanAbuseSnapshot = adminResetScanAbuseState(lineUserId, Date.now());
          abuseAfter = snapshotAbuseForAdminResetLog(lineUserId, Date.now());
        }

        console.log(
          JSON.stringify({
            event: "ADMIN_FREE_RESET_SUCCESS",
            lineUserId,
            resetMode,
            freeQuotaPerDay: confirm.freeQuotaPerDay,
            resetAt,
            offerLabel: confirm.offerLabel,
            configVersion: confirm.configVersion,
            previousScanSpamScore: abuseBefore.scanSpamScore,
            previousLockState: abuseBefore.lockState,
            newScanSpamScore: abuseAfter.scanSpamScore,
            newLockState: abuseAfter.lockState,
            newIsHardBlocked: abuseAfter.isHardBlocked,
            previousTextSpamScore: abuseBefore.textSpamScore,
            previousPaymentSpamScore: abuseBefore.paymentSpamScore,
            newTextSpamScore: abuseAfter.textSpamScore,
            newPaymentSpamScore: abuseAfter.paymentSpamScore,
            scanAbuseResetApplied: Boolean(scanAbuseSnapshot),
          }),
        );

        if (scanAbuseSnapshot) {
          console.log(
            JSON.stringify({
              event: "ADMIN_SCAN_ABUSE_RESET_SUCCESS",
              lineUserId,
              resetMode,
              resetAt,
              previousScanSpamScore: scanAbuseSnapshot.previousScanSpamScore,
              previousLockState: scanAbuseSnapshot.previousLockState,
              newScanSpamScore: scanAbuseSnapshot.newScanSpamScore,
              newLockState: scanAbuseSnapshot.newLockState,
              newIsHardBlocked: scanAbuseSnapshot.newIsHardBlocked,
            }),
          );
        }

        console.log(
          JSON.stringify({
            event: "ADMIN_DASH_FREE_TRIAL_RESET_APPLIED",
            message: "[ADMIN_DASH] free-trial reset applied",
            lineUserId,
            appUserId: result.appUserId,
            freeQuotaPerDay: confirm.freeQuotaPerDay,
            scansTodayAtReset: result.scansToday,
            resetMode,
          }),
        );

        const lineReplyToken =
          typeof req.body?.lineReplyToken === "string"
            ? req.body.lineReplyToken.trim()
            : "";

        const notifyResult = await notifyLineUserTextAfterAdminAction({
          client: lineClient,
          lineUserId,
          text: confirm.text,
          replyToken: lineReplyToken || null,
          logPrefix: "[ADMIN_DASH_FREE_RESET_NOTIFY]",
        });

        if (!notifyResult.userNotified) {
          const le = /** @type {{ message?: string, status?: number, response?: { status?: number, data?: unknown } }} */ (
            notifyResult.lastError
          );
          console.error(
            JSON.stringify({
              event: "ADMIN_FREE_RESET_NOTIFY_EXHAUSTED",
              lineUserId,
              resetApplied: true,
              userNotified: false,
              notifyError: notifyResult.notifyError,
              attempts: notifyResult.attempts,
              channel: notifyResult.channel,
              message: le?.message,
              status: le?.status ?? le?.response?.status,
              responseData: le?.response?.data ?? null,
            }),
          );
        }

        if (wantsJsonResponse(req)) {
          res.status(200).json({
            ok: true,
            resetApplied: true,
            userNotified: notifyResult.userNotified,
            notifyChannel: notifyResult.channel,
            notifyAttempts: notifyResult.attempts,
            ...(notifyResult.userNotified
              ? {}
              : { notifyError: notifyResult.notifyError || "notify_failed" }),
            ...result,
            resetMode,
            scanAbuseReset: Boolean(scanAbuseSnapshot),
            freeQuotaPerDay: confirm.freeQuotaPerDay,
          });
        } else {
          res.status(200).send("ok");
        }
      } catch (err) {
        console.error("[ADMIN_DASH] reset_free_trial failed:", err);
        const msg = err?.message || "reset_free_trial_failed";
        const code = msg === "app_user_not_found" ? 404 : 409;
        if (wantsJsonResponse(req)) {
          res.status(code).json({ ok: false, message: msg });
        } else {
          res.status(code).send(msg);
        }
      }
    }
  );

  router.post(
    "/admin/users/:lineUserId/revoke-paid-access",
    requireAdminSession,
    async (req, res) => {
      let lineUserId = String(req.params?.lineUserId || "").trim();
      try {
        lineUserId = decodeURIComponent(lineUserId);
      } catch {
        /* ignore */
      }
      if (!lineUserId) {
        if (wantsJsonResponse(req)) {
          res.status(400).json({ ok: false, message: "line_user_id_missing" });
        } else {
          res.status(400).send("line_user_id_missing");
        }
        return;
      }

      try {
        const result = await revokePaidAccessForLineUserByAdmin({
          lineUserId,
          adminLabel: "admin_dashboard",
        });
        if (wantsJsonResponse(req)) {
          res.status(200).json({ ok: true, ...result });
        } else {
          res.status(200).send("ok");
        }
      } catch (err) {
        console.error("[ADMIN_DASH] revoke_paid_access failed:", err);
        const msg = err?.message || "revoke_paid_access_failed";
        const code = msg === "app_user_not_found" ? 404 : 409;
        if (wantsJsonResponse(req)) {
          res.status(code).json({ ok: false, message: msg });
        } else {
          res.status(code).send(msg);
        }
      }
    }
  );

  return router;
}

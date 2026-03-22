/**
 * Admin Dashboard v2 — payments list + detail (mobile-first, dark mode, one-click actions).
 */
import { Router } from "express";

import { supabase } from "../config/supabase.js";
import { requireAdminSession } from "../middleware/requireAdmin.js";
import {
  getPaymentsForAdminByStatus,
  getPaymentStatusCountsForAdmin,
  getPaymentDetailForAdmin,
  markPaymentApprovedAndUnlock,
  markPaymentRejected,
} from "../stores/payments.db.js";
import {
  resetFreeTrialForLineUserByAdmin,
  revokePaidAccessForLineUserByAdmin,
} from "../stores/adminReset.db.js";
import { getScanUsageSummaryForAppUser } from "../stores/paymentAccess.db.js";
import {
  buildPaymentApprovedText,
  buildPaymentRejectedText,
} from "../utils/webhookText.util.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
 */
function adminListTableActionsTd(p) {
  const idRaw = String(p?.id ?? "").trim();
  const idAttr = escapeHtml(idRaw);
  const detailHref = adminPaymentDetailHref(p);
  const canAct = paymentRowCanAct(p);
  const detailLink = `<a class="btn btn-neu" style="padding:6px 10px;font-size:0.78rem;" href="${detailHref}">ดู</a>`;
  const approveReject =
    canAct && idRaw
      ? `<button type="button" class="btn btn-ok js-approve" style="padding:6px 10px;font-size:0.78rem;" data-id="${idAttr}" data-payment-id="${idAttr}">อนุมัติ</button><button type="button" class="btn btn-bad js-reject" style="padding:6px 10px;font-size:0.78rem;" data-id="${idAttr}" data-payment-id="${idAttr}">ปฏิเสธ</button>`
      : "";
  return `<td class="t-actions">${detailLink}${approveReject}</td>`;
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
  if (!iso) return "—";
  try {
    return escapeHtml(new Date(iso).toLocaleString("th-TH"));
  } catch {
    return "—";
  }
}

function fmtDateOnly(iso) {
  if (!iso) return "—";
  try {
    return escapeHtml(new Date(iso).toLocaleDateString("th-TH"));
  } catch {
    return "—";
  }
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
.btn-link { background: transparent; color: var(--info); padding: 8px 10px; }
.table-wrap { display: none; overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
table.data { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
table.data th, table.data td { padding: 10px 8px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: middle; }
table.data th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
table.data tr:last-child td { border-bottom: none; }
table.data .t-actions { white-space: nowrap; position: relative; z-index: 2; }
/* Slip column (9th): clip overflow so thumbs cannot sit on top of Actions (10th). */
table.data td:nth-child(9) {
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

function renderListPage({ rows, filterStatus, flash, statusCounts = {} }) {
  const c = statusCounts || {};
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
    <a class="stat-box${st === filterStatus ? " active" : ""}" href="/admin/payments?status=${encodeURIComponent(st)}">
      <div class="num">${escapeHtml(String(Number(c[st] ?? 0)))}</div>
      <div class="lbl">${escapeHtml(label)}</div>
    </a>`
    )
    .join("");

  const tabsHtml = tabs
    .map(
      ([st, label]) => `
    <a class="tab${st === filterStatus ? " active" : ""}" href="/admin/payments?status=${encodeURIComponent(st)}">${escapeHtml(label)}</a>`
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
      const canAct = paymentRowCanAct(p);
      const reasonRow =
        String(p.status) === "rejected" && p.reject_reason
          ? `<div class="card-row"><b>เหตุผล</b> <span style="word-break:break-word;">${escapeHtml(String(p.reject_reason))}</span></div>`
          : "";
      return `
    <article class="card" data-payment-id="${escapeHtml(p.id)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <span class="${statusBadgeClass(p.status)}">${escapeHtml(p.status)}</span>
          <div class="card-row"><b>LINE</b> <span style="word-break:break-all;">${escapeHtml(p.line_user_id || "—")}</span></div>
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
        ${
          canAct
            ? `
        <button type="button" class="btn btn-ok js-approve" data-id="${escapeHtml(p.id)}" data-payment-id="${escapeHtml(p.id)}">✅ อนุมัติ</button>
        <button type="button" class="btn btn-bad js-reject" data-id="${escapeHtml(p.id)}" data-payment-id="${escapeHtml(p.id)}">❌ ปฏิเสธ</button>`
            : ""
        }
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
      return `
      <tr>
        <td style="max-width:140px;word-break:break-all;font-size:0.78rem;">${escapeHtml(p.line_user_id || "—")}</td>
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

  const presetOpts = rejectPresetOptionsHtml();

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
    <div class="stat-strip">${statStripHtml}</div>
    <nav class="tabs">${tabsHtml}</nav>
    <div class="cards">${empty}${cardsHtml}</div>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>line_user_id</th>
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
        <tbody>${tableRows || `<tr><td colspan="10" style="text-align:center;color:var(--muted);">ไม่มีรายการ</td></tr>`}</tbody>
      </table>
    </div>
  </div>
  <div id="slip-modal" class="modal hidden" aria-hidden="true"><img alt="slip full" /></div>
  <div id="reject-modal" class="modal modal-dialog hidden" aria-hidden="true">
    <div class="dialog-inner" role="dialog" aria-labelledby="reject-title">
      <h3 id="reject-title" style="margin:0 0 12px;font-size:1rem;">ปฏิเสธสลิป</h3>
      <p class="reject-hint">เลือกเหตุผลหลัก หรือระบุเพิ่มในช่องรายละเอียด</p>
      <label for="reject-preset">เหตุผล</label>
      <select id="reject-preset">${presetOpts}</select>
      <label for="reject-detail">รายละเอียดเพิ่มเติม (ถ้ามี)</label>
      <textarea id="reject-detail" rows="3" placeholder="เช่น หมายเลขอ้างอิง / หมายเหตุสั้น ๆ"></textarea>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        <button type="button" class="btn btn-neu" id="reject-cancel" style="flex:1;">ยกเลิก</button>
        <button type="button" class="btn btn-bad" id="reject-confirm" style="flex:1;">ยืนยันปฏิเสธ</button>
      </div>
    </div>
  </div>
  <script>
    (function () {
      try {
      var initialFlash = ${JSON.stringify(flash || "")};
      var pendingRejectBtn = null;
      var ADMIN_JSON_HEADERS = { Accept: "application/json", "X-Admin-Json": "1" };
      function qs(sel) { return document.querySelector(sel); }
      function showToast(msg, kind) {
        var t = qs("#toast");
        if (!t) return;
        t.textContent = msg;
        t.className = "toast show " + (kind === "err" ? "toast-err" : "toast-ok");
        clearTimeout(t._tm);
        t._tm = setTimeout(function () { t.className = "toast"; }, kind === "err" ? 4200 : 2800);
      }
      function actionScopeFromBtn(btn) {
        return btn && (btn.closest("article.card") || btn.closest("tr"));
      }
      function setScopeActionBusy(scope, busy, activeBtn, loadingLabel) {
        if (!scope) {
          if (activeBtn) {
            if (busy) {
              if (!activeBtn.dataset._admOrig) activeBtn.dataset._admOrig = activeBtn.textContent;
              activeBtn.disabled = true;
              activeBtn.textContent = loadingLabel || "…";
            } else {
              activeBtn.disabled = false;
              if (activeBtn.dataset._admOrig) activeBtn.textContent = activeBtn.dataset._admOrig;
            }
          }
          return;
        }
        var xs = scope.querySelectorAll(".js-approve, .js-reject");
        for (var i = 0; i < xs.length; i++) {
          var b = xs[i];
          if (busy) {
            if (!b.dataset._admOrig) b.dataset._admOrig = b.textContent;
            b.disabled = true;
            if (activeBtn === b) b.textContent = loadingLabel || "…";
          } else {
            b.disabled = false;
            if (b.dataset._admOrig) b.textContent = b.dataset._admOrig;
          }
        }
      }
      function openRejectModal(btn) {
        pendingRejectBtn = btn;
        var rd = qs("#reject-detail");
        var rp = qs("#reject-preset");
        var rc = qs("#reject-confirm");
        var m = qs("#reject-modal");
        if (!rd || !rp || !rc || !m) return;
        rd.value = "";
        rp.selectedIndex = 0;
        rc.disabled = false;
        rc.textContent = "ยืนยันปฏิเสธ";
        m.classList.remove("hidden");
        m.setAttribute("aria-hidden", "false");
      }
      function closeRejectModal() {
        var m = qs("#reject-modal");
        if (!m) return;
        m.classList.add("hidden");
        m.setAttribute("aria-hidden", "true");
        pendingRejectBtn = null;
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
      var rejectModalEl = document.getElementById("reject-modal");
      if (rejectModalEl) {
        rejectModalEl.addEventListener("click", function (e) {
          if (e.target === this) closeRejectModal();
        });
      }
      var rejectCancelEl = document.getElementById("reject-cancel");
      if (rejectCancelEl) rejectCancelEl.addEventListener("click", closeRejectModal);
      document.body.addEventListener("click", function (e) {
        var z = e.target.closest(".slip-zoom");
        if (z && z.dataset.full) openModal(z.dataset.full);
      });
      if (initialFlash) {
        showToast(initialFlash, "ok");
        try {
          var u = new URL(location.href);
          u.searchParams.delete("flash");
          history.replaceState({}, "", u.toString());
        } catch (_) {}
      }
      async function postApprove(btn) {
        if (!btn || btn.disabled) return;
        var scope = actionScopeFromBtn(btn);
        setScopeActionBusy(scope, true, btn, "กำลังอนุมัติ…");
        try {
          var payId = String(btn.dataset.id || "").trim();
          if (!payId) throw new Error("missing_payment_id");
          var r = await fetch("/admin/payments/" + encodeURIComponent(payId) + "/approve", {
            method: "POST",
            headers: Object.assign({}, ADMIN_JSON_HEADERS),
            credentials: "same-origin"
          });
          var j = null;
          try { j = await r.json(); } catch (_) {}
          if (!r.ok || (j && j.ok === false)) throw new Error((j && j.message) || ("HTTP " + r.status));
          showToast("อนุมัติแล้ว ✅", "ok");
          setTimeout(function () { location.reload(); }, 900);
        } catch (err) {
          showToast(err.message || "เกิดข้อผิดพลาด", "err");
          setScopeActionBusy(scope, false, btn);
        }
      }
      async function postRejectFromModal() {
        var btn = pendingRejectBtn;
        if (!btn || btn.disabled) return;
        var rpEl = qs("#reject-preset");
        var rdEl = qs("#reject-detail");
        var rc = qs("#reject-confirm");
        if (!rpEl || !rdEl || !rc) return;
        var preset = rpEl.value;
        var detail = rdEl.value;
        if (preset === "other" && !String(detail).trim()) {
          showToast("กรุณาระบุเหตุผลเมื่อเลือก \"อื่น ๆ\"", "err");
          return;
        }
        var scope = actionScopeFromBtn(btn);
        var rcOrig = rc.textContent;
        setScopeActionBusy(scope, true, btn, "กำลังปฏิเสธ…");
        rc.disabled = true;
        rc.textContent = "กำลังส่ง…";
        closeRejectModal();
        try {
          var body = new URLSearchParams();
          body.set("reject_preset", preset);
          body.set("reject_detail", detail);
          var payId2 = String(btn.dataset.id || "").trim();
          if (!payId2) throw new Error("missing_payment_id");
          var r = await fetch("/admin/payments/" + encodeURIComponent(payId2) + "/reject", {
            method: "POST",
            headers: Object.assign(
              { "Content-Type": "application/x-www-form-urlencoded" },
              ADMIN_JSON_HEADERS
            ),
            body: body.toString(),
            credentials: "same-origin"
          });
          var j = null;
          try { j = await r.json(); } catch (_) {}
          if (!r.ok || (j && j.ok === false)) throw new Error((j && j.message) || ("HTTP " + r.status));
          showToast("บันทึกการปฏิเสธแล้ว", "ok");
          setTimeout(function () { location.reload(); }, 900);
        } catch (err) {
          showToast(err.message || "เกิดข้อผิดพลาด", "err");
          setScopeActionBusy(scope, false, btn);
          rc.disabled = false;
          rc.textContent = rcOrig;
        }
      }
      var rejectConfirmEl = document.getElementById("reject-confirm");
      if (rejectConfirmEl) rejectConfirmEl.addEventListener("click", postRejectFromModal);
      document.body.addEventListener("click", function (e) {
        var a = e.target.closest(".js-approve");
        if (a) {
          e.preventDefault();
          postApprove(a);
        }
        var rj = e.target.closest(".js-reject");
        if (rj) {
          e.preventDefault();
          openRejectModal(rj);
        }
      });
      } catch (initErr) {
        console.error("[admin-payments-list] script init failed", initErr);
      }
    })();
  </script>
</body>
</html>`;
}

function renderDetailPage({
  payment,
  scanSummary,
  flash,
}) {
  const p = payment;
  const au = embeddedAppUser(p);
  const slip = p.slip_url ? escapeHtml(p.slip_url) : "";
  const canAct = String(p.status) === "pending_verify";
  const rem =
    au?.paid_remaining_scans != null
      ? escapeHtml(String(au.paid_remaining_scans))
      : "—";
  const flashHtml = flash
    ? `<p class="flash-ok" style="margin:0 0 12px;">${escapeHtml(flash)}</p>`
    : "";

  const rejectPanelHtml = canAct
    ? `<div class="reject-panel" id="reject-panel-block">
    <h3>ปฏิเสธสลิป</h3>
    <p class="reject-hint">เลือกเหตุผลหลัก หรือระบุเพิ่ม (ถ้าเลือก &quot;อื่น ๆ&quot; ต้องกรอกรายละเอียด)</p>
    <label for="detail-reject-preset">เหตุผล</label>
    <select id="detail-reject-preset">${rejectPresetOptionsHtml()}</select>
    <label for="detail-reject-detail">รายละเอียดเพิ่มเติม (ถ้ามี)</label>
    <textarea id="detail-reject-detail" rows="3" placeholder="เช่น หมายเลขอ้างอิง / หมายเหตุสั้น ๆ"></textarea>
  </div>`
    : "";

  const rejectReasonKv =
    String(p.status) === "rejected"
      ? `<div>reject_reason</div><div style="word-break:break-word;">${p.reject_reason ? escapeHtml(String(p.reject_reason)) : "—"}</div>`
      : "";

  const lineUid = p.line_user_id ? String(p.line_user_id).trim() : "";
  const adminToolsHtml = lineUid
    ? `<div class="panel" style="margin-top:14px;">
    <h2>การดูแล (แอดมิน)</h2>
    <p class="reject-hint"><strong>รีเซ็ตสิทธิ์ทดลองฟรี</strong> — เคลียร์ paid + ตั้งโควต้าฟรีวันนี้ให้เหลือ 2 ครั้ง (offset) · <strong>ไม่ลบ</strong>ประวัติ · ปิด payment ที่ค้าง</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
      <button type="button" class="btn btn-neu js-reset-free">รีเซ็ตสิทธิ์ทดลองฟรี</button>
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
          <div>id</div><div style="word-break:break-all;">${escapeHtml(p.id)}</div>
          <div>line_user_id</div><div style="word-break:break-all;">${escapeHtml(p.line_user_id || "—")}</div>
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
    canAct
      ? `<div class="sticky-actions">
    <a class="btn btn-neu" href="/admin/payments?status=pending_verify">← กลับ</a>
    <button type="button" class="btn btn-ok js-approve" data-id="${escapeHtml(p.id)}">✅ อนุมัติ</button>
    <button type="button" class="btn btn-bad js-reject" data-id="${escapeHtml(p.id)}">❌ ปฏิเสธ</button>
  </div>`
      : `<div class="sticky-actions">
    <a class="btn btn-neu" href="/admin/payments?status=${encodeURIComponent(String(p.status))}">← กลับรายการ</a>
  </div>`
  }
  <script>
    (function () {
      try {
      var pid = ${JSON.stringify(p.id)};
      var lineUid = ${lineUid ? JSON.stringify(lineUid) : "null"};
      var ADMIN_JSON_HEADERS = { Accept: "application/json", "X-Admin-Json": "1" };
      function qs(s) { return document.querySelector(s); }
      function showToast(msg, kind) {
        var t = qs("#toast");
        if (!t) return;
        t.textContent = msg;
        t.className = "toast show " + (kind === "err" ? "toast-err" : "toast-ok");
        clearTimeout(t._tm);
        t._tm = setTimeout(function () { t.className = "toast"; }, kind === "err" ? 4200 : 2800);
      }
      function setDetailStickyBusy(busy, activeBtn, loadingLabel) {
        var nodes = document.querySelectorAll(".sticky-actions .js-approve, .sticky-actions .js-reject");
        for (var i = 0; i < nodes.length; i++) {
          var b = nodes[i];
          if (busy) {
            if (!b.dataset._admOrig) b.dataset._admOrig = b.textContent;
            b.disabled = true;
            if (b === activeBtn) b.textContent = loadingLabel || "…";
          } else {
            b.disabled = false;
            if (b.dataset._admOrig) b.textContent = b.dataset._admOrig;
          }
        }
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
      async function approve(btn) {
        if (!btn || btn.disabled) return;
        setDetailStickyBusy(true, btn, "กำลังอนุมัติ…");
        try {
          var r = await fetch("/admin/payments/" + encodeURIComponent(String(pid || "").trim()) + "/approve", {
            method: "POST",
            headers: Object.assign({}, ADMIN_JSON_HEADERS),
            credentials: "same-origin"
          });
          var j = await r.json().catch(function () { return null; });
          if (!r.ok || (j && j.ok === false)) throw new Error((j && j.message) || ("HTTP " + r.status));
          showToast("อนุมัติแล้ว ✅", "ok");
          setTimeout(function () {
            location.href = "/admin/payments?status=paid&flash=approved";
          }, 900);
        } catch (e) {
          showToast(e.message || "เกิดข้อผิดพลาด", "err");
          setDetailStickyBusy(false, btn);
        }
      }
      async function reject(btn) {
        if (!btn || btn.disabled) return;
        var presetEl = qs("#detail-reject-preset");
        var detailEl = qs("#detail-reject-detail");
        if (!presetEl || !detailEl) {
          showToast("ไม่พบฟอร์มเหตุผล", "err");
          return;
        }
        var preset = presetEl.value;
        var detail = detailEl.value;
        if (preset === "other" && !String(detail).trim()) {
          showToast("กรุณาระบุเหตุผลเมื่อเลือก \"อื่น ๆ\"", "err");
          return;
        }
        setDetailStickyBusy(true, btn, "กำลังปฏิเสธ…");
        try {
          var body = new URLSearchParams();
          body.set("reject_preset", preset);
          body.set("reject_detail", detail);
          var r = await fetch("/admin/payments/" + encodeURIComponent(String(pid || "").trim()) + "/reject", {
            method: "POST",
            headers: Object.assign(
              { "Content-Type": "application/x-www-form-urlencoded" },
              ADMIN_JSON_HEADERS
            ),
            body: body.toString(),
            credentials: "same-origin"
          });
          var j = await r.json().catch(function () { return null; });
          if (!r.ok || (j && j.ok === false)) throw new Error((j && j.message) || ("HTTP " + r.status));
          showToast("บันทึกการปฏิเสธแล้ว", "ok");
          setTimeout(function () {
            location.href = "/admin/payments?status=rejected&flash=rejected";
          }, 900);
        } catch (e) {
          showToast(e.message || "เกิดข้อผิดพลาด", "err");
          setDetailStickyBusy(false, btn);
        }
      }
      var ap = document.querySelector(".js-approve");
      var rj = document.querySelector(".js-reject");
      if (ap) ap.addEventListener("click", function () { approve(ap); });
      if (rj) rj.addEventListener("click", function () { reject(rj); });
      var rb = document.querySelector(".js-reset-free");
      if (rb && lineUid) {
        rb.addEventListener("click", async function () {
          if (!confirm("ยืนยันรีเซ็ตสิทธิ์ทดลองฟรี?\\n\\n• ยกเลิก paid\\n• โควต้าฟรีวันนี้กลับไป 2 ครั้ง (ไม่ลบประวัติ)\\n• ปิด payment ที่ค้าง")) return;
          rb.disabled = true;
          try {
            var r = await fetch("/admin/users/" + encodeURIComponent(lineUid) + "/reset-free-trial", {
              method: "POST",
              headers: { Accept: "application/json" },
              credentials: "same-origin"
            });
            var j = await r.json().catch(function () { return null; });
            if (!r.ok || (j && j.ok === false)) throw new Error((j && j.message) || "รีเซ็ตไม่สำเร็จ");
            showToast("รีเซ็ตสิทธิ์ทดลองฟรีแล้ว", "ok");
            setTimeout(function () { location.reload(); }, 650);
          } catch (e) {
            showToast(e.message || "เกิดข้อผิดพลาด", "err");
            rb.disabled = false;
          }
        });
      }
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
      const [{ rows, filterStatus }, statusCounts] = await Promise.all([
        getPaymentsForAdminByStatus({
          status,
          limit: 200,
        }),
        getPaymentStatusCountsForAdmin(),
      ]);
      const flashMap = {
        approved: "อนุมัติแล้ว ✅",
        rejected: "บันทึกการปฏิเสธแล้ว",
      };
      const flash = flashMap[String(req.query?.flash || "")] || "";
      const html = renderListPage({ rows, filterStatus, flash, statusCounts });
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

      const uid = payment.user_id || embeddedAppUser(payment)?.id;
      const scanSummary = uid
        ? await getScanUsageSummaryForAppUser(uid)
        : { totalScans: 0, lastScanAt: null };

      const flashMap = { approved: "อนุมัติแล้ว ✅", rejected: "บันทึกการปฏิเสธแล้ว" };
      const flash = flashMap[String(req.query?.flash || "")] || "";

      const html = renderDetailPage({
        payment,
        scanSummary,
        flash,
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

  router.post("/admin/payments/:id/approve", requireAdminSession, async (req, res) => {
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

      if (!isIdempotent) {
        const paidUntilDate = activation.paidUntil
          ? new Date(activation.paidUntil)
          : null;
        const paidUntilText = paidUntilDate
          ? paidUntilDate.toLocaleDateString("th-TH")
          : "ภายใน 24 ชั่วโมง";

        const paidRemainingText =
          Number(activation.paidRemainingScans) >= 999999
            ? "สแกนได้ไม่จำกัดช่วงที่สิทธิ์ใช้งานอยู่"
            : `สแกนได้อีก ${activation.paidRemainingScans} ครั้ง`;

        const message = buildPaymentApprovedText({
          paidRemainingLine: paidRemainingText,
          paidUntilLine: `หมดอายุ: ${paidUntilText}`,
        });

        void lineClient
          .pushMessage(activation.lineUserId, {
            type: "text",
            text: message,
          })
          .catch((pushErr) => {
            console.error("[ADMIN_DASH] LINE push after approve failed:", {
              message: pushErr?.message,
            });
          });
      }

      if (prefersAdminJson(req)) {
        res.status(200).json({ ok: true, idempotent: Boolean(isIdempotent) });
      } else {
        res.status(200).send("ok");
      }
    } catch (err) {
      console.error("[ADMIN_DASH] approve failed:", err);
      if (prefersAdminJson(req)) {
        res.status(409).json({ ok: false, message: err?.message || "approve_failed" });
      } else {
        res.status(409).send(err?.message || "approve_failed");
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
        res.status(200).send("ok");
      }
    } catch (err) {
      console.error("[ADMIN_DASH] reject failed:", err);
      if (prefersAdminJson(req)) {
        res.status(409).json({ ok: false, message: err?.message || "reject_failed" });
      } else {
        res.status(409).send(err?.message || "reject_failed");
      }
    }
  });

  router.post(
    "/admin/users/:lineUserId/reset-free-trial",
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
        const result = await resetFreeTrialForLineUserByAdmin({
          lineUserId,
          adminLabel: "admin_dashboard",
        });
        if (wantsJsonResponse(req)) {
          res.status(200).json({ ok: true, ...result });
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

/**
 * Admin Dashboard v2 — payments list + detail (mobile-first, dark mode, one-click actions).
 */
import { Router } from "express";

import { supabase } from "../config/supabase.js";
import { requireAdminSession } from "../middleware/requireAdmin.js";
import {
  getPaymentsForAdminByStatus,
  getPaymentDetailForAdmin,
  markPaymentApprovedAndUnlock,
  markPaymentRejected,
} from "../stores/payments.db.js";
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
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
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
table.data .t-actions { white-space: nowrap; }
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
.sticky-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  z-index: 40;
}
.sticky-actions .btn { flex: 1 1 140px; max-width: 220px; }
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  cursor: zoom-out;
}
.modal.hidden { display: none; }
.modal img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}
.flash-ok { color: var(--ok); font-weight: 700; }
.toast {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 120;
  background: var(--ok);
  color: #fff;
  padding: 10px 18px;
  border-radius: 999px;
  font-weight: 700;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  display: none;
}
.toast.show { display: block; }
`;

function slipThumbHtml(slipUrl) {
  if (!slipUrl) {
    return '<div class="thumb-ph">ไม่มีสลิป</div>';
  }
  const u = escapeHtml(slipUrl);
  return `<img class="thumb slip-zoom" src="${u}" alt="slip" width="72" height="72" loading="lazy" referrerpolicy="no-referrer" data-full="${u}" />`;
}

function renderListPage({ rows, filterStatus, flash }) {
  const tabs = [
    ["pending_verify", "รอตรวจสลิป"],
    ["awaiting_payment", "รอสลิป"],
    ["paid", "จ่ายแล้ว"],
    ["rejected", "ปฏิเสธ"],
  ];

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
      const canAct = String(p.status) === "pending_verify";
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
        </div>
        ${slipThumbHtml(p.slip_url)}
      </div>
      <div class="actions">
        <a class="btn btn-neu" href="/admin/payments/${escapeHtml(p.id)}">👁 รายละเอียด</a>
        ${
          canAct
            ? `
        <button type="button" class="btn btn-ok js-approve" data-id="${escapeHtml(p.id)}">✅ อนุมัติ</button>
        <button type="button" class="btn btn-bad js-reject" data-id="${escapeHtml(p.id)}">❌ ปฏิเสธ</button>`
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
      const canAct = String(p.status) === "pending_verify";
      return `
      <tr>
        <td style="max-width:140px;word-break:break-all;font-size:0.78rem;">${escapeHtml(p.line_user_id || "—")}</td>
        <td>${fmtMoney(p)}</td>
        <td>${escapeHtml(p.package_code || "—")}</td>
        <td><span class="${statusBadgeClass(p.status)}">${escapeHtml(p.status)}</span></td>
        <td>${fmtDt(p.created_at)}</td>
        <td>${rem}</td>
        <td>${pu}</td>
        <td>${slipThumbHtml(p.slip_url)}</td>
        <td class="t-actions">
          <a class="btn btn-neu" style="padding:6px 10px;font-size:0.78rem;" href="/admin/payments/${escapeHtml(p.id)}">ดู</a>
          ${
            canAct
              ? `
          <button type="button" class="btn btn-ok js-approve" style="padding:6px 10px;font-size:0.78rem;" data-id="${escapeHtml(p.id)}">อนุมัติ</button>
          <button type="button" class="btn btn-bad js-reject" style="padding:6px 10px;font-size:0.78rem;" data-id="${escapeHtml(p.id)}">ปฏิเสธ</button>`
              : ""
          }
        </td>
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
  <div id="toast" class="toast">อนุมัติแล้ว ✅</div>
  <div class="wrap">
    <div class="topbar">
      <h1>💳 Payments</h1>
      <form method="POST" action="/admin/logout" style="margin:0;">
        <button type="submit">ออกจากระบบ</button>
      </form>
    </div>
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
            <th>created</th>
            <th>remaining</th>
            <th>paid_until</th>
            <th>slip</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>${tableRows || `<tr><td colspan="9" style="text-align:center;color:var(--muted);">ไม่มีรายการ</td></tr>`}</tbody>
      </table>
    </div>
  </div>
  <div id="slip-modal" class="modal hidden" aria-hidden="true"><img alt="slip full" /></div>
  <script>
    (function () {
      var initialFlash = ${JSON.stringify(flash || "")};
      function qs(sel) { return document.querySelector(sel); }
      function showToast(msg) {
        var t = qs("#toast");
        t.textContent = msg;
        t.classList.add("show");
        setTimeout(function () { t.classList.remove("show"); }, 2200);
      }
      function openModal(src) {
        var m = qs("#slip-modal");
        m.querySelector("img").src = src;
        m.classList.remove("hidden");
        m.setAttribute("aria-hidden", "false");
      }
      function closeModal() {
        var m = qs("#slip-modal");
        m.classList.add("hidden");
        m.setAttribute("aria-hidden", "true");
      }
      document.getElementById("slip-modal").addEventListener("click", closeModal);
      document.body.addEventListener("click", function (e) {
        var z = e.target.closest(".slip-zoom");
        if (z && z.dataset.full) openModal(z.dataset.full);
      });
      if (initialFlash) {
        showToast(initialFlash);
        try {
          var u = new URL(location.href);
          u.searchParams.delete("flash");
          history.replaceState({}, "", u.toString());
        } catch (_) {}
      }
      async function postAction(path, btn, loadingLabel) {
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        var orig = btn.textContent;
        btn.textContent = loadingLabel;
        try {
          var r = await fetch(path, {
            method: "POST",
            headers: { Accept: "application/json" },
            credentials: "same-origin"
          });
          var j = null;
          try { j = await r.json(); } catch (_) {}
          if (!r.ok) throw new Error((j && j.message) || r.statusText || "failed");
          showToast(path.indexOf("approve") !== -1 ? "อนุมัติแล้ว ✅" : "ปฏิเสธแล้ว");
          setTimeout(function () { location.reload(); }, 600);
        } catch (err) {
          alert(err.message || "เกิดข้อผิดพลาด");
          btn.disabled = false;
          btn.textContent = orig;
        }
      }
      document.body.addEventListener("click", function (e) {
        var a = e.target.closest(".js-approve");
        if (a) {
          e.preventDefault();
          postAction("/admin/payments/" + a.dataset.id + "/approve", a, "กำลังอนุมัติ…");
        }
        var rj = e.target.closest(".js-reject");
        if (rj) {
          e.preventDefault();
          var reason = prompt("เหตุผลปฏิเสธ (ถ้ามี):") || "";
          postReject(rj, reason);
        }
      });
      async function postReject(btn, reason) {
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        var orig = btn.textContent;
        btn.textContent = "กำลังปฏิเสธ…";
        try {
          var body = new URLSearchParams();
          if (reason) body.set("reject_reason", reason);
          var r = await fetch("/admin/payments/" + btn.dataset.id + "/reject", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: body.toString(),
            credentials: "same-origin"
          });
          var j = null;
          try { j = await r.json(); } catch (_) {}
          if (!r.ok) throw new Error((j && j.message) || r.statusText || "failed");
          showToast("ปฏิเสธแล้ว");
          setTimeout(function () { location.reload(); }, 600);
        } catch (err) {
          alert(err.message || "เกิดข้อผิดพลาด");
          btn.disabled = false;
          btn.textContent = orig;
        }
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

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Payment ${escapeHtml(p.id)} — Ener Scan</title>
  <style>${DASHBOARD_STYLES}</style>
</head>
<body>
  <div class="wrap">
    ${flashHtml}
    <p style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between;">
      <a href="/admin/payments?status=${encodeURIComponent(String(p.status))}">← กลับรายการ</a>
      <form method="POST" action="/admin/logout" style="margin:0;"><button type="submit" class="btn btn-neu" style="padding:6px 12px;font-size:0.85rem;">ออกจากระบบ</button></form>
    </p>
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
    <div class="panel" style="margin-top:14px;">
      <h2>สลิป</h2>
      ${
        slip
          ? `<p style="margin:0 0 8px;color:var(--muted);font-size:0.85rem;">แตะรูปเพื่อขยายเต็มจอ · <a href="${slip}" target="_blank" rel="noopener">เปิดแท็บใหม่</a></p>
          <img class="slip-large slip-zoom" src="${slip}" alt="slip" data-full="${slip}" referrerpolicy="no-referrer" />`
          : `<p style="color:var(--muted);">ไม่มีไฟล์สลิป</p>`
      }
    </div>
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
  <div id="slip-modal" class="modal hidden" aria-hidden="true"><img alt="slip full" /></div>
  <script>
    (function () {
      function qs(s) { return document.querySelector(s); }
      function openModal(src) {
        var m = qs("#slip-modal");
        m.querySelector("img").src = src;
        m.classList.remove("hidden");
      }
      function closeModal() { qs("#slip-modal").classList.add("hidden"); }
      qs("#slip-modal").addEventListener("click", closeModal);
      document.body.addEventListener("click", function (e) {
        var z = e.target.closest(".slip-zoom");
        if (z && z.dataset.full) openModal(z.dataset.full);
      });
      async function approve(btn) {
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        btn.textContent = "กำลังอนุมัติ…";
        try {
          var r = await fetch("/admin/payments/" + btn.dataset.id + "/approve", {
            method: "POST",
            headers: { Accept: "application/json" },
            credentials: "same-origin"
          });
          var j = await r.json().catch(function () { return null; });
          if (!r.ok) throw new Error((j && j.message) || "failed");
          location.href = "/admin/payments?status=paid&flash=approved";
        } catch (e) {
          alert(e.message);
          btn.disabled = false;
          btn.textContent = "✅ อนุมัติ";
        }
      }
      async function reject(btn) {
        if (!btn || btn.disabled) return;
        var reason = prompt("เหตุผลปฏิเสธ (ถ้ามี):") || "";
        btn.disabled = true;
        btn.textContent = "กำลังปฏิเสธ…";
        try {
          var body = new URLSearchParams();
          if (reason) body.set("reject_reason", reason);
          var r = await fetch("/admin/payments/" + btn.dataset.id + "/reject", {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
            credentials: "same-origin"
          });
          var j = await r.json().catch(function () { return null; });
          if (!r.ok) throw new Error((j && j.message) || "failed");
          location.href = "/admin/payments?status=rejected&flash=rejected";
        } catch (e) {
          alert(e.message);
          btn.disabled = false;
          btn.textContent = "❌ ปฏิเสธ";
        }
      }
      document.querySelector(".js-approve") && document.querySelector(".js-approve").addEventListener("click", function () {
        approve(document.querySelector(".js-approve"));
      });
      document.querySelector(".js-reject") && document.querySelector(".js-reject").addEventListener("click", function () {
        reject(document.querySelector(".js-reject"));
      });
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
      const { rows, filterStatus } = await getPaymentsForAdminByStatus({
        status,
        limit: 200,
      });
      const flashMap = {
        approved: "อนุมัติแล้ว ✅",
        rejected: "บันทึกการปฏิเสธแล้ว",
      };
      const flash = flashMap[String(req.query?.flash || "")] || "";
      const html = renderListPage({ rows, filterStatus, flash });
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

  router.post("/admin/payments/:id/approve", requireAdminSession, async (req, res) => {
    const paymentId = String(req.params?.id || "").trim();
    const approvedBy = "admin_dashboard";

    if (!paymentId) {
      if (wantsJsonResponse(req)) {
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

        await lineClient.pushMessage(activation.lineUserId, {
          type: "text",
          text: message,
        });
      }

      if (wantsJsonResponse(req)) {
        res.status(200).json({ ok: true, idempotent: Boolean(isIdempotent) });
      } else {
        res.status(200).send("ok");
      }
    } catch (err) {
      console.error("[ADMIN_DASH] approve failed:", err);
      if (wantsJsonResponse(req)) {
        res.status(409).json({ ok: false, message: err?.message || "approve_failed" });
      } else {
        res.status(409).send(err?.message || "approve_failed");
      }
    }
  });

  router.post("/admin/payments/:id/reject", requireAdminSession, async (req, res) => {
    const paymentId = String(req.params?.id || "").trim();
    const rejectReason = req.body?.reject_reason || req.body?.reason || null;
    const approvedBy = "admin_dashboard";

    if (!paymentId) {
      if (wantsJsonResponse(req)) {
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
        await lineClient.pushMessage(lineUserId, {
          type: "text",
          text: buildPaymentRejectedText(),
        });
      }

      if (wantsJsonResponse(req)) {
        res.status(200).json({ ok: true });
      } else {
        res.status(200).send("ok");
      }
    } catch (err) {
      console.error("[ADMIN_DASH] reject failed:", err);
      if (wantsJsonResponse(req)) {
        res.status(409).json({ ok: false, message: err?.message || "reject_failed" });
      } else {
        res.status(409).send(err?.message || "reject_failed");
      }
    }
  });

  return router;
}

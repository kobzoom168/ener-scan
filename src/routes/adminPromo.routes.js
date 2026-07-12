/**
 * /admin/promo — จัดการแพ็กราคา + โควตาฟรี แบบมีผลสด (ไม่ต้อง deploy):
 * ค่าเก็บใน app_settings key "scan_offer" ชนะไฟล์ scanOffer.default.json,
 * แชท (paywall/พิมพ์ จ่าย) และหน้า LIFF อ่านจากชุดเดียวกันผ่าน loadActiveScanOffer.
 * ปุ่มล้าง override = กลับไปใช้ค่าจากไฟล์ในโค้ด.
 */
import express from "express";
import { requireAdminSession } from "../middleware/requireAdmin.js";
import {
  loadActiveScanOffer,
  normalizeScanOffer,
  saveScanOfferOverride,
  getScanOfferOverrideRaw,
} from "../services/scanOffer.loader.js";
import { buildSingleOfferPaywallAltText, formatOfferWindowThai } from "../utils/webhookText.util.js";
import { setAppSetting } from "../stores/appSettings.db.js";
import {
  getRenewalReminderConfig,
  RENEWAL_REMINDER_DEFAULTS,
} from "../services/scanV2/renewalReminder.service.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageHtml({ offer, overrideOn, savedMsg, errorMsg, renewal }) {
  const pkgRows = offer.packages
    .map(
      (p, i) => `
    <div class="pkg" data-i="${i}">
      <div class="pkg-head">
        <b>แพ็ก ${i + 1}</b>
        <label class="chk"><input type="checkbox" class="f-active"${p.active ? " checked" : ""}/> เปิดขาย</label>
        <label class="chk"><input type="radio" name="defaultPkg" class="f-default"${p.key === offer.defaultPackageKey ? " checked" : ""}/> แพ็กหลัก</label>
        <button type="button" class="btn mini js-del">🗑️</button>
      </div>
      <div class="row3">
        <label>ราคา (บาท)<input type="number" class="f-price" min="1" value="${p.priceThb}"/></label>
        <label>จำนวนครั้ง<input type="number" class="f-count" min="1" value="${p.scanCount}"/></label>
        <label>อายุ (ชั่วโมง)<input type="number" class="f-hours" min="1" value="${p.windowHours}"/><small>24=1วัน · 168=7วัน · 720=30วัน</small></label>
      </div>
      <label>ป้ายชื่อ (โชว์ลูกค้า)<input type="text" class="f-label" value="${esc(p.label)}"/></label>
      <input type="hidden" class="f-key" value="${esc(p.key)}"/>
    </div>`,
    )
    .join("\n");

  const preview = buildSingleOfferPaywallAltText(offer);

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Ener Scan — โปรโมชัน</title>
<style>
  :root{--bg:#14120d;--card:#1e1b14;--line:#3a3426;--ink:#efe8d8;--muted:#9c937d;--accent:#e6c34a;--ok:#69b47c;--warn:#e08b4a}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:780px;margin:0 auto;padding:18px 14px 80px}
  .topbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px}
  h1{font-size:1.25rem;margin:0}
  a.btn,button.btn{background:#2a2618;border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:8px 14px;
    font-size:.9rem;font-weight:700;text-decoration:none;cursor:pointer}
  button.save{background:var(--accent);color:#1c1808;border:none}
  .btn.mini{padding:5px 10px;font-size:.78rem}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:14px}
  .card h2{font-size:.95rem;margin:0 0 10px;color:var(--accent)}
  label{display:flex;flex-direction:column;gap:4px;font-size:.82rem;color:var(--muted);margin-bottom:8px}
  input[type=number],input[type=text]{background:#141109;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px 10px;font-size:.95rem}
  .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
  .pkg{border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:12px;background:#191611}
  .pkg-head{display:flex;align-items:center;gap:14px;margin-bottom:10px}
  .pkg-head b{color:var(--accent)}
  .chk{flex-direction:row;align-items:center;gap:6px;margin:0;font-size:.8rem}
  .js-del{margin-left:auto}
  .banner{border-radius:10px;padding:10px 12px;font-size:.85rem;margin-bottom:14px}
  .banner.ok{background:#1d2b1f;border:1px solid var(--ok);color:#b9e2c2}
  .banner.err{background:#2d1c14;border:1px solid var(--warn);color:#eec3a4}
  .src{font-size:.78rem;color:var(--muted);margin-bottom:12px}
  .src b{color:${"${"}""}</style>`.replace("${\"\"}", "var(--ok)") + `
<style>pre.preview{background:#0f0d08;border:1px dashed var(--line);border-radius:10px;padding:12px;font-size:.85rem;white-space:pre-wrap;color:#cfc6ae;font-family:inherit}
small{color:var(--muted);font-size:.7rem}</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <h1>🏷️ โปรโมชัน / แพ็กราคา</h1>
    <a class="btn" href="/admin">← หน้ารวม</a>
  </div>
  ${savedMsg ? `<div class="banner ok">✅ ${esc(savedMsg)}</div>` : ""}
  ${errorMsg ? `<div class="banner err">⚠️ ${esc(errorMsg)}</div>` : ""}
  <p class="src">ค่าที่ใช้อยู่ตอนนี้มาจาก: <b>${overrideOn ? "หน้านี้ (override ใน DB)" : "ไฟล์ในโค้ด (ยังไม่เคยบันทึกจากหน้านี้)"}</b> · มีผลกับแชท + หน้า LIFF ภายใน ~30 วิ</p>

  <form method="POST" action="/admin/promo/save" id="promoForm">
    <div class="card">
      <h2>โควตาฟรี</h2>
      <label style="max-width:220px">ฟรีวันละ (ครั้ง/คน)
        <input type="number" name="freeQuotaPerDay" min="0" value="${offer.freeQuotaPerDay}"/>
      </label>
    </div>

    <div class="card">
      <h2>แพ็กชำระเงิน</h2>
      <div id="pkgList">
${pkgRows}
      </div>
      <button type="button" class="btn" id="addPkg">➕ เพิ่มแพ็ก</button>
    </div>

    <div class="card">
      <h2>เตือนต่ออายุรายเดือนอัตโนมัติ</h2>
      <label class="chk" style="flex-direction:row;align-items:center;gap:8px">
        <input type="checkbox" name="renewalEnabled"${renewal.enabled ? " checked" : ""}/> เปิดใช้งาน
      </label>
      <label style="max-width:220px">เตือนก่อนหมดกี่วัน
        <input type="number" name="renewalDaysBefore" min="1" max="10" value="${renewal.daysBefore}"/>
      </label>
      <label>ข้อความเตือน (ใช้ {date} = วันหมด, {days} = อีกกี่วัน)
        <input type="text" name="renewalText" value="${esc(renewal.text)}"/>
      </label>
      <small>ส่งเฉพาะลูกค้าแพ็กรายเดือน ครั้งเดียวต่อรอบสมาชิก ช่วง 10:00-20:00 พร้อมปุ่ม จ่าย ทุกแพ็ก กับ ไว้ก่อน</small>
    </div>

    <input type="hidden" name="payload" id="payload"/>
    <div style="display:flex;gap:10px">
      <button type="submit" class="btn save">💾 บันทึก (มีผลสด)</button>
      <button type="submit" class="btn" formaction="/admin/promo/clear"
        onclick="return confirm('ล้างค่าจากหน้านี้ กลับไปใช้ค่าจากไฟล์ในโค้ด?')">↩️ กลับไปใช้ค่าจากโค้ด</button>
    </div>
  </form>

  <div class="card" style="margin-top:16px">
    <h2>พรีวิวข้อความชวนจ่ายที่ลูกค้าเห็นในแชท (ค่าปัจจุบัน)</h2>
    <pre class="preview">${esc(preview)}</pre>
  </div>
</div>
<script>
(function(){
  var list = document.getElementById("pkgList");
  document.getElementById("addPkg").addEventListener("click", function(){
    var i = list.querySelectorAll(".pkg").length;
    var div = document.createElement("div");
    div.className = "pkg";
    div.innerHTML = '<div class="pkg-head"><b>แพ็กใหม่</b>'+
      '<label class="chk"><input type="checkbox" class="f-active" checked/> เปิดขาย</label>'+
      '<label class="chk"><input type="radio" name="defaultPkg" class="f-default"/> แพ็กหลัก</label>'+
      '<button type="button" class="btn mini js-del">🗑️</button></div>'+
      '<div class="row3"><label>ราคา (บาท)<input type="number" class="f-price" min="1" value="99"/></label>'+
      '<label>จำนวนครั้ง<input type="number" class="f-count" min="1" value="10"/></label>'+
      '<label>อายุ (ชั่วโมง)<input type="number" class="f-hours" min="1" value="24"/><small>24=1วัน · 168=7วัน · 720=30วัน</small></label></div>'+
      '<label>ป้ายชื่อ (โชว์ลูกค้า)<input type="text" class="f-label" value=""/></label>'+
      '<input type="hidden" class="f-key" value=""/>';
    list.appendChild(div);
  });
  list.addEventListener("click", function(e){
    if (e.target.classList.contains("js-del")) {
      var pkgs = list.querySelectorAll(".pkg");
      if (pkgs.length <= 1) { alert("ต้องมีอย่างน้อย 1 แพ็ก"); return; }
      e.target.closest(".pkg").remove();
    }
  });
  document.getElementById("promoForm").addEventListener("submit", function(){
    var pkgs = [];
    var defaultKey = "";
    list.querySelectorAll(".pkg").forEach(function(el, i){
      var price = Number(el.querySelector(".f-price").value) || 0;
      var count = Number(el.querySelector(".f-count").value) || 0;
      var hours = Number(el.querySelector(".f-hours").value) || 0;
      var key = (el.querySelector(".f-key").value || "").trim() ||
        (price + "baht_" + count + "scans_" + hours + "h");
      var label = (el.querySelector(".f-label").value || "").trim();
      var p = { key: key, priceThb: price, scanCount: count, windowHours: hours,
        active: el.querySelector(".f-active").checked, label: label };
      if (el.querySelector(".f-default").checked) defaultKey = key;
      pkgs.push(p);
    });
    document.getElementById("payload").value = JSON.stringify({
      packages: pkgs, defaultPackageKey: defaultKey || (pkgs[0] && pkgs[0].key) || ""
    });
  });
})();
</script>
</body></html>`;
}

export default function createAdminPromoRouter() {
  const router = express.Router();

  router.get("/admin/promo", requireAdminSession, async (req, res) => {
    const overrideRaw = await getScanOfferOverrideRaw().catch(() => null);
    const offer = loadActiveScanOffer();
    const renewal = await getRenewalReminderConfig().catch(() => ({ ...RENEWAL_REMINDER_DEFAULTS }));
    res.status(200).type("html").send(
      pageHtml({
        offer,
        renewal,
        overrideOn: Boolean(overrideRaw),
        savedMsg: req.query.saved ? "บันทึกแล้ว — มีผลกับลูกค้าภายใน ~30 วินาที" : "",
        errorMsg: req.query.err ? String(req.query.err) : "",
      }),
    );
  });

  router.post(
    "/admin/promo/save",
    requireAdminSession,
    express.urlencoded({ extended: false, limit: "200kb" }),
    async (req, res) => {
      try {
        const payload = JSON.parse(String(req.body?.payload || "{}"));
        const freeQuotaPerDay = Math.max(0, Math.floor(Number(req.body?.freeQuotaPerDay)) || 0);
        const pkgs = Array.isArray(payload.packages) ? payload.packages : [];
        if (!pkgs.length) throw new Error("ต้องมีอย่างน้อย 1 แพ็ก");
        for (const p of pkgs) {
          if (!(Number(p.priceThb) >= 1)) throw new Error("ราคาต้องอย่างน้อย 1 บาท");
          if (!(Number(p.scanCount) >= 1)) throw new Error("จำนวนครั้งต้องอย่างน้อย 1");
          if (!(Number(p.windowHours) >= 1)) throw new Error("อายุแพ็กต้องอย่างน้อย 1 ชม.");
        }
        const prices = pkgs.filter((p) => p.active !== false).map((p) => Number(p.priceThb));
        if (new Set(prices).size !== prices.length) {
          throw new Error("แพ็กที่เปิดขายห้ามราคาซ้ำกัน (ลูกค้าพิมพ์ราคาเพื่อเลือกแพ็ก)");
        }
        const raw = {
          active: true,
          label: "admin_promo",
          freeQuotaPerDay,
          defaultPackageKey: String(payload.defaultPackageKey || pkgs[0].key || ""),
          packages: pkgs.map((p) => ({
            key: String(p.key || "").trim(),
            priceThb: Math.floor(Number(p.priceThb)),
            scanCount: Math.floor(Number(p.scanCount)),
            windowHours: Math.floor(Number(p.windowHours)),
            active: p.active !== false,
            label:
              String(p.label || "").trim() ||
              `${Math.floor(Number(p.priceThb))} บาท ${Math.floor(Number(p.scanCount))} ครั้ง / ${formatOfferWindowThai(p.windowHours)}`,
          })),
          startAt: null,
          endAt: null,
          configVersion: `admin-${new Date().toISOString().slice(0, 16)}`,
        };
        // normalize รอบนึงกันค่าหลุด (โครงเดียวกับที่ loader ใช้)
        const normalized = normalizeScanOffer(raw);
        await saveScanOfferOverride({ ...raw, ...normalized });
        // ตั้งค่าเตือนต่ออายุรายเดือน (บันทึกพร้อมกันในฟอร์มเดียว)
        const renewalDays = Math.floor(Number(req.body?.renewalDaysBefore));
        await setAppSetting("renewal_reminder", {
          enabled: req.body?.renewalEnabled === "on",
          daysBefore:
            Number.isFinite(renewalDays) && renewalDays >= 1 && renewalDays <= 10
              ? renewalDays
              : RENEWAL_REMINDER_DEFAULTS.daysBefore,
          text:
            String(req.body?.renewalText || "").trim().slice(0, 300) ||
            RENEWAL_REMINDER_DEFAULTS.text,
        });
        console.log(
          JSON.stringify({
            event: "ADMIN_PROMO_SAVED",
            freeQuotaPerDay,
            packages: normalized.packages.map((p) => `${p.priceThb}/${p.scanCount}/${p.windowHours}h${p.active ? "" : ":off"}`),
            defaultPackageKey: normalized.defaultPackageKey,
          }),
        );
        res.redirect("/admin/promo?saved=1");
      } catch (e) {
        res.redirect(`/admin/promo?err=${encodeURIComponent(String(e?.message || e).slice(0, 120))}`);
      }
    },
  );

  router.post(
    "/admin/promo/clear",
    requireAdminSession,
    express.urlencoded({ extended: false, limit: "200kb" }),
    async (req, res) => {
      try {
        await saveScanOfferOverride(null);
        console.log(JSON.stringify({ event: "ADMIN_PROMO_CLEARED" }));
        res.redirect("/admin/promo?saved=1");
      } catch (e) {
        res.redirect(`/admin/promo?err=${encodeURIComponent(String(e?.message || e).slice(0, 120))}`);
      }
    },
  );

  return router;
}

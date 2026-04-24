/**
 * Standalone page: คลังพลัง / อันดับรายการสแกน (sacred amulet lane; no guessed amulet names).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { formatBangkokScanDateThaiBE } from "../../utils/dateTime.util.js";

/**
 * @typedef {import("../../services/reports/sacredAmuletLibrary.service.js").SacredAmuletLibraryItem} SacredAmuletLibraryItem
 * @typedef {import("../../services/reports/sacredAmuletLibrary.service.js").SacredAmuletLibraryView} SacredAmuletLibraryView
 */

/**
 * @param {SacredAmuletLibraryItem} it
 * @param {number} rank
 */
function rankCardHtml(it, rank) {
  const href = `/r/${encodeURIComponent(it.publicToken)}`;
  const img = it.thumbUrl
    ? `<div class="alib-card-img"><img src="${escapeHtml(it.thumbUrl)}" alt="" width="96" height="96" loading="lazy" decoding="async"/></div>`
    : `<div class="alib-card-img alib-card-img--empty" aria-hidden="true"></div>`;
  const compat =
    it.compatPercent != null
      ? `<p class="alib-card-line"><span class="alib-k">เข้ากับคุณ</span> <span class="alib-v">${escapeHtml(String(it.compatPercent))}%</span></p>`
      : "";
  const when = formatBangkokScanDateThaiBE(it.scannedAtIso);
  const dupBadge =
    it.scanCountInGroup > 1
      ? `<p class="alib-card-dup"><span class="alib-card-dup-pill">สแกนซ้ำ ${escapeHtml(String(it.scanCountInGroup))} ครั้ง</span></p>`
      : "";
  const possibleDupBadge =
    it.duplicateStatus === "possible_duplicate"
      ? `<p class="alib-card-dup"><span class="alib-card-dup-pill alib-card-dup-pill--possible">อาจซ้ำกับรายการอื่น</span></p>
        <p class="alib-card-possible-note">ระบบพบว่ารายการนี้อาจเป็นวัตถุเดียวกับรายการอื่น แต่ยังไม่รวมให้อัตโนมัติ เพื่อป้องกันการรวมผิด</p>`
      : "";
  return `
  <article class="alib-card" data-rank="${rank}">
    <div class="alib-card-top">
      <span class="alib-rank">อันดับ ${rank}</span>
      ${img}
      <div class="alib-card-main">
        <p class="alib-card-line"><span class="alib-k">พลังรวม</span> <span class="alib-v">${escapeHtml(String(it.powerTotal))}</span></p>
        <p class="alib-card-line"><span class="alib-k">เด่นสุด</span> <span class="alib-v">${escapeHtml(it.peakPowerLabelTh)}</span></p>
        ${compat}
        <p class="alib-card-line"><span class="alib-k">สแกนเมื่อ</span> <span class="alib-v">${escapeHtml(when)}</span></p>
        <p class="alib-card-line alib-card-line--sub"><span class="alib-k">รหัสรายงาน</span> <span class="alib-v">${escapeHtml(it.displayReportId)}</span></p>
        ${dupBadge}
        ${possibleDupBadge}
      </div>
    </div>
    <a class="alib-card-btn" href="${escapeHtml(href)}">ดูรายงานนี้</a>
  </article>`;
}

/**
 * @param {SacredAmuletLibraryItem[]} list
 */
function panelHtml(list) {
  if (!list.length) {
    return `<p class="alib-empty">ยังไม่มีข้อมูลในหมวดนี้</p>`;
  }
  return list.map((it, i) => rankCardHtml(it, i + 1)).join("");
}

/**
 * @param {object} p
 * @param {string} p.pagePublicToken
 * @param {SacredAmuletLibraryView} p.library
 * @returns {string}
 */
export function renderAmuletLibraryRankingHtml({ pagePublicToken, library }) {
  const backHref = `/r/${encodeURIComponent(pagePublicToken)}`;
  const n = library.totalCount;
  const dedupeExplainLine =
    Array.isArray(library.items) && library.items.length < n
      ? `<p class="alib-sub alib-sub--grouped">แสดงเฉพาะรายการที่ไม่ซ้ำกันในหน้านี้</p>`
      : "";
  const tabs = [
    { id: "overall", label: "แรงสุดโดยรวม", list: library.byOverall },
    { id: "luck", label: "โชคลาภสูงสุด", list: library.byLuck },
    { id: "protection", label: "คุ้มครองสูงสุด", list: library.byProtection },
    { id: "metta", label: "เมตตาสูงสุด", list: library.byMetta },
    { id: "baramee", label: "บารมีสูงสุด", list: library.byBaramee },
    { id: "fit", label: "เข้ากับคุณที่สุด", list: library.byFit },
  ];

  const tabButtons = tabs
    .map(
      (t, i) =>
        `<button type="button" class="alib-tab${i === 0 ? " alib-tab--on" : ""}" data-alib-tab="${escapeHtml(t.id)}" aria-pressed="${i === 0 ? "true" : "false"}">${escapeHtml(t.label)}</button>`,
    )
    .join("");

  const tabPanels = tabs
    .map(
      (t, i) =>
        `<div class="alib-panel${i === 0 ? " alib-panel--on" : ""}" data-alib-panel="${escapeHtml(t.id)}" role="tabpanel">${panelHtml(t.list)}</div>`,
    )
    .join("");

  const docTitle = "คลังพลังของคุณ · Ener Scan";

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(docTitle)}</title>
  <meta name="robots" content="noindex,nofollow"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --alib-bg: #0a0c10;
      --alib-surface: #12151c;
      --alib-border: rgba(212, 175, 55, 0.22);
      --alib-gold: #d4af37;
      --alib-gold-soft: #c9a961;
      --alib-text: #ece8e0;
      --alib-muted: #9a958c;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Sarabun, system-ui, sans-serif; background: var(--alib-bg); color: var(--alib-text); line-height: 1.6; font-size: 1.02rem; }
    .alib-wrap { max-width: 26rem; margin: 0 auto; padding: 1.2rem 1rem 2.5rem; }
    .alib-back { display: inline-block; margin-bottom: 0.85rem; font-size: 0.9rem; color: var(--alib-gold-soft); text-decoration: none; font-weight: 600; }
    .alib-back:hover { color: var(--alib-gold); text-decoration: underline; }
    .alib-h1 { margin: 0 0 0.35rem; font-size: 1.28rem; font-weight: 700; color: var(--alib-gold); }
    .alib-sub { margin: 0 0 1rem; font-size: 0.95rem; color: var(--alib-muted); }
    .alib-sub--grouped { margin-top: -0.6rem; }
    .alib-tabs { margin-bottom: 1rem; }
    .alib-tab-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.65rem; }
    .alib-tab {
      flex: 1 1 auto;
      min-width: calc(33% - 0.25rem);
      padding: 0.4rem 0.45rem;
      font-size: 0.72rem;
      font-weight: 700;
      font-family: inherit;
      border-radius: 999px;
      border: 1px solid rgba(212, 175, 55, 0.28);
      background: rgba(0,0,0,0.2);
      color: var(--alib-muted);
      cursor: pointer;
    }
    .alib-tab--on { color: #0c0e12; background: linear-gradient(165deg, #f0d060, #c9a227); border-color: rgba(0,0,0,0.25); }
    .alib-panel { display: none; }
    .alib-panel--on { display: block; }
    .alib-card {
      background: var(--alib-surface);
      border: 1px solid var(--alib-border);
      border-radius: 14px;
      padding: 0.75rem 0.85rem;
      margin-bottom: 0.65rem;
    }
    .alib-card-top { display: flex; gap: 0.65rem; align-items: flex-start; }
    .alib-rank { display: block; font-size: 0.78rem; font-weight: 800; color: var(--alib-gold); margin-bottom: 0.35rem; }
    .alib-card-img { flex-shrink: 0; width: 4.5rem; height: 4.5rem; border-radius: 10px; overflow: hidden; background: rgba(0,0,0,0.35); border: 1px solid rgba(212,175,55,0.15); }
    .alib-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .alib-card-img--empty { background: repeating-linear-gradient(-45deg, rgba(212,175,55,0.06), rgba(212,175,55,0.06) 6px, transparent 6px, transparent 12px); }
    .alib-card-main { flex: 1; min-width: 0; }
    .alib-card-line { margin: 0 0 0.25rem; font-size: 0.88rem; }
    .alib-card-line--sub { font-size: 0.8rem; color: var(--alib-muted); }
    .alib-card-dup { margin: 0.35rem 0 0; }
    .alib-card-dup-pill {
      display: inline-block;
      padding: 0.16rem 0.52rem;
      font-size: 0.74rem;
      font-weight: 700;
      color: #f7e09a;
      border: 1px solid rgba(212, 175, 55, 0.35);
      border-radius: 999px;
      background: rgba(212, 175, 55, 0.12);
    }
    .alib-card-dup-pill--possible {
      color: #ffe5b3;
      border-color: rgba(255, 170, 90, 0.42);
      background: rgba(255, 170, 90, 0.12);
    }
    .alib-card-possible-note {
      margin: 0.28rem 0 0;
      font-size: 0.76rem;
      line-height: 1.45;
      color: var(--alib-muted);
    }
    .alib-k { color: var(--alib-muted); font-weight: 600; margin-right: 0.2rem; }
    .alib-v { font-weight: 700; color: var(--alib-text); }
    .alib-card-btn {
      display: block; text-align: center; margin-top: 0.55rem;
      padding: 0.48rem 0.75rem; font-size: 0.88rem; font-weight: 700;
      border-radius: 10px; text-decoration: none; color: #0c0e12;
      background: linear-gradient(165deg, #e8c547, #c9a227);
    }
    .alib-card-btn:hover { filter: brightness(1.05); }
    .alib-empty { color: var(--alib-muted); font-size: 0.9rem; }
    .alib-note { margin: 1.1rem 0 0; font-size: 0.82rem; color: var(--alib-muted); line-height: 1.55; }
    .alib-safety {
      margin: 0 0 0.85rem;
      padding: 0.55rem 0.65rem;
      font-size: 0.78rem;
      line-height: 1.55;
      color: var(--alib-muted);
      background: rgba(0,0,0,0.22);
      border-radius: 10px;
      border: 1px solid rgba(212, 175, 55, 0.12);
    }
    .alib-scan-footer {
      margin-top: 1.35rem;
      padding: 1rem 0.95rem 1.05rem;
      border-radius: 14px;
      border: 1px solid rgba(212, 175, 55, 0.22);
      background: rgba(184, 135, 27, 0.08);
      text-align: center;
    }
    .alib-scan-footer-title {
      margin: 0 0 0.5rem;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--alib-gold);
      line-height: 1.35;
    }
    .alib-scan-footer-lead {
      margin: 0 0 0.85rem;
      font-size: 0.93rem;
      font-weight: 600;
      color: var(--alib-text);
      line-height: 1.55;
    }
    .alib-scan-btn {
      display: inline-block;
      margin: 0;
      padding: 0.55rem 1.15rem;
      font-size: 0.92rem;
      font-weight: 800;
      font-family: inherit;
      line-height: 1.35;
      color: #0c0e12;
      background: linear-gradient(165deg, #e8c547, #c9a227);
      border: none;
      border-radius: 999px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.25);
    }
  </style>
</head>
<body>
  <div class="alib-wrap">
    <a class="alib-back" href="${escapeHtml(backHref)}">← กลับรายงาน</a>
    <h1 class="alib-h1">คลังพลังของคุณ</h1>
    <p class="alib-sub">จากรายการสแกนทั้งหมด ${escapeHtml(String(n))} รายการ</p>
    ${dedupeExplainLine}
    <p class="alib-safety" role="note">ระบบจัดอันดับจากผลสแกนของคุณเท่านั้น ไม่ได้ระบุชื่อพระหรือรุ่นพระจริง</p>
    <div class="alib-tabs">
      <div class="alib-tab-row" role="tablist" aria-label="หมวดอันดับ">${tabButtons}</div>
      ${tabPanels}
    </div>
    <section class="alib-scan-footer" aria-labelledby="alib-scan-footer-h">
      <h2 id="alib-scan-footer-h" class="alib-scan-footer-title">อยากรู้ว่าองค์อื่นของคุณจะขึ้นอันดับไหน?</h2>
      <p class="alib-scan-footer-lead">สแกนเพิ่มเพื่อเทียบพลังรวม โชคลาภ คุ้มครอง เมตตา บารมี และความเข้ากัน</p>
      <p class="alib-scan-btn" role="status" aria-label="ชวนสแกนวัตถุเพิ่ม">สแกนวัตถุเพิ่ม</p>
    </section>
    <p class="alib-note" role="note">อันดับและคะแนนเป็นการประเมินจากผลสแกน ใช้เป็นแนวทาง ไม่ได้ระบุชนิดหรือชื่อพระจริงจากภาพ</p>
  </div>
  <script>
(function () {
  var tabs = document.querySelectorAll("[data-alib-tab]");
  var panels = document.querySelectorAll("[data-alib-panel]");
  function activate(id) {
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-alib-tab") === id;
      t.classList.toggle("alib-tab--on", on);
      t.setAttribute("aria-pressed", on ? "true" : "false");
    });
    panels.forEach(function (p) {
      p.classList.toggle("alib-panel--on", p.getAttribute("data-alib-panel") === id);
    });
  }
  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      activate(btn.getAttribute("data-alib-tab"));
    });
  });
})();
  </script>
</body>
</html>`;
}

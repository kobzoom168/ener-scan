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
 * @param {SacredAmuletLibraryItem} it
 */
function spotlightCardHtml(it) {
  const href = `/r/${encodeURIComponent(it.publicToken)}`;
  const img = it.thumbUrl
    ? `<div class="alib-spot-img"><img src="${escapeHtml(it.thumbUrl)}" alt="" width="88" height="88" loading="lazy" decoding="async"/></div>`
    : `<div class="alib-spot-img alib-spot-img--empty" aria-hidden="true"></div>`;
  const compat =
    it.compatPercent != null
      ? `<p class="alib-spot-line"><span class="alib-k">เข้ากับคุณ</span> <span class="alib-v">${escapeHtml(String(it.compatPercent))}%</span></p>`
      : "";
  return `
  <article class="alib-spotlight" aria-label="อันดับหนึ่งโดยรวม">
    <p class="alib-spot-badge">อันดับ 1 โดยรวมตอนนี้</p>
    <div class="alib-spot-inner">
      ${img}
      <div class="alib-spot-main">
        <p class="alib-spot-title">${escapeHtml(it.displayReportId)}</p>
        <p class="alib-spot-line"><span class="alib-k">พลังรวม</span> <span class="alib-v">${escapeHtml(String(it.powerTotal))}</span></p>
        <p class="alib-spot-line"><span class="alib-k">เด่นสุด</span> <span class="alib-v">${escapeHtml(it.peakPowerLabelTh)}</span></p>
        ${compat}
      </div>
    </div>
    <a class="alib-spot-btn" href="${escapeHtml(href)}">ดูรายงานนี้</a>
  </article>`;
}

/**
 * @param {{ labelTh: string, axisScore: number, item: SacredAmuletLibraryItem }} h
 */
function axisHighlightCardHtml(h) {
  const { item, labelTh, axisScore } = h;
  const href = `/r/${encodeURIComponent(item.publicToken)}`;
  const img = item.thumbUrl
    ? `<div class="alib-axis-img"><img src="${escapeHtml(item.thumbUrl)}" alt="" width="72" height="72" loading="lazy" decoding="async"/></div>`
    : `<div class="alib-axis-img alib-axis-img--empty" aria-hidden="true"></div>`;
  return `
  <article class="alib-axis-card">
    <p class="alib-axis-dim">${escapeHtml(labelTh)}</p>
    <p class="alib-axis-rank-note">อันดับ 1 ด้านนี้</p>
    <div class="alib-axis-body">
      ${img}
      <div class="alib-axis-text">
        <p class="alib-axis-name">${escapeHtml(item.displayReportId)}</p>
        <p class="alib-axis-score"><span class="alib-axis-score-num">${escapeHtml(String(axisScore))}</span> <span class="alib-axis-score-suf">คะแนน</span></p>
        <p class="alib-axis-blurb">คะแนนสูงสุดด้านนี้ในคลังของคุณตอนนี้</p>
      </div>
    </div>
    <a class="alib-axis-btn" href="${escapeHtml(href)}">ดูรายละเอียด</a>
  </article>`;
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
  const spotlightIt = library.topOverall ?? library.byOverall?.[0] ?? null;
  const spotlightHtml = spotlightIt ? spotlightCardHtml(spotlightIt) : "";
  const axisHighlights = Array.isArray(library.axisHighlights)
    ? library.axisHighlights
    : [];
  const axisCarouselSection =
    axisHighlights.length > 0
      ? `<section class="alib-axis-section" aria-labelledby="alib-axis-h">
    <h2 id="alib-axis-h" class="alib-axis-h2">พระเด่นประจำพลังของคุณ</h2>
    <div class="alib-axis-track" role="list">${axisHighlights
      .map(
        (h) =>
          `<div class="alib-axis-slide" role="listitem">${axisHighlightCardHtml(h)}</div>`,
      )
      .join("")}</div>
  </section>`
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
      --alib-bg: #ffffff;
      --alib-surface: #ffffff;
      --alib-border: rgba(180, 140, 40, 0.18);
      --alib-gold: #a07800;
      --alib-gold-soft: rgba(140, 100, 20, 0.7);
      --alib-text: #1a1610;
      --alib-body: #3d3320;
      --alib-muted: #7a6b4e;
      --alib-chip-bg: rgba(200, 155, 30, 0.08);
      --alib-chip-border: rgba(180, 140, 40, 0.22);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Sarabun, system-ui, sans-serif; background: var(--alib-bg); color: var(--alib-text); line-height: 1.6; font-size: 1.02rem; -webkit-font-smoothing: antialiased; }
    .alib-wrap { max-width: 720px; margin: 0 auto; padding: 1.2rem 1.05rem 2.5rem; }
    .alib-back { display: inline-block; margin-bottom: 0.85rem; font-size: 0.9rem; color: var(--alib-gold-soft); text-decoration: none; font-weight: 600; }
    .alib-back:hover { color: var(--alib-gold); text-decoration: underline; }
    .alib-h1 { margin: 0 0 0.35rem; font-size: 1.28rem; font-weight: 700; color: var(--alib-gold); }
    .alib-sub { margin: 0 0 1rem; font-size: 0.95rem; color: var(--alib-body); }
    .alib-sub--grouped { margin-top: -0.6rem; }
    .alib-spotlight {
      margin: 0 0 1rem;
      padding: 0.75rem 0.85rem 0.8rem;
      border-radius: 14px;
      border: 1px solid rgba(180, 140, 40, 0.22);
      background: linear-gradient(180deg, #fffefb 0%, #faf7f0 100%);
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }
    .alib-spot-badge {
      margin: 0 0 0.5rem;
      font-size: 0.78rem;
      font-weight: 800;
      color: var(--alib-gold);
      letter-spacing: 0.02em;
    }
    .alib-spot-inner { display: flex; gap: 0.6rem; align-items: flex-start; }
    .alib-spot-img {
      flex-shrink: 0;
      width: 4.25rem;
      height: 4.25rem;
      border-radius: 10px;
      overflow: hidden;
      background: rgba(200, 155, 30, 0.08);
      border: 1px solid rgba(180, 140, 40, 0.2);
    }
    .alib-spot-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .alib-spot-img--empty {
      background: repeating-linear-gradient(-45deg, rgba(200,155,30,0.1), rgba(200,155,30,0.1) 6px, transparent 6px, transparent 12px);
    }
    .alib-spot-main { flex: 1; min-width: 0; }
    .alib-spot-title {
      margin: 0 0 0.35rem;
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--alib-body);
      line-height: 1.3;
    }
    .alib-spot-line { margin: 0 0 0.2rem; font-size: 0.84rem; }
    .alib-spot-btn {
      display: block;
      text-align: center;
      margin-top: 0.55rem;
      padding: 0.45rem 0.7rem;
      font-size: 0.86rem;
      font-weight: 700;
      border-radius: 10px;
      text-decoration: none;
      color: #1a1610;
      background: linear-gradient(165deg, #e8c547, #c9a227);
      box-shadow: 0 2px 10px rgba(180, 140, 40, 0.18);
    }
    .alib-spot-btn:hover { filter: brightness(1.05); }
    .alib-axis-section { margin: 0.25rem 0 0.35rem; }
    .alib-axis-h2 {
      margin: 0 0 0.55rem;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--alib-gold);
      line-height: 1.35;
    }
    .alib-axis-track {
      display: flex;
      gap: 0.65rem;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      padding: 0.15rem 0 0.45rem;
      margin: 0 -0.15rem;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
    }
    .alib-axis-slide {
      flex: 0 0 min(82vw, 18rem);
      max-width: 18rem;
      scroll-snap-align: start;
    }
    @media (min-width: 640px) {
      .alib-axis-slide {
        flex: 0 0 calc((100% - 1.3rem) / 2.4);
        min-width: 11rem;
        max-width: 14rem;
      }
    }
    .alib-axis-card {
      height: 100%;
      background: var(--alib-surface);
      border: 1px solid rgba(180, 140, 40, 0.16);
      border-radius: 14px;
      padding: 0.55rem 0.65rem 0.6rem;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      display: flex;
      flex-direction: column;
    }
    .alib-axis-dim {
      margin: 0 0 0.15rem;
      font-size: 0.72rem;
      font-weight: 800;
      color: var(--alib-gold);
      line-height: 1.35;
    }
    .alib-axis-rank-note {
      margin: 0 0 0.45rem;
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--alib-muted);
    }
    .alib-axis-body { display: flex; gap: 0.5rem; align-items: flex-start; }
    .alib-axis-img {
      flex-shrink: 0;
      width: 3.6rem;
      height: 3.6rem;
      border-radius: 9px;
      overflow: hidden;
      border: 1px solid rgba(180, 140, 40, 0.18);
      background: rgba(200, 155, 30, 0.06);
    }
    .alib-axis-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .alib-axis-img--empty {
      background: repeating-linear-gradient(-45deg, rgba(200,155,30,0.1), rgba(200,155,30,0.1) 5px, transparent 5px, transparent 10px);
    }
    .alib-axis-text { flex: 1; min-width: 0; }
    .alib-axis-name {
      margin: 0 0 0.2rem;
      font-size: 0.86rem;
      font-weight: 800;
      color: var(--alib-body);
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .alib-axis-score { margin: 0 0 0.2rem; line-height: 1.2; }
    .alib-axis-score-num { font-size: 1.35rem; font-weight: 800; color: var(--alib-gold); }
    .alib-axis-score-suf { font-size: 0.72rem; font-weight: 600; color: var(--alib-muted); margin-left: 0.15rem; }
    .alib-axis-blurb {
      margin: 0;
      font-size: 0.72rem;
      line-height: 1.4;
      color: var(--alib-muted);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .alib-axis-btn {
      display: block;
      text-align: center;
      margin-top: 0.45rem;
      padding: 0.38rem 0.5rem;
      font-size: 0.82rem;
      font-weight: 700;
      border-radius: 9px;
      text-decoration: none;
      color: #1a1610;
      background: linear-gradient(165deg, #e8c547, #c9a227);
      box-shadow: 0 2px 8px rgba(180, 140, 40, 0.15);
    }
    .alib-axis-btn:hover { filter: brightness(1.04); }
    .alib-show-all {
      display: block;
      width: 100%;
      margin: 0.65rem 0 0.5rem;
      padding: 0.52rem 1rem;
      font-size: 0.9rem;
      font-weight: 800;
      font-family: inherit;
      line-height: 1.35;
      color: #1a1610;
      background: linear-gradient(165deg, #e8c547, #c9a227);
      border: none;
      border-radius: 999px;
      cursor: pointer;
      box-shadow: 0 2px 12px rgba(180, 140, 40, 0.2);
    }
    .alib-show-all:hover { filter: brightness(1.04); }
    .alib-full-rankings { margin-top: 0.15rem; }
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
      border: 1px solid var(--alib-chip-border);
      background: var(--alib-chip-bg);
      color: var(--alib-gold);
      cursor: pointer;
    }
    .alib-tab--on { color: #1a1610; background: linear-gradient(165deg, #e8c547, #c9a227); border-color: rgba(180, 140, 40, 0.35); }
    .alib-panel { display: none; }
    .alib-panel--on { display: block; }
    .alib-card {
      background: var(--alib-surface);
      border: 1px solid rgba(180, 140, 40, 0.16);
      border-radius: 14px;
      padding: 0.75rem 0.85rem;
      margin-bottom: 0.65rem;
      box-shadow: 0 4px 18px rgba(0,0,0,0.07);
    }
    .alib-card-top { display: flex; gap: 0.65rem; align-items: flex-start; }
    .alib-rank { display: block; font-size: 0.78rem; font-weight: 800; color: var(--alib-gold); margin-bottom: 0.35rem; }
    .alib-card-img { flex-shrink: 0; width: 4.5rem; height: 4.5rem; border-radius: 10px; overflow: hidden; background: rgba(200, 155, 30, 0.08); border: 1px solid rgba(180, 140, 40, 0.2); }
    .alib-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .alib-card-img--empty { background: repeating-linear-gradient(-45deg, rgba(200,155,30,0.1), rgba(200,155,30,0.1) 6px, transparent 6px, transparent 12px); }
    .alib-card-main { flex: 1; min-width: 0; }
    .alib-card-line { margin: 0 0 0.25rem; font-size: 0.88rem; }
    .alib-card-line--sub { font-size: 0.8rem; color: var(--alib-muted); }
    .alib-card-dup { margin: 0.35rem 0 0; }
    .alib-card-dup-pill {
      display: inline-block;
      padding: 0.16rem 0.52rem;
      font-size: 0.74rem;
      font-weight: 700;
      color: var(--alib-gold);
      border: 1px solid var(--alib-chip-border);
      border-radius: 999px;
      background: var(--alib-chip-bg);
    }
    .alib-card-dup-pill--possible {
      color: #8a5a00;
      border-color: rgba(200, 120, 40, 0.35);
      background: rgba(255, 200, 140, 0.18);
    }
    .alib-card-possible-note {
      margin: 0.28rem 0 0;
      font-size: 0.76rem;
      line-height: 1.45;
      color: var(--alib-muted);
    }
    .alib-k { color: var(--alib-muted); font-weight: 600; margin-right: 0.2rem; }
    .alib-v { font-weight: 700; color: var(--alib-body); }
    .alib-card-btn {
      display: block; text-align: center; margin-top: 0.55rem;
      padding: 0.48rem 0.75rem; font-size: 0.88rem; font-weight: 700;
      border-radius: 10px; text-decoration: none; color: #1a1610;
      background: linear-gradient(165deg, #e8c547, #c9a227);
      box-shadow: 0 2px 10px rgba(180, 140, 40, 0.18);
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
      background: #f9f7f2;
      border-radius: 10px;
      border: 1px solid rgba(180, 140, 40, 0.16);
    }
    .alib-scan-footer {
      margin-top: 1.35rem;
      padding: 1rem 0.95rem 1.05rem;
      border-radius: 14px;
      border: 1px solid rgba(180, 140, 40, 0.18);
      background: linear-gradient(180deg, #faf8f2 0%, #f5f1e6 100%);
      text-align: center;
      box-shadow: 0 4px 18px rgba(0,0,0,0.06);
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
      color: var(--alib-body);
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
      color: #1a1610;
      background: linear-gradient(165deg, #e8c547, #c9a227);
      border: none;
      border-radius: 999px;
      box-shadow: 0 2px 12px rgba(180, 140, 40, 0.2);
    }
  </style>
</head>
<body>
  <div class="alib-wrap">
    <a class="alib-back" href="${escapeHtml(backHref)}">← กลับรายงาน</a>
    <h1 class="alib-h1">คลังพลังของคุณ</h1>
    <p class="alib-sub">คุณมีรายการสแกนแล้ว ${escapeHtml(String(n))} รายการ</p>
    ${dedupeExplainLine}
    <p class="alib-safety" role="note">ระบบจัดอันดับจากผลสแกนของคุณเท่านั้น ไม่ได้ระบุชื่อพระหรือรุ่นพระจริง</p>
    ${spotlightHtml}
    ${axisCarouselSection}
    <button type="button" class="alib-show-all" id="alib-btn-show-rankings">ดูอันดับทั้งหมด</button>
    <section id="alib-full-rankings" class="alib-full-rankings" hidden aria-label="อันดับเต็มตามหมวด">
    <div class="alib-tabs">
      <div class="alib-tab-row" role="tablist" aria-label="หมวดอันดับ">${tabButtons}</div>
      ${tabPanels}
    </div>
    </section>
    <section class="alib-scan-footer" aria-labelledby="alib-scan-footer-h">
      <h2 id="alib-scan-footer-h" class="alib-scan-footer-title">อยากรู้ว่าองค์อื่นของคุณจะขึ้นอันดับไหน?</h2>
      <p class="alib-scan-footer-lead">สแกนเพิ่มเพื่อเทียบพลังรวม โชคลาภ คุ้มครอง เมตตา บารมี และความเข้ากัน</p>
      <p class="alib-scan-btn" role="status" aria-label="ชวนสแกนวัตถุเพิ่ม">สแกนวัตถุเพิ่ม</p>
    </section>
    <p class="alib-note" role="note">อันดับและคะแนนเป็นการประเมินจากผลสแกน ใช้เป็นแนวทาง ไม่ได้ระบุชนิดหรือชื่อพระจริงจากภาพ</p>
  </div>
  <script>
(function () {
  var showBtn = document.getElementById("alib-btn-show-rankings");
  var rankings = document.getElementById("alib-full-rankings");
  if (showBtn && rankings) {
    showBtn.addEventListener("click", function () {
      rankings.removeAttribute("hidden");
      showBtn.setAttribute("hidden", "");
      rankings.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
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

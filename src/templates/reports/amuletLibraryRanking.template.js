/**
 * Standalone page: คลังพลัง / อันดับรายการสแกน (sacred amulet lane; no guessed amulet names).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { formatBangkokScanDateThaiBE } from "../../utils/dateTime.util.js";
import {
  amuletSubpageAutoDarkScriptHtml,
  buildAmuletSubpageDarkThemeCss,
} from "../../utils/reports/amuletSubpageTheme.util.js";

/**
 * @typedef {import("../../services/reports/sacredAmuletLibrary.service.js").SacredAmuletLibraryItem} SacredAmuletLibraryItem
 * @typedef {import("../../services/reports/sacredAmuletLibrary.service.js").SacredAmuletLibraryView} SacredAmuletLibraryView
 */

/**
 * @param {SacredAmuletLibraryItem} it
 * @param {number} rank
 */
function rankCardHtml(it, rank) {
  // แถวเตี้ยบรรทัดเดียว (โฉมใหม่ กบ 15 ก.ค. — ของเดิมการ์ดใหญ่ 94 ใบเลื่อนไม่ไหว)
  const href = `/r/${encodeURIComponent(it.publicToken)}`;
  const img = it.thumbUrl
    ? `<img class="alib-row-img" src="${escapeHtml(it.thumbUrl)}" alt="" width="46" height="46" loading="lazy" decoding="async" onerror="this.onerror=null;this.removeAttribute('src');"/>`
    : `<span class="alib-row-img alib-row-img--empty" aria-hidden="true"></span>`;
  const when = formatBangkokScanDateThaiBE(it.scannedAtIso);
  const fit =
    it.compatPercent != null
      ? `<span class="alib-row-fit">เข้ากับคุณ ${escapeHtml(String(it.compatPercent))}%</span>`
      : "";
  const dupPills = [
    it.scanCountInGroup > 1
      ? `<span class="alib-card-dup-pill">สแกนซ้ำ ${escapeHtml(String(it.scanCountInGroup))} ครั้ง</span>`
      : "",
    it.duplicateStatus === "possible_duplicate"
      ? `<span class="alib-card-dup-pill alib-card-dup-pill--possible" title="อาจเป็นวัตถุเดียวกับรายการอื่น ยังไม่รวมให้อัตโนมัติเพื่อป้องกันการรวมผิด">อาจซ้ำกับรายการอื่น</span>`
      : "",
  ].join("");
  return `
  <a class="alib-row" data-rank="${rank}" href="${escapeHtml(href)}">
    <span class="alib-row-rank">${rank}</span>
    ${img}
    <span class="alib-row-main">
      <span class="alib-row-id">${escapeHtml(it.displayReportId)}</span>
      <span class="alib-row-peak">เด่นสุด ${escapeHtml(it.peakPowerLabelTh)} · ${escapeHtml(when)}</span>
      ${dupPills ? `<span class="alib-row-dups">${dupPills}</span>` : ""}
    </span>
    <span class="alib-row-score"><b>${escapeHtml(String(it.powerTotal))}</b>${fit}</span>
    <span class="alib-row-go" aria-hidden="true">›</span>
  </a>`;
}

/**
 * @param {SacredAmuletLibraryItem[]} list
 * @param {string} [emptyText]
 */
function panelHtml(list, emptyText = "ยังไม่มีข้อมูลในหมวดนี้") {
  if (!list.length) {
    return `<p class="alib-empty">${escapeHtml(emptyText)}</p>`;
  }
  return `<div class="alib-rows">${list.map((it, i) => rankCardHtml(it, i + 1)).join("")}</div>`;
}

/**
 * การ์ดแท่นรับรางวัลท็อป 3 — อันดับ 1 ใบใหญ่กลาง (โฉมใหม่ กบ 15 ก.ค.)
 * @param {SacredAmuletLibraryItem} it
 * @param {number} rank
 * @param {string} pagePublicToken
 */
function podiumCardHtml(it, rank, pagePublicToken) {
  const first = rank === 1;
  const href = `/r/${encodeURIComponent(it.publicToken)}`;
  const img = it.thumbUrl
    ? `<img class="alib-pod-img" src="${escapeHtml(it.thumbUrl)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.removeAttribute('src');"/>`
    : `<span class="alib-pod-img alib-pod-img--empty" aria-hidden="true"></span>`;
  const when = formatBangkokScanDateThaiBE(it.scannedAtIso);
  const fitBits = [];
  if (it.compatPercent != null) fitBits.push(`เข้ากับคุณ ${it.compatPercent}%`);
  if (first && when) fitBits.push(`สแกนเมื่อ ${when}`);
  const pinForm = first ? spotlightPinFormHtml(pagePublicToken, it) : "";
  return `
  <article class="alib-pod${first ? " alib-pod--first" : ""}" data-rank="${rank}">
    <span class="alib-pod-chip">${first ? "อันดับ 1 ของคลังคุณ" : `อันดับ ${rank}`}</span>
    ${img}
    <p class="alib-pod-id">${escapeHtml(it.displayReportId)}</p>
    <p class="alib-pod-total">${escapeHtml(String(it.powerTotal))}<small>พลังรวม</small></p>
    <p class="alib-pod-peak">${escapeHtml(it.peakPowerLabelTh)}</p>
    ${fitBits.length ? `<p class="alib-pod-fit">${escapeHtml(fitBits.join(" · "))}</p>` : ""}
    ${pinForm}
    <a class="alib-spot-btn" href="${escapeHtml(href)}">ดูรายงานนี้</a>
  </article>`;
}

/**
 * @param {SacredAmuletLibraryItem[]} items — top 3 by overall
 * @param {string} pagePublicToken
 */
function podiumHtml(items, pagePublicToken) {
  if (!items.length) return "";
  if (items.length === 1) return spotlightCardHtml(items[0], pagePublicToken);
  const [a, b, c] = items;
  const cards = [
    b ? podiumCardHtml(b, 2, pagePublicToken) : "",
    podiumCardHtml(a, 1, pagePublicToken),
    c ? podiumCardHtml(c, 3, pagePublicToken) : "",
  ].join("");
  return `<section class="alib-podium" aria-label="ท็อป 3 ของคลังคุณ">${cards}</section>`;
}

/**
 * @param {SacredAmuletLibraryItem} it
 * @param {string} pagePublicToken
 */
function spotlightPinFormHtml(pagePublicToken, it) {
  const sid = String(it?.scanResultV2Id || "").trim();
  const up = String(it?.uploadId || "").trim();
  if (!sid || !up) return "";
  if (it?.uploadOriginalDeletedAt) return "";
  const action = `/r/${encodeURIComponent(pagePublicToken)}/library/pin`;
  return `<form method="post" action="${escapeHtml(action)}" class="alib-pin-form">
    <input type="hidden" name="scanResultV2Id" value="${escapeHtml(sid)}" />
    <button type="submit" class="alib-pin-btn">ปักหมุดรูปนี้</button>
  </form>`;
}

/**
 * @param {SacredAmuletLibraryItem} it
 * @param {string} pagePublicToken
 */
function spotlightCardHtml(it, pagePublicToken) {
  const href = `/r/${encodeURIComponent(it.publicToken)}`;
  const img = it.thumbUrl
    ? `<div class="alib-spot-img"><img src="${escapeHtml(it.thumbUrl)}" alt="" width="88" height="88" loading="lazy" decoding="async" onerror="this.onerror=null;this.removeAttribute('src');"/></div>`
    : `<div class="alib-spot-img alib-spot-img--empty" aria-hidden="true"></div>`;
  const compat =
    it.compatPercent != null
      ? `<p class="alib-spot-line"><span class="alib-k">เข้ากับคุณ</span> <span class="alib-v">${escapeHtml(String(it.compatPercent))}%</span></p>`
      : "";
  const pinForm = spotlightPinFormHtml(pagePublicToken, it);
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
    ${pinForm}
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
    ? `<div class="alib-axis-img"><img src="${escapeHtml(item.thumbUrl)}" alt="" width="88" height="88" loading="lazy" decoding="async" onerror="this.onerror=null;this.removeAttribute('src');"/></div>`
    : `<div class="alib-axis-img alib-axis-img--empty" aria-hidden="true"></div>`;
  return `
  <article class="alib-axis-card">
    <p class="alib-axis-dim">${escapeHtml(labelTh)}</p>
    <p class="alib-axis-rank-note">อันดับ 1 ด้านนี้</p>
    <div class="alib-axis-body">
      ${img}
      <div class="alib-axis-text">
        <p class="alib-axis-name">${escapeHtml(item.displayReportId)}</p>
      </div>
    </div>
    <p class="alib-axis-blurb">เด่นสุดในด้านนี้</p>
    <div class="alib-axis-score-block" aria-label="คะแนนด้านนี้">
      <span class="alib-axis-score-num">${escapeHtml(String(axisScore))}</span><span class="alib-axis-score-suf">คะแนน</span>
    </div>
    <a class="alib-axis-btn" href="${escapeHtml(href)}">ดูรายละเอียด</a>
  </article>`;
}

/**
 * @param {object} p
 * @param {string} p.pagePublicToken
 * @param {SacredAmuletLibraryView} p.library
 * @param {number|null} [p.pinnedOriginalCount]
 * @param {string|null} [p.pinFlash]
 * @param {number} [p.freeTierPinLimit]
 * @returns {string}
 */
export function renderAmuletLibraryRankingHtml({
  pagePublicToken,
  library,
  pinnedOriginalCount = null,
  pinFlash = null,
  freeTierPinLimit = 10,
} = {}) {
  const backHref = `/r/${encodeURIComponent(pagePublicToken)}`;
  const n = library.totalCount;
  const dedupeExplainLine =
    Array.isArray(library.items) && library.items.length < n
      ? `<p class="alib-sub alib-sub--grouped">แสดงเฉพาะรายการที่ไม่ซ้ำกันในหน้านี้</p>`
      : "";
  const retentionNoticeHtml =
    pinnedOriginalCount != null
      ? `<p class="alib-retention-note" role="note">บัญชีฟรีเก็บรูปเต็มได้ ${escapeHtml(String(freeTierPinLimit))} รายการ ผลสแกนและคะแนนยังอยู่ แม้รูปเต็มหมดอายุ</p>`
      : "";
  const pinFlashHtml =
    pinFlash === "quota"
      ? `<p class="alib-pin-upsell" role="status">คุณปักหมุดครบ ${escapeHtml(String(freeTierPinLimit))} รายการแล้ว แพ็กเก็บพื้นที่แบบจ่ายเงินจะเปิดให้บริการภายหลัง เพื่อเก็บรูปเต็มเพิ่ม</p>`
      : pinFlash === "ok"
        ? `<p class="alib-pin-flash alib-pin-flash--ok" role="status">ปักหมุดรูปเต็มเรียบร้อย</p>`
        : pinFlash === "err"
          ? `<p class="alib-pin-flash alib-pin-flash--err" role="status">ไม่สามารถปักหมุดได้ในขณะนี้ ลองใหม่ภายหลัง</p>`
          : pinFlash === "denied"
            ? `<p class="alib-pin-flash alib-pin-flash--err" role="status">ไม่พบสิทธิ์ปักหมุดรายการนี้</p>`
            : "";
  // แท่นรับรางวัลท็อป 3 (มีชิ้นเดียวถอยเป็นการ์ด spotlight เดิม)
  const podiumItems = Array.isArray(library.byOverall)
    ? library.byOverall.slice(0, 3)
    : [];
  const spotlightIt = library.topOverall ?? library.byOverall?.[0] ?? null;
  const spotlightHtml = podiumItems.length
    ? podiumHtml(podiumItems, pagePublicToken)
    : spotlightIt
      ? spotlightCardHtml(spotlightIt, pagePublicToken)
      : "";
  const axisHighlights = Array.isArray(library.axisHighlights)
    ? library.axisHighlights
    : [];
  const axisCarouselSection =
    axisHighlights.length > 0
      ? `<section class="alib-axis-section" aria-labelledby="alib-axis-h">
    <h2 id="alib-axis-h" class="alib-axis-h2">พระเด่นประจำพลังของคุณ</h2>
    <p class="alib-axis-scroll-hint alib-axis-scroll-hint--before">เลื่อนดูพลังด้านอื่น ๆ</p>
    <div class="alib-axis-track" role="list">${axisHighlights
      .map(
        (h) =>
          `<div class="alib-axis-slide" role="listitem">${axisHighlightCardHtml(h)}</div>`,
      )
      .join("")}</div>
    <p class="alib-axis-scroll-hint">เลื่อนดูพลังด้านอื่น ๆ</p>
  </section>`
      : "";
  const emptyAxisTab = "ยังไม่มีรายการที่เด่นด้านนี้";
  const tabs = [
    { id: "overall", label: "แรงสุดโดยรวม", list: library.byOverall, emptyText: "ยังไม่มีข้อมูลในหมวดนี้" },
    { id: "fit", label: "เข้ากับคุณที่สุด", list: library.byFit, emptyText: "ยังไม่มีข้อมูลในหมวดนี้" },
    { id: "protection", label: "คุ้มครองสูงสุด", list: library.byProtection ?? [], emptyText: emptyAxisTab },
    { id: "metta", label: "เมตตาสูงสุด", list: library.byMetta ?? [], emptyText: emptyAxisTab },
    { id: "baramee", label: "บารมีสูงสุด", list: library.byBaramee ?? [], emptyText: emptyAxisTab },
    { id: "luck", label: "โชคลาภสูงสุด", list: library.byLuck ?? [], emptyText: emptyAxisTab },
    {
      id: "fortune_anchor",
      label: "หนุนดวงสูงสุด",
      list: library.byFortuneAnchor ?? [],
      emptyText: emptyAxisTab,
    },
    { id: "specialty", label: "งานเฉพาะทางสูงสุด", list: library.bySpecialty ?? [], emptyText: emptyAxisTab },
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
        `<div class="alib-panel${i === 0 ? " alib-panel--on" : ""}" data-alib-panel="${escapeHtml(t.id)}" role="tabpanel">${panelHtml(t.list, t.emptyText)}</div>`,
    )
    .join("");

  const docTitle = "คลังพลังของคุณ · Ener Scan";

  return `<!DOCTYPE html>
${amuletSubpageAutoDarkScriptHtml()}
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
      color-scheme: light;
      --alib-bg: #f6f6f4;
      --alib-surface: #fcfcfa;
      --alib-elevated: #fffefb;
      --alib-border: rgba(180, 140, 40, 0.18);
      --alib-gold: #b8871b;
      --alib-gold-soft: #8f6710;
      --alib-text: #241c12;
      --alib-body: rgba(36, 28, 18, 0.92);
      --alib-muted: #7a6a58;
      --alib-chip-bg: rgba(200, 155, 30, 0.08);
      --alib-chip-border: rgba(180, 140, 40, 0.22);
      --alib-panel-bg: linear-gradient(180deg, #fffefb 0%, #faf7f0 100%);
      --alib-safety-bg: #faf8f4;
      --alib-btn-text: #1a1610;
      --alib-shadow: 0 4px 18px rgba(0, 0, 0, 0.07);
      --alib-img-bg: rgba(200, 155, 30, 0.08);
      --alib-img-empty: repeating-linear-gradient(-45deg, rgba(200,155,30,0.1), rgba(200,155,30,0.1) 6px, transparent 6px, transparent 12px);
      --alib-dup-possible-bg: rgba(255, 200, 140, 0.18);
      --alib-dup-possible-text: #8a5a00;
      --alib-pin-upsell-bg: rgba(255, 220, 160, 0.28);
      --alib-pin-upsell-text: #6b4a00;
      --alib-pin-flash-ok: #2d6a3a;
      --alib-pin-flash-err: #8a3a00;
    }
    ${buildAmuletSubpageDarkThemeCss("alib")}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Sarabun, system-ui, sans-serif; background: var(--alib-bg); color: var(--alib-text); line-height: 1.62; font-size: 1.02rem; -webkit-font-smoothing: antialiased; }
    .alib-wrap { max-width: 720px; margin: 0 auto; padding: 1.35rem 1.1rem 2.6rem; }
    .alib-back { display: inline-block; margin-bottom: 0.85rem; font-size: 0.9rem; color: var(--alib-gold-soft); text-decoration: none; font-weight: 600; }
    .alib-back:hover { color: var(--alib-gold); text-decoration: underline; }
    .alib-h1 { margin: 0 0 0.4rem; font-size: 1.32rem; font-weight: 700; color: var(--alib-gold); letter-spacing: 0.01em; }
    .alib-sub { margin: 0 0 1.05rem; font-size: 0.96rem; color: var(--alib-body); line-height: 1.55; }
    .alib-sub--grouped { margin-top: -0.6rem; }
    .alib-spotlight {
      margin: 0 0 1.15rem;
      padding: 0.95rem 1rem 0.95rem;
      border-radius: 16px;
      border: 1px solid var(--alib-border);
      background: var(--alib-panel-bg);
      box-shadow: var(--alib-shadow);
    }
    .alib-spot-badge {
      margin: 0 0 0.55rem;
      font-size: 0.8rem;
      font-weight: 800;
      color: var(--alib-gold);
      letter-spacing: 0.02em;
    }
    .alib-spot-inner { display: flex; gap: 0.75rem; align-items: flex-start; }
    .alib-spot-img {
      flex-shrink: 0;
      width: 4.25rem;
      height: 4.25rem;
      border-radius: 10px;
      overflow: hidden;
      background: var(--alib-img-bg);
      border: 1px solid var(--alib-border);
    }
    .alib-spot-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .alib-spot-img--empty { background: var(--alib-img-empty); }
    .alib-spot-main { flex: 1; min-width: 0; }
    .alib-spot-title {
      margin: 0 0 0.35rem;
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--alib-body);
      line-height: 1.3;
    }
    .alib-spot-line { margin: 0 0 0.28rem; font-size: 0.85rem; line-height: 1.5; }
    .alib-spot-btn {
      display: block;
      text-align: center;
      margin-top: 0.55rem;
      padding: 0.45rem 0.7rem;
      font-size: 0.86rem;
      font-weight: 700;
      border-radius: 10px;
      text-decoration: none;
      color: var(--alib-btn-text);
      background: linear-gradient(165deg, #e8c547, #c9a227);
      box-shadow: 0 2px 10px rgba(180, 140, 40, 0.18);
    }
    .alib-spot-btn:hover { filter: brightness(1.05); }
    /* ── โฉมใหม่ (กบ 15 ก.ค.): แท่นรับรางวัลท็อป 3 + แถวอันดับแบบเตี้ย ── */
    .alib-podium { display: flex; gap: 12px; align-items: flex-end; margin: 0.4rem 0 1.15rem; }
    .alib-pod { flex: 1; text-align: center; position: relative; border: 1px solid var(--alib-border); border-radius: 18px; background: var(--alib-panel-bg); box-shadow: var(--alib-shadow); padding: 1.35rem 0.8rem 0.9rem; }
    .alib-pod--first { flex: 1.35; border: 2px solid var(--alib-gold); padding: 1.6rem 1rem 1rem; }
    .alib-pod-chip { position: absolute; top: -0.8rem; left: 50%; transform: translateX(-50%); white-space: nowrap; background: var(--alib-gold); color: #fffdf6; font-weight: 800; font-size: 0.72rem; border-radius: 999px; padding: 0.15rem 0.85rem; }
    .alib-pod--first .alib-pod-chip { background: linear-gradient(90deg, #b98a2e, #e3bc5f); font-size: 0.8rem; padding: 0.2rem 1.1rem; }
    .alib-pod-img { width: 5.4rem; height: 5.4rem; border-radius: 14px; object-fit: cover; border: 1px solid var(--alib-border); background: var(--alib-img-bg); display: block; margin: 0.35rem auto 0.45rem; }
    .alib-pod--first .alib-pod-img { width: 7.6rem; height: 7.6rem; border: 2px solid var(--alib-gold); }
    .alib-pod-img--empty { background: var(--alib-img-empty); }
    .alib-pod-id { margin: 0; font-weight: 800; font-size: 0.78rem; color: var(--alib-muted); letter-spacing: 0.02em; }
    .alib-pod-total { margin: 0.1rem 0 0; font-size: 1.9rem; font-weight: 700; color: var(--alib-gold); line-height: 1.1; }
    .alib-pod--first .alib-pod-total { font-size: 2.5rem; }
    .alib-pod-total small { display: block; font-size: 0.6rem; font-weight: 600; color: var(--alib-muted); }
    .alib-pod-peak { display: inline-block; margin: 0.35rem 0 0; font-size: 0.72rem; font-weight: 700; color: var(--alib-gold-soft); background: var(--alib-chip-bg); border: 1px solid var(--alib-chip-border); border-radius: 999px; padding: 0.15rem 0.6rem; }
    .alib-pod-fit { margin: 0.35rem 0 0; font-size: 0.75rem; color: var(--alib-muted); }
    .alib-pod .alib-spot-btn { margin-top: 0.6rem; font-size: 0.8rem; padding: 0.4rem 0.5rem; }
    .alib-pod .alib-pin-form { margin-top: 0.5rem; }
    @media (max-width: 560px) {
      .alib-podium { flex-wrap: wrap; }
      .alib-pod--first { order: -1; flex: 1 1 100%; }
      .alib-pod { flex: 1 1 calc(50% - 6px); }
    }
    .alib-rows { display: grid; grid-template-columns: 1fr; gap: 0.6rem; }
    .alib-row { display: flex; align-items: center; gap: 0.65rem; background: var(--alib-elevated); border: 1px solid var(--alib-border); border-radius: 13px; padding: 0.55rem 0.75rem; text-decoration: none; color: var(--alib-text); }
    .alib-row:hover { border-color: var(--alib-gold); }
    .alib-row-rank { flex: 0 0 1.7rem; text-align: center; font-weight: 800; color: var(--alib-muted); }
    .alib-row-img { width: 46px; height: 46px; border-radius: 10px; object-fit: cover; flex: 0 0 auto; background: var(--alib-img-bg); border: 1px solid var(--alib-border); }
    .alib-row-img--empty { display: inline-block; background: var(--alib-img-empty); }
    .alib-row-main { min-width: 0; flex: 1; display: flex; flex-direction: column; }
    .alib-row-id { font-weight: 800; font-size: 0.84rem; }
    .alib-row-peak { font-size: 0.73rem; color: var(--alib-muted); }
    .alib-row-dups { margin-top: 2px; }
    .alib-row-score { flex: 0 0 auto; text-align: right; display: flex; flex-direction: column; line-height: 1.2; }
    .alib-row-score b { font-size: 1.3rem; color: var(--alib-gold); font-weight: 700; }
    .alib-row-fit { font-size: 0.63rem; color: var(--alib-muted); }
    .alib-row-go { flex: 0 0 auto; color: var(--alib-gold); font-weight: 800; font-size: 1.1rem; }
    @media (min-width: 900px) {
      .alib-wrap { max-width: 1080px; }
      .alib-rows { grid-template-columns: 1fr 1fr; }
      .alib-podium { max-width: 860px; margin-left: auto; margin-right: auto; }
    }
    .alib-axis-section { margin: 0.35rem 0 0.5rem; }
    .alib-axis-h2 {
      margin: 0 0 0.35rem;
      font-size: 1.08rem;
      font-weight: 700;
      color: var(--alib-gold);
      line-height: 1.4;
      letter-spacing: 0.01em;
    }
    .alib-axis-scroll-hint {
      margin: 0.35rem 0 0;
      font-size: 0.74rem;
      font-weight: 500;
      color: var(--alib-muted);
      line-height: 1.45;
      text-align: center;
      letter-spacing: 0.02em;
    }
    .alib-axis-scroll-hint--before {
      margin: 0.15rem 0 0.4rem;
    }
    .alib-axis-track {
      display: flex;
      align-items: stretch;
      gap: 0.7rem;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-padding-inline: 0.25rem;
      padding: 0.2rem 0.1rem 0.5rem;
      margin: 0 -0.1rem;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .alib-axis-track::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
    .alib-axis-slide {
      flex: 0 0 min(82vw, 18rem);
      max-width: 18rem;
      scroll-snap-align: start;
      scroll-snap-stop: normal;
      display: flex;
      flex-direction: column;
    }
    @media (min-width: 640px) {
      .alib-axis-slide {
        flex: 0 0 calc((100% - 1.4rem) / 2.4);
        min-width: 11rem;
        max-width: 14rem;
      }
    }
    .alib-axis-card {
      flex: 1;
      width: 100%;
      min-height: 18.5rem;
      background: var(--alib-surface);
      border: 1px solid var(--alib-border);
      border-radius: 16px;
      padding: 0.7rem 0.75rem 0.72rem;
      box-shadow: var(--alib-shadow);
      display: flex;
      flex-direction: column;
    }
    .alib-axis-dim {
      margin: 0 0 0.2rem;
      font-size: 0.74rem;
      font-weight: 800;
      color: var(--alib-gold);
      line-height: 1.38;
    }
    .alib-axis-rank-note {
      margin: 0 0 0.5rem;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--alib-muted);
      line-height: 1.4;
    }
    .alib-axis-body { display: flex; gap: 0.55rem; align-items: flex-start; }
    .alib-axis-img {
      flex-shrink: 0;
      width: 88px;
      height: 88px;
      border-radius: 11px;
      overflow: hidden;
      border: 1px solid var(--alib-border);
      background: var(--alib-img-bg);
    }
    .alib-axis-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .alib-axis-img--empty { background: var(--alib-img-empty); }
    .alib-axis-text { flex: 1; min-width: 0; align-self: center; }
    .alib-axis-name {
      margin: 0;
      font-size: 0.88rem;
      font-weight: 800;
      color: var(--alib-body);
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .alib-axis-blurb {
      margin: 0.55rem 0 0;
      font-size: 0.76rem;
      line-height: 1.45;
      color: var(--alib-muted);
      font-weight: 500;
    }
    .alib-axis-score-block {
      margin: 0.45rem 0 0;
      line-height: 1;
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.12rem 0.35rem;
    }
    .alib-axis-score-num {
      font-size: 2.05rem;
      font-weight: 800;
      color: var(--alib-gold);
      letter-spacing: -0.02em;
      line-height: 1;
    }
    .alib-axis-score-suf {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--alib-muted);
    }
    .alib-axis-btn {
      display: block;
      text-align: center;
      margin-top: auto;
      padding-top: 0.65rem;
      padding-bottom: 0.42rem;
      padding-left: 0.5rem;
      padding-right: 0.5rem;
      font-size: 0.84rem;
      font-weight: 700;
      border-radius: 10px;
      text-decoration: none;
      color: var(--alib-btn-text);
      background: linear-gradient(165deg, #e8c547, #c9a227);
      box-shadow: 0 2px 10px rgba(180, 140, 40, 0.16);
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
      color: var(--alib-btn-text);
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
    .alib-tab--on { color: var(--alib-btn-text); background: linear-gradient(165deg, #e8c547, #c9a227); border-color: rgba(180, 140, 40, 0.35); }
    .alib-panel { display: none; }
    .alib-panel--on { display: block; }
    .alib-card {
      background: var(--alib-surface);
      border: 1px solid var(--alib-border);
      border-radius: 14px;
      padding: 0.75rem 0.85rem;
      margin-bottom: 0.65rem;
      box-shadow: var(--alib-shadow);
    }
    .alib-card-top { display: flex; gap: 0.65rem; align-items: flex-start; }
    .alib-rank { display: block; font-size: 0.78rem; font-weight: 800; color: var(--alib-gold); margin-bottom: 0.35rem; }
    .alib-card-img { flex-shrink: 0; width: 4.5rem; height: 4.5rem; border-radius: 10px; overflow: hidden; background: var(--alib-img-bg); border: 1px solid var(--alib-border); }
    .alib-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .alib-card-img--empty { background: var(--alib-img-empty); }
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
      color: var(--alib-dup-possible-text);
      border-color: rgba(200, 120, 40, 0.35);
      background: var(--alib-dup-possible-bg);
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
      border-radius: 10px; text-decoration: none; color: var(--alib-btn-text);
      background: linear-gradient(165deg, #e8c547, #c9a227);
      box-shadow: 0 2px 10px rgba(180, 140, 40, 0.18);
    }
    .alib-card-btn:hover { filter: brightness(1.05); }
    .alib-empty { color: var(--alib-muted); font-size: 0.9rem; }
    .alib-note { margin: 1.1rem 0 0; font-size: 0.82rem; color: var(--alib-muted); line-height: 1.55; }
    .alib-safety {
      margin: 0 0 0.95rem;
      padding: 0.65rem 0.75rem;
      font-size: 0.8rem;
      line-height: 1.58;
      color: var(--alib-muted);
      background: var(--alib-safety-bg);
      border-radius: 12px;
      border: 1px solid var(--alib-border);
    }
    .alib-retention-note {
      margin: 0 0 0.75rem;
      padding: 0.55rem 0.65rem;
      font-size: 0.78rem;
      line-height: 1.55;
      color: var(--alib-body);
      background: var(--alib-elevated);
      border-radius: 10px;
      border: 1px solid var(--alib-border);
    }
    .alib-pin-upsell {
      margin: 0 0 0.75rem;
      padding: 0.55rem 0.65rem;
      font-size: 0.8rem;
      line-height: 1.5;
      font-weight: 600;
      color: var(--alib-pin-upsell-text);
      background: var(--alib-pin-upsell-bg);
      border-radius: 10px;
      border: 1px solid var(--alib-border);
    }
    .alib-pin-flash { margin: 0 0 0.65rem; font-size: 0.8rem; font-weight: 600; line-height: 1.45; }
    .alib-pin-flash--ok { color: var(--alib-pin-flash-ok); }
    .alib-pin-flash--err { color: var(--alib-pin-flash-err); }
    .alib-pin-form { margin: 0.45rem 0 0.5rem; }
    .alib-pin-btn {
      display: inline-block;
      width: 100%;
      padding: 0.38rem 0.65rem;
      font-size: 0.82rem;
      font-weight: 700;
      font-family: inherit;
      color: var(--alib-gold);
      background: var(--alib-elevated);
      border: 1px solid var(--alib-border);
      border-radius: 999px;
      cursor: pointer;
      box-shadow: var(--alib-shadow);
    }
    .alib-pin-btn:hover { filter: brightness(1.06); }
    .alib-scan-footer {
      margin-top: 1.35rem;
      padding: 1rem 0.95rem 1.05rem;
      border-radius: 14px;
      border: 1px solid var(--alib-border);
      background: var(--alib-panel-bg);
      text-align: center;
      box-shadow: var(--alib-shadow);
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
      color: var(--alib-btn-text);
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
    <p class="alib-safety" role="note">อันดับนี้จัดจากผลสแกนของคุณเท่านั้น ไม่ได้ระบุชื่อพระหรือรุ่นพระจริง</p>
    ${retentionNoticeHtml}
    ${pinFlashHtml}
    ${spotlightHtml}
    ${axisCarouselSection}
    <button type="button" class="alib-show-all" id="alib-btn-show-rankings">ดูอันดับทั้งหมดในคลัง</button>
    <section id="alib-full-rankings" class="alib-full-rankings" hidden aria-label="อันดับเต็มตามหมวด">
    <div class="alib-tabs">
      <div class="alib-tab-row" role="tablist" aria-label="หมวดอันดับ">${tabButtons}</div>
      ${tabPanels}
    </div>
    </section>
    <section class="alib-scan-footer" aria-labelledby="alib-scan-footer-h">
      <h2 id="alib-scan-footer-h" class="alib-scan-footer-title">อยากรู้ว่าองค์อื่นของคุณจะขึ้นอันดับไหน?</h2>
      <p class="alib-scan-footer-lead">สแกนเพิ่มเพื่อเทียบพลังรวม ความเข้ากัน คุ้มครอง เมตตา บารมี โชคลาภ หนุนดวง งานเฉพาะทาง</p>
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

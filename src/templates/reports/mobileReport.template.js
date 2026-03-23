import { escapeHtml } from "../../utils/reports/reportHtml.util.js";

/**
 * Optional section: show muted empty hint when no content (graceful).
 * @param {string} title
 * @param {string} bodyHtml
 * @param {string} [variantClass]
 */
function sectionOrEmpty(title, bodyHtml, variantClass = "") {
  const trimmed = String(bodyHtml || "").trim();
  const inner = trimmed
    ? bodyHtml
    : `<p class="empty-hint" role="status">ยังไม่มีข้อมูลในส่วนนี้</p>`;
  return sectionCard(title, inner, trimmed ? "" : " card--empty", variantClass);
}

/**
 * @param {string} title
 * @param {string} innerHtml
 * @param {string} [emptyModifier]
 * @param {string} [variantClass]
 */
function sectionCard(title, innerHtml, emptyModifier = "", variantClass = "") {
  return `
  <section class="card card--section${emptyModifier}${variantClass ? ` ${variantClass}` : ""}">
    <h2 class="card-title">${escapeHtml(title)}</h2>
    ${innerHtml}
  </section>`;
}

/**
 * @param {string[]} items
 * @returns {string}
 */
function ulList(items) {
  if (!items?.length) return "";
  return `<ul class="bullet-list">${items
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("")}</ul>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function hero(p) {
  const imageUrl = String(p.object?.objectImageUrl || "").trim();
  const label = p.object?.objectLabel || "วัตถุของคุณ";
  const alt = imageUrl
    ? `รูปวัตถุ — ${escapeHtml(label)}`
    : "ไม่มีรูปวัตถุจากระบบ";
  const media = imageUrl
    ? `<div class="hero-media">
    <img class="hero-img" src="${escapeHtml(imageUrl)}" alt="${alt}" loading="lazy" decoding="async" fetchpriority="high" onerror="this.classList.add('hero-img--broken'); this.closest('.hero-media')?.classList.add('hero-media--broken');" />
    <div class="hero-fallback" role="img" aria-label="ไม่สามารถโหลดรูปได้"><span class="hero-placeholder-inner">โหลดรูปไม่สำเร็จ</span></div>
  </div>`
    : `<div class="hero-media hero-media--empty" aria-label="${escapeHtml(alt)}">
    <div class="hero-placeholder"><span class="hero-placeholder-inner">ยังไม่มีรูปวัตถุในรายงาน</span></div>
  </div>`;
  const date = p.generatedAt
    ? new Date(p.generatedAt).toLocaleString("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
  const heroModifier = imageUrl ? " hero--with-image" : " hero--no-image";
  return `
  <header class="hero${heroModifier}">
    <div class="hero-frame">
      ${media}
    </div>
    <div class="hero-text">
      <span class="badge">Ener Scan · รายงานฉบับเต็ม</span>
      <h1 class="title">รายงานพลังวัตถุ</h1>
      <p class="byline">${escapeHtml(label)}</p>
      ${date ? `<p class="hero-date"><span class="hero-date-inner">${escapeHtml(date)}</span></p>` : ""}
    </div>
  </header>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function summary(p) {
  const s = p.summary || {};
  const score =
    s.energyScore != null && Number.isFinite(Number(s.energyScore))
      ? Number(s.energyScore).toFixed(1)
      : "—";
  const compat =
    s.compatibilityPercent != null &&
    Number.isFinite(Number(s.compatibilityPercent))
      ? `${Math.round(Number(s.compatibilityPercent))}%`
      : "—";
  const meterPct = Math.min(
    100,
    Math.max(0, Number(s.energyScore) * 10 || 0),
  );
  const mainShort = s.mainEnergyLabel || "—";
  return `
  <section class="card card--summary">
    <div class="summary-head">
      <h2 class="card-title card-title--inline">สรุปภาพรวม</h2>
    </div>
    <p class="summary-line">${escapeHtml(s.summaryLine || "")}</p>
    <div class="summary-metrics">
      <div class="metric metric--highlight">
        <span class="metric-label">คะแนนพลัง</span>
        <span class="metric-value gold">${escapeHtml(score)}</span>
        <span class="metric-sub">${escapeHtml(s.energyLevelLabel || "—")}</span>
      </div>
      <div class="metric metric--wide">
        <span class="metric-label">พลังหลัก</span>
        <span class="metric-value metric-value--text">${escapeHtml(mainShort)}</span>
      </div>
      <div class="metric metric--highlight">
        <span class="metric-label">ความเข้ากัน</span>
        <span class="metric-value gold">${escapeHtml(compat)}</span>
      </div>
    </div>
    <div class="meter-wrap">
      <span class="meter-label">ระดับพลังโดยรวม</span>
      <div class="meter" role="presentation" aria-hidden="true"><span class="meter-fill" style="width:${meterPct}%"></span></div>
    </div>
  </section>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function trustBlock(p) {
  const t = p.trust || {};
  const note = t.trustNote || "";
  return `
  <section class="card card--section card--trust">
    <h2 class="card-title">หมายเหตุ</h2>
    ${note ? `<p class="trust-text">${escapeHtml(note)}</p>` : `<p class="empty-hint">ไม่มีหมายเหตุเพิ่มเติม</p>`}
    <p class="meta tiny">เวอร์ชันรายงาน ${escapeHtml(p.reportVersion)} · render ${escapeHtml(t.rendererVersion || "")}${t.modelLabel ? ` · ${escapeHtml(t.modelLabel)}` : ""}</p>
  </section>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function actionBar(p) {
  const a = p.actions || {};
  const buttons = [];
  if (a.rescanUrl)
    buttons.push(
      `<a class="btn btn-primary" href="${escapeHtml(a.rescanUrl)}">สแกนใหม่</a>`,
    );
  if (a.historyUrl)
    buttons.push(
      `<a class="btn btn-secondary" href="${escapeHtml(a.historyUrl)}">ดูประวัติ</a>`,
    );
  if (a.changeBirthdateUrl)
    buttons.push(
      `<a class="btn btn-secondary" href="${escapeHtml(a.changeBirthdateUrl)}">เปลี่ยนวันเกิด</a>`,
    );
  if (a.lineHomeUrl)
    buttons.push(
      `<a class="btn btn-secondary" href="${escapeHtml(a.lineHomeUrl)}">กลับ LINE</a>`,
    );
  if (!buttons.length)
    buttons.push(
      `<span class="btn btn-disabled" role="note">เปิดจาก LINE เพื่อใช้งานต่อ</span>`,
    );
  return `
  <footer class="action-bar">
    <div class="action-bar-inner">
      ${buttons.join("")}
    </div>
  </footer>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @returns {string}
 */
export function renderMobileReportHtml(payload) {
  const p = payload || {};
  const sec = p.sections || {};

  const whatItGives = Array.isArray(sec.whatItGives) ? sec.whatItGives : [];
  const ownerMatchReason = Array.isArray(sec.ownerMatchReason)
    ? sec.ownerMatchReason
    : [];
  const bestUseCases = Array.isArray(sec.bestUseCases) ? sec.bestUseCases : [];

  const whatBody = ulList(whatItGives);
  const ownerBody = `${ownerMatchReason.length ? ulList(ownerMatchReason) : ""}${sec.roleDescription ? `<p class="para">${escapeHtml(sec.roleDescription)}</p>` : ""}`;
  const bestBody = ulList(bestUseCases);

  const what = sectionOrEmpty("สิ่งที่วัตถุนี้มอบให้", whatBody, "card--tone-a");
  const owner = sectionOrEmpty(
    "ทำไมถึงเข้ากับเจ้าของ",
    ownerBody,
    "card--tone-b",
  );
  const best = sectionOrEmpty(
    "จังหวะที่เหมาะจะใช้",
    bestBody,
    "card--tone-c",
  );

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <title>${escapeHtml(p.summary?.summaryLine?.slice(0, 48) || "Ener Scan — รายงาน")}</title>
  <style>
    :root {
      --bg: #080a0d;
      --bg-elevated: #0e1117;
      --card: #12161d;
      --card-edge: rgba(255, 255, 255, 0.07);
      --text: #eceae7;
      --muted: #9b968f;
      --muted2: #6f6a64;
      --gold: #d4af37;
      --gold-soft: rgba(212, 175, 55, 0.14);
      --gold-dim: #9a7b1a;
      --radius: 16px;
      --radius-sm: 12px;
      --font: "Sarabun", "Noto Sans Thai", system-ui, sans-serif;
      --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.35);
      --section-accent-a: rgba(212, 175, 55, 0.22);
      --section-accent-b: rgba(120, 160, 200, 0.12);
      --section-accent-c: rgba(180, 140, 200, 0.1);
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      font-family: var(--font);
      background: var(--bg);
      background-image: radial-gradient(ellipse 120% 80% at 50% -20%, rgba(212, 175, 55, 0.06), transparent 50%);
      color: var(--text);
      line-height: 1.7;
      font-size: 17px;
      letter-spacing: 0.01em;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    .wrap {
      max-width: 26rem;
      margin: 0 auto;
      padding: 1.25rem 1.125rem 2.75rem;
    }
    /* Hero */
    .hero {
      margin-bottom: 1.5rem;
    }
    .hero-frame {
      border-radius: var(--radius);
      padding: 1px;
      background: linear-gradient(145deg, rgba(212, 175, 55, 0.35), rgba(255, 255, 255, 0.06) 40%, rgba(212, 175, 55, 0.12));
      box-shadow: var(--shadow-card);
      overflow: hidden;
    }
    .hero-media {
      position: relative;
      border-radius: calc(var(--radius) - 1px);
      background: linear-gradient(160deg, #1a1f2a 0%, #0d1016 100%);
    }
    .hero-media--empty .hero-placeholder {
      border-radius: calc(var(--radius) - 1px);
    }
    .hero-img,
    .hero-placeholder {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      object-position: center;
      border-radius: calc(var(--radius) - 1px);
      background: linear-gradient(160deg, #1a1f2a 0%, #0d1016 100%);
      border: none;
    }
    .hero-img--broken {
      display: none !important;
    }
    .hero-fallback {
      display: none;
      width: 100%;
      aspect-ratio: 4 / 3;
      align-items: center;
      justify-content: center;
      color: var(--muted2);
      font-size: 0.9rem;
      border-radius: calc(var(--radius) - 1px);
      background: linear-gradient(160deg, #1a1f2a 0%, #0d1016 100%);
    }
    .hero-media--broken .hero-fallback {
      display: flex;
    }
    .hero-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted2);
      font-size: 0.9rem;
    }
    .hero-placeholder-inner {
      padding: 0.5rem 1rem;
      border: 1px dashed rgba(212, 175, 55, 0.2);
      border-radius: var(--radius-sm);
    }
    .hero--no-image .hero-frame {
      background: linear-gradient(145deg, rgba(212, 175, 55, 0.2), rgba(255, 255, 255, 0.04) 45%, rgba(212, 175, 55, 0.08));
    }
    .hero-text {
      padding: 1.1rem 0.15rem 0;
    }
    .badge {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--gold);
      background: var(--gold-soft);
      padding: 0.35rem 0.65rem;
      border-radius: 999px;
      margin: 0 0 0.65rem;
    }
    .title {
      font-size: 1.55rem;
      font-weight: 700;
      margin: 0 0 0.4rem;
      line-height: 1.35;
      letter-spacing: -0.02em;
    }
    .byline {
      margin: 0;
      color: var(--muted);
      font-size: 1rem;
      line-height: 1.55;
    }
    .hero-date {
      margin: 0.75rem 0 0;
    }
    .hero-date-inner {
      display: inline-block;
      font-size: 0.8rem;
      color: var(--muted);
      padding: 0.25rem 0.6rem;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    /* Cards */
    .card {
      background: var(--card);
      border-radius: var(--radius);
      padding: 1.15rem 1.2rem;
      margin-bottom: 1rem;
      border: 1px solid var(--card-edge);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
    }
    .card--section {
      border-left: 3px solid var(--section-accent-a);
      background: linear-gradient(180deg, var(--bg-elevated) 0%, var(--card) 100%);
    }
    .card--tone-a { border-left-color: rgba(212, 175, 55, 0.55); }
    .card--tone-b { border-left-color: rgba(130, 170, 210, 0.45); }
    .card--tone-c { border-left-color: rgba(190, 150, 210, 0.4); }
    .card--empty {
      border-left-color: rgba(255, 255, 255, 0.12);
    }
    .card--empty .card-title {
      opacity: 0.85;
    }
    .empty-hint {
      margin: 0;
      font-size: 0.92rem;
      color: var(--muted2);
      font-style: normal;
    }
    .card-title {
      font-size: 1.02rem;
      margin: 0 0 0.75rem;
      color: var(--gold);
      font-weight: 600;
      line-height: 1.4;
    }
    .card-title--inline { margin-bottom: 0.5rem; }
    .summary-head {
      margin-bottom: 0.35rem;
    }
    /* Summary */
    .card--summary {
      background: linear-gradient(165deg, rgba(212, 175, 55, 0.08) 0%, var(--card) 45%);
      border-color: rgba(212, 175, 55, 0.18);
    }
    .summary-line {
      margin: 0 0 1.1rem;
      font-size: 1rem;
      line-height: 1.75;
      color: var(--text);
    }
    .summary-metrics {
      display: grid;
      grid-template-columns: 1fr 1.4fr 1fr;
      gap: 0.6rem;
      margin-bottom: 1rem;
      align-items: stretch;
    }
    .metric {
      background: rgba(0, 0, 0, 0.28);
      border-radius: var(--radius-sm);
      padding: 0.65rem 0.45rem;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.05);
      min-height: 5.25rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .metric--wide {
      grid-column: span 1;
    }
    .metric-label {
      display: block;
      font-size: 0.68rem;
      color: var(--muted);
      margin-bottom: 0.25rem;
      line-height: 1.3;
    }
    .metric-value {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1.2;
    }
    .metric-value--text {
      font-size: 0.82rem;
      font-weight: 600;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .metric-sub {
      font-size: 0.68rem;
      color: var(--muted);
      margin-top: 0.2rem;
    }
    .gold { color: var(--gold); }
    .meter-wrap {
      padding-top: 0.25rem;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .meter-label {
      display: block;
      font-size: 0.72rem;
      color: var(--muted);
      margin-bottom: 0.4rem;
    }
    .meter {
      height: 7px;
      background: rgba(255, 255, 255, 0.07);
      border-radius: 4px;
      overflow: hidden;
    }
    .meter-fill {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--gold-dim), var(--gold));
      border-radius: 4px;
    }
    .bullet-list {
      margin: 0;
      padding-left: 1.2rem;
    }
    .bullet-list li {
      margin-bottom: 0.55rem;
      padding-left: 0.15rem;
    }
    .bullet-list li::marker {
      color: var(--gold-dim);
    }
    .para {
      margin: 0.65rem 0 0;
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.7;
    }
    .card--trust .trust-text {
      margin: 0 0 0.65rem;
      font-size: 0.94rem;
      line-height: 1.7;
      color: var(--text);
    }
    .tiny {
      font-size: 0.72rem;
      color: var(--muted2);
      margin: 0;
      line-height: 1.5;
    }
    /* Action bar */
    .action-bar {
      margin-top: 1.25rem;
      padding-top: 0.25rem;
    }
    .action-bar-inner {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 2.85rem;
      padding: 0.6rem 1rem;
      border-radius: var(--radius-sm);
      font-size: 0.95rem;
      font-weight: 600;
      text-decoration: none;
      color: var(--text);
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .btn-secondary {
      border-color: rgba(212, 175, 55, 0.22);
      background: rgba(255, 255, 255, 0.03);
    }
    .btn-primary {
      background: linear-gradient(180deg, rgba(212, 175, 55, 0.22), rgba(212, 175, 55, 0.06));
      border-color: rgba(212, 175, 55, 0.45);
      color: var(--gold);
    }
    .btn-disabled {
      opacity: 0.5;
      cursor: default;
      font-weight: 500;
    }
    @media (min-width: 380px) {
      .action-bar-inner {
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: center;
      }
      .btn {
        flex: 1 1 auto;
        min-width: 44%;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    ${hero(p)}
    ${summary(p)}
    ${what}
    ${owner}
    ${best}
    ${trustBlock(p)}
    ${actionBar(p)}
  </div>
</body>
</html>`;
}

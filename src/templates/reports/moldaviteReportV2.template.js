import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { formatBangkokDateTime } from "../../utils/dateTime.util.js";
import { buildMoldaviteHtmlV2ViewModel } from "../../moldavite/moldaviteHtmlV2.model.js";

const RADAR_R = 38;
const RADAR_CX = 50;
const RADAR_CY = 50;
/** Radians: top, bottom-right, bottom-left — งาน, ความสัมพันธ์, การเงิน */
const RADAR_ANGLES = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI) / 3, -Math.PI / 2 + (4 * Math.PI) / 3];
const AXIS_KEYS = /** @type {const} */ (["work", "relationship", "money"]);

/**
 * Footer render/meta line: off in production unless explicitly enabled (support/debug).
 * `REPORT_HTML_RENDER_META=true|1|yes` → show; `false|0|no` → hide;
 * unset → show only when `NODE_ENV !== "production"`.
 * @returns {boolean}
 */
function moldaviteHtmlShowRenderMetaLine() {
  const raw = String(process.env.REPORT_HTML_RENDER_META ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * @param {Record<string, number>} values01to100
 */
function radarPolygonPoints(values01to100) {
  const pts = RADAR_ANGLES.map((ang, i) => {
    const k = AXIS_KEYS[i];
    const v = Math.max(0, Math.min(100, Number(values01to100[k]) || 0)) / 100;
    const x = RADAR_CX + RADAR_R * v * Math.cos(ang);
    const y = RADAR_CY + RADAR_R * v * Math.sin(ang);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return pts.join(" ");
}

/**
 * Vertex for one axis on the radar (viewBox coords).
 * @param {Record<string, number>} values01to100
 * @param {string} axisKey
 */
function radarVertexForAxis(values01to100, axisKey) {
  const i = AXIS_KEYS.indexOf(axisKey);
  if (i < 0) return { x: RADAR_CX, y: RADAR_CY };
  const ang = RADAR_ANGLES[i];
  const v = Math.max(0, Math.min(100, Number(values01to100[axisKey]) || 0)) / 100;
  return {
    x: RADAR_CX + RADAR_R * v * Math.cos(ang),
    y: RADAR_CY + RADAR_R * v * Math.sin(ang),
  };
}

/**
 * @param {ReturnType<typeof buildMoldaviteHtmlV2ViewModel>} vm
 */
function radarBlock(vm) {
  const g = vm.graph;
  const ownerPts = radarPolygonPoints(g.owner);
  const crystalPts = radarPolygonPoints(g.crystal);
  const peak = radarVertexForAxis(g.crystal, g.crystalPeakAxisKey);
  const peakLabel = String(g.crystalPeakLabelThai || "").trim() || "หิน";
  const crystalMarker = `<circle class="mv2-radar-peak" cx="${peak.x.toFixed(2)}" cy="${peak.y.toFixed(2)}" r="2.5" fill="#4ade80" stroke="rgba(255,255,255,0.9)" stroke-width="0.55" aria-hidden="true"><title>แรงเน้นสูงสุดของโทนหิน: ${escapeHtml(peakLabel)}</title></circle>`;
  /** Bottom-right = ความสัมพันธ์, bottom-left = การเงิน (matches axis math). */
  const labels = [
    { ax: RADAR_CX, ay: 8, text: "งาน", ta: "middle" },
    { ax: 88, ay: 72, text: "ความสัมพันธ์", ta: "end" },
    { ax: 12, ay: 72, text: "การเงิน", ta: "start" },
  ];
  const labelSvg = labels
    .map(
      (L) =>
        `<text x="${L.ax}" y="${L.ay}" fill="rgba(200,210,205,0.9)" font-size="3.2" text-anchor="${L.ta}" font-family="inherit">${escapeHtml(L.text)}</text>`,
    )
    .join("");
  return `
  <section class="mv2-radar-card" aria-labelledby="mv2-radar-h">
    <h2 class="mv2-radar-title" id="mv2-radar-h">ภาพรวมการจับคู่</h2>
    <p class="mv2-radar-sub"><span class="mv2-radar-sub-line">สเกล 0–100 ต่อแกน</span><span class="mv2-radar-sub-line">จุดสว่าง = มิติที่เด่นสุด</span></p>
    <div class="mv2-radar-svg-wrap">
      <svg class="mv2-radar-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="เรดาร์สามแกน เจ้าของและโทนหิน" aria-describedby="mv2-radar-peak-note">
        <polygon points="${radarPolygonPoints({ work: 100, relationship: 100, money: 100 })}" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" stroke-width="0.4"/>
        <line x1="50" y1="50" x2="50" y2="12" stroke="rgba(255,255,255,0.08)" stroke-width="0.25"/>
        <line x1="50" y1="50" x2="83" y2="67" stroke="rgba(255,255,255,0.08)" stroke-width="0.25"/>
        <line x1="50" y1="50" x2="17" y2="67" stroke="rgba(255,255,255,0.08)" stroke-width="0.25"/>
        <polygon points="${ownerPts}" fill="rgba(96,165,250,0.2)" stroke="rgba(147,197,253,0.98)" stroke-width="0.78" stroke-linejoin="round" opacity="0.95"/>
        <polygon points="${crystalPts}" fill="rgba(22,163,74,0.22)" stroke="rgba(52,211,153,0.98)" stroke-width="0.88" stroke-linejoin="round"/>
        ${crystalMarker}
        ${labelSvg}
      </svg>
      <p class="mv2-radar-peak-note" id="mv2-radar-peak-note">เด่นสุดตอนนี้: ${escapeHtml(peakLabel)}</p>
    </div>
    <ul class="mv2-legend" role="list">
      <li><span class="mv2-dot mv2-dot--owner"></span> คุณ (จากวันเกิด / รหัสรายงาน)</li>
      <li><span class="mv2-dot mv2-dot--crystal"></span> โทนหิน (มิติชีวิต)</li>
    </ul>
  </section>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @returns {string}
 */
export function renderMoldaviteReportV2Html(payload) {
  const vm = buildMoldaviteHtmlV2ViewModel(payload);
  const h = vm.hero;
  const dateRaw = formatBangkokDateTime(h.reportGeneratedAt);
  const date = dateRaw !== "-" ? dateRaw : "";
  const imgUrl = h.objectImageUrl;
  const media = imgUrl
    ? `<div class="mv2-hero-media"><img class="mv2-hero-img" src="${escapeHtml(imgUrl)}" alt="" loading="lazy" decoding="async"/></div>`
    : `<div class="mv2-hero-media mv2-hero-media--empty"><span>ยังไม่มีรูป</span></div>`;

  const score =
    vm.metrics.energyScore != null &&
    Number.isFinite(Number(vm.metrics.energyScore))
      ? Number(vm.metrics.energyScore).toFixed(1)
      : "—";
  const compat =
    vm.metrics.compatibilityPercent != null &&
    Number.isFinite(Number(vm.metrics.compatibilityPercent))
      ? `${Math.round(Number(vm.metrics.compatibilityPercent))}%`
      : "—";

  const gs = vm.graphSummary;
  const graphSummaryHtml = `
    <p class="mv2-graph-sum-compact"><span class="mv2-graph-sum-k">แรงสอดคล้องสุด</span><span class="mv2-graph-sum-arrow"> → </span><span class="mv2-graph-sum-v">${escapeHtml(gs.alignmentTargetThai)}</span></p>
    <p class="mv2-graph-sum-compact"><span class="mv2-graph-sum-k">จุดที่ควรบาลานซ์</span><span class="mv2-graph-sum-arrow"> → </span><span class="mv2-graph-sum-v">${escapeHtml(gs.tensionTargetThai)}</span></p>`;

  const traitsHtml = vm.ownerProfile.traits
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("");

  const interactionHtml = vm.interactionSummary.rows
    .map(
      (row) =>
        `<li class="mv2-int-row"><span class="mv2-int-kicker">${escapeHtml(row.kicker)}</span><span class="mv2-int-body">${escapeHtml(row.body)}</span></li>`,
    )
    .join("");

  const meaningHtml =
    vm.meaningParagraphs.length > 0
      ? vm.meaningParagraphs
          .map((p) => `<p class="mv2-para">${escapeHtml(String(p))}</p>`)
          .join("")
      : "";

  const lifeRowsHtml = vm.lifeAreaDetail.rows
    .map(
      (row) => `
    <div class="mv2-life-card">
      <div class="mv2-life-head"><span>${escapeHtml(row.label)}</span><span class="mv2-life-score">${escapeHtml(String(row.score))}</span></div>
      <p class="mv2-para mv2-life-blurb">${escapeHtml(row.blurb)}</p>
    </div>`,
    )
    .join("");

  const usageHtml = vm.usageCaution.lines
    .map((u) => `<li>${escapeHtml(u)}</li>`)
    .join("");

  const title = escapeHtml(
    (h.subtypeLabel || "รายงาน").slice(0, 48),
  );

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <!-- moldavite-html-v2 -->
  <title>${title} — Ener Scan</title>
  <style>
    :root {
      --mv2-bg: #0a0c0f;
      --mv2-card: #111418;
      --mv2-edge: rgba(255,255,255,0.06);
      --mv2-text: #f3f4f6;
      --mv2-muted: #9ca3af;
      --mv2-green: #22c55e;
      --mv2-green-dim: #86efac;
      --mv2-blue: #93c5fd;
      --mv2-r: 18px;
      --mv2-font: "Sarabun","Noto Sans Thai",system-ui,sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--mv2-font);
      background: var(--mv2-bg);
      color: var(--mv2-text);
      font-size: 16px;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    .mv2-wrap { max-width: 26rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
    .mv2-hero { margin-bottom: 1.25rem; }
    .mv2-badge { font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mv2-muted); }
    .mv2-hero-media { border-radius: var(--mv2-r); overflow: hidden; background: #1a1f26; aspect-ratio: 20/13; margin-top: 0.5rem; }
    .mv2-hero-media--empty { display:flex; align-items:center; justify-content:center; color: var(--mv2-muted); font-size: 0.85rem; }
    .mv2-hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .mv2-h1 { font-size: 1.45rem; font-weight: 700; margin: 0.6rem 0 0.2rem; line-height: 1.25; }
    .mv2-tag { color: var(--mv2-green-dim); font-size: 0.92rem; margin: 0.25rem 0 1.05rem; line-height: 1.4; }
    .mv2-main { color: var(--mv2-green); font-weight: 600; font-size: 0.95rem; margin: 0 0 0.5rem; border-left: 3px solid rgba(34,197,94,0.5); padding-left: 0.6rem; }
    .mv2-h1 + .mv2-main { margin-top: 0.35rem; }
    .mv2-date { font-size: 0.72rem; color: var(--mv2-muted); margin-top: 0.35rem; }
    .mv2-strip {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.5rem;
      margin: 1rem 0 1.25rem;
      text-align: center;
    }
    .mv2-strip > div { background: var(--mv2-card); border: 1px solid var(--mv2-edge); border-radius: 12px; padding: 0.55rem 0.35rem; }
    .mv2-strip-k { font-size: 0.65rem; color: var(--mv2-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .mv2-strip-v { font-size: 1.05rem; font-weight: 700; color: var(--mv2-green-dim); margin-top: 0.2rem; }
    .mv2-strip-v small { font-size: 0.75rem; font-weight: 500; color: var(--mv2-muted); }
    .mv2-strip-cell--level .mv2-strip-k { font-size: 0.6rem; opacity: 0.72; letter-spacing: 0.05em; }
    .mv2-strip-cell--level .mv2-strip-v { font-size: 0.82rem !important; font-weight: 600; color: rgba(134,239,172,0.78); margin-top: 0.22rem; }
    .mv2-card {
      background: var(--mv2-card);
      border: 1px solid var(--mv2-edge);
      border-radius: var(--mv2-r);
      padding: 1rem 1.05rem;
      margin-bottom: 1rem;
    }
    .mv2-card h2 { font-size: 0.95rem; margin: 0 0 0.5rem; color: var(--mv2-green-dim); font-weight: 600; }
    .mv2-radar-card { border-left: 3px solid rgba(34,197,94,0.55); }
    .mv2-radar-title { margin: 0 0 0.35rem; font-size: 1rem; color: var(--mv2-green-dim); }
    .mv2-radar-sub { margin: 0 0 0.75rem; font-size: 0.72rem; color: var(--mv2-muted); line-height: 1.45; display: flex; flex-direction: column; gap: 0.2rem; }
    .mv2-radar-sub-line { display: block; }
    .mv2-radar-peak-note { margin: 0.35rem 0 0; font-size: 0.58rem; color: rgba(100,116,139,0.78); line-height: 1.3; text-align: center; font-weight: 400; letter-spacing: 0.02em; }
    .mv2-radar-svg-wrap { width: 100%; max-width: 18rem; margin: 0 auto; }
    .mv2-radar-svg { width: 100%; height: auto; display: block; }
    .mv2-legend { list-style: none; padding: 0.3rem 0 0; margin: 0; font-size: 0.58rem; color: rgba(100,116,139,0.52); letter-spacing: 0.01em; line-height: 1.35; }
    .mv2-legend li { display: flex; align-items: center; gap: 0.32rem; margin-bottom: 0.18rem; }
    .mv2-dot { width: 0.34rem; height: 0.34rem; border-radius: 999px; display: inline-block; opacity: 0.58; }
    .mv2-dot--owner { background: rgba(147,197,253,0.5); }
    .mv2-dot--crystal { background: rgba(34,197,94,0.52); }
    .mv2-graph-sum-compact { margin: 0.35rem 0; font-size: 0.92rem; line-height: 1.45; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.15rem 0.35rem; }
    .mv2-graph-sum-k { color: rgba(148,163,184,0.78); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.02em; }
    .mv2-graph-sum-arrow { color: #64748b; font-weight: 500; opacity: 0.85; }
    .mv2-graph-sum-v { color: #f0fdf4; font-weight: 800; font-size: 1.1rem; letter-spacing: 0.04em; text-shadow: 0 0 24px rgba(52,211,153,0.2), 0 1px 0 rgba(0,0,0,0.35); }
    .mv2-owner-id { margin: 0 0 0.45rem; font-size: 0.95rem; font-weight: 700; color: #a7f3d0; letter-spacing: 0.02em; }
    .mv2-owner-traits { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.84rem; color: var(--mv2-muted); }
    .mv2-owner-traits li { margin-bottom: 0.35rem; }
    .mv2-int-row { list-style: none; margin: 0; padding-left: 0; display: flex; flex-direction: column; gap: 0.2rem; }
    .mv2-int-kicker { display: inline-block; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #6ee7b7; margin-bottom: 0.05rem; }
    .mv2-int-body { font-size: 0.82rem; line-height: 1.45; color: rgba(215,213,208,0.95); }
    .mv2-int-list { list-style: none; padding: 0.35rem 0 0; margin: 0; display: flex; flex-direction: column; gap: 1.15rem; }
    .mv2-note { font-size: 0.72rem; color: #6b7280; margin-top: 0.6rem; }
    .mv2-para { margin: 0.4rem 0 0; font-size: 0.88rem; color: rgba(210,208,202,0.95); }
    .mv2-life-card { border-top: 1px solid var(--mv2-edge); padding: 0.75rem 0 0; margin-top: 0.75rem; }
    .mv2-life-card:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
    .mv2-life-head { display: flex; justify-content: space-between; font-weight: 600; font-size: 0.9rem; }
    .mv2-life-score { color: var(--mv2-green); font-variant-numeric: tabular-nums; }
    .mv2-life-blurb { margin-top: 0.35rem; }
    .mv2-trust { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--mv2-edge); text-align: center; font-size: 0.78rem; color: var(--mv2-muted); }
    .mv2-render-meta { margin: 0.5rem 0 0; font-size: 0.65rem; color: rgba(100,116,139,0.85); letter-spacing: 0.02em; }
  </style>
</head>
<body>
  <div class="mv2-wrap">
    <header class="mv2-hero">
      <div class="mv2-badge">Ener Scan · Moldavite · รายงานฉบับเต็ม</div>
      ${media}
      <h1 class="mv2-h1">${escapeHtml(h.subtypeLabel || "—")}</h1>
      ${h.tagline ? `<p class="mv2-tag">${escapeHtml(h.tagline)}</p>` : ""}
      <p class="mv2-main">พลังหลัก · ${escapeHtml(h.mainEnergyLabel)}</p>
      ${date ? `<p class="mv2-date">${escapeHtml(date)}</p>` : ""}
    </header>

    <div class="mv2-strip" role="group" aria-label="สรุปตัวเลข">
      <div><div class="mv2-strip-k">คะแนนพลัง</div><div class="mv2-strip-v">${escapeHtml(score)}<small> /10</small></div></div>
      <div><div class="mv2-strip-k">เข้ากัน</div><div class="mv2-strip-v">${escapeHtml(compat)}</div></div>
      <div class="mv2-strip-cell mv2-strip-cell--level"><div class="mv2-strip-k">ระดับ</div><div class="mv2-strip-v">${escapeHtml(vm.metrics.energyLevelLabel || "—")}</div></div>
    </div>

    ${radarBlock(vm)}

    <section class="mv2-card" aria-labelledby="mv2-gsum-h">
      <h2 id="mv2-gsum-h">สรุปจากกราฟ</h2>
      ${graphSummaryHtml}
    </section>

    <section class="mv2-card" aria-labelledby="mv2-owner-h">
      <h2 id="mv2-owner-h">โปรไฟล์เจ้าของ</h2>
      <p class="mv2-owner-id">${escapeHtml(vm.ownerProfile.identityLabel)}</p>
      <p class="mv2-para">${escapeHtml(vm.ownerProfile.summaryLine)}</p>
      <ul class="mv2-owner-traits">${traitsHtml}</ul>
      <p class="mv2-note">${escapeHtml(vm.ownerProfile.derivationNote)}</p>
    </section>

    <section class="mv2-card" aria-labelledby="mv2-int-h">
      <h2 id="mv2-int-h">${escapeHtml(vm.interactionSummary.headline)}</h2>
      <ul class="mv2-int-list">${interactionHtml}</ul>
    </section>

    ${meaningHtml ? `<section class="mv2-card" aria-labelledby="mv2-mean-h"><h2 id="mv2-mean-h">แรงโทนเปลี่ยนแปลง</h2>${meaningHtml}</section>` : ""}

    <section class="mv2-card" aria-labelledby="mv2-life-h">
      <h2 id="mv2-life-h">มิติชีวิตละเอียด</h2>
      <p class="mv2-note" style="margin-bottom:0.5rem">เรียงจากคะแนนสูงไปต่ำ</p>
      ${lifeRowsHtml}
    </section>

    <section class="mv2-card" aria-labelledby="mv2-use-h">
      <h2 id="mv2-use-h">การใช้และข้อควรระวัง</h2>
      <ul class="mv2-owner-traits">${usageHtml}</ul>
    </section>

    <footer class="mv2-trust">
      ${vm.trustNote ? `<p>${escapeHtml(vm.trustNote)}</p>` : ""}
      ${moldaviteHtmlShowRenderMetaLine() ? `<p class="mv2-render-meta">render ${escapeHtml(vm.rendererId)} · เวอร์ชัน ${escapeHtml(vm.reportVersion)}${vm.modelLabel ? ` · ${escapeHtml(vm.modelLabel)}` : ""}</p>` : ""}
    </footer>
  </div>
</body>
</html>`;
}

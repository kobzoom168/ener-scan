/**
 * Crystal bracelet lane HTML — standalone renderer (does not import Moldavite/amulet templates).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { formatBangkokDateTime } from "../../utils/dateTime.util.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
} from "../../crystalBracelet/crystalBraceletScores.util.js";

const DISCLAIMER_FIXED =
  "ผลนี้อ่านจากพลังรวมของกำไลทั้งเส้น ไม่ยืนยันชนิดหินรายเม็ด";

const CB_RADAR_W = 500;
const CB_RADAR_H = 500;
const CB_RADAR_CX = 250;
const CB_RADAR_CY = 250;
const CB_RADAR_R = 160;
/** ระยะวางป้ายชื่อแกนนอกวงเรดาร์ */
const CB_RADAR_LABEL_R = CB_RADAR_R + 36;
const RING_LEVELS = [20, 40, 60, 80, 100];
const CB_RADAR_ANGLES = CRYSTAL_BRACELET_AXIS_ORDER.map(
  (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / CRYSTAL_BRACELET_AXIS_ORDER.length,
);

/**
 * @param {Record<string, number>} axisScores
 */
function cbRadarPolygonPoints(axisScores) {
  return CB_RADAR_ANGLES.map((ang, i) => {
    const k = CRYSTAL_BRACELET_AXIS_ORDER[i];
    const v = Math.max(0, Math.min(100, Number(axisScores[k]) || 0)) / 100;
    const x = CB_RADAR_CX + CB_RADAR_R * v * Math.cos(ang);
    const y = CB_RADAR_CY + CB_RADAR_R * v * Math.sin(ang);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

/**
 * @param {Record<string, number>} axisScores
 * @param {string} axisKey
 */
function cbRadarVertexForAxis(axisScores, axisKey) {
  const i = CRYSTAL_BRACELET_AXIS_ORDER.indexOf(axisKey);
  if (i < 0) return { x: CB_RADAR_CX, y: CB_RADAR_CY };
  const ang = CB_RADAR_ANGLES[i];
  const v = Math.max(0, Math.min(100, Number(axisScores[axisKey]) || 0)) / 100;
  return {
    x: CB_RADAR_CX + CB_RADAR_R * v * Math.cos(ang),
    y: CB_RADAR_CY + CB_RADAR_R * v * Math.sin(ang),
  };
}

/**
 * ป้ายชื่อแกน + คะแนนใน SVG (วางนอกวงตาม LABEL_R)
 * @param {string} labelThai
 * @param {number} score
 * @param {boolean} isPeak
 * @param {number} i
 */
function cbRadarAxisLabelSvg(labelThai, score, isPeak, i) {
  const ang = CB_RADAR_ANGLES[i];
  const lx = (CB_RADAR_CX + CB_RADAR_LABEL_R * Math.cos(ang)).toFixed(1);
  const ly = (CB_RADAR_CY + CB_RADAR_LABEL_R * Math.sin(ang)).toFixed(1);
  const lxN = Number(lx);
  const anchor =
    lxN < CB_RADAR_CX - 10 ? "end" : lxN > CB_RADAR_CX + 10 ? "start" : "middle";
  const fill = isPeak ? "#0284c7" : "#0369a1";
  const fw = isPeak ? "700" : "400";
  const text = escapeHtml(`${labelThai} ${score}`);
  return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-size="13" fill="${fill}" font-weight="${fw}" font-family="system-ui,sans-serif">${text}</text>`;
}

/**
 * @param {Record<string, unknown>} axes
 * @param {string} primaryAxis
 */
function createCbRadarSection(axes, primaryAxis) {
  /** @type {Record<string, number>} */
  const axisScores = {};
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const e = axes[k];
    const sc =
      e && typeof e === "object" && e.score != null && Number.isFinite(Number(e.score))
        ? Math.max(0, Math.min(100, Math.round(Number(e.score))))
        : 0;
    axisScores[k] = sc;
  }

  const rings = RING_LEVELS.map((pct) => {
    const pts = CB_RADAR_ANGLES.map((ang) => {
      const v = pct / 100;
      return `${(CB_RADAR_CX + CB_RADAR_R * v * Math.cos(ang)).toFixed(1)},${(CB_RADAR_CY + CB_RADAR_R * v * Math.sin(ang)).toFixed(1)}`;
    }).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="rgba(14,165,233,0.22)" stroke-width="${pct === 100 ? 1.2 : 0.8}"/>`;
  }).join("");

  const ringLabels = RING_LEVELS.map((pct) => {
    const y = (CB_RADAR_CY - CB_RADAR_R * (pct / 100)).toFixed(1);
    return `<text x="${CB_RADAR_CX}" y="${y}" text-anchor="middle" font-size="11" fill="rgba(100,116,139,0.8)" font-family="system-ui,sans-serif" dy="-3">${pct}</text>`;
  }).join("");

  const polyPts = cbRadarPolygonPoints(axisScores);
  const spokes = CB_RADAR_ANGLES.map((ang) => {
    const x = CB_RADAR_CX + CB_RADAR_R * Math.cos(ang);
    const y = CB_RADAR_CY + CB_RADAR_R * Math.sin(ang);
    return `<line x1="${CB_RADAR_CX}" y1="${CB_RADAR_CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(14,165,233,0.2)" stroke-width="1"/>`;
  }).join("");

  const peak = cbRadarVertexForAxis(axisScores, primaryAxis);
  const peakX = peak.x.toFixed(1);
  const peakY = peak.y.toFixed(1);
  const peakMeta = axes[primaryAxis];
  const peakLabelThai =
    peakMeta && typeof peakMeta === "object"
      ? String(peakMeta.labelThai || "").trim()
      : "";
  const peakMarker = `<circle cx="${peakX}" cy="${peakY}" r="12" fill="rgba(14,165,233,0.2)" stroke="none" aria-hidden="true"/><circle class="cb2-radar-peak" cx="${peakX}" cy="${peakY}" r="6.5" fill="#0284c7" stroke="#ffffff" stroke-width="1.2" aria-hidden="true"><title>พลังเด่น: ${escapeHtml(peakLabelThai)}</title></circle>`;

  const axisLabelsSvg = CRYSTAL_BRACELET_AXIS_ORDER.map((k, i) => {
    const e = axes[k];
    const labelThai =
      e && typeof e === "object"
        ? String(e.labelThai || "").trim() || CRYSTAL_BRACELET_AXIS_LABEL_THAI[k] || k
        : CRYSTAL_BRACELET_AXIS_LABEL_THAI[k] || k;
    return cbRadarAxisLabelSvg(labelThai, axisScores[k], k === primaryAxis, i);
  }).join("");

  return `<section class="cb2-card cb2-graph-card" aria-labelledby="cb2-radar-h">
    <h2 id="cb2-radar-h">กราฟเจ็ดมิติพลังกำไล</h2>
    <div class="cb2-radar-wrap" role="img" aria-label="กราฟเจ็ดมิติพลังกำไล">
      <div class="cb2-radar-plot">
        <svg class="cb2-radar-svg cb2-radar-svg--animate" viewBox="0 0 ${CB_RADAR_W} ${CB_RADAR_H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" text-rendering="optimizeLegibility" style="width:100%;max-width:340px;display:block;margin:0 auto">
          ${rings}
          ${ringLabels}
          ${spokes}
          <g class="cb2-radar-layer cb2-radar-layer--bracelet">
            <polygon points="${polyPts}" fill="rgba(14,165,233,0.15)" stroke="#0ea5e9" stroke-width="2.2" stroke-linejoin="round"/>
          </g>
          <g class="cb2-radar-layer cb2-radar-layer--peak">${peakMarker}</g>
          <g class="cb2-radar-layer cb2-radar-layer--labels" aria-hidden="true">${axisLabelsSvg}</g>
        </svg>
      </div>
    </div>
  </section>`;
}

const GRAPH_SUMMARY_ROW_LABELS = ["พลังเด่น", "เข้ากับคุณที่สุด", "มุมที่ควรค่อยๆ ไป"];

/**
 * @param {unknown[]} graphSummaryRows
 */
function buildGraphSummaryRowsHtml(graphSummaryRows) {
  const lines = Array.isArray(graphSummaryRows)
    ? graphSummaryRows.map((t) => String(t || "").trim()).filter(Boolean)
    : [];
  if (!lines.length) return `<p class="cb2-para">—</p>`;
  const rowsHtml = lines
    .map((value, i) => {
      const label = GRAPH_SUMMARY_ROW_LABELS[i] ?? `สรุป ${i + 1}`;
      const lead = i === 0 ? " cb2-gsum-row--lead" : "";
      return `<div class="cb2-gsum-row${lead}"><span class="cb2-gsum-k">${escapeHtml(label)}</span><span class="cb2-gsum-v">${escapeHtml(value)}</span></div>`;
    })
    .join("");
  return `<div class="cb2-gsum-rows">${rowsHtml}</div>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 */
export function renderCrystalBraceletReportV2Html(payload) {
  const cb = payload?.crystalBraceletV1;
  if (!cb || typeof cb !== "object" || Array.isArray(cb)) {
    throw new Error("CRYSTAL_BRACELET_HTML_MISSING_PAYLOAD");
  }

  const fs = cb.flexSurface;
  const hr = cb.htmlReport;
  if (!hr || typeof hr !== "object") {
    throw new Error("CRYSTAL_BRACELET_HTML_MISSING_HTML_REPORT");
  }

  const headline = String(fs?.headline || "").trim() || "กำไลหินคริสตัล";
  const tagline = String(fs?.tagline || "").trim() || "กำไลหินคริสตัล · อ่านจากพลังรวม";
  const mainShort = String(fs?.mainEnergyShort || "").trim() || "พลังรวมของกำไล";

  const generatedAt = payload?.generatedAt ? formatBangkokDateTime(payload.generatedAt) : "";
  const score =
    payload?.summary?.energyScore != null &&
    Number.isFinite(Number(payload.summary.energyScore))
      ? String(payload.summary.energyScore)
      : "ไม่มี";
  const compat =
    payload?.summary?.compatibilityPercent != null &&
    Number.isFinite(Number(payload.summary.compatibilityPercent))
      ? `${Math.round(Number(payload.summary.compatibilityPercent))}%`
      : "ไม่มี";
  const levelLabel = String(payload?.summary?.energyLevelLabel || "").trim() || "ไม่มี";

  const imgRaw = String(payload?.object?.objectImageUrl || "").trim();
  const heroImg =
    /^https:\/\//i.test(imgRaw) ? `<div class="cb2-hero-img"><img src="${escapeHtml(imgRaw)}" alt="" loading="lazy" decoding="async"/></div>` : "";

  /** @type {{ label: string, score: number|null }[]} */
  const axisRows = [];
  const axes = cb.axes && typeof cb.axes === "object" ? cb.axes : {};
  const primaryAxis = CRYSTAL_BRACELET_AXIS_ORDER.reduce((best, k) => {
    const sc = typeof axes[k]?.score === "number" ? axes[k].score : -1;
    const bestSc = typeof axes[best]?.score === "number" ? axes[best].score : -1;
    return sc > bestSc ? k : best;
  }, CRYSTAL_BRACELET_AXIS_ORDER[0]);

  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const e = axes[k];
    const label =
      e && typeof e === "object" ? String(e.labelThai || "").trim() : "";
    const sc =
      e && typeof e === "object" && e.score != null && Number.isFinite(Number(e.score))
        ? Math.round(Number(e.score))
        : null;
    axisRows.push({ label: label || "—", score: sc });
  }
  axisRows.sort((a, b) => {
    if (a.score == null && b.score == null) return 0;
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score;
  });

  const axisBarsHtml = axisRows
    .map(({ label, score: sc }) => {
      const pct = sc == null ? 0 : Math.max(0, Math.min(100, sc));
      const w = `${pct}%`;
      return `<div class="cb2-axis-row">
  <span class="cb2-axis-l">${escapeHtml(label)}</span>
  <div class="cb2-axis-track" role="presentation"><span class="cb2-axis-fill" style="width:${w}"></span></div>
  <span class="cb2-axis-s">${sc == null ? "—" : escapeHtml(String(sc))}</span>
</div>`;
    })
    .join("");

  const graphSummaryHtml = buildGraphSummaryRowsHtml(hr.graphSummaryRows);

  const blurbs = hr.axisBlurbs && typeof hr.axisBlurbs === "object" ? hr.axisBlurbs : {};
  const blurbSections = CRYSTAL_BRACELET_AXIS_ORDER.map((k) => {
    const txt = String(blurbs[k] || "").trim();
    if (!txt) return "";
    const ax = axes[k];
    const title =
      ax && typeof ax === "object"
        ? String(ax.labelThai || "").trim()
        : k;
    return `<article class="cb2-life-card">
  <div class="cb2-life-head"><span class="cb2-life-title">${escapeHtml(title)}</span></div>
  <p class="cb2-life-blurb">${escapeHtml(txt)}</p>
</article>`;
  }).join("");

  const meaningParas = Array.isArray(hr.meaningParagraphs)
    ? hr.meaningParagraphs.map((p) => String(p || "").trim()).filter(Boolean)
    : [];
  const meaningHtml = meaningParas
    .map((p) => `<p class="cb2-para">${escapeHtml(p)}</p>`)
    .join("");

  const cautionLines = Array.isArray(hr.usageCautionLines)
    ? hr.usageCautionLines.map((p) => String(p || "").trim()).filter(Boolean)
    : [];
  const cautionHtml = cautionLines
    .map((p) => `<li class="cb2-caution-li">${escapeHtml(p)}</li>`)
    .join("");

  const radarSectionHtml = createCbRadarSection(axes, primaryAxis);

  console.log(
    JSON.stringify({
      event: "CRYSTAL_BRACELET_HTML_V2_RENDER",
      scanResultIdPrefix: String(cb.context?.scanResultIdPrefix || "").slice(0, 8),
      primaryAxis: String(cb.primaryAxis || ""),
    }),
  );

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(headline)} · Ener Scan</title>
  <style>
    :root {
      --cb2-bg: #ffffff;
      --cb2-card: #f8fafc;
      --cb2-muted: #64748b;
      --cb2-text: #0f172a;
      --cb2-accent: #0284c7;
      --cb2-accent2: #0ea5e9;
      --cb2-strip: #f1f5f9;
      --cb2-radar-bg: #f0f9ff;
      --cb2-radar-ring-outer-fill: rgba(14,165,233,0.05);
      --cb2-radar-ring-outer-stroke: rgba(14,165,233,0.4);
      --cb2-radar-ring-mid-stroke: rgba(14,165,233,0.22);
      --cb2-radar-ring-inner-stroke: rgba(14,165,233,0.14);
      --cb2-radar-spoke: rgba(14,165,233,0.2);
      --cb2-radar-fill: rgba(14,165,233,0.15);
      --cb2-radar-stroke: #0ea5e9;
      --cb2-radar-peak-fill: #0284c7;
      --cb2-radar-peak-stroke: #ffffff;
      --cb2-radar-peak-halo: rgba(14,165,233,0.2);
      --cb2-gsum-bg: #f1f5f9;
      --cb2-gsum-border: rgba(0, 0, 0, 0.08);
      --cb2-gsum-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
      --cb2-gsum-lead-bg: rgba(14, 165, 233, 0.08);
      --cb2-gsum-lead-border: rgba(14, 165, 233, 0.25);
      --cb2-gsum-k: #64748b;
      --cb2-gsum-v: #1e293b;
      --cb2-gsum-v-lead: #0284c7;
    }
    body { margin:0; font-family: system-ui, "Segoe UI", sans-serif; background: #ffffff; color: var(--cb2-text); }
    .cb2-wrap { max-width: 28rem; margin: 0 auto; padding: 1rem 1rem 2rem; }
    .cb2-badge { font-size: 0.65rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cb2-accent); margin-bottom: 0.5rem; }
    .cb2-hero-img {
      width: 100%;
      aspect-ratio: 4 / 3;
      border-radius: 14px;
      overflow: hidden;
      background: #e2e8f0;
    }
    .cb2-hero-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }
    .cb2-h1 { font-size: 1.35rem; font-weight: 700; margin: 0.75rem 0 0.25rem; line-height: 1.35; }
    .cb2-tag { font-size: 0.8rem; color: var(--cb2-muted); margin: 0 0 0.35rem; }
    .cb2-main { font-size: 0.95rem; font-weight: 600; color: var(--cb2-accent); margin: 0.25rem 0 0; }
    .cb2-date { font-size: 0.72rem; color: var(--cb2-muted); margin: 0.5rem 0 0; }
    .cb2-strip {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.5rem;
      margin: 1rem 0;
      padding: 0.75rem;
      border-radius: 12px;
      background: var(--cb2-strip);
      border: 1px solid rgba(0, 0, 0, 0.08);
    }
    .cb2-strip-k { font-size: 0.62rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
    .cb2-strip-v { font-size: 1.05rem; font-weight: 700; color: #0284c7; margin-top: 0.2rem; }
    .cb2-strip-v small { font-size: 0.65em; font-weight: 600; color: var(--cb2-muted); }
    .cb2-card { background: var(--cb2-card); border-radius: 16px; padding: 1rem 1.1rem; margin-top: 0.85rem; border: 1px solid rgba(0, 0, 0, 0.08); }
    .cb2-graph-card {
      border-left: 3px solid rgba(14, 165, 233, 0.55);
      padding: 1rem 0.95rem;
      background: linear-gradient(135deg, var(--cb2-card) 0%, var(--cb2-radar-bg) 100%);
    }
    .cb2-graph-card > h2 { font-size: 1.02rem; color: var(--cb2-accent); margin: 0 0 0.35rem; }
    .cb2-card h2 { font-size: 0.92rem; margin: 0 0 0.5rem; color: var(--cb2-accent); }
    .cb2-hint { font-size: 0.68rem; color: var(--cb2-muted); margin: 0 0 0.5rem; }
    .cb2-radar-wrap { max-width: 340px; margin: 0 auto; }
    .cb2-radar-plot {
      position: relative;
      container-type: inline-size;
      background: var(--cb2-radar-bg);
      border-radius: 12px;
      padding: 0.25rem;
    }
    .cb2-radar-svg { width: 100%; height: auto; display: block; overflow: visible; }
    .cb2-radar-svg--animate .cb2-radar-layer--bracelet {
      transform-box: view-box;
      transform-origin: 50% 50%;
      opacity: 0;
      transform: scale(0);
    }
    .cb2-radar-svg--animate .cb2-radar-layer--peak { opacity: 0; }
    @media (prefers-reduced-motion: no-preference) {
      .cb2-radar-svg--animate .cb2-radar-layer--bracelet {
        animation: cb2RdrPoly 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.25s forwards;
      }
      .cb2-radar-svg--animate .cb2-radar-layer--peak {
        animation: cb2RdrFade 0.55s ease-out 1.2s forwards;
      }
      .cb2-radar-peak {
        animation: cb2PeakPulse 2.2s ease-in-out 1.9s infinite;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .cb2-radar-svg--animate .cb2-radar-layer--bracelet,
      .cb2-radar-svg--animate .cb2-radar-layer--peak,
      .cb2-radar-peak {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    }
    @keyframes cb2RdrPoly {
      0% { opacity: 0; transform: scale(0); }
      45% { opacity: 0.75; transform: scale(1.06); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes cb2RdrFade {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes cb2PeakPulse {
      0%, 100% { opacity: 1; filter: drop-shadow(0 0 1.5px rgba(14, 165, 233, 0.35)); }
      50% { opacity: 0.62; filter: drop-shadow(0 0 5px rgba(14, 165, 233, 0.5)); }
    }
    .cb2-axis-row { display: flex; align-items: center; gap: 0.45rem; margin: 0.35rem 0; font-size: 0.78rem; }
    .cb2-axis-l { flex: 0 0 42%; color: var(--cb2-muted); line-height: 1.25; }
    .cb2-axis-track { flex: 1; height: 7px; background: #e2e8f0; border-radius: 6px; overflow: hidden; }
    .cb2-axis-fill { display: block; height: 100%; background: linear-gradient(90deg, var(--cb2-accent2), var(--cb2-accent)); border-radius: 6px; }
    .cb2-axis-s { flex: 0 0 2.2rem; text-align: right; font-weight: 700; color: var(--cb2-accent); font-variant-numeric: tabular-nums; }
    .cb2-gsum-rows { display: flex; flex-direction: column; gap: 0.5rem; }
    .cb2-gsum-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      background: var(--cb2-gsum-bg);
      border: 1px solid var(--cb2-gsum-border);
      box-shadow: var(--cb2-gsum-shadow);
    }
    .cb2-gsum-row:not(.cb2-gsum-row--lead) { padding: 0.42rem 1rem; }
    .cb2-gsum-row--lead { background: var(--cb2-gsum-lead-bg); border-color: var(--cb2-gsum-lead-border); }
    .cb2-gsum-k { font-size: 0.72rem; font-weight: 500; color: var(--cb2-gsum-k); white-space: nowrap; flex-shrink: 0; }
    .cb2-gsum-v {
      font-size: 0.92rem;
      font-weight: 800;
      color: var(--cb2-gsum-v);
      text-align: right;
      flex: 1;
      min-width: 0;
      line-height: 1.25;
    }
    .cb2-gsum-row--lead .cb2-gsum-v { color: var(--cb2-gsum-v-lead); }
    .cb2-life-card { border-top: 1px solid rgba(0,0,0,0.08); padding: 0.75rem 0 0; margin-top: 0.65rem; }
    .cb2-life-card:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
    .cb2-life-title { font-weight: 600; font-size: 0.86rem; color: #0f172a; }
    .cb2-life-blurb { margin: 0.35rem 0 0; font-size: 0.82rem; line-height: 1.5; color: #334155; }
    .cb2-para { margin: 0.45rem 0 0; font-size: 0.88rem; line-height: 1.55; color: #1e293b; }
    .cb2-caution { margin: 0.35rem 0 0; padding-left: 1.1rem; font-size: 0.82rem; color: #334155; }
    .cb2-caution-li { margin-bottom: 0.35rem; }
    .cb2-disclaimer { margin-top: 1rem; padding: 0.75rem; border-radius: 10px; background: rgba(14, 165, 233, 0.06); border: 1px solid rgba(14, 165, 233, 0.25); font-size: 0.78rem; line-height: 1.45; color: #0369a1; }
    .cb2-foot { margin-top: 1.25rem; text-align: center; font-size: 0.72rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="cb2-wrap">
    <header>
      <div class="cb2-badge">Ener Scan · กำไลหินคริสตัล · รายงานฉบับเต็ม</div>
      ${heroImg}
      <h1 class="cb2-h1">${escapeHtml(headline)}</h1>
      <p class="cb2-tag">${escapeHtml(tagline)}</p>
      <p class="cb2-main">พลังหลัก · ${escapeHtml(mainShort)}</p>
      ${generatedAt ? `<p class="cb2-date">${escapeHtml(generatedAt)}</p>` : ""}
    </header>

    <section class="cb2-strip" aria-label="คะแนนสรุป">
      <div><div class="cb2-strip-k">คะแนนพลัง</div><div class="cb2-strip-v">${escapeHtml(score)}<small> /10</small></div></div>
      <div><div class="cb2-strip-k">เข้ากัน</div><div class="cb2-strip-v">${escapeHtml(compat)}</div></div>
      <div><div class="cb2-strip-k">ระดับ</div><div class="cb2-strip-v">${escapeHtml(levelLabel)}</div></div>
    </section>

    ${radarSectionHtml}

    <section class="cb2-card" aria-labelledby="cb2-gsum-h">
      <h2 id="cb2-gsum-h">สรุปจากกราฟ</h2>
      ${graphSummaryHtml}
    </section>

    <section class="cb2-card" aria-labelledby="cb2-axes-h">
      <h2 id="cb2-axes-h">มิติพลังกำไล</h2>
      <p class="cb2-hint">เรียงจากคะแนนสูงไปต่ำ</p>
      ${axisBarsHtml}
    </section>

    <section class="cb2-card" aria-labelledby="cb2-life-h">
      <h2 id="cb2-life-h">มิติชีวิตละเอียด</h2>
      ${blurbSections || `<p class="cb2-para">—</p>`}
    </section>

    <section class="cb2-card" aria-labelledby="cb2-mean-h">
      <h2 id="cb2-mean-h">ความหมายโดยรวม</h2>
      ${meaningHtml || `<p class="cb2-para">—</p>`}
    </section>

    <section class="cb2-card" aria-labelledby="cb2-use-h">
      <h2 id="cb2-use-h">การใช้และข้อควรระวัง</h2>
      <ul class="cb2-caution">${cautionHtml || `<li class="cb2-caution-li">—</li>`}</ul>
    </section>

    <p class="cb2-disclaimer" role="note">${escapeHtml(DISCLAIMER_FIXED)}</p>

    <footer class="cb2-foot">
      <p>Ener Scan · กำไลหินคริสตัล</p>
    </footer>
  </div>
</body>
</html>`;
}

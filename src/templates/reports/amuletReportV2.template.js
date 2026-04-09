import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { formatBangkokDateTime } from "../../utils/dateTime.util.js";
import { buildAmuletHtmlV2ViewModel } from "../../amulet/amuletHtmlV2.model.js";

const AMULET_RADAR_R = 38;
const AMULET_RADAR_CX = 50;
const AMULET_RADAR_CY = 50;
const AMULET_AXIS_KEYS = /** @type {const} */ ([
  "protection",
  "metta",
  "baramee",
  "luck",
  "fortune_anchor",
  "specialty",
]);
const AMULET_RADAR_ANGLES = AMULET_AXIS_KEYS.map(
  (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / AMULET_AXIS_KEYS.length,
);
const AMULET_AXIS_LABEL_ALIAS = {
  protection: "คุ้มครอง",
  metta: "เมตตา",
  baramee: "บารมี",
  luck: "โชคลาภ",
  fortune_anchor: "หนุนดวง",
  specialty: "งานเฉพาะ",
};

/**
 * @param {Record<string, number>} values01to100
 */
function amuletRadarPolygonPoints(values01to100) {
  return AMULET_RADAR_ANGLES.map((ang, i) => {
    const k = AMULET_AXIS_KEYS[i];
    const v = Math.max(0, Math.min(100, Number(values01to100[k]) || 0)) / 100;
    const x = AMULET_RADAR_CX + AMULET_RADAR_R * v * Math.cos(ang);
    const y = AMULET_RADAR_CY + AMULET_RADAR_R * v * Math.sin(ang);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

/**
 * @param {Record<string, number>} values01to100
 * @param {string} axisKey
 */
function amuletRadarVertexForAxis(values01to100, axisKey) {
  const i = AMULET_AXIS_KEYS.indexOf(axisKey);
  if (i < 0) return { x: AMULET_RADAR_CX, y: AMULET_RADAR_CY };
  const ang = AMULET_RADAR_ANGLES[i];
  const v = Math.max(0, Math.min(100, Number(values01to100[axisKey]) || 0)) / 100;
  return {
    x: AMULET_RADAR_CX + AMULET_RADAR_R * v * Math.cos(ang),
    y: AMULET_RADAR_CY + AMULET_RADAR_R * v * Math.sin(ang),
  };
}

/**
 * @param {string} axisKey
 * @param {string} fallbackLabel
 */
function amuletRadarAxisAlias(axisKey, fallbackLabel) {
  return AMULET_AXIS_LABEL_ALIAS[axisKey] || fallbackLabel;
}

/**
 * @param {{ id: string, labelThai: string }} axis
 * @param {number} score
 * @param {boolean} isPeak
 * @param {boolean} isSecond
 */
function amuletRadarAxisLabelHtml(axis, score, isPeak, isSecond) {
  const rankCls = isPeak
    ? " mv2a-radar-lbl--top1"
    : isSecond
      ? " mv2a-radar-lbl--top2"
      : "";
  const alias = amuletRadarAxisAlias(axis.id, axis.labelThai);
  return `<span class="mv2a-radar-lbl mv2a-radar-lbl--${escapeHtml(axis.id)}${rankCls}"><span class="mv2a-radar-axis-t">${escapeHtml(alias)}</span> <span class="mv2a-radar-axis-n">${escapeHtml(String(score))}</span></span>`;
}

function amuletHtmlShowRenderMetaLine() {
  const raw = String(process.env.REPORT_HTML_RENDER_META ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * @param {ReturnType<typeof buildAmuletHtmlV2ViewModel>} vm
 */
function mainGraphBlock(vm) {
  const ownerPts = amuletRadarPolygonPoints(vm.power.owner);
  const objectPts = amuletRadarPolygonPoints(vm.power.object);
  const axisLabelsHtml = vm.power.axes
    .map((ax, i) => {
      const isPeak = vm.power.objectPeakKey === ax.id;
      const isSecond = vm.power.objectSecondKey === ax.id;
      const score = Math.round(Number(vm.power.object[ax.id]) || 0);
      return amuletRadarAxisLabelHtml(ax, score, isPeak, isSecond);
    })
    .join("");
  const peak = amuletRadarVertexForAxis(vm.power.object, vm.power.objectPeakKey);
  const peakX = peak.x.toFixed(2);
  const peakY = peak.y.toFixed(2);
  const peakMarker = `<circle cx="${peakX}" cy="${peakY}" r="2.6" fill="rgba(248,232,168,0.1)" stroke="none" aria-hidden="true"/><circle class="mv2a-radar-peak" cx="${peakX}" cy="${peakY}" r="1.4" fill="rgba(248,232,168,0.98)" stroke="rgba(255,252,240,0.5)" stroke-width="0.26" aria-hidden="true"><title>แกนเด่นสุดของพลังพระเครื่อง: ${escapeHtml(vm.power.objectPeakLabelThai || "")}</title></circle>`;

  return `<section class="mv2a-card mv2a-graph-card" aria-labelledby="mv2a-graph-h">
    <h2 id="mv2a-graph-h">กราฟหกมิติพลังพระเครื่อง</h2>
    <p class="mv2a-hint">ชั้น 1 = คุณ · ชั้น 2 = พลังพระเครื่อง</p>
    <div class="mv2a-radar-wrap" role="img" aria-label="กราฟหกมิติ เปรียบเทียบโปรไฟล์เจ้าของและพลังพระเครื่อง">
      <div class="mv2a-radar-plot">
        <svg class="mv2a-radar-svg mv2a-radar-svg--animate" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" text-rendering="optimizeLegibility">
          <polygon points="${amuletRadarPolygonPoints({ protection: 100, metta: 100, baramee: 100, luck: 100, fortune_anchor: 100, specialty: 100 })}" fill="rgba(255,255,255,0.02)" stroke="rgba(212,175,55,0.26)" stroke-width="0.28"/>
          <polygon points="${amuletRadarPolygonPoints({ protection: 66, metta: 66, baramee: 66, luck: 66, fortune_anchor: 66, specialty: 66 })}" fill="none" stroke="rgba(212,175,55,0.16)" stroke-width="0.22"/>
          <polygon points="${amuletRadarPolygonPoints({ protection: 33, metta: 33, baramee: 33, luck: 33, fortune_anchor: 33, specialty: 33 })}" fill="none" stroke="rgba(212,175,55,0.1)" stroke-width="0.2"/>
          ${AMULET_RADAR_ANGLES.map((ang) => {
            const x = AMULET_RADAR_CX + AMULET_RADAR_R * Math.cos(ang);
            const y = AMULET_RADAR_CY + AMULET_RADAR_R * Math.sin(ang);
            return `<line x1="${AMULET_RADAR_CX}" y1="${AMULET_RADAR_CY}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(212,175,55,0.12)" stroke-width="0.2"/>`;
          }).join("")}
          <g class="mv2a-radar-layer mv2a-radar-layer--owner">
            <polygon points="${ownerPts}" fill="rgba(143,126,95,0.12)" stroke="rgba(182,163,128,0.74)" stroke-width="0.44" stroke-linejoin="round"/>
          </g>
          <g class="mv2a-radar-layer mv2a-radar-layer--amulet">
            <polygon points="${objectPts}" fill="rgba(212,175,55,0.22)" stroke="rgba(232,197,71,0.96)" stroke-width="0.58" stroke-linejoin="round"/>
          </g>
          <g class="mv2a-radar-layer mv2a-radar-layer--peak">${peakMarker}</g>
        </svg>
        <div class="mv2a-radar-labels" aria-hidden="true">${axisLabelsHtml}</div>
      </div>
    </div>
    <div class="mv2a-radar-key" role="group" aria-label="เลเยอร์กราฟ">
      <span class="mv2a-radar-key-chip"><span class="mv2a-radar-dot mv2a-radar-dot--owner"></span>คุณ</span>
      <span class="mv2a-radar-key-chip"><span class="mv2a-radar-dot mv2a-radar-dot--amulet"></span>พลังพระเครื่อง</span>
    </div>
  </section>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 */
export function renderAmuletReportV2Html(payload) {
  const vm = buildAmuletHtmlV2ViewModel(payload);
  const h = vm.hero;
  const date = h.reportGeneratedAt
    ? formatBangkokDateTime(h.reportGeneratedAt)
    : "";
  const score =
    vm.metrics.energyScore != null && Number.isFinite(Number(vm.metrics.energyScore))
      ? String(vm.metrics.energyScore)
      : "ไม่มี";
  const compat =
    Number.isFinite(Number(vm.metrics.compatibilityPercent))
      ? `${Math.round(Number(vm.metrics.compatibilityPercent))}%`
      : "ไม่มี";

  const graphSummaryHtml = `<div class="mv2-gsum-rows">${vm.graphSummary.rows
    .map(
      (r, i) =>
        `<div class="mv2-gsum-row${i === 0 ? " mv2-gsum-row--lead" : ""}"><span class="mv2-gsum-k">${escapeHtml(r.label)}</span><span class="mv2-gsum-v">${escapeHtml(r.value)}</span></div>`,
    )
    .join("")}</div>`;

  const traitChipsHtml = vm.ownerProfile.traitScores
    .map((t) => `<span class="mv2-owner-chip">${escapeHtml(t.label)} ${t.score}/10</span>`)
    .join("");

  const interactionHtml = vm.interactionSummary.rows
    .map(
      (row) =>
        `<div class="mv2-int-row"><span class="mv2-int-kicker">${escapeHtml(row.kicker)}</span><span class="mv2-int-main">${escapeHtml(row.main)}</span><span class="mv2-int-sub">${escapeHtml(row.sub)}</span></div>`,
    )
    .join("");

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
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  const media = h.objectImageUrl
    ? `<div class="mv2a-media"><img src="${escapeHtml(h.objectImageUrl)}" alt="" loading="lazy" /></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(h.subtypeLabel || "พระเครื่อง")} · Ener Scan</title>
  <style>
    :root {
      --mv2a-gold: #d4af37;
      --mv2a-gold-dim: #a67c00;
      --mv2a-bg: #0c0a08;
      --mv2a-card: #141210;
      --mv2a-muted: #78716c;
      --mv2a-text: #f5f5f4;
    }
    body { margin: 0; background: var(--mv2a-bg); color: var(--mv2a-text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
    .mv2a-wrap { max-width: 520px; margin: 0 auto; padding: 1rem 1rem 2.5rem; }
    .mv2-hero { text-align: center; margin-bottom: 1rem; }
    .mv2a-badge { display: inline-block; font-size: 0.65rem; color: var(--mv2a-gold); border: 1px solid rgba(212,175,55,0.35); padding: 0.2rem 0.5rem; border-radius: 999px; margin-bottom: 0.5rem; }
    .mv2a-media img { max-width: 100%; border-radius: 12px; border: 1px solid rgba(212,175,55,0.2); }
    .mv2-h1 { font-size: 1.35rem; margin: 0.5rem 0; color: var(--mv2a-gold); }
    .mv2-main { font-size: 0.95rem; margin: 0.4rem 0 0; color: rgba(250,250,249,0.95); }
    .mv2-date { font-size: 0.72rem; color: var(--mv2a-muted); margin: 0.35rem 0 0; }
    .mv2-strip { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.42rem; margin: 0.85rem 0; text-align: center; }
    .mv2-strip-k { font-size: 0.65rem; color: var(--mv2a-muted); }
    .mv2-strip-v { font-size: 1.1rem; font-weight: 700; color: var(--mv2a-gold); }
    .mv2a-card, .mv2-card { background: var(--mv2a-card); border: 1px solid rgba(212,175,55,0.12); border-radius: 12px; padding: 0.85rem 1rem; margin: 0.75rem 0; }
    .mv2a-card h2, .mv2-card h2 { font-size: 0.95rem; margin: 0 0 0.5rem; color: var(--mv2a-gold-dim); font-weight: 600; }
    .mv2a-hint { font-size: 0.68rem; color: var(--mv2a-muted); margin: 0 0 0.6rem; }
    .mv2a-graph-card { border-left: 3px solid rgba(212,175,55,0.38); padding: 0.85rem 0.85rem; }
    .mv2a-graph-card > h2 { font-size: 1.02rem; color: var(--mv2a-gold); margin: 0 0 0.28rem; }
    .mv2a-graph-card > .mv2a-hint { margin: 0 0 0.35rem; }
    .mv2a-radar-wrap { max-width: 18rem; margin: 0 auto; }
    .mv2a-radar-plot { position: relative; container-type: inline-size; }
    .mv2a-radar-svg { width: 100%; height: auto; display: block; overflow: visible; }
    .mv2a-radar-svg--animate .mv2a-radar-layer--owner,
    .mv2a-radar-svg--animate .mv2a-radar-layer--amulet {
      transform-box: view-box;
      transform-origin: 50% 50%;
      opacity: 0;
      transform: scale(0);
    }
    .mv2a-radar-svg--animate .mv2a-radar-layer--peak { opacity: 0; }
    .mv2a-radar-labels {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    @media (prefers-reduced-motion: no-preference) {
      .mv2a-radar-svg--animate .mv2a-radar-layer--owner {
        animation: mv2aRdrPoly 1.55s cubic-bezier(0.22, 1, 0.36, 1) 0.2s forwards;
      }
      .mv2a-radar-svg--animate .mv2a-radar-layer--amulet {
        animation: mv2aRdrPoly 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.58s forwards;
      }
      .mv2a-radar-svg--animate .mv2a-radar-layer--peak {
        animation: mv2aRdrFade 0.6s ease-out 1.38s forwards;
      }
      .mv2a-radar-peak {
        animation: mv2aLblPulse 2.3s ease-in-out 2.1s infinite;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .mv2a-radar-svg--animate .mv2a-radar-layer,
      .mv2a-radar-peak {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    }
    @keyframes mv2aRdrPoly {
      0% { opacity: 0; transform: scale(0); }
      40% { opacity: 0.6; transform: scale(1.08); }
      70% { opacity: 0.9; transform: scale(0.97); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes mv2aRdrFade {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes mv2aLblPulse {
      0%, 100% { opacity: 1; filter: drop-shadow(0 0 1.5px rgba(248,232,168,0.2)); }
      50% { opacity: 0.6; filter: drop-shadow(0 0 5px rgba(248,232,168,0.45)); }
    }
    .mv2a-radar-lbl {
      position: absolute;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Thai", "Sarabun", sans-serif;
      font-size: clamp(10px, 4.2cqw, 12px);
      line-height: 1.18;
      letter-spacing: 0.01em;
    }
    .mv2a-radar-lbl--protection {
      top: 1.6%;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
    }
    .mv2a-radar-lbl--metta {
      top: 20%;
      right: -1%;
      text-align: right;
    }
    .mv2a-radar-lbl--baramee {
      top: 69%;
      right: 1%;
      text-align: right;
    }
    .mv2a-radar-lbl--luck {
      bottom: 1.6%;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
    }
    .mv2a-radar-lbl--fortune_anchor {
      top: 69%;
      left: 1%;
      text-align: left;
    }
    .mv2a-radar-lbl--specialty {
      top: 20%;
      left: -1%;
      text-align: left;
    }
    .mv2a-radar-axis-t { color: rgba(245,245,244,0.86); font-weight: 600; }
    .mv2a-radar-axis-n { color: rgba(238,223,170,0.92); font-weight: 700; }
    .mv2a-radar-lbl--top1 { font-size: clamp(11px, 4.65cqw, 13px); text-shadow: 0 0 10px rgba(248,232,168,0.22); }
    .mv2a-radar-lbl--top1 .mv2a-radar-axis-t { color: #f8e8a8; font-weight: 700; }
    .mv2a-radar-lbl--top1 .mv2a-radar-axis-n { color: #fff3c3; font-weight: 800; }
    .mv2a-radar-lbl--top2 { font-size: clamp(10.5px, 4.35cqw, 12.5px); }
    .mv2a-radar-lbl--top2 .mv2a-radar-axis-t { color: rgba(248,233,177,0.96); font-weight: 650; }
    .mv2a-radar-lbl--top2 .mv2a-radar-axis-n { color: rgba(255,240,190,0.96); }
    .mv2a-radar-key {
      margin: 0.38rem 0 0;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.55rem;
      font-size: 0.65rem;
      color: rgba(200,196,190,0.72);
    }
    .mv2a-radar-key-chip { display: inline-flex; align-items: center; gap: 0.3rem; }
    .mv2a-radar-dot {
      width: 0.44rem;
      height: 0.44rem;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.2);
      display: inline-block;
    }
    .mv2a-radar-dot--owner { background: rgba(203,213,225,0.85); }
    .mv2a-radar-dot--amulet { background: rgba(232,197,71,0.9); }
    .mv2-gsum-rows { display: flex; flex-direction: column; gap: 0.32rem; }
    .mv2-gsum-row { display: flex; align-items: baseline; gap: 0.45rem; padding: 0.28rem 0.5rem; border-radius: 8px; background: rgba(255,255,255,0.028); border: 1px solid rgba(212,175,55,0.1); }
    .mv2-gsum-row:not(.mv2-gsum-row--lead) { padding: 0.18rem 0.5rem; }
    .mv2-gsum-row--lead { background: rgba(212,175,55,0.08); border-color: rgba(212,175,55,0.2); }
    .mv2-gsum-k { font-size: 0.72rem; font-weight: 400; color: rgba(148,163,184,0.58); white-space: nowrap; }
    .mv2-gsum-v { font-size: 0.92rem; font-weight: 800; color: rgba(250,250,249,0.97); }
    .mv2-gsum-row--lead .mv2-gsum-v { color: #fde68a; }
    .mv2-card--owner > h2 { margin-bottom: 0.22rem; }
    .mv2-owner-zodiac { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.4rem; color: rgba(250,250,249,0.96); }
    .mv2-owner-chips { display: flex; flex-wrap: wrap; gap: 0.42rem 0.55rem; margin: 0 0 0.35rem; }
    .mv2-owner-chip { font-size: 0.72rem; padding: 0.2rem 0.45rem; border-radius: 999px; background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.22); color: rgba(254,243,199,0.9); }
    .mv2-owner-note { margin: 0; font-size: 0.62rem; color: rgba(148,163,184,0.42); }
    .mv2-int-rows { display: flex; flex-direction: column; gap: 0.42rem; padding: 0.15rem 0 0; }
    .mv2-int-row { display: flex; flex-direction: column; gap: 0.12rem; padding: 0.32rem 0.5rem; border-radius: 8px; background: rgba(255,255,255,0.028); border: 1px solid rgba(212,175,55,0.08); }
    .mv2-int-row + .mv2-int-row { padding: 0.22rem 0.5rem; }
    .mv2-int-kicker { font-size: 0.64rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(212,175,55,0.85); }
    .mv2-int-main { font-size: 0.88rem; font-weight: 700; line-height: 1.3; color: rgba(250,250,249,0.96); }
    .mv2-int-sub { font-size: 0.74rem; color: rgba(148,163,184,0.62); }
    .mv2-para { margin: 0.4rem 0 0; font-size: 0.88rem; color: rgba(210,208,202,0.95); }
    .mv2-life-card { border-top: 1px solid rgba(212,175,55,0.08); padding: 0.85rem 0 0; margin-top: 0.82rem; }
    .mv2-life-card:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
    .mv2-life-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.6rem; font-weight: 600; font-size: 0.9rem; }
    .mv2-life-score { color: #b8860b; font-weight: 600; font-size: 0.82rem; }
    .mv2-life-hint { margin: 0 0 0.55rem; font-size: 0.68rem; color: var(--mv2a-muted); opacity: 0.75; }
    .mv2-owner-traits { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.84rem; color: var(--mv2a-muted); }
    .mv2-trust { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); text-align: center; font-size: 0.78rem; color: var(--mv2a-muted); }
    .mv2-render-meta { margin: 0.5rem 0 0; font-size: 0.65rem; color: rgba(100,116,139,0.85); }
  </style>
</head>
<body>
  <div class="mv2a-wrap">
    <header class="mv2-hero">
      <div class="mv2a-badge">Ener Scan · พระเครื่อง · รายงานฉบับเต็ม</div>
      ${media}
      <h1 class="mv2-h1">${escapeHtml(h.subtypeLabel || "พระเครื่อง")}</h1>
      <p class="mv2-main">โทนหลัก · ${escapeHtml(h.mainEnergyLabel)}</p>
      ${date ? `<p class="mv2-date">${escapeHtml(date)}</p>` : ""}
    </header>

    <div class="mv2-strip" role="group" aria-label="สรุปตัวเลข">
      <div><div class="mv2-strip-k">คะแนนพลัง</div><div class="mv2-strip-v">${escapeHtml(score)}<small> /10</small></div></div>
      <div><div class="mv2-strip-k">เข้ากัน</div><div class="mv2-strip-v">${escapeHtml(compat)}</div></div>
      <div><div class="mv2-strip-k">ระดับ</div><div class="mv2-strip-v">${escapeHtml(vm.metrics.energyLevelLabel || "ไม่มี")}</div></div>
    </div>

    ${mainGraphBlock(vm)}

    <section class="mv2-card" aria-labelledby="mv2-gsum-h">
      <h2 id="mv2-gsum-h">สรุปจากกราฟ</h2>
      ${graphSummaryHtml}
    </section>

    <section class="mv2-card mv2-card--owner" aria-labelledby="mv2-owner-h">
      <h2 id="mv2-owner-h">โปรไฟล์เจ้าของ</h2>
      <p class="mv2-owner-zodiac">${escapeHtml(vm.ownerProfile.zodiacLabel)}</p>
      <div class="mv2-owner-chips">${traitChipsHtml}</div>
      <p class="mv2-owner-note">${escapeHtml(vm.ownerProfile.note)}</p>
    </section>

    <section class="mv2-card" aria-labelledby="mv2-int-h">
      <h2 id="mv2-int-h">${escapeHtml(vm.interactionSummary.headline)}</h2>
      <div class="mv2-int-rows">${interactionHtml}</div>
    </section>

    <section class="mv2-card mv2-card--life" aria-labelledby="mv2-life-h">
      <h2 id="mv2-life-h">มิติชีวิตละเอียด</h2>
      <p class="mv2-life-hint">ดูจากมิติที่เด่นที่สุดก่อน</p>
      ${lifeRowsHtml}
    </section>

    <section class="mv2-card" aria-labelledby="mv2-use-h">
      <h2 id="mv2-use-h">การใช้และข้อควรระวัง</h2>
      <ul class="mv2-owner-traits">${usageHtml}</ul>
    </section>

    <footer class="mv2-trust">
      ${vm.trustNote ? `<p>${escapeHtml(vm.trustNote)}</p>` : ""}
      ${amuletHtmlShowRenderMetaLine() ? `<p class="mv2-render-meta">render ${escapeHtml(vm.rendererId)} · เวอร์ชัน ${escapeHtml(vm.reportVersion)}${vm.modelLabel ? ` · ${escapeHtml(vm.modelLabel)}` : ""}</p>` : ""}
    </footer>
  </div>
</body>
</html>`;
}

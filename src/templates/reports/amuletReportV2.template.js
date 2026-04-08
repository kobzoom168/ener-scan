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
  const axisLabels = vm.power.axes
    .map((ax, i) => {
      const angle = AMULET_RADAR_ANGLES[i];
      const x = AMULET_RADAR_CX + (AMULET_RADAR_R + 8) * Math.cos(angle);
      const y = AMULET_RADAR_CY + (AMULET_RADAR_R + 8) * Math.sin(angle);
      return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" class="mv2a-radar-axis" text-anchor="middle" dominant-baseline="middle">${escapeHtml(ax.labelThai)}</text>`;
    })
    .join("");

  const axisRows = vm.power.axes.map((ax) => {
    const k = ax.id;
    const ownerV = Math.round(Number(vm.power.owner[k]) || 0);
    const objectV = Math.round(Number(vm.power.object[k]) || 0);
    return `<div class="mv2a-ax-row">
      <span class="mv2a-ax-l">${escapeHtml(ax.labelThai)}</span>
      <span class="mv2a-ax-v">เจ้าของ ${ownerV} · วัตถุ ${objectV}</span>
    </div>`;
  });

  return `<section class="mv2a-card mv2a-graph-card" aria-labelledby="mv2a-graph-h">
    <h2 id="mv2a-graph-h">Main Graph · หกมิติพลังพระเครื่อง</h2>
    <p class="mv2a-hint">Layer 1 = โปรไฟล์เจ้าของ · Layer 2 = พลังพระเครื่อง</p>
    <div class="mv2a-radar-wrap" role="img" aria-label="กราฟหกมิติ เปรียบเทียบโปรไฟล์เจ้าของและพลังพระเครื่อง">
      <svg class="mv2a-radar-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <polygon points="${amuletRadarPolygonPoints({ protection: 100, metta: 100, baramee: 100, luck: 100, fortune_anchor: 100, specialty: 100 })}" fill="rgba(255,255,255,0.02)" stroke="rgba(212,175,55,0.26)" stroke-width="0.28"/>
        <polygon points="${amuletRadarPolygonPoints({ protection: 66, metta: 66, baramee: 66, luck: 66, fortune_anchor: 66, specialty: 66 })}" fill="none" stroke="rgba(212,175,55,0.16)" stroke-width="0.22"/>
        <polygon points="${amuletRadarPolygonPoints({ protection: 33, metta: 33, baramee: 33, luck: 33, fortune_anchor: 33, specialty: 33 })}" fill="none" stroke="rgba(212,175,55,0.1)" stroke-width="0.2"/>
        ${AMULET_RADAR_ANGLES.map((ang) => {
          const x = AMULET_RADAR_CX + AMULET_RADAR_R * Math.cos(ang);
          const y = AMULET_RADAR_CY + AMULET_RADAR_R * Math.sin(ang);
          return `<line x1="${AMULET_RADAR_CX}" y1="${AMULET_RADAR_CY}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(212,175,55,0.12)" stroke-width="0.2"/>`;
        }).join("")}
        <polygon points="${ownerPts}" fill="rgba(148,163,184,0.18)" stroke="rgba(203,213,225,0.9)" stroke-width="0.45" stroke-linejoin="round"/>
        <polygon points="${objectPts}" fill="rgba(212,175,55,0.18)" stroke="rgba(232,197,71,0.92)" stroke-width="0.55" stroke-linejoin="round"/>
        ${axisLabels}
      </svg>
    </div>
    <div class="mv2a-radar-key" role="group" aria-label="เลเยอร์กราฟ">
      <span class="mv2a-radar-key-chip"><span class="mv2a-radar-dot mv2a-radar-dot--owner"></span>โปรไฟล์เจ้าของ</span>
      <span class="mv2a-radar-key-chip"><span class="mv2a-radar-dot mv2a-radar-dot--amulet"></span>พลังพระเครื่อง</span>
    </div>
    <div class="mv2a-ax-list">${axisRows.join("")}</div>
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
    .mv2-tag { color: var(--mv2a-muted); font-size: 0.8rem; margin: 0; }
    .mv2-main { font-size: 0.95rem; margin: 0.4rem 0 0; color: rgba(250,250,249,0.95); }
    .mv2-date { font-size: 0.72rem; color: var(--mv2a-muted); margin: 0.35rem 0 0; }
    .mv2-strip { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin: 1rem 0; }
    .mv2-strip-k { font-size: 0.65rem; color: var(--mv2a-muted); }
    .mv2-strip-v { font-size: 1.1rem; font-weight: 700; color: var(--mv2a-gold); }
    .mv2a-card, .mv2-card { background: var(--mv2a-card); border: 1px solid rgba(212,175,55,0.12); border-radius: 12px; padding: 0.85rem 1rem; margin: 0.75rem 0; }
    .mv2a-card h2, .mv2-card h2 { font-size: 0.95rem; margin: 0 0 0.5rem; color: var(--mv2a-gold-dim); font-weight: 600; }
    .mv2a-hint { font-size: 0.68rem; color: var(--mv2a-muted); margin: 0 0 0.6rem; }
    .mv2a-graph-card { border-left: 3px solid rgba(212,175,55,0.38); }
    .mv2a-radar-wrap { max-width: 19rem; margin: 0.3rem auto 0; }
    .mv2a-radar-svg { width: 100%; height: auto; display: block; overflow: visible; }
    .mv2a-radar-axis { font-size: 2.45px; fill: rgba(245,245,244,0.76); font-weight: 500; }
    .mv2a-radar-key {
      margin: 0.42rem 0 0;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.65rem;
      font-size: 0.72rem;
      color: rgba(231,229,228,0.88);
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
    .mv2a-ax-list {
      margin-top: 0.52rem;
      padding-top: 0.42rem;
      border-top: 1px solid rgba(212,175,55,0.12);
      display: grid;
      gap: 0.28rem;
    }
    .mv2a-ax-row {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.72rem;
      line-height: 1.35;
    }
    .mv2a-ax-l { color: rgba(245,245,244,0.95); }
    .mv2a-ax-v { color: rgba(168,162,158,0.92); font-variant-numeric: tabular-nums; white-space: nowrap; }
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
      ${h.tagline ? `<p class="mv2-tag">${escapeHtml(h.tagline)}</p>` : ""}
      <p class="mv2-main">พลังหลัก · ${escapeHtml(h.mainEnergyLabel)}</p>
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
      <p class="mv2-life-hint">เรียงจากคะแนนสูงไปต่ำ</p>
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

import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { formatBangkokDateTime } from "../../utils/dateTime.util.js";
import { buildMoldaviteHtmlV2ViewModel } from "../../moldavite/moldaviteHtmlV2.model.js";

const RADAR_R = 38;
const RADAR_CX = 50;
const RADAR_CY = 50;
/** Radians: top, bottom-right, bottom-left (งาน, ความสัมพันธ์, การเงิน) */
const RADAR_ANGLES = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI) / 3, -Math.PI / 2 + (4 * Math.PI) / 3];
const AXIS_KEYS = /** @type {const} */ (["work", "relationship", "money"]);

const AXIS_TITLE_TH = {
  work: "งาน",
  relationship: "ความสัมพันธ์",
  money: "การเงิน",
};

/** ต่างกันไม่เกินนี้ถือว่า "ใกล้เคียง" (คุณ vs หิน ต่อแกน) */
const RADAR_AXIS_COMPARE_EPS = 6;

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
 * อันดับแกนตามคะแนนโทนหิน (1 = สูงสุด) — ตรงกับ sort ใน moldaviteHtmlV2.model
 * @param {Record<string, number>} crystal
 */
function axisRankByCrystalStrength(crystal) {
  const sorted = [...AXIS_KEYS].sort((a, b) => {
    const db = (Number(crystal[b]) || 0) - (Number(crystal[a]) || 0);
    if (db !== 0) return db;
    return AXIS_KEYS.indexOf(a) - AXIS_KEYS.indexOf(b);
  });
  /** @type {Record<string, number>} */
  const rank = {};
  sorted.forEach((k, i) => {
    rank[k] = i + 1;
  });
  return rank;
}

/**
 * @param {number} rank 1 | 2 | 3
 */
function radarAxisFontSize(rank) {
  if (rank === 1) return "3.78";
  if (rank === 2) return "3.57";
  return "3.38";
}

/**
 * ลำดับความเด่นของแกน (โทนหิน): 1 = เด่นสุด
 * @param {number} rank
 */
function radarCategoryFill(rank) {
  if (rank === 1) return "#a7f3d0";
  if (rank === 2) return "rgba(226,232,240,0.93)";
  return "rgba(100,116,139,0.72)";
}

/**
 * @param {number} rank
 */
function radarNumberFill(rank) {
  if (rank === 1) return "#ecfdf5";
  if (rank === 2) return "rgba(241,245,249,0.97)";
  return "rgba(203,213,225,0.9)";
}

/**
 * ข้อความเทียบคุณกับหิน (แสดงนอก SVG เท่านั้น)
 * @param {number} owner01
 * @param {number} crystal01
 */
function radarAxisComparePhrase(owner01, crystal01) {
  const o = Math.round(Number(owner01) || 0);
  const c = Math.round(Number(crystal01) || 0);
  if (Math.abs(o - c) <= RADAR_AXIS_COMPARE_EPS) return "ใกล้เคียง";
  if (o > c) return "คุณสูงกว่า";
  return "หินสูงกว่า";
}

/**
 * ป้ายบนกราฟ: ชื่อแกน + คะแนนโทนหินเท่านั้น (รูปแบบเสถียร — ไม่ใส่สถานะเทียบใน SVG)
 * @param {{ key: string, anchorX: number, ay: number, ta: "middle"|"start"|"end", owner: number, crystal: number }} L
 * @param {number} rank
 */
function radarAxisLabelSvg(L, rank) {
  const fs = radarAxisFontSize(rank);
  const ax = L.anchorX;
  const y = L.ay;
  const title = AXIS_TITLE_TH[L.key];
  const scoreStr = String(Math.round(Number(L.crystal) || 0));
  const catFill = radarCategoryFill(rank);
  const numFill = radarNumberFill(rank);
  const titleFw = rank === 1 ? "600" : "500";
  const ta = L.ta;

  const titleStyle = `font-weight:${titleFw};color:${catFill}`;
  const numStyle = `font-weight:700;color:${numFill}`;

  // All axes: foreignObject + HTML. iOS Safari SVG <text>/<tspan> mis-shapes Thai (สระ, marks)
  // and mis-measures vs Latin digits; rem-only sizing also blew up one label vs SVG text.
  // Font size tracks chart width via container query (same idea as viewBox font-size units).
  const foH = 7.2;
  const foY = y - 5.95;

  let foW;
  let foX;
  /** @type {"mid"|"end"|"start"} */
  let align;
  if (ta === "middle") {
    foW = 28;
    foX = ax - foW / 2;
    align = "mid";
  } else if (ta === "end") {
    foW = 42;
    foX = ax - foW;
    align = "end";
  } else {
    foW = 48;
    foX = Math.max(2.5, ax - 1.2);
    align = "start";
  }

  const inner = `<div xmlns="http://www.w3.org/1999/xhtml" class="mv2-radar-axis-html mv2-radar-axis-html--${align}" style="--mv2-rfs:${fs}"><span class="mv2-radar-axis-t" style="${titleStyle}">${escapeHtml(title)}</span><span class="mv2-radar-axis-n" style="${numStyle}">${escapeHtml(scoreStr)}</span></div>`;
  return `<foreignObject class="mv2-radar-axis mv2-radar-axis-fo" x="${foX.toFixed(2)}" y="${foY.toFixed(2)}" width="${foW}" height="${foH}">${inner}</foreignObject>`;
}

/**
 * บล็อกเทียบคุณกับหิน (HTML ใต้กราฟ ไม่ใช่ใน SVG)
 * @param {{ owner: Record<string, number>, crystal: Record<string, number> }} g
 */
function radarCompareBlockHtml(g) {
  const rows = AXIS_KEYS.map((k) => {
    const label = AXIS_TITLE_TH[k];
    const phrase = radarAxisComparePhrase(
      Number(g.owner[k]) || 0,
      Number(g.crystal[k]) || 0,
    );
    return `<p class="mv2-radar-compare-line">${escapeHtml(label)}: ${escapeHtml(phrase)}</p>`;
  }).join("");
  return `<div class="mv2-radar-compare" role="group" aria-label="เทียบคุณกับโทนหินต่อแกน">${rows}</div>`;
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
  const px = peak.x.toFixed(2);
  const py = peak.y.toFixed(2);
  const crystalMarker = `<circle cx="${px}" cy="${py}" r="1.72" fill="rgba(74,222,128,0.11)" stroke="none" aria-hidden="true"/><circle class="mv2-radar-peak" cx="${px}" cy="${py}" r="1.28" fill="rgba(74,222,128,0.86)" stroke="rgba(255,255,255,0.26)" stroke-width="0.24" aria-hidden="true"><title>แรงเน้นสูงสุดของโทนหิน: ${escapeHtml(peakLabel)}</title></circle>`;

  const cw = Math.round(Number(g.crystal.work) || 0);
  const cr = Math.round(Number(g.crystal.relationship) || 0);
  const cm = Math.round(Number(g.crystal.money) || 0);
  const ow = Math.round(Number(g.owner.work) || 0);
  const or_ = Math.round(Number(g.owner.relationship) || 0);
  const om = Math.round(Number(g.owner.money) || 0);

  const rankOf = axisRankByCrystalStrength(g.crystal);

  /** Bottom-right = ความสัมพันธ์, bottom-left = การเงิน — ป้ายบนกราฟ: ชื่อแกน + คะแนนหินเท่านั้น */
  const labels = [
    {
      key: "work",
      anchorX: RADAR_CX,
      ay: 6.1,
      ta: /** @type {"middle"} */ ("middle"),
      owner: ow,
      crystal: cw,
    },
    {
      key: "relationship",
      anchorX: 92,
      ay: 75.5,
      ta: /** @type {"end"} */ ("end"),
      owner: or_,
      crystal: cr,
    },
    {
      key: "money",
      anchorX: 8,
      ay: 76.8,
      ta: /** @type {"start"} */ ("start"),
      owner: om,
      crystal: cm,
    },
  ];
  const labelSvg = labels
    .map((L) => {
      const rk = rankOf[L.key] ?? 2;
      return radarAxisLabelSvg(L, rk);
    })
    .join("");

  const radarHelperHtml = `<p class="mv2-radar-context">${escapeHtml(vm.radarSectionContext.compareHelperLine)}</p>`;

  return `
  <section class="mv2-radar-card" aria-labelledby="mv2-radar-h">
    <h2 class="mv2-radar-title" id="mv2-radar-h">ภาพรวมการจับคู่</h2>
    ${radarHelperHtml}
    <div class="mv2-radar-svg-wrap">
      <svg class="mv2-radar-svg mv2-radar-svg--animate" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="เรดาร์สามแกน เปรียบเทียบคุณกับโทนหิน" aria-describedby="mv2-radar-key" text-rendering="optimizeLegibility">
        <polygon points="${radarPolygonPoints({ work: 100, relationship: 100, money: 100 })}" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" stroke-width="0.4"/>
        <line x1="50" y1="50" x2="50" y2="12" stroke="rgba(255,255,255,0.08)" stroke-width="0.25"/>
        <line x1="50" y1="50" x2="83" y2="67" stroke="rgba(255,255,255,0.08)" stroke-width="0.25"/>
        <line x1="50" y1="50" x2="17" y2="67" stroke="rgba(255,255,255,0.08)" stroke-width="0.25"/>
        <g class="mv2-radar-layer mv2-radar-layer--owner">
          <polygon points="${ownerPts}" fill="rgba(96,165,250,0.155)" stroke="rgba(147,197,253,0.92)" stroke-width="0.78" stroke-linejoin="round"/>
        </g>
        <g class="mv2-radar-layer mv2-radar-layer--crystal">
          <polygon points="${crystalPts}" fill="rgba(22,163,74,0.175)" stroke="rgba(52,211,153,0.92)" stroke-width="0.88" stroke-linejoin="round"/>
        </g>
        <g class="mv2-radar-layer mv2-radar-layer--peak">${crystalMarker}</g>
        <g class="mv2-radar-layer mv2-radar-layer--labels">${labelSvg}</g>
      </svg>
      <div class="mv2-radar-key" id="mv2-radar-key" role="group" aria-label="คุณ สีฟ้า หิน สีเขียว">
        <span class="mv2-radar-key-chip"><span class="mv2-radar-key-dot mv2-radar-key-dot--owner" aria-hidden="true"></span><span class="mv2-radar-key-label">คุณ</span></span>
        <span class="mv2-radar-key-chip"><span class="mv2-radar-key-dot mv2-radar-key-dot--stone" aria-hidden="true"></span><span class="mv2-radar-key-label">หิน</span></span>
      </div>
      ${radarCompareBlockHtml(g)}
    </div>
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
      : "ไม่มี";
  const compat =
    vm.metrics.compatibilityPercent != null &&
    Number.isFinite(Number(vm.metrics.compatibilityPercent))
      ? `${Math.round(Number(vm.metrics.compatibilityPercent))}%`
      : "ไม่มี";

  const gs = vm.graphSummary;
  const highlightLine = String(gs.highlightLine || "").trim();
  const highlightHtml = highlightLine
    ? `<p class="mv2-graph-sum-highlight">${escapeHtml(highlightLine)}</p>`
    : "";
  const graphSummaryLinesHtml =
    Array.isArray(gs.lines) && gs.lines.length > 0
      ? `<div class="mv2-graph-sum-lines">${gs.lines
          .map(
            (line, i) =>
              `<p class="mv2-graph-sum-line${i === 0 ? " mv2-graph-sum-line--lead" : ""}">${escapeHtml(String(line))}</p>`,
          )
          .join("")}</div>`
      : "";
  const graphSummaryHtml = `${highlightHtml}${graphSummaryLinesHtml}`;

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
  <title>${title} | Ener Scan</title>
  <style>
    :root {
      --mv2-bg: #0a0c0f;
      --mv2-card: #111418;
      --mv2-edge: rgba(255,255,255,0.042);
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
    .mv2-date { font-size: 0.63rem; color: rgba(90,95,105,0.68); margin-top: 0.35rem; font-weight: 400; letter-spacing: 0.02em; opacity: 0.78; }
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
      margin-bottom: 1.08rem;
    }
    .mv2-card h2 { font-size: 0.95rem; margin: 0 0 0.5rem; color: var(--mv2-green-dim); font-weight: 600; }
    section.mv2-card:has(#mv2-mean-h) { margin-bottom: 1.42rem; }
    .mv2-card--life > h2 { margin: 0 0 0.72rem; }
    .mv2-life-hint { margin: 0 0 0.55rem; font-size: 0.68rem; line-height: 1.4; color: rgb(148, 163, 184); opacity: 0.47; font-weight: 400; }
    .mv2-radar-card { border-left: 3px solid rgba(34,197,94,0.55); }
    .mv2-radar-title { margin: 0 0 0.35rem; font-size: 1rem; color: var(--mv2-green-dim); }
    .mv2-radar-context { margin: 0 0 0.5rem; font-size: 0.8rem; line-height: 1.42; color: rgba(186, 230, 253, 0.88); font-weight: 500; letter-spacing: 0.01em; }
    .mv2-radar-svg-wrap {
      width: 100%;
      max-width: 17.5rem;
      margin: 0 auto;
      padding: 0.55rem 0.85rem 0.2rem;
      box-sizing: border-box;
      container-type: inline-size;
      container-name: mv2-radar;
    }
    .mv2-radar-svg { width: 100%; height: auto; display: block; overflow: visible; }
    .mv2-radar-svg--animate .mv2-radar-layer--owner,
    .mv2-radar-svg--animate .mv2-radar-layer--crystal {
      transform-box: view-box;
      transform-origin: 50% 50%;
      opacity: 1;
      transform: scale(1);
    }
    .mv2-radar-svg--animate .mv2-radar-layer--peak,
    .mv2-radar-svg--animate .mv2-radar-layer--labels {
      opacity: 1;
    }
    @media (prefers-reduced-motion: no-preference) {
      .mv2-radar-svg--animate .mv2-radar-layer--owner {
        animation: mv2RdrPoly 0.58s cubic-bezier(0.22, 1, 0.36, 1) 0.02s forwards;
      }
      .mv2-radar-svg--animate .mv2-radar-layer--crystal {
        animation: mv2RdrPoly 0.54s cubic-bezier(0.22, 1, 0.36, 1) 0.14s forwards;
      }
      .mv2-radar-svg--animate .mv2-radar-layer--peak {
        animation: mv2RdrFade 0.42s ease-out 0.28s forwards;
      }
      .mv2-radar-svg--animate .mv2-radar-layer--labels {
        animation: mv2RdrFade 0.44s ease-out 0.44s forwards;
      }
    }
    @keyframes mv2RdrPoly {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes mv2RdrFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .mv2-radar-svg--animate .mv2-radar-layer {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    }
    .mv2-radar-svg foreignObject.mv2-radar-axis-fo {
      overflow: visible;
    }
    .mv2-radar-svg foreignObject.mv2-radar-axis-fo .mv2-radar-axis-html {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      height: 100%;
      display: flex;
      align-items: baseline;
      flex-wrap: nowrap;
      gap: 0.35em;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Noto Sans Thai", "Sarabun", sans-serif;
      line-height: 1.12;
      letter-spacing: 0.01em;
      white-space: nowrap;
      font-size: clamp(7px, 2.35vmin, 10.5px);
      font-size: calc(var(--mv2-rfs, 3.57) * 1cqw);
    }
    .mv2-radar-svg foreignObject.mv2-radar-axis-fo .mv2-radar-axis-html--mid { justify-content: center; }
    .mv2-radar-svg foreignObject.mv2-radar-axis-fo .mv2-radar-axis-html--end { justify-content: flex-end; }
    .mv2-radar-svg foreignObject.mv2-radar-axis-fo .mv2-radar-axis-html--start { justify-content: flex-start; }
    .mv2-radar-svg .mv2-radar-peak {
      filter: drop-shadow(0 0 0.65px rgba(52, 211, 153, 0.3)) drop-shadow(0 0 1.5px rgba(34, 197, 94, 0.14));
    }
    .mv2-radar-key {
      margin: 0.28rem 0 0;
      padding: 0;
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      font-size: 0.8125rem;
      line-height: 1.2;
      letter-spacing: 0.02em;
      font-weight: 500;
      opacity: 0.85;
    }
    .mv2-radar-key-chip {
      display: inline-flex;
      flex-direction: row;
      align-items: center;
      gap: 0.32rem;
    }
    .mv2-radar-key-label {
      color: rgba(226, 232, 240, 0.95);
    }
    .mv2-radar-key-dot {
      width: 0.48rem;
      height: 0.48rem;
      border-radius: 50%;
      flex-shrink: 0;
      border: 1px solid rgba(255, 255, 255, 0.14);
    }
    .mv2-radar-key-dot--owner {
      background: radial-gradient(circle at 32% 28%, rgba(224,242,254,0.98), rgba(96, 165, 250, 0.9));
      box-shadow: 0 0 8px rgba(96, 165, 250, 0.32);
    }
    .mv2-radar-key-dot--stone {
      background: radial-gradient(circle at 32% 28%, rgba(220,252,231,0.96), rgba(34, 197, 94, 0.88));
      box-shadow: 0 0 8px rgba(34, 197, 94, 0.3);
    }
    .mv2-radar-compare {
      margin: 0.5rem 0 0;
      padding: 0.42rem 0.45rem 0.38rem;
      border-radius: 10px;
      background: rgba(255,255,255,0.028);
      border: 1px solid rgba(255,255,255,0.06);
    }
    .mv2-radar-compare-line {
      margin: 0;
      padding: 0.18rem 0;
      font-size: 0.76rem;
      line-height: 1.42;
      color: rgba(203, 213, 225, 0.92);
      font-weight: 400;
      letter-spacing: 0.01em;
    }
    .mv2-graph-sum-highlight {
      margin: 0.35rem 0 0.5rem;
      padding: 0.38rem 0.45rem;
      border-radius: 10px;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(52, 211, 153, 0.14);
      font-size: 0.84rem;
      font-weight: 600;
      color: rgba(209, 250, 229, 0.95);
      letter-spacing: 0.02em;
    }
    .mv2-graph-sum-lines { margin: 0; display: flex; flex-direction: column; gap: 0.36rem; }
    .mv2-graph-sum-line { margin: 0; font-size: 0.88rem; line-height: 1.38; color: rgba(215,213,208,0.96); font-weight: 400; }
    .mv2-graph-sum-line--lead { font-weight: 600; color: rgba(240,253,244,0.96); font-size: 0.9rem; }
    .mv2-owner-id { margin: 0 0 0.45rem; font-size: 0.95rem; font-weight: 700; color: #a7f3d0; letter-spacing: 0.02em; }
    .mv2-owner-traits { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.84rem; color: var(--mv2-muted); }
    .mv2-owner-traits li { margin-bottom: 0.35rem; }
    section[aria-labelledby="mv2-use-h"] .mv2-owner-traits li::marker {
      color: rgba(148,163,184,0.7);
      font-size: 0.81em;
    }
    .mv2-int-row { list-style: none; margin: 0; padding-left: 0; display: flex; flex-direction: column; gap: 0.2rem; }
    .mv2-int-kicker { display: inline-block; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #6ee7b7; margin-bottom: 0.05rem; }
    .mv2-int-body { font-size: 0.82rem; line-height: 1.45; color: rgba(215,213,208,0.95); }
    .mv2-int-list { list-style: none; padding: 0.35rem 0 0; margin: 0; display: flex; flex-direction: column; gap: 1.15rem; }
    .mv2-note { font-size: 0.72rem; color: #6b7280; margin-top: 0.6rem; }
    .mv2-para { margin: 0.4rem 0 0; font-size: 0.88rem; color: rgba(210,208,202,0.95); }
    .mv2-life-card { border-top: 1px solid rgba(255,255,255,0.032); padding: 0.85rem 0 0; margin-top: 0.82rem; }
    .mv2-life-card:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
    .mv2-life-head { display: flex; justify-content: space-between; font-weight: 600; font-size: 0.9rem; }
    .mv2-life-score { color: #15803d; font-weight: 500; opacity: 0.82; font-variant-numeric: tabular-nums; }
    .mv2-life-blurb { margin-top: 0.35rem; }
    .mv2-trust { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.038); text-align: center; font-size: 0.78rem; color: var(--mv2-muted); }
    .mv2-render-meta { margin: 0.5rem 0 0; font-size: 0.65rem; color: rgba(100,116,139,0.85); letter-spacing: 0.02em; }
  </style>
</head>
<body>
  <div class="mv2-wrap">
    <header class="mv2-hero">
      <div class="mv2-badge">Ener Scan · Moldavite · รายงานฉบับเต็ม</div>
      ${media}
      <h1 class="mv2-h1">${escapeHtml(h.subtypeLabel || "ไม่มีชื่อ")}</h1>
      ${h.tagline ? `<p class="mv2-tag">${escapeHtml(h.tagline)}</p>` : ""}
      <p class="mv2-main">พลังหลัก · ${escapeHtml(h.mainEnergyLabel)}</p>
      ${date ? `<p class="mv2-date">${escapeHtml(date)}</p>` : ""}
    </header>

    <div class="mv2-strip" role="group" aria-label="สรุปตัวเลข">
      <div><div class="mv2-strip-k">คะแนนพลัง</div><div class="mv2-strip-v">${escapeHtml(score)}<small> /10</small></div></div>
      <div><div class="mv2-strip-k">เข้ากัน</div><div class="mv2-strip-v">${escapeHtml(compat)}</div></div>
      <div class="mv2-strip-cell mv2-strip-cell--level"><div class="mv2-strip-k">ระดับ</div><div class="mv2-strip-v">${escapeHtml(vm.metrics.energyLevelLabel || "ไม่มี")}</div></div>
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
      ${moldaviteHtmlShowRenderMetaLine() ? `<p class="mv2-render-meta">render ${escapeHtml(vm.rendererId)} · เวอร์ชัน ${escapeHtml(vm.reportVersion)}${vm.modelLabel ? ` · ${escapeHtml(vm.modelLabel)}` : ""}</p>` : ""}
    </footer>
  </div>
</body>
</html>`;
}

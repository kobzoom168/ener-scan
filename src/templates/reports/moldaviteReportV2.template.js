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

/** Half-donut arc (opens upward); paired paths use pathLength=100 for stroke-dash */
const MV2_GAUGE_ARC_D = "M 12 44 A 36 36 0 0 0 84 44";

/** @type {Record<string, { fill: string, track: string }>} */
const MV2_GAUGE_STROKE = {
  boost: {
    fill: "rgba(52,211,153,0.97)",
    track: "rgba(52,211,153,0.14)",
  },
  caution: {
    fill: "rgba(251,191,36,0.97)",
    track: "rgba(251,191,36,0.16)",
  },
  tone: {
    fill: "rgba(45,212,191,0.97)",
    track: "rgba(45,212,191,0.16)",
  },
};

/**
 * @param {string} key
 * @returns {"boost"|"caution"|"tone"}
 */
function gaugeVariantFromKey(key) {
  const k = String(key || "").trim();
  if (k === "caution") return "caution";
  if (k === "tone") return "tone";
  return "boost";
}

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
  if (rank === 1) return "#fbbf24";
  if (rank === 2) return "rgba(226,232,240,0.93)";
  return "rgba(100,116,139,0.72)";
}

/**
 * @param {number} rank
 */
function radarNumberFill(rank) {
  if (rank === 1) return "#fde68a";
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
 * ป้ายบนกราฟ: ชื่อแกน + คะแนนหิน + ข้อความเทียบ (บรรทัดที่สอง)
 * Rendered as plain HTML (absolutely positioned over the SVG) so iOS Safari's
 * body text shaper handles Thai clusters correctly.
 * @param {{ key: string, owner: number, crystal: number }} L
 * @param {number} rank
 */
function radarAxisLabelHtml(L, rank) {
  const fs = radarAxisFontSize(rank);
  const title = AXIS_TITLE_TH[L.key];
  const scoreStr = String(Math.round(Number(L.crystal) || 0));
  const catFill = radarCategoryFill(rank);
  const numFill = radarNumberFill(rank);
  const titleFw = rank === 1 ? "600" : "500";
  const compare = radarAxisComparePhrase(L.owner, L.crystal);

  const titleStyle = `font-weight:${titleFw};color:${catFill}`;
  const numStyle = `font-weight:700;color:${numFill}`;

  const peakCls = rank === 1 ? " mv2-radar-lbl--peak" : "";
  return `<span class="mv2-radar-lbl mv2-radar-lbl--${L.key}${peakCls}" style="--mv2-rfs:${fs}"><span class="mv2-radar-axis-t" style="${titleStyle}">${escapeHtml(title)}</span> <span class="mv2-radar-axis-n" style="${numStyle}">${escapeHtml(scoreStr)}</span><br/><span class="mv2-radar-axis-cmp">${escapeHtml(compare)}</span></span>`;
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
  const labelHtml = labels
    .map((L) => {
      const rk = rankOf[L.key] ?? 2;
      return radarAxisLabelHtml(L, rk);
    })
    .join("");

  return `
  <section class="mv2-radar-card mv2-radar-card--feature" aria-labelledby="mv2-radar-h">
    <h2 class="mv2-radar-title" id="mv2-radar-h">กราฟโทนหิน</h2>
    <div class="mv2-radar-svg-wrap">
      <div class="mv2-radar-plot">
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
        </svg>
        <div class="mv2-radar-labels" aria-hidden="true">${labelHtml}</div>
      </div>
      <div class="mv2-radar-key" id="mv2-radar-key" role="group" aria-label="คุณ สีฟ้า หิน สีเขียว">
        <span class="mv2-radar-key-chip"><span class="mv2-radar-key-dot mv2-radar-key-dot--owner" aria-hidden="true"></span><span class="mv2-radar-key-label">คุณ</span></span>
        <span class="mv2-radar-key-chip"><span class="mv2-radar-key-dot mv2-radar-key-dot--stone" aria-hidden="true"></span><span class="mv2-radar-key-label">หิน</span></span>
      </div>
    </div>
  </section>`;
}

/**
 * @param {number} score0to100
 * @param {"boost"|"caution"|"tone"} variant
 */
function semiDonutGaugeSvg(score0to100, variant) {
  const s = Math.max(
    0,
    Math.min(100, Math.round(Number(score0to100) || 0)),
  );
  const off = 100 - s;
  const st = MV2_GAUGE_STROKE[variant] || MV2_GAUGE_STROKE.boost;
  return `<svg class="mv2-gauge-svg" viewBox="0 0 96 46" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path class="mv2-gauge-track" d="${MV2_GAUGE_ARC_D}" fill="none" stroke="${st.track}" stroke-width="6.5" stroke-linecap="round" pathLength="100" vector-effect="non-scaling-stroke"/>
  <path class="mv2-gauge-fill" d="${MV2_GAUGE_ARC_D}" fill="none" stroke="${st.fill}" stroke-width="6.5" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${off}" vector-effect="non-scaling-stroke"/>
</svg>`;
}

/**
 * @param {{ key: string, label: string, score: number, main: string, sub: string }} item
 */
function semiDonutGaugeCard(item) {
  const variant = gaugeVariantFromKey(item.key);
  const sub =
    item.sub && String(item.sub).trim()
      ? `<span class="mv2-gauge-sub">${escapeHtml(String(item.sub).trim())}</span>`
      : "";
  const scoreStr = escapeHtml(String(item.score));
  return `<div class="mv2-gauge-card mv2-gauge-card--${variant}" data-mv2-gauge="${escapeHtml(item.key)}" aria-label="${escapeHtml(item.label)} ${scoreStr}">
    <div class="mv2-gauge-chart">
      ${semiDonutGaugeSvg(item.score, variant)}
      <span class="mv2-gauge-score mv2-gauge-score--overlay">${scoreStr}</span>
    </div>
    <div class="mv2-gauge-meta">
      <span class="mv2-gauge-kicker">${escapeHtml(item.label)}</span>
      <span class="mv2-gauge-main">${escapeHtml(item.main)}</span>
      ${sub}
    </div>
  </div>`;
}

/**
 * @param {ReturnType<typeof buildMoldaviteHtmlV2ViewModel>} vm
 */
function interactionGaugeBlock(vm) {
  const gauges = vm.interactionGauges;
  if (!gauges || !gauges.length) return "";
  return `<div class="mv2-gauge-grid" role="group" aria-label="${escapeHtml(vm.interactionSummary.headline)}">${gauges.map(semiDonutGaugeCard).join("")}</div>`;
}

/**
 * @param {ReturnType<typeof buildMoldaviteHtmlV2ViewModel>} vm
 */
function lifeAreaBarsBlock(vm) {
  const rows =
    vm.lifeAreaBars && vm.lifeAreaBars.length
      ? vm.lifeAreaBars
      : vm.lifeAreaDetail.rows;
  const inner = rows
    .map(
      (r, i) => {
        const isLead = i === 0;
        const leadCls = isLead ? " mv2-bar-row--lead" : "";
        const fillCls = isLead ? " mv2-bar-fill--lead" : "";
        const w = Math.max(0, Math.min(100, Number(r.score) || 0));
        const badge = isLead
          ? `<span class="mv2-bar-badge">เด่นสุด</span>`
          : "";
        return `
    <div class="mv2-bar-row${leadCls}" data-mv2-life="${escapeHtml(r.key)}">
      <div class="mv2-bar-top">
        <span class="mv2-bar-label-wrap">${badge}<span class="mv2-bar-label">${escapeHtml(r.label)}</span></span>
        <span class="mv2-bar-score">${escapeHtml(String(r.score))}</span>
      </div>
      <div class="mv2-bar-track" aria-hidden="true"><div class="mv2-bar-fill${fillCls}" style="width:${w}%"></div></div>
      <p class="mv2-bar-blurb">${escapeHtml(r.blurb)}</p>
    </div>`;
      },
    )
    .join("");
  return `<div class="mv2-bars">${inner}</div>`;
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

  const graphSummaryHtml = `<div class="mv2-gsum-rows">${vm.graphSummary.rows
    .map(
      (r, i) =>
        `<div class="mv2-gsum-row${i === 0 ? " mv2-gsum-row--lead" : ""}"><span class="mv2-gsum-k">${escapeHtml(r.label)}</span><span class="mv2-gsum-v">${escapeHtml(r.value)}</span></div>`,
    )
    .join("")}</div>`;

  const traitChipsHtml = vm.ownerProfile.traitScores
    .map((t) => `<span class="mv2-owner-chip">${escapeHtml(t.label)} ${t.score}/10</span>`)
    .join("");

  const interactionGaugeHtml = interactionGaugeBlock(vm);
  const lifeBarsHtml = lifeAreaBarsBlock(vm);

  const usageHtml = vm.usageCaution.lines
    .map((u) => `<p class="mv2-usage-line">${escapeHtml(u)}</p>`)
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
    .mv2-wrap { max-width: 26.5rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
    .mv2-hero { margin-bottom: 1rem; }
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
      margin: 0.85rem 0 1.1rem;
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
      padding: 0.85rem 0.95rem;
      margin-bottom: 0.95rem;
    }
    .mv2-card h2 { font-size: 0.95rem; margin: 0 0 0.5rem; color: var(--mv2-green-dim); font-weight: 600; }
    .mv2-life-hint { font-size: 0.65rem; line-height: 1.35; color: rgb(148, 163, 184); opacity: 0.44; font-weight: 400; }
    .mv2-radar-card { border-left: 3px solid rgba(34,197,94,0.55); }
    .mv2-radar-card--feature {
      margin: 0 0 1.1rem;
      padding: 1.05rem 0.9rem 1rem;
      background: linear-gradient(168deg, rgba(16,185,129,0.09) 0%, rgba(15,23,42,0.62) 55%, rgba(10,12,15,0.92) 100%);
      border: 1px solid rgba(52,211,153,0.18);
      border-radius: 20px;
      border-left: 3px solid rgba(52,211,153,0.65);
      box-shadow: 0 12px 44px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04);
    }
    .mv2-radar-title { margin: 0 0 0.35rem; font-size: 1rem; color: var(--mv2-green-dim); }
    .mv2-radar-card--feature .mv2-radar-title {
      margin: 0 0 0.5rem;
      font-size: 1.06rem;
      font-weight: 600;
      text-align: center;
      letter-spacing: 0.03em;
    }
    .mv2-radar-svg-wrap {
      width: 100%;
      max-width: 17.5rem;
      margin: 0 auto;
      padding: 0.55rem 0.85rem 0.2rem;
      box-sizing: border-box;
    }
    .mv2-radar-card--feature .mv2-radar-svg-wrap {
      max-width: 19.35rem;
      padding: 0.65rem 0.9rem 0.28rem;
    }
    .mv2-radar-plot {
      position: relative;
      container-type: inline-size;
    }
    .mv2-radar-svg { width: 100%; height: auto; display: block; overflow: visible; }
    .mv2-radar-svg--animate .mv2-radar-layer--owner,
    .mv2-radar-svg--animate .mv2-radar-layer--crystal {
      transform-box: view-box;
      transform-origin: 50% 50%;
      opacity: 0;
      transform: scale(0);
    }
    .mv2-radar-svg--animate .mv2-radar-layer--peak { opacity: 0; }
    .mv2-radar-labels {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none;
      opacity: 0;
    }
    @media (prefers-reduced-motion: no-preference) {
      .mv2-radar-svg--animate .mv2-radar-layer--owner {
        animation: mv2RdrPoly 1.6s cubic-bezier(0.22, 1, 0.36, 1) 0.2s forwards;
      }
      .mv2-radar-svg--animate .mv2-radar-layer--crystal {
        animation: mv2RdrPoly 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.6s forwards;
      }
      .mv2-radar-svg--animate .mv2-radar-layer--peak {
        animation: mv2RdrFade 0.6s ease-out 1.5s forwards;
      }
      .mv2-radar-labels {
        animation: mv2RdrFade 0.6s ease-out 1.8s forwards;
      }
    }
    @keyframes mv2RdrPoly {
      0% { opacity: 0; transform: scale(0); }
      40% { opacity: 0.6; transform: scale(1.08); }
      70% { opacity: 0.9; transform: scale(0.97); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes mv2RdrFade {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes mv2LblPulse {
      0%, 100% { opacity: 1; text-shadow: 0 0 4px rgba(251,191,36,0.25); }
      50% { opacity: 0.45; text-shadow: 0 0 16px rgba(251,191,36,0.7); }
    }
    @media (prefers-reduced-motion: reduce) {
      .mv2-radar-svg--animate .mv2-radar-layer,
      .mv2-radar-labels {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
      .mv2-radar-lbl--peak { animation: none !important; }
    }
    .mv2-radar-lbl {
      position: absolute;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Noto Sans Thai", "Sarabun", sans-serif;
      font-size: calc(var(--mv2-rfs, 3.57) * 1cqw);
      line-height: 1.2;
      letter-spacing: 0.01em;
    }
    @supports not (font-size: 1cqw) {
      .mv2-radar-lbl { font-size: clamp(7px, 2.35vmin, 10.5px); }
    }
    .mv2-radar-lbl--work {
      top: 1.5%;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
    }
    .mv2-radar-lbl--relationship {
      top: 72%;
      right: 0;
      text-align: right;
    }
    .mv2-radar-lbl--money {
      top: 73%;
      left: 0;
      text-align: left;
    }
    .mv2-radar-lbl--peak {
      text-shadow: 0 0 8px rgba(251,191,36,0.35);
      animation: mv2LblPulse 1.2s ease-in-out 2.6s infinite;
    }
    .mv2-radar-axis-cmp {
      display: block;
      font-size: 0.82em;
      font-weight: 400;
      color: rgba(203, 213, 225, 0.78);
      margin-top: 0.08em;
      letter-spacing: 0.005em;
    }
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
    .mv2-gsum-rows {
      display: flex;
      flex-direction: column;
      gap: 0.32rem;
    }
    .mv2-gsum-row {
      display: flex;
      align-items: baseline;
      gap: 0.45rem;
      padding: 0.28rem 0.5rem;
      border-radius: 8px;
      background: rgba(255,255,255,0.028);
      border: 1px solid rgba(255,255,255,0.055);
    }
    .mv2-gsum-row:not(.mv2-gsum-row--lead) {
      padding: 0.18rem 0.5rem;
    }
    .mv2-gsum-row--lead {
      background: rgba(16,185,129,0.07);
      border-color: rgba(52,211,153,0.14);
    }
    .mv2-gsum-k {
      font-size: 0.72rem;
      font-weight: 400;
      color: rgba(148,163,184,0.58);
      white-space: nowrap;
    }
    .mv2-gsum-v {
      font-size: 0.92rem;
      font-weight: 800;
      color: rgba(236,240,246,0.97);
    }
    .mv2-gsum-row--lead .mv2-gsum-v {
      color: rgba(209,250,229,0.98);
    }
    .mv2-card--gsum { padding: 0.78rem 0.9rem; }
    .mv2-card--owner > h2 { margin-bottom: 0.22rem; }
    .mv2-owner-zodiac {
      margin: 0 0 0.42rem;
      font-size: 1.02rem;
      font-weight: 700;
      color: #e2e8f0;
      letter-spacing: 0.02em;
    }
    .mv2-owner-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.42rem 0.55rem;
      margin: 0 0 0.5rem;
    }
    .mv2-owner-chip {
      display: inline-block;
      padding: 0.22rem 0.55rem;
      border-radius: 1rem;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.1);
      font-size: 0.78rem;
      font-weight: 500;
      color: rgba(226,232,240,0.92);
      white-space: nowrap;
      letter-spacing: 0.01em;
    }
    .mv2-owner-note {
      margin: 0;
      font-size: 0.65rem;
      color: rgba(148,163,184,0.48);
      font-weight: 400;
    }
    .mv2-owner-traits { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.84rem; color: var(--mv2-muted); }
    .mv2-owner-traits li { margin-bottom: 0.35rem; }
    section[aria-labelledby="mv2-use-h"] .mv2-owner-traits li::marker {
      color: rgba(148,163,184,0.7);
      font-size: 0.81em;
    }
    .mv2-card--int {
      padding: 0.58rem 0.72rem 0.62rem;
      border-color: rgba(255,255,255,0.038);
    }
    .mv2-card--int > h2 { margin-bottom: 0.38rem; }
    .mv2-gauge-grid {
      display: flex;
      flex-direction: column;
      gap: 0.36rem;
      margin-top: 0.05rem;
    }
    .mv2-gauge-card {
      display: grid;
      grid-template-columns: minmax(6.75rem, 7.35rem) minmax(0, 1fr);
      gap: 0.38rem 0.5rem;
      align-items: center;
      padding: 0.3rem 0.38rem;
      border-radius: 11px;
      background: rgba(255,255,255,0.022);
      border: 1px solid rgba(255,255,255,0.055);
    }
    .mv2-gauge-card--boost {
      border-color: rgba(52,211,153,0.12);
      background: linear-gradient(135deg, rgba(52,211,153,0.06) 0%, rgba(255,255,255,0.02) 55%);
    }
    .mv2-gauge-card--caution {
      border-color: rgba(251,191,36,0.14);
      background: linear-gradient(135deg, rgba(251,191,36,0.06) 0%, rgba(255,255,255,0.02) 55%);
    }
    .mv2-gauge-card--tone {
      border-color: rgba(45,212,191,0.14);
      background: linear-gradient(135deg, rgba(45,212,191,0.06) 0%, rgba(255,255,255,0.02) 55%);
    }
    .mv2-gauge-chart {
      position: relative;
      width: 100%;
      max-width: 7.35rem;
      justify-self: start;
    }
    .mv2-gauge-svg {
      width: 100%;
      height: auto;
      display: block;
    }
    .mv2-gauge-card--boost .mv2-gauge-fill {
      filter: drop-shadow(0 0 5px rgba(52,211,153,0.42));
    }
    .mv2-gauge-card--caution .mv2-gauge-fill {
      filter: drop-shadow(0 0 5px rgba(251,191,36,0.38));
    }
    .mv2-gauge-card--tone .mv2-gauge-fill {
      filter: drop-shadow(0 0 5px rgba(45,212,191,0.4));
    }
    .mv2-gauge-score--overlay {
      position: absolute;
      left: 50%;
      bottom: 0.05rem;
      transform: translateX(-50%);
      font-size: 1.38rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      letter-spacing: -0.02em;
      text-shadow: 0 1px 12px rgba(0,0,0,0.55);
      pointer-events: none;
    }
    .mv2-gauge-card--boost .mv2-gauge-score--overlay { color: #a7f3d0; }
    .mv2-gauge-card--caution .mv2-gauge-score--overlay { color: #fde68a; }
    .mv2-gauge-card--tone .mv2-gauge-score--overlay { color: #99f6e4; }
    .mv2-gauge-meta {
      display: flex;
      flex-direction: column;
      gap: 0.06rem;
      min-width: 0;
      padding-top: 0.06rem;
    }
    .mv2-gauge-kicker {
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }
    .mv2-gauge-card--boost .mv2-gauge-kicker { color: rgba(110,231,183,0.88); }
    .mv2-gauge-card--caution .mv2-gauge-kicker { color: rgba(252,211,77,0.9); }
    .mv2-gauge-card--tone .mv2-gauge-kicker { color: rgba(94,234,212,0.9); }
    .mv2-gauge-main {
      font-size: 0.76rem;
      font-weight: 600;
      line-height: 1.22;
      color: rgba(226,232,240,0.88);
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .mv2-gauge-sub {
      font-size: 0.62rem;
      line-height: 1.25;
      color: rgba(100,116,139,0.72);
      margin-top: 0.06rem;
    }
    .mv2-card--life {
      padding: 0.62rem 0.78rem 0.68rem;
      border-color: rgba(255,255,255,0.038);
    }
    .mv2-card--life > h2 { margin-bottom: 0.28rem; }
    .mv2-life-hint { margin: 0 0 0.38rem; opacity: 0.42; }
    .mv2-bars {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin-top: 0.02rem;
    }
    .mv2-bar-row {
      padding: 0.28rem 0.4rem 0.32rem;
      border-radius: 11px;
      border: 1px solid rgba(255,255,255,0.04);
      background: rgba(255,255,255,0.015);
    }
    .mv2-bar-row--lead {
      border-color: rgba(52,211,153,0.12);
      background: linear-gradient(165deg, rgba(52,211,153,0.07) 0%, rgba(255,255,255,0.02) 100%);
      box-shadow: 0 0 0 1px rgba(52,211,153,0.06);
    }
    .mv2-bar-row:not(.mv2-bar-row--lead) {
      opacity: 0.94;
    }
    .mv2-bar-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.45rem;
    }
    .mv2-bar-label-wrap {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
    }
    .mv2-bar-badge {
      flex-shrink: 0;
      font-size: 0.52rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 0.12rem 0.38rem;
      border-radius: 999px;
      color: rgba(209,250,229,0.95);
      background: rgba(52,211,153,0.14);
      border: 1px solid rgba(52,211,153,0.22);
    }
    .mv2-bar-label {
      font-weight: 600;
      font-size: 0.84rem;
      color: rgba(241,245,249,0.94);
    }
    .mv2-bar-row--lead .mv2-bar-label {
      font-weight: 700;
      color: #f8fafc;
    }
    .mv2-bar-score {
      font-size: 0.95rem;
      font-weight: 800;
      color: #86efac;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
      text-shadow: 0 0 18px rgba(52,211,153,0.22);
    }
    .mv2-bar-row--lead .mv2-bar-score {
      font-size: 1.02rem;
      color: #bbf7d0;
    }
    .mv2-bar-track {
      margin-top: 0.38rem;
      height: 11px;
      border-radius: 999px;
      background: rgba(255,255,255,0.055);
      overflow: hidden;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.35);
    }
    .mv2-bar-row--lead .mv2-bar-track {
      height: 12px;
    }
    .mv2-bar-fill {
      height: 100%;
      border-radius: 999px;
      min-width: 0;
      background: linear-gradient(90deg, rgba(21,128,61,0.75) 0%, rgba(34,197,94,0.92) 45%, rgba(52,211,153,1) 100%);
      box-shadow: 0 0 10px rgba(52,211,153,0.35), 0 0 20px rgba(34,197,94,0.12);
      transition: width 0.5s ease-out;
    }
    .mv2-bar-fill--lead {
      background: linear-gradient(90deg, rgba(34,197,94,0.88) 0%, rgba(52,211,153,1) 55%, rgba(110,231,183,0.98) 100%);
      box-shadow: 0 0 14px rgba(52,211,153,0.45), 0 0 28px rgba(34,197,94,0.18);
    }
    .mv2-bar-blurb {
      margin: 0.22rem 0 0;
      font-size: 0.68rem;
      line-height: 1.28;
      color: rgba(100,116,139,0.78);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .mv2-note { font-size: 0.72rem; color: #6b7280; margin-top: 0.6rem; }
    .mv2-para { margin: 0.4rem 0 0; font-size: 0.88rem; color: rgba(210,208,202,0.95); }
    .mv2-usage-tight { margin: 0; }
    .mv2-usage-tight .mv2-usage-line {
      margin: 0 0 0.32rem;
      font-size: 0.76rem;
      line-height: 1.38;
      color: rgba(148,163,184,0.88);
    }
    .mv2-usage-tight .mv2-usage-line:last-child { margin-bottom: 0; }
    .mv2-card--usage { padding: 0.78rem 0.9rem; }
    .mv2-trust { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.038); text-align: center; font-size: 0.78rem; color: var(--mv2-muted); }
    .mv2-render-meta { margin: 0.5rem 0 0; font-size: 0.65rem; color: rgba(100,116,139,0.85); letter-spacing: 0.02em; }
  </style>
</head>
<body>
  <div class="mv2-wrap">
    <header class="mv2-hero">
      <div class="mv2-badge">Ener Scan · Moldavite</div>
      ${media}
      <h1 class="mv2-h1">${escapeHtml(h.subtypeLabel || "ไม่มีชื่อ")}</h1>
      ${h.tagline ? `<p class="mv2-tag">${escapeHtml(String(h.tagline).slice(0, 96))}</p>` : ""}
      <p class="mv2-main">พลังหลัก · ${escapeHtml(h.mainEnergyLabel)}</p>
      ${date ? `<p class="mv2-date">${escapeHtml(date)}</p>` : ""}
    </header>

    ${radarBlock(vm)}

    <div class="mv2-strip" role="group" aria-label="สรุปตัวเลข">
      <div><div class="mv2-strip-k">คะแนนพลัง</div><div class="mv2-strip-v">${escapeHtml(score)}<small> /10</small></div></div>
      <div><div class="mv2-strip-k">เข้ากัน</div><div class="mv2-strip-v">${escapeHtml(compat)}</div></div>
      <div class="mv2-strip-cell mv2-strip-cell--level"><div class="mv2-strip-k">ระดับ</div><div class="mv2-strip-v">${escapeHtml(vm.metrics.energyLevelLabel || "ไม่มี")}</div></div>
    </div>

    <section class="mv2-card mv2-card--gsum" aria-labelledby="mv2-gsum-h">
      <h2 id="mv2-gsum-h">สรุปกราฟ</h2>
      ${graphSummaryHtml}
    </section>

    <section class="mv2-card mv2-card--owner" aria-labelledby="mv2-owner-h">
      <h2 id="mv2-owner-h">คุณ</h2>
      <p class="mv2-owner-zodiac">${escapeHtml(vm.ownerProfile.zodiacLabel)}</p>
      <div class="mv2-owner-chips">${traitChipsHtml}</div>
      <p class="mv2-owner-note">${escapeHtml(vm.ownerProfile.note)}</p>
    </section>

    <section class="mv2-card mv2-card--int" aria-labelledby="mv2-int-h">
      <h2 id="mv2-int-h">${escapeHtml(vm.interactionSummary.headline)}</h2>
      ${interactionGaugeHtml}
    </section>

    <section class="mv2-card mv2-card--life" aria-labelledby="mv2-life-h">
      <h2 id="mv2-life-h">มิติชีวิต</h2>
      <p class="mv2-life-hint">สูง → ต่ำ</p>
      ${lifeBarsHtml}
    </section>

    <section class="mv2-card mv2-card--usage" aria-labelledby="mv2-use-h">
      <h2 id="mv2-use-h">หมายเหตุ</h2>
      <div class="mv2-usage-tight">${usageHtml}</div>
    </section>

    <footer class="mv2-trust">
      ${vm.trustNote ? `<p>${escapeHtml(vm.trustNote)}</p>` : ""}
      ${moldaviteHtmlShowRenderMetaLine() ? `<p class="mv2-render-meta">render ${escapeHtml(vm.rendererId)} · เวอร์ชัน ${escapeHtml(vm.reportVersion)}${vm.modelLabel ? ` · ${escapeHtml(vm.modelLabel)}` : ""}</p>` : ""}
    </footer>
  </div>
</body>
</html>`;
}

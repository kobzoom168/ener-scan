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
 * @param {string} graphSummaryHtml rows only (`.mv2-gsum-rows`); placed in right column of feature grid
 */
function radarBlock(vm, graphSummaryHtml) {
  const gSum = String(graphSummaryHtml || "").trim();
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
    <div class="mv2-radar-feature-grid">
      <div class="mv2-radar-feature-left">
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
      </div>
      <div class="mv2-radar-feature-right" aria-labelledby="mv2-gsum-h">
        <h3 class="mv2-radar-gsum-h" id="mv2-gsum-h">สรุปกราฟ</h3>
        ${gSum}
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

  const pillEnergy =
    vm.metrics.energyScore != null &&
    Number.isFinite(Number(vm.metrics.energyScore))
      ? `คะแนนพลัง ${Number(vm.metrics.energyScore).toFixed(1)}`
      : "คะแนนพลัง —";
  const pillCompatHero =
    vm.metrics.compatibilityPercent != null &&
    Number.isFinite(Number(vm.metrics.compatibilityPercent))
      ? `เข้ากันกับคุณ ${Math.round(Number(vm.metrics.compatibilityPercent))}%`
      : "เข้ากันกับคุณ —";

  const graphSummaryHtml = `<div class="mv2-gsum-rows">${vm.graphSummary.rows
    .map(
      (r, i) =>
        `<div class="mv2-gsum-row${i === 0 ? " mv2-gsum-row--lead" : ""}"><span class="mv2-gsum-k">${escapeHtml(r.label)}:</span><span class="mv2-gsum-v">${escapeHtml(r.value)}</span></div>`,
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
    .mv2-wrap { max-width: 26.5rem; margin: 0 auto; padding: 1.2rem 1rem 3rem; }
    .mv2-hero { margin-bottom: 0.68rem; }
    .mv2-badge {
      font-size: 0.58rem;
      font-weight: 500;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(100,116,139,0.55);
      margin-bottom: 0.4rem;
      opacity: 0.88;
    }
    .mv2-hero-card {
      background:
        linear-gradient(165deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 38%),
        linear-gradient(165deg, rgba(22,27,34,0.98) 0%, rgba(10,12,16,0.995) 100%);
      border: 1px solid rgba(52,211,153,0.09);
      border-radius: 20px;
      padding: 0.88rem 1rem;
      box-shadow:
        0 14px 44px rgba(0,0,0,0.2),
        0 4px 18px rgba(0,0,0,0.12),
        inset 0 1px 0 rgba(255,255,255,0.055);
    }
    .mv2-hero-grid {
      display: grid;
      grid-template-columns: 6.25rem 1fr;
      gap: 1rem;
      align-items: center;
    }
    .mv2-hero-copy { min-width: 0; }
    .mv2-hero-card .mv2-hero-media {
      margin-top: 0;
      border-radius: 15px;
      aspect-ratio: 1 / 1;
      overflow: hidden;
      background: linear-gradient(145deg, #1a222c 0%, #12161c 100%);
      box-shadow:
        inset 0 0 0 1px rgba(52,211,153,0.065),
        inset 0 0 20px rgba(0,0,0,0.22),
        0 3px 14px rgba(0,0,0,0.28);
    }
    .mv2-hero-media--empty { display:flex; align-items:center; justify-content:center; color: var(--mv2-muted); font-size: 0.72rem; text-align: center; padding: 0.25rem; }
    .mv2-hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .mv2-hero-copy .mv2-h1 {
      font-size: 1.62rem;
      font-weight: 800;
      margin: 0 0 0.16rem;
      line-height: 1.08;
      letter-spacing: -0.03em;
      color: #f8fafc;
    }
    .mv2-hero-copy .mv2-tag {
      color: rgba(110,231,183,0.98);
      font-size: 0.84rem;
      margin: 0 0 0.36rem;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .mv2-hero-copy .mv2-main {
      color: #6ee7b7;
      font-weight: 600;
      font-size: 0.82rem;
      margin: 0 0 0.4rem;
      border-left: 2px solid rgba(52,211,153,0.22);
      padding-left: 0.48rem;
      line-height: 1.3;
    }
    .mv2-hero-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.38rem;
      margin: 0 0 0.38rem;
    }
    .mv2-hero-pill {
      display: inline-block;
      font-size: 0.65rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      padding: 0.28rem 0.55rem;
      border-radius: 999px;
      color: rgba(248,250,252,0.98);
      background: rgba(6,78,59,0.38);
      border: 1px solid rgba(52,211,153,0.32);
      white-space: nowrap;
    }
    .mv2-hero-copy .mv2-date {
      font-size: 0.5rem;
      color: rgba(71,85,105,0.55);
      margin: 0;
      font-weight: 400;
      letter-spacing: 0.05em;
      opacity: 0.32;
    }
    .mv2-strip {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.35rem;
      margin: 0.22rem 0 0.62rem;
      text-align: center;
    }
    .mv2-strip > div {
      background: rgba(12,14,18,0.48);
      border: 1px solid rgba(255,255,255,0.028);
      border-radius: 15px;
      padding: 0.46rem 0.26rem 0.42rem;
    }
    .mv2-strip-k { font-size: 0.5rem; color: rgba(148,163,184,0.58); text-transform: uppercase; letter-spacing: 0.08em; }
    .mv2-strip-v { font-size: 1rem; font-weight: 800; color: rgba(167,243,208,0.92); margin-top: 0.1rem; letter-spacing: -0.02em; }
    .mv2-strip-v small { font-size: 0.68rem; font-weight: 500; color: rgba(148,163,184,0.58); }
    .mv2-strip-cell--level { opacity: 0.72; }
    .mv2-strip-cell--level .mv2-strip-k { font-size: 0.5rem; opacity: 0.55; letter-spacing: 0.07em; }
    .mv2-strip-cell--level .mv2-strip-v { font-size: 0.72rem !important; font-weight: 600; color: rgba(110,231,183,0.55); margin-top: 0.15rem; }
    .mv2-card {
      background: rgba(17,20,24,0.92);
      border: 1px solid rgba(255,255,255,0.045);
      border-radius: 15px;
      padding: 0.85rem 0.95rem;
      margin-bottom: 1.05rem;
    }
    .mv2-card h2 { font-size: 0.95rem; margin: 0 0 0.5rem; color: var(--mv2-green-dim); font-weight: 600; }
    .mv2-life-hint { font-size: 0.65rem; line-height: 1.35; color: rgb(148, 163, 184); opacity: 0.44; font-weight: 400; }
    .mv2-radar-card { border-left: 1px solid rgba(45,212,191,0.22); }
    .mv2-radar-card--feature {
      margin: 0 0 0.88rem;
      padding: 1.38rem 1.05rem 1.32rem;
      background:
        linear-gradient(180deg, rgba(16,185,129,0.1) 0%, rgba(16,185,129,0.03) 28%, transparent 52%),
        linear-gradient(175deg, rgba(17,26,36,0.72) 0%, rgba(10,14,20,0.88) 48%, rgba(6,8,12,0.98) 100%);
      border: 1px solid rgba(52,211,153,0.1);
      border-radius: 20px;
      border-left: 1px solid rgba(45,212,191,0.18);
      box-shadow:
        0 16px 48px rgba(0,0,0,0.26),
        inset 0 1px 0 rgba(255,255,255,0.06);
    }
    .mv2-radar-title { margin: 0 0 0.35rem; font-size: 1rem; color: var(--mv2-green-dim); }
    .mv2-radar-card--feature .mv2-radar-title {
      margin: 0 0 0.58rem;
      font-size: 1.14rem;
      font-weight: 800;
      text-align: center;
      letter-spacing: 0.035em;
      color: #6ee7b7;
      text-shadow: 0 0 28px rgba(52,211,153,0.18);
    }
    .mv2-radar-feature-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.92fr);
      gap: 0.5rem 0.58rem;
      align-items: start;
    }
    @media (max-width: 18.5rem) {
      .mv2-radar-feature-grid {
        grid-template-columns: 1fr;
        gap: 0.75rem;
      }
    }
    .mv2-radar-feature-left,
    .mv2-radar-feature-right {
      min-width: 0;
    }
    .mv2-radar-feature-right {
      padding: 0.02rem 0 0;
      border-radius: 14px;
      background: rgba(0,0,0,0.12);
      border: 1px solid rgba(255,255,255,0.04);
      padding: 0.42rem 0.48rem 0.48rem;
    }
    .mv2-radar-gsum-h {
      font-size: 0.86rem;
      margin: 0 0 0.32rem;
      color: rgba(134,239,172,0.88);
      font-weight: 600;
      letter-spacing: 0.02em;
      opacity: 0.92;
    }
    .mv2-radar-feature-right .mv2-gsum-rows {
      gap: 0.24rem;
    }
    .mv2-radar-svg-wrap {
      width: 100%;
      max-width: 17.5rem;
      margin: 0 auto;
      padding: 0.55rem 0.85rem 0.2rem;
      box-sizing: border-box;
    }
    .mv2-radar-card--feature .mv2-radar-svg-wrap {
      max-width: 21rem;
      padding: 0.82rem 1rem 0.58rem;
    }
    .mv2-radar-card--feature .mv2-radar-feature-left .mv2-radar-svg-wrap {
      margin-left: 0;
      margin-right: 0;
      max-width: 100%;
      padding: 0.72rem 0.4rem 0.52rem;
    }
    .mv2-radar-plot {
      position: relative;
      container-type: inline-size;
      filter: drop-shadow(0 8px 28px rgba(0,0,0,0.35));
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
      margin: 0.38rem 0 0;
      padding: 0;
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      font-size: 0.75rem;
      line-height: 1.2;
      letter-spacing: 0.02em;
      font-weight: 500;
      opacity: 0.48;
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
      gap: 0.28rem;
    }
    .mv2-gsum-row {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.32rem 0.45rem;
      padding: 0.34rem 0.52rem;
      border-radius: 12px;
      background: rgba(255,255,255,0.035);
      border: 1px solid rgba(255,255,255,0.075);
    }
    .mv2-gsum-row:not(.mv2-gsum-row--lead) {
      padding: 0.26rem 0.52rem;
    }
    .mv2-gsum-row--lead {
      background: rgba(16,185,129,0.11);
      border-color: rgba(52,211,153,0.26);
      box-shadow: 0 0 0 1px rgba(52,211,153,0.1), inset 0 1px 0 rgba(255,255,255,0.04);
    }
    .mv2-gsum-k {
      font-size: 0.66rem;
      font-weight: 500;
      color: rgba(148,163,184,0.58);
      white-space: nowrap;
    }
    .mv2-gsum-v {
      font-size: 1rem;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.015em;
    }
    .mv2-gsum-row--lead .mv2-gsum-v {
      color: #ecfdf5;
    }
    .mv2-radar-feature-right .mv2-gsum-row:not(.mv2-gsum-row--lead) {
      background: rgba(255,255,255,0.022);
      border-color: rgba(255,255,255,0.055);
      opacity: 0.94;
    }
    .mv2-radar-feature-right .mv2-gsum-row:not(.mv2-gsum-row--lead) .mv2-gsum-v {
      font-size: 0.94rem;
      font-weight: 700;
      color: rgba(226,232,240,0.94);
    }
    .mv2-card--owner {
      padding: 0.44rem 0.62rem 0.5rem;
      background: rgba(12,14,18,0.52);
      border-color: rgba(255,255,255,0.028);
      margin-bottom: 0.82rem;
    }
    .mv2-card--owner > h2 { margin-bottom: 0.12rem; font-size: 0.78rem; font-weight: 600; opacity: 0.78; }
    .mv2-owner-zodiac {
      margin: 0 0 0.22rem;
      font-size: 0.84rem;
      font-weight: 600;
      color: rgba(226,232,240,0.82);
      letter-spacing: 0.015em;
    }
    .mv2-owner-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.24rem 0.3rem;
      margin: 0 0 0.26rem;
    }
    .mv2-owner-chip {
      display: inline-block;
      padding: 0.1rem 0.32rem;
      border-radius: 999px;
      background: rgba(255,255,255,0.022);
      border: 1px solid rgba(255,255,255,0.04);
      font-size: 0.62rem;
      font-weight: 500;
      color: rgba(203,213,225,0.72);
      white-space: nowrap;
      letter-spacing: 0.01em;
    }
    .mv2-owner-note {
      margin: 0;
      font-size: 0.52rem;
      color: rgba(71,85,105,0.55);
      font-weight: 400;
      opacity: 0.55;
    }
    .mv2-owner-traits { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.84rem; color: var(--mv2-muted); }
    .mv2-owner-traits li { margin-bottom: 0.35rem; }
    section[aria-labelledby="mv2-use-h"] .mv2-owner-traits li::marker {
      color: rgba(148,163,184,0.7);
      font-size: 0.81em;
    }
    .mv2-card--int {
      padding: 0.54rem 0.68rem 0.62rem;
      border-color: rgba(255,255,255,0.04);
    }
    .mv2-card--int > h2 { margin-bottom: 0.36rem; font-size: 0.95rem; }
    .mv2-gauge-grid {
      display: flex;
      flex-direction: column;
      gap: 0.44rem;
      margin-top: 0.04rem;
    }
    .mv2-gauge-card {
      display: grid;
      grid-template-columns: 5.5rem minmax(0, 1fr);
      gap: 0.45rem 0.52rem;
      align-items: center;
      min-height: 4.35rem;
      padding: 0.3rem 0.38rem 0.32rem;
      border-radius: 12px;
      background: rgba(255,255,255,0.022);
      border: 1px solid rgba(255,255,255,0.065);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.035);
    }
    .mv2-gauge-card--boost {
      border-color: rgba(52,211,153,0.14);
      background: linear-gradient(142deg, rgba(52,211,153,0.07) 0%, rgba(255,255,255,0.018) 60%);
    }
    .mv2-gauge-card--caution {
      border-color: rgba(251,191,36,0.16);
      background: linear-gradient(142deg, rgba(251,191,36,0.07) 0%, rgba(255,255,255,0.018) 60%);
    }
    .mv2-gauge-card--tone {
      border-color: rgba(45,212,191,0.15);
      background: linear-gradient(142deg, rgba(45,212,191,0.07) 0%, rgba(255,255,255,0.018) 60%);
    }
    .mv2-gauge-card[data-mv2-gauge="boost"] .mv2-gauge-track { stroke: rgba(52,211,153,0.22) !important; }
    .mv2-gauge-card[data-mv2-gauge="boost"] .mv2-gauge-fill { stroke: rgba(52,211,153,0.98) !important; }
    .mv2-gauge-card[data-mv2-gauge="caution"] .mv2-gauge-track { stroke: rgba(251,191,36,0.24) !important; }
    .mv2-gauge-card[data-mv2-gauge="caution"] .mv2-gauge-fill { stroke: rgba(251,191,36,0.96) !important; }
    .mv2-gauge-card[data-mv2-gauge="tone"] .mv2-gauge-track { stroke: rgba(45,212,191,0.24) !important; }
    .mv2-gauge-card[data-mv2-gauge="tone"] .mv2-gauge-fill { stroke: rgba(45,212,191,0.97) !important; }
    .mv2-gauge-chart {
      position: relative;
      width: 100%;
      max-width: 5.55rem;
      justify-self: start;
    }
    .mv2-gauge-svg {
      width: 100%;
      max-width: 5.55rem;
      height: auto;
      display: block;
    }
    .mv2-gauge-card--boost .mv2-gauge-fill {
      filter: drop-shadow(0 0 6px rgba(52,211,153,0.48));
    }
    .mv2-gauge-card--caution .mv2-gauge-fill {
      filter: drop-shadow(0 0 6px rgba(251,191,36,0.42));
    }
    .mv2-gauge-card--tone .mv2-gauge-fill {
      filter: drop-shadow(0 0 6px rgba(45,212,191,0.45));
    }
    .mv2-gauge-score--overlay {
      position: absolute;
      left: 50%;
      bottom: 0.14rem;
      transform: translateX(-50%);
      font-size: 1.56rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      letter-spacing: -0.035em;
      text-shadow: 0 2px 16px rgba(0,0,0,0.7);
      pointer-events: none;
    }
    .mv2-gauge-card--boost .mv2-gauge-score--overlay { color: #a7f3d0; }
    .mv2-gauge-card--caution .mv2-gauge-score--overlay { color: #fde68a; }
    .mv2-gauge-card--tone .mv2-gauge-score--overlay { color: #99f6e4; }
    .mv2-gauge-meta {
      display: flex;
      flex-direction: column;
      gap: 0.04rem;
      min-width: 0;
      padding-top: 0;
    }
    .mv2-gauge-kicker {
      font-size: 0.5rem;
      font-weight: 700;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      opacity: 0.78;
    }
    .mv2-gauge-card--boost .mv2-gauge-kicker { color: rgba(110,231,183,0.82); }
    .mv2-gauge-card--caution .mv2-gauge-kicker { color: rgba(252,211,77,0.82); }
    .mv2-gauge-card--tone .mv2-gauge-kicker { color: rgba(94,234,212,0.82); }
    .mv2-gauge-main {
      font-size: 0.76rem;
      font-weight: 700;
      line-height: 1.2;
      color: rgba(241,245,249,0.94);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .mv2-gauge-sub {
      font-size: 0.54rem;
      line-height: 1.18;
      color: rgba(51,65,85,0.72);
      margin-top: 0.03rem;
      opacity: 0.85;
    }
    .mv2-card--life {
      padding: 0.54rem 0.72rem 0.62rem;
      border-color: rgba(255,255,255,0.038);
    }
    .mv2-card--life > h2 { margin-bottom: 0.2rem; }
    .mv2-life-hint { margin: 0 0 0.32rem; opacity: 0.36; }
    .mv2-bars {
      display: flex;
      flex-direction: column;
      gap: 0.48rem;
      margin-top: 0.02rem;
    }
    .mv2-bar-row {
      padding: 0.4rem 0.45rem 0.42rem;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.035);
      background: rgba(255,255,255,0.01);
    }
    .mv2-bar-row--lead {
      border-color: rgba(52,211,153,0.14);
      background: linear-gradient(168deg, rgba(52,211,153,0.06) 0%, rgba(255,255,255,0.015) 100%);
      box-shadow: 0 0 0 1px rgba(52,211,153,0.05);
    }
    .mv2-bar-row:not(.mv2-bar-row--lead) {
      opacity: 0.94;
    }
    .mv2-bar-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.55rem;
    }
    .mv2-bar-label-wrap {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
    }
    .mv2-bar-badge {
      flex-shrink: 0;
      font-size: 0.5rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.1rem 0.34rem;
      border-radius: 999px;
      color: rgba(209,250,229,0.92);
      background: rgba(52,211,153,0.12);
      border: 1px solid rgba(52,211,153,0.2);
    }
    .mv2-bar-label {
      font-weight: 600;
      font-size: 0.88rem;
      color: rgba(248,250,252,0.96);
      letter-spacing: 0.01em;
    }
    .mv2-bar-row--lead .mv2-bar-label {
      font-weight: 700;
      color: #fff;
    }
    .mv2-bar-score {
      font-size: 1.12rem;
      font-weight: 800;
      color: #4ade80;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.035em;
      text-shadow: 0 0 24px rgba(74,222,128,0.38);
    }
    .mv2-bar-row--lead .mv2-bar-score {
      font-size: 1.2rem;
      color: #86efac;
      text-shadow: 0 0 28px rgba(52,211,153,0.42);
    }
    .mv2-bar-track {
      margin-top: 0.42rem;
      height: 11px;
      border-radius: 999px;
      background: rgba(0,0,0,0.38);
      overflow: hidden;
      box-shadow: inset 0 1px 4px rgba(0,0,0,0.5);
    }
    .mv2-bar-row--lead .mv2-bar-track {
      height: 12px;
    }
    .mv2-bar-fill {
      height: 100%;
      border-radius: 999px;
      min-width: 0;
      background: linear-gradient(90deg, rgba(21,128,61,0.8) 0%, rgba(34,197,94,0.95) 42%, rgba(52,211,153,1) 100%);
      box-shadow: 0 0 8px rgba(52,211,153,0.28), 0 0 16px rgba(34,197,94,0.1);
      transition: width 0.5s ease-out;
    }
    .mv2-bar-fill--lead {
      background: linear-gradient(90deg, rgba(34,197,94,0.9) 0%, rgba(52,211,153,1) 50%, rgba(110,231,183,1) 100%);
      box-shadow: 0 0 12px rgba(52,211,153,0.38), 0 0 24px rgba(34,197,94,0.15);
    }
    .mv2-bar-blurb {
      margin: 0.18rem 0 0;
      font-size: 0.62rem;
      line-height: 1.25;
      color: rgba(51,65,85,0.62);
      opacity: 0.88;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .mv2-note { font-size: 0.72rem; color: #6b7280; margin-top: 0.6rem; }
    .mv2-para { margin: 0.4rem 0 0; font-size: 0.88rem; color: rgba(210,208,202,0.95); }
    .mv2-usage-tight { margin: 0; }
    .mv2-usage-tight .mv2-usage-line {
      margin: 0 0 0.22rem;
      font-size: 0.62rem;
      line-height: 1.28;
      color: rgba(71,85,105,0.75);
      opacity: 0.72;
    }
    .mv2-usage-tight .mv2-usage-line:last-child { margin-bottom: 0; }
    .mv2-card--usage {
      padding: 0.48rem 0.68rem 0.52rem;
      border-color: rgba(255,255,255,0.028);
      background: rgba(10,12,15,0.5);
      margin-bottom: 0.75rem;
    }
    .mv2-card--usage > h2 { font-size: 0.78rem; margin-bottom: 0.28rem; opacity: 0.65; font-weight: 600; }
    .mv2-trust { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.038); text-align: center; font-size: 0.78rem; color: var(--mv2-muted); }
    .mv2-render-meta { margin: 0.5rem 0 0; font-size: 0.65rem; color: rgba(100,116,139,0.85); letter-spacing: 0.02em; }
  </style>
</head>
<body>
  <div class="mv2-wrap">
    <header class="mv2-hero">
      <div class="mv2-badge">Ener Scan · Moldavite</div>
      <section class="mv2-hero-card">
        <div class="mv2-hero-grid">
          ${media}
          <div class="mv2-hero-copy">
            <h1 class="mv2-h1">${escapeHtml(h.subtypeLabel || "ไม่มีชื่อ")}</h1>
            ${h.tagline ? `<p class="mv2-tag">${escapeHtml(String(h.tagline).slice(0, 96))}</p>` : ""}
            <p class="mv2-main">พลังหลัก · ${escapeHtml(h.mainEnergyLabel)}</p>
            <div class="mv2-hero-pills">
              <span class="mv2-hero-pill">${escapeHtml(pillEnergy)}</span>
              <span class="mv2-hero-pill">${escapeHtml(pillCompatHero)}</span>
            </div>
            ${date ? `<p class="mv2-date">${escapeHtml(date)}</p>` : ""}
          </div>
        </div>
      </section>
    </header>

    ${radarBlock(vm, graphSummaryHtml)}

    <div class="mv2-strip" role="group" aria-label="สรุปตัวเลข">
      <div><div class="mv2-strip-k">คะแนนพลัง</div><div class="mv2-strip-v">${escapeHtml(score)}<small> /10</small></div></div>
      <div><div class="mv2-strip-k">เข้ากัน</div><div class="mv2-strip-v">${escapeHtml(compat)}</div></div>
      <div class="mv2-strip-cell mv2-strip-cell--level"><div class="mv2-strip-k">ระดับ</div><div class="mv2-strip-v">${escapeHtml(vm.metrics.energyLevelLabel || "ไม่มี")}</div></div>
    </div>

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

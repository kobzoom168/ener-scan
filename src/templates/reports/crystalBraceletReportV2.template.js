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

const CB_RING_CX = 160;
const CB_RING_CY = 160;
const CB_RING_VB = 320;
const RING_R_START = 140;
const RING_STEP = 16;
const CB_RING_STROKE = 11;

const CB_RING_COLORS = {
  protection: "#06b6d4",
  charm: "#f97316",
  aura: "#a855f7",
  opportunity: "#22c55e",
  work: "#ef4444",
  grounding: "#eab308",
  third_eye: "#3b82f6",
};

/**
 * @param {Record<string, unknown>} axes
 * @param {string} key
 */
function cbAxisLabelThai(axes, key) {
  const e = axes[key];
  if (e && typeof e === "object") {
    const t = String(e.labelThai || "").trim();
    if (t) return t;
  }
  return CRYSTAL_BRACELET_AXIS_LABEL_THAI[key] || key;
}

/**
 * Concentric ring chart — วงนอก = คะแนนสูงสุด (เรียงตามคะแนน DESC)
 * @param {Record<string, unknown>} axes
 */
function createCbRingsSection(axes) {
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

  const sorted = [...CRYSTAL_BRACELET_AXIS_ORDER].sort((a, b) => {
    const d = axisScores[b] - axisScores[a];
    if (d !== 0) return d;
    return CRYSTAL_BRACELET_AXIS_ORDER.indexOf(a) - CRYSTAL_BRACELET_AXIS_ORDER.indexOf(b);
  });

  const topKey = sorted[0];
  const primaryAxisLabel = escapeHtml(cbAxisLabelThai(axes, topKey));

  const circlesHtml = [];
  for (let i = 0; i < 7; i++) {
    const key = sorted[i];
    const r = RING_R_START - i * RING_STEP;
    const circumference = 2 * Math.PI * r;
    const score = axisScores[key];
    const fillLen = (score / 100) * circumference;
    const gapLen = Math.max(0, circumference - fillLen);
    const color = CB_RING_COLORS[key] || "#0284c7";
    circlesHtml.push(
      `<circle cx="${CB_RING_CX}" cy="${CB_RING_CY}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${CB_RING_STROKE}"/>`,
    );
    circlesHtml.push(
      `<circle cx="${CB_RING_CX}" cy="${CB_RING_CY}" r="${r}" fill="none" stroke="${color}" stroke-width="${CB_RING_STROKE}" stroke-linecap="round" stroke-dasharray="${fillLen.toFixed(2)} ${gapLen.toFixed(2)}" transform="rotate(-90 ${CB_RING_CX} ${CB_RING_CY})"/>`,
    );
  }

  const legendHtml = sorted
    .map((key) => {
      const color = CB_RING_COLORS[key] || "#0284c7";
      const lab = escapeHtml(cbAxisLabelThai(axes, key));
      const sc = axisScores[key];
      return `<div class="cb2-ring-leg-row">
  <span class="cb2-ring-dot" style="background:${color}" aria-hidden="true"></span>
  <span class="cb2-ring-leg-label">${lab}</span>
  <span class="cb2-ring-leg-score" style="color:${color}">${sc}%</span>
</div>`;
    })
    .join("");

  return `<section class="cb2-card cb2-rings-card" aria-labelledby="cb2-rings-h">
    <h2 id="cb2-rings-h">มิติพลังกำไล</h2>
    <div class="cb2-rings-wrap" role="img" aria-label="มิติพลังกำไล แผนภูมิวงแหวน">
      <svg class="cb2-rings-svg" viewBox="0 0 ${CB_RING_VB} ${CB_RING_VB}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" text-rendering="optimizeLegibility">
        ${circlesHtml.join("")}
        <text x="${CB_RING_CX}" y="154" text-anchor="middle" font-size="13" fill="#6e7681" font-family="system-ui,sans-serif">พลังหลัก</text>
        <text x="${CB_RING_CX}" y="174" text-anchor="middle" font-size="15" font-weight="700" fill="#f0f6fc" font-family="system-ui,sans-serif">${primaryAxisLabel}</text>
      </svg>
      <div class="cb2-rings-legend">${legendHtml}</div>
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

  /** @type {{ key: string, label: string, score: number|null }[]} */
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
    axisRows.push({ key: k, label: label || "—", score: sc });
  }
  axisRows.sort((a, b) => {
    if (a.score == null && b.score == null) return 0;
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score;
  });

  const axisBarsHtml = axisRows
    .map(({ key, label, score: sc }) => {
      const pct = sc == null ? 0 : Math.max(0, Math.min(100, sc));
      const w = `${pct}%`;
      const axisColor = CB_RING_COLORS[key] || "#0284c7";
      return `<div class="cb2-axis-row">
  <span class="cb2-axis-l">${escapeHtml(label)}</span>
  <div class="cb2-axis-track" role="presentation"><span class="cb2-axis-fill" style="width:${w};background:${axisColor}"></span></div>
  <span class="cb2-axis-s" style="color:${axisColor}">${sc == null ? "—" : escapeHtml(String(sc))}</span>
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

  const ringsSectionHtml = createCbRingsSection(axes);

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
      --cb2-bg: #0d1117;
      --cb2-card: #161b22;
      --cb2-card2: #1c2333;
      --cb2-border: rgba(255,255,255,0.08);
      --cb2-text: #f0f6fc;
      --cb2-sub: #8b949e;
      --cb2-muted: #6e7681;
      --cb2-accent: #38bdf8;
      --cb2-accent2: #7dd3fc;
      --cb2-card-shadow: 0 1px 6px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
      --cb2-gsum-bg: #1c2333;
      --cb2-gsum-border: rgba(255,255,255,0.07);
      --cb2-gsum-lead-bg: rgba(56,189,248,0.10);
      --cb2-gsum-lead-border: rgba(56,189,248,0.30);
      --cb2-gsum-k: #6e7681;
      --cb2-gsum-v: #c9d1d9;
      --cb2-gsum-v-lead: #38bdf8;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, "Segoe UI", sans-serif; background: var(--cb2-bg); color: var(--cb2-text); line-height: 1.5; -webkit-font-smoothing: antialiased; }
    .cb2-wrap { max-width: 28rem; margin: 0 auto; padding: 1.25rem 1rem 2.5rem; }

    /* ── Header ── */
    .cb2-badge { font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cb2-accent); margin-bottom: 0.6rem; font-weight: 600; }
    .cb2-header-row { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.25rem; }
    .cb2-header-text { flex: 1; min-width: 0; }
    .cb2-hero-img { width: 100%; aspect-ratio: 4/3; border-radius: 16px; overflow: hidden; background: #21262d; margin-bottom: 0.85rem; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
    .cb2-header-row .cb2-hero-img { width: 88px; height: 88px; aspect-ratio: 1 / 1; border-radius: 12px; flex-shrink: 0; margin-bottom: 0; }
    .cb2-hero-img img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
    .cb2-h1 { font-size: 1.4rem; font-weight: 800; margin: 0 0 0.2rem; line-height: 1.3; color: #f0f6fc; letter-spacing: -0.01em; }
    .cb2-tag { font-size: 0.78rem; color: var(--cb2-muted); margin: 0 0 0.3rem; }
    .cb2-main { font-size: 0.88rem; font-weight: 600; color: var(--cb2-accent); margin: 0.15rem 0 0; }
    .cb2-date { font-size: 0.7rem; color: var(--cb2-muted); margin: 0.45rem 0 0; }

    /* ── Score strip ── */
    .cb2-strip {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.5rem;
      margin: 1rem 0;
    }
    .cb2-strip > div {
      background: var(--cb2-card);
      border-radius: 12px;
      padding: 0.65rem 0.75rem;
      box-shadow: var(--cb2-card-shadow);
      border: 1px solid var(--cb2-border);
    }
    .cb2-strip-k { font-size: 0.6rem; color: var(--cb2-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    .cb2-strip-v { font-size: 1.1rem; font-weight: 800; color: #f0f6fc; margin-top: 0.25rem; line-height: 1; }
    .cb2-strip-v small { font-size: 0.6em; font-weight: 600; color: var(--cb2-sub); }

    /* ── Cards ── */
    .cb2-card { background: var(--cb2-card); border-radius: 16px; padding: 1.1rem 1.15rem; margin-top: 0.75rem; box-shadow: var(--cb2-card-shadow); border: 1px solid var(--cb2-border); }
    .cb2-card h2 {
      font-size: 0.88rem;
      font-weight: 700;
      margin: 0 0 0.8rem;
      color: #c9d1d9;
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .cb2-card h2::before { content: ""; display: block; width: 3px; height: 0.9em; background: var(--cb2-accent); border-radius: 2px; flex-shrink: 0; }
    .cb2-hint { font-size: 0.67rem; color: var(--cb2-muted); margin: -0.4rem 0 0.65rem 0.5rem; }

    /* ── Ring chart ── */
    .cb2-rings-card { }
    .cb2-rings-wrap { display: flex; align-items: center; gap: 1rem; }
    .cb2-rings-svg { width: 170px; flex-shrink: 0; height: auto; display: block; }
    .cb2-rings-legend { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; min-width: 0; }
    .cb2-ring-leg-row { display: flex; align-items: center; gap: 0.45rem; font-size: 0.78rem; }
    .cb2-ring-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    .cb2-ring-leg-label { flex: 1; color: var(--cb2-sub); min-width: 0; font-size: 0.76rem; }
    .cb2-ring-leg-score { font-weight: 700; font-variant-numeric: tabular-nums; font-size: 0.78rem; }

    /* ── Axis bars ── */
    .cb2-axis-row { display: flex; align-items: center; gap: 0.45rem; margin: 0.4rem 0; font-size: 0.78rem; }
    .cb2-axis-l { flex: 0 0 40%; color: var(--cb2-sub); line-height: 1.25; }
    .cb2-axis-track { flex: 1; height: 6px; background: rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden; }
    .cb2-axis-fill { display: block; height: 100%; border-radius: 6px; transition: width 0.3s; }
    .cb2-axis-s { flex: 0 0 2.2rem; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; font-size: 0.78rem; }

    /* ── Graph summary rows ── */
    .cb2-gsum-rows { display: flex; flex-direction: column; gap: 0.45rem; }
    .cb2-gsum-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.45rem 0.9rem;
      border-radius: 9999px;
      background: var(--cb2-gsum-bg);
      border: 1px solid var(--cb2-gsum-border);
    }
    .cb2-gsum-row--lead { background: var(--cb2-gsum-lead-bg); border-color: var(--cb2-gsum-lead-border); padding: 0.55rem 0.9rem; }
    .cb2-gsum-k { font-size: 0.7rem; font-weight: 500; color: var(--cb2-gsum-k); white-space: nowrap; flex-shrink: 0; }
    .cb2-gsum-v { font-size: 0.88rem; font-weight: 800; color: var(--cb2-gsum-v); text-align: right; flex: 1; min-width: 0; line-height: 1.25; }
    .cb2-gsum-row--lead .cb2-gsum-v { color: var(--cb2-gsum-v-lead); }

    /* ── Life area cards ── */
    .cb2-life-card { border-top: 1px solid rgba(255,255,255,0.06); padding: 0.8rem 0 0; margin-top: 0.7rem; }
    .cb2-life-card:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
    .cb2-life-head { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem; }
    .cb2-life-title { font-weight: 700; font-size: 0.84rem; color: var(--cb2-accent); }
    .cb2-life-blurb { margin: 0; font-size: 0.82rem; line-height: 1.6; color: var(--cb2-sub); }

    /* ── Misc text ── */
    .cb2-para { margin: 0.45rem 0 0; font-size: 0.85rem; line-height: 1.65; color: #c9d1d9; }
    .cb2-caution { margin: 0.25rem 0 0; padding-left: 1.1rem; font-size: 0.82rem; color: var(--cb2-sub); line-height: 1.6; }
    .cb2-caution-li { margin-bottom: 0.4rem; }
    .cb2-disclaimer { margin-top: 1.25rem; padding: 0.8rem 1rem; border-radius: 12px; background: rgba(56,189,248,0.07); border: 1px solid rgba(56,189,248,0.20); font-size: 0.76rem; line-height: 1.55; color: #7dd3fc; }

    /* ── Footer ── */
    .cb2-foot { margin-top: 1.75rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 0.7rem; color: var(--cb2-muted); letter-spacing: 0.04em; }
  </style>
</head>
<body>
  <div class="cb2-wrap">
    <header>
      <div class="cb2-badge">Ener Scan · กำไลหินคริสตัล · รายงานฉบับเต็ม</div>
      <div class="cb2-header-row">
        <div class="cb2-header-text">
          <h1 class="cb2-h1">${escapeHtml(headline)}</h1>
          <p class="cb2-tag">${escapeHtml(tagline)}</p>
          <p class="cb2-main">พลังหลัก · ${escapeHtml(mainShort)}</p>
          ${generatedAt ? `<p class="cb2-date">${escapeHtml(generatedAt)}</p>` : ""}
        </div>
        ${heroImg}
      </div>
    </header>

    <section class="cb2-strip" aria-label="คะแนนสรุป">
      <div><div class="cb2-strip-k">คะแนนพลัง</div><div class="cb2-strip-v">${escapeHtml(score)}<small> /10</small></div></div>
      <div><div class="cb2-strip-k">เข้ากัน</div><div class="cb2-strip-v">${escapeHtml(compat)}</div></div>
      <div><div class="cb2-strip-k">ระดับ</div><div class="cb2-strip-v">${escapeHtml(levelLabel)}</div></div>
    </section>

    ${ringsSectionHtml}

    <section class="cb2-card" aria-labelledby="cb2-gsum-h">
      <h2 id="cb2-gsum-h">สรุปจากกราฟ</h2>
      ${graphSummaryHtml}
    </section>

    <section class="cb2-card" aria-labelledby="cb2-axes-h">
      <h2 id="cb2-axes-h">คะแนนแต่ละมิติ</h2>
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

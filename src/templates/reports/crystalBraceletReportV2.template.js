/**
 * Crystal bracelet lane HTML — standalone renderer (does not import Moldavite/amulet templates).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { formatBangkokDateTime } from "../../utils/dateTime.util.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
  computeCrystalBraceletAlignmentAxisKey,
  computeCrystalBraceletOwnerAxisScoresV1,
} from "../../crystalBracelet/crystalBraceletScores.util.js";
import { buildCrystalBraceletRadarChartSvg } from "../../utils/reports/crystalBraceletRadarChart.util.js";

const DISCLAIMER_FIXED =
  "ผลนี้อ่านจากพลังรวมของกำไลทั้งเส้น ไม่ยืนยันชนิดหินรายเม็ด";

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
 * Deterministic mini-glyph (bracelet lane — not Moldavite assets).
 * @param {number} glyphSeed
 */
function buildCbOwnerGlyphSvg(glyphSeed) {
  const g = Number(glyphSeed) >>> 0;
  const cx = 16;
  const cy = 16;
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const ang = ((g + i * 97) % 360) * (Math.PI / 180);
    const rr = 6 + ((g >> (i * 4)) & 7);
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr;
    const rDot = 1.8 + ((g >> (i * 2)) & 3) * 0.35;
    const op = 0.35 + ((g >> (i * 3)) & 0xf) / 28;
    parts.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rDot.toFixed(2)}" fill="rgba(125,211,252,${op.toFixed(2)})"/>`,
    );
  }
  return `<svg class="cb2-owner-glyph" viewBox="0 0 32 32" width="44" height="44" aria-hidden="true">${parts.join("")}</svg>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportCrystalBraceletV1} cb
 */
function buildCrystalBraceletOwnerProfileHtml(cb) {
  const op = cb?.ownerProfile;
  if (!op || typeof op !== "object") return "";
  const chips = Array.isArray(op.ownerChips)
    ? op.ownerChips.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  const identity = String(op.identityPhrase || "").trim();
  const short = String(op.profileSummaryShort || "").trim();
  const note = String(op.derivationNote || "").trim();
  const glyph = buildCbOwnerGlyphSvg(op.glyphSeed ?? 0);

  const chipsHtml = chips
    .slice(0, 6)
    .map(
      (c) =>
        `<span class="cb2-owner-chip">${escapeHtml(c)}</span>`,
    )
    .join("");

  return `<section class="cb2-owner-card" aria-labelledby="cb2-owner-h">
  <h2 id="cb2-owner-h">โปรไฟล์เจ้าของ</h2>
  <div class="cb2-owner-inner">
    <div class="cb2-owner-glyph-wrap" aria-hidden="true">${glyph}</div>
    <div class="cb2-owner-body">
      ${identity ? `<p class="cb2-owner-id">${escapeHtml(identity)}</p>` : ""}
      ${chipsHtml ? `<div class="cb2-owner-chips">${chipsHtml}</div>` : ""}
      ${short ? `<p class="cb2-owner-sum">${escapeHtml(short)}</p>` : ""}
      ${note ? `<p class="cb2-owner-note">${escapeHtml(note)}</p>` : ""}
    </div>
  </div>
</section>`;
}

/**
 * Radar (spider) heptagon — พลังกำไล (เส้นทึบ) + จังหวะผู้สวม (เส้นประ)
 * @param {Record<string, unknown>} axes
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 */
function createCbRadarSection(axes, payload) {
  /** @type {Record<string, number>} */
  const stoneScores = {};
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const e = axes[k];
    const sc =
      e && typeof e === "object" && e.score != null && Number.isFinite(Number(e.score))
        ? Math.max(0, Math.min(100, Math.round(Number(e.score))))
        : 0;
    stoneScores[k] = sc;
  }
  const cb = payload?.crystalBraceletV1;
  const seedKey =
    String(payload?.reportId || payload?.scanId || "").trim() ||
    String(cb?.context?.scanResultIdPrefix || "cb");
  const sessionKey = String(
    payload?.scanId || payload?.reportId || cb?.context?.scanResultIdPrefix || "session",
  );
  const ownerFitFromCb =
    cb?.ownerFit &&
    typeof cb.ownerFit === "object" &&
    cb.ownerFit.score != null &&
    Number.isFinite(Number(cb.ownerFit.score))
      ? Number(cb.ownerFit.score)
      : null;
  const ownerFitFromSummary =
    payload?.summary?.compatibilityPercent != null &&
    Number.isFinite(Number(payload.summary.compatibilityPercent))
      ? Number(payload.summary.compatibilityPercent)
      : null;
  const ownerFit = ownerFitFromCb ?? ownerFitFromSummary;
  const ownerScores = computeCrystalBraceletOwnerAxisScoresV1(
    seedKey,
    sessionKey,
    stoneScores,
    ownerFit,
  );
  const radarSvg = buildCrystalBraceletRadarChartSvg(axes, ownerScores);
  return `<section class="cb2-card cb2-radar-card" aria-labelledby="cb2-radar-h">
    <h2 id="cb2-radar-h">มิติพลังกำไล</h2>
    <div role="img" aria-label="พลังกำไลและจังหวะผู้สวม แผนภูมิเรดาร์">
      ${radarSvg}
    </div>
    <p class="cb2-radar-key">เส้นทึบ = พลังกำไล · เส้นประ = จังหวะผู้สวม</p>
  </section>`;
}

/**
 * สรุปจากกราฟ — หลอดพลังตามค่าเดียวกับแกนบนเรดาร์ (พีค / เข้ากันสุด)
 * @param {Record<string, unknown>} axes
 * @param {string} primaryAxis
 * @param {string} alignAxisKey
 * @param {Record<string, number>} stoneScores
 */
function buildCrystalBraceletGraphSummaryBarsHtml(
  axes,
  primaryAxis,
  alignAxisKey,
  stoneScores,
) {
  const peakPct = Math.max(0, Math.min(100, stoneScores[primaryAxis] ?? 0));
  const alignPct = Math.max(0, Math.min(100, stoneScores[alignAxisKey] ?? 0));
  const peakName = cbAxisLabelThai(axes, primaryAxis);
  const alignName = cbAxisLabelThai(axes, alignAxisKey);
  const peakColor = CB_RING_COLORS[primaryAxis] || "#38bdf8";
  const alignColor = CB_RING_COLORS[alignAxisKey] || "#f97316";

  const row = (rowLabel, descText, pct, axisColor, leadClass) =>
    `<div class="cb2-gsum-bar-row${leadClass}">
  <span class="cb2-gsum-bar-k">${escapeHtml(rowLabel)}</span>
  <div class="cb2-gsum-bar-main">
    <p class="cb2-gsum-bar-desc" style="color:${axisColor}">${escapeHtml(descText)}</p>
    <div class="cb2-gsum-bar-line">
      <div class="cb2-gsum-bar-track" role="presentation"><span class="cb2-gsum-bar-fill" style="width:${pct}%;background:${axisColor}"></span></div>
      <span class="cb2-gsum-bar-num">${escapeHtml(String(pct))}</span>
    </div>
  </div>
</div>`;

  return `<div class="cb2-gsum-bars">
${row("พลังเด่น", `เด่นสุดที่ ${peakName}`, peakPct, peakColor, " cb2-gsum-bar-row--lead")}
${row("เข้ากับคุณที่สุด", `เข้ากันสุดที่ ${alignName}`, alignPct, alignColor, "")}
</div>`;
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

  const axes = cb.axes && typeof cb.axes === "object" ? cb.axes : {};

  /** คะแนนกำไลต่อแกน — ใช้ชุดเดียวกับเรดาร์ / พีค / alignment */
  /** @type {Record<string, number>} */
  const stoneScores = {};
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const e = axes[k];
    const sc =
      e && typeof e === "object" && e.score != null && Number.isFinite(Number(e.score))
        ? Math.max(0, Math.min(100, Math.round(Number(e.score))))
        : 0;
    stoneScores[k] = sc;
  }
  const primaryAxis = CRYSTAL_BRACELET_AXIS_ORDER.reduce(
    (best, k) => (stoneScores[k] > stoneScores[best] ? k : best),
    CRYSTAL_BRACELET_AXIS_ORDER[0],
  );
  const peakLabelThai = cbAxisLabelThai(axes, primaryAxis);

  const seedKey =
    String(payload?.reportId || payload?.scanId || "").trim() ||
    String(cb?.context?.scanResultIdPrefix || "cb");
  const sessionKey = String(
    payload?.scanId || payload?.reportId || cb?.context?.scanResultIdPrefix || "session",
  );
  const ownerFitFromCb =
    cb?.ownerFit &&
    typeof cb.ownerFit === "object" &&
    cb.ownerFit.score != null &&
    Number.isFinite(Number(cb.ownerFit.score))
      ? Number(cb.ownerFit.score)
      : null;
  const ownerFitFromSummary =
    payload?.summary?.compatibilityPercent != null &&
    Number.isFinite(Number(payload.summary.compatibilityPercent))
      ? Number(payload.summary.compatibilityPercent)
      : null;
  const ownerFitForGraph = ownerFitFromCb ?? ownerFitFromSummary;
  const ownerScoresForGraph = computeCrystalBraceletOwnerAxisScoresV1(
    seedKey,
    sessionKey,
    stoneScores,
    ownerFitForGraph,
  );
  const alignAxisKey = computeCrystalBraceletAlignmentAxisKey(
    stoneScores,
    ownerScoresForGraph,
  );

  const graphSummaryHtml = buildCrystalBraceletGraphSummaryBarsHtml(
    axes,
    primaryAxis,
    alignAxisKey,
    stoneScores,
  );

  const imgRaw = String(payload?.object?.objectImageUrl || "").trim();
  const heroImg =
    /^https:\/\//i.test(imgRaw)
      ? `<div class="cb2-hero-stack"><div class="cb2-hero-img"><img src="${escapeHtml(imgRaw)}" alt="" loading="lazy" decoding="async"/></div><span class="cb2-hero-cap">${escapeHtml(peakLabelThai)}</span></div>`
      : "";

  /** @type {{ key: string, label: string, score: number|null }[]} */
  const axisRows = [];
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const e = axes[k];
    const label =
      e && typeof e === "object" ? String(e.labelThai || "").trim() : "";
    const sc = stoneScores[k];
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

  const radarSectionHtml = createCbRadarSection(axes, payload);
  const ownerProfileHtml = buildCrystalBraceletOwnerProfileHtml(cb);

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
    .cb2-hero-stack { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; flex-shrink: 0; }
    .cb2-hero-cap { font-size: 0.65rem; font-weight: 700; color: rgba(255,255,255,0.92); letter-spacing: 0.02em; }
    .cb2-hero-img { width: 100%; aspect-ratio: 4/3; border-radius: 16px; overflow: hidden; background: #21262d; margin-bottom: 0.85rem; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
    .cb2-header-row .cb2-hero-img { width: 88px; height: 88px; aspect-ratio: 1 / 1; border-radius: 12px; flex-shrink: 0; margin-bottom: 0; }
    .cb2-hero-img img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
    .cb2-h1 { font-size: 1.4rem; font-weight: 800; margin: 0 0 0.2rem; line-height: 1.3; color: #f0f6fc; letter-spacing: -0.01em; }
    .cb2-tag { font-size: 0.78rem; color: var(--cb2-muted); margin: 0 0 0.3rem; }
    .cb2-main { font-size: 0.88rem; font-weight: 600; color: var(--cb2-accent); margin: 0.15rem 0 0; }
    .cb2-date { font-size: 0.7rem; color: var(--cb2-muted); margin: 0.45rem 0 0; }

    /* ── Owner profile (lane-local; not Moldavite) ── */
    .cb2-owner-card {
      margin-top: 0.75rem;
      padding: 0.75rem 0 0.75rem 0.95rem;
      border-left: 3px solid rgba(125, 211, 252, 0.55);
    }
    .cb2-owner-card h2 { font-size: 0.88rem; font-weight: 700; margin: 0 0 0.55rem; color: #c9d1d9; }
    .cb2-owner-inner { display: flex; align-items: flex-start; gap: 0.65rem; }
    .cb2-owner-glyph-wrap { flex-shrink: 0; opacity: 0.95; }
    .cb2-owner-glyph { display: block; }
    .cb2-owner-body { flex: 1; min-width: 0; }
    .cb2-owner-id { margin: 0; font-size: 0.8rem; font-weight: 600; line-height: 1.45; color: #e6edf3; }
    .cb2-owner-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.45rem 0 0; }
    .cb2-owner-chip {
      font-size: 0.6rem;
      font-weight: 600;
      padding: 0.18rem 0.42rem;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.10);
      border: 1px solid rgba(56, 189, 248, 0.28);
      color: #7dd3fc;
      letter-spacing: 0.01em;
    }
    .cb2-owner-sum { margin: 0.45rem 0 0; font-size: 0.72rem; line-height: 1.45; color: var(--cb2-sub); }
    .cb2-owner-note { margin: 0.35rem 0 0; font-size: 0.6rem; line-height: 1.4; color: var(--cb2-muted); }

    /* ── Score strip ── */
    .cb2-strip {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.5rem;
      margin: 1rem 0;
    }
    .cb2-strip > div {
      background: transparent;
      border-radius: 0;
      padding: 0.35rem 0.15rem;
      box-shadow: none;
      border: none;
    }
    .cb2-strip-k { font-size: 0.6rem; color: var(--cb2-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    .cb2-strip-v { font-size: 1.1rem; font-weight: 800; color: #f0f6fc; margin-top: 0.25rem; line-height: 1; }
    .cb2-strip-v small { font-size: 0.6em; font-weight: 600; color: var(--cb2-sub); }

    /* ── Sections: white left rule แทนกล่องพื้นหลัง ── */
    .cb2-card {
      background: transparent;
      border-radius: 0;
      padding: 0.85rem 0 0.85rem 0.95rem;
      margin-top: 0.85rem;
      box-shadow: none;
      border: none;
      border-left: 3px solid rgba(255,255,255,0.88);
    }
    .cb2-card h2 {
      font-size: 0.88rem;
      font-weight: 700;
      margin: 0 0 0.8rem;
      color: #c9d1d9;
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .cb2-card h2::before { content: none; }
    .cb2-hint { font-size: 0.67rem; color: var(--cb2-muted); margin: -0.4rem 0 0.65rem 0.5rem; }

    /* ── Radar chart ── */
    .cb2-radar-card { }
    .cb2-radar-wrap { }
    .cb2-radar-plot { position: relative; max-width: 17rem; margin: 0 auto; }
    .cb2-radar-svg { width: 100%; height: auto; display: block; overflow: visible; }
    .cb2-radar-labels { position: absolute; inset: 0; pointer-events: none; }
    .cb2-radar-lbl {
      position: absolute;
      display: flex;
      flex-direction: column;
      font-size: 0.62rem;
      line-height: 1.3;
      color: rgba(255,255,255,0.50);
    }
    .cb2-radar-lbl--peak { color: #ffffff; }
    .cb2-radar-lbl-t { font-size: 0.62rem; }
    .cb2-radar-lbl-n { font-size: 0.67rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .cb2-radar-lbl--peak .cb2-radar-lbl-n { color: rgba(255,255,255,0.92); }
    /* แกน “เข้ากับคุณที่สุด” (min |owner−stone|) — เทียบจุดเทาใน SVG */
    .cb2-radar-lbl--align { color: #94a3b8; }
    .cb2-radar-lbl--align .cb2-radar-lbl-n { color: #cbd5e1; }
    @keyframes cb2-radar-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.38; }
    }
    .cb2-radar-lbl--blink {
      animation: cb2-radar-blink 1.1s ease-in-out infinite;
    }
    .cb2-radar-svg .cb2-radar-blink {
      animation: cb2-radar-blink 1.1s ease-in-out infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .cb2-radar-lbl--blink,
      .cb2-radar-svg .cb2-radar-blink { animation: none; opacity: 1; }
    }
    .cb2-radar-key {
      font-size: 0.62rem;
      color: var(--cb2-muted);
      text-align: center;
      margin: 0.5rem 0 0;
      line-height: 1.35;
    }

    /* ── Axis bars ── */
    .cb2-axis-row { display: flex; align-items: center; gap: 0.45rem; margin: 0.4rem 0; font-size: 0.78rem; }
    .cb2-axis-l { flex: 0 0 40%; color: var(--cb2-sub); line-height: 1.25; }
    .cb2-axis-track { flex: 1; height: 6px; background: rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden; }
    .cb2-axis-fill { display: block; height: 100%; border-radius: 6px; transition: width 0.3s; }
    .cb2-axis-s { flex: 0 0 2.2rem; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; font-size: 0.78rem; }

    /* ── Graph summary: หลอดพลัง (ค่าตามแกนพีค / แกนเข้ากัน) ── */
    .cb2-gsum-bars { display: flex; flex-direction: column; gap: 0.75rem; }
    .cb2-gsum-bar-row {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 0.35rem 0 0.5rem;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .cb2-gsum-bar-row:last-child { border-bottom: none; }
    .cb2-gsum-bar-row--lead { border-bottom-color: rgba(56,189,248,0.18); }
    .cb2-gsum-bar-k {
      flex: 0 0 5.5rem;
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--cb2-gsum-k);
      line-height: 1.35;
      padding-top: 0.1rem;
    }
    .cb2-gsum-bar-main { flex: 1; min-width: 0; }
    .cb2-gsum-bar-desc {
      margin: 0 0 0.38rem;
      font-size: 0.8rem;
      font-weight: 700;
      line-height: 1.3;
    }
    .cb2-gsum-bar-line { display: flex; align-items: center; gap: 0.45rem; }
    .cb2-gsum-bar-track {
      flex: 1;
      height: 8px;
      border-radius: 9999px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
      min-width: 0;
    }
    .cb2-gsum-bar-fill { display: block; height: 100%; border-radius: 9999px; transition: width 0.25s ease; }
    .cb2-gsum-bar-num {
      flex: 0 0 1.6rem;
      font-size: 0.82rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: #e6edf3;
      text-align: end;
    }

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
          <p class="cb2-main">พลังเด่น · ${escapeHtml(peakLabelThai)}</p>
          ${generatedAt ? `<p class="cb2-date">${escapeHtml(generatedAt)}</p>` : ""}
        </div>
        ${heroImg}
      </div>
    </header>

    ${ownerProfileHtml}

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

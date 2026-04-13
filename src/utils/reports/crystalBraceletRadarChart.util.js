import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
} from "../../crystalBracelet/crystalBraceletScores.util.js";

// SVG viewBox: 100×100 coordinate system (same pattern as amulet radar)
const SVG_CX = 50;
const SVG_CY = 50;
const SVG_R = 38;

// CSS % positions for each axis label (top/bottom/left/right from the plot container)
// Computed for 7-axis heptagon, label radius ~52% from center (50%,50%)
// angles: -90°, -38.6°, 12.9°, 64.3°, 115.7°, 167.1°, 218.6°
const AXIS_LABEL_CSS = {
  protection:  { top: "1%",   left: "50%",  transform: "translateX(-50%)", textAlign: "center" },
  charm:       { top: "18%",  right: "8%",  textAlign: "right" },
  aura:        { top: "56%",  right: "2%",  textAlign: "right" },
  opportunity: { bottom: "5%",right: "22%", textAlign: "right" },
  work:        { bottom: "5%",left: "22%",  textAlign: "left" },
  grounding:   { top: "56%",  left: "2%",   textAlign: "left" },
  third_eye:   { top: "18%",  left: "8%",   textAlign: "left" },
};

/** @param {string} s */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {Record<string, number>} scores
 * @param {number[]} angles
 */
function polygonPoints(scores, angles) {
  return CRYSTAL_BRACELET_AXIS_ORDER
    .map((k, i) => {
      const v = Math.max(0, Math.min(100, Number(scores[k]) || 0)) / 100;
      const x = SVG_CX + Math.cos(angles[i]) * v * SVG_R;
      const y = SVG_CY + Math.sin(angles[i]) * v * SVG_R;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * 7-axis radar — stone polygon (solid) + owner overlay (dashed).
 * Labels are HTML elements positioned outside the SVG (avoids SVG text overflow).
 *
 * @param {Record<string, unknown>} axes
 * @param {Record<string, number>} ownerAxisScores
 * @returns {string} — complete plot HTML: <div class="cb2-radar-plot">…</div>
 */
export function buildCrystalBraceletRadarChartSvg(axes, ownerAxisScores) {
  const n = CRYSTAL_BRACELET_AXIS_ORDER.length;
  const angles = CRYSTAL_BRACELET_AXIS_ORDER.map(
    (_, i) => -Math.PI / 2 + ((2 * Math.PI) / n) * i,
  );

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

  const peakKey = CRYSTAL_BRACELET_AXIS_ORDER.reduce(
    (best, k) => (axisScores[k] > axisScores[best] ? k : best),
    CRYSTAL_BRACELET_AXIS_ORDER[0],
  );
  const ownerPeakKey = CRYSTAL_BRACELET_AXIS_ORDER.reduce(
    (best, k) => ((ownerAxisScores[k] || 0) > (ownerAxisScores[best] || 0) ? k : best),
    CRYSTAL_BRACELET_AXIS_ORDER[0],
  );

  // Grid rings (3 rings at 33%, 66%, 100%)
  const gridRings = [SVG_R * 0.33, SVG_R * 0.66, SVG_R]
    .map((r) => `<circle cx="${SVG_CX}" cy="${SVG_CY}" r="${r.toFixed(2)}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="0.5"/>`)
    .join("");

  // Spokes
  const spokes = angles
    .map((ang) => {
      const x2 = SVG_CX + SVG_R * Math.cos(ang);
      const y2 = SVG_CY + SVG_R * Math.sin(ang);
      return `<line x1="${SVG_CX}" y1="${SVG_CY}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="rgba(255,255,255,0.10)" stroke-width="0.4"/>`;
    })
    .join("");

  const stonePoints = polygonPoints(axisScores, angles);
  const ownerPoints = polygonPoints(ownerAxisScores, angles);

  // Peak dot (stone)
  const peakIdx = CRYSTAL_BRACELET_AXIS_ORDER.indexOf(peakKey);
  const peakAng = angles[peakIdx];
  const peakV = axisScores[peakKey] / 100;
  const pxf = (SVG_CX + Math.cos(peakAng) * peakV * SVG_R).toFixed(2);
  const pyf = (SVG_CY + Math.sin(peakAng) * peakV * SVG_R).toFixed(2);
  const stonePeak = `<circle cx="${pxf}" cy="${pyf}" r="3.2" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.8"/>
  <circle cx="${pxf}" cy="${pyf}" r="1.6" fill="#ffffff"/>`;

  // Owner peak dot
  const oIdx = CRYSTAL_BRACELET_AXIS_ORDER.indexOf(ownerPeakKey);
  const oAng = angles[oIdx];
  const oV = Math.max(0, Math.min(100, ownerAxisScores[ownerPeakKey] || 0)) / 100;
  const oxf = (SVG_CX + Math.cos(oAng) * oV * SVG_R).toFixed(2);
  const oyf = (SVG_CY + Math.sin(oAng) * oV * SVG_R).toFixed(2);
  const ownerPeak = `<circle cx="${oxf}" cy="${oyf}" r="2.2" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.7"/>
  <circle cx="${oxf}" cy="${oyf}" r="1.1" fill="rgba(255,255,255,0.75)"/>`;

  const svgHtml = `<svg class="cb2-radar-svg" viewBox="0 0 100 100" width="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" text-rendering="optimizeLegibility" aria-hidden="true">
  ${gridRings}
  ${spokes}
  <polygon points="${ownerPoints}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.6" stroke-dasharray="2 2" stroke-linejoin="round"/>
  <polygon points="${stonePoints}" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.85)" stroke-width="0.75" stroke-linejoin="round"/>
  ${ownerPeak}
  ${stonePeak}
</svg>`;

  // HTML labels (positioned with CSS — no SVG text overflow issues)
  const labelsHtml = CRYSTAL_BRACELET_AXIS_ORDER
    .map((k) => {
      const isPeak = k === peakKey;
      const pos = AXIS_LABEL_CSS[k] || { top: "50%", left: "50%" };
      const styleStr = Object.entries(pos)
        .map(([p, v]) => {
          const prop = p.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
          return `${prop}:${v}`;
        })
        .join(";");
      const cls = `cb2-radar-lbl cb2-radar-lbl--${k}${isPeak ? " cb2-radar-lbl--peak" : ""}`;
      const label = esc(String(CRYSTAL_BRACELET_AXIS_LABEL_THAI[k] || k));
      const score = esc(String(axisScores[k]));
      return `<span class="${cls}" style="${styleStr}"><span class="cb2-radar-lbl-t">${label}</span><span class="cb2-radar-lbl-n">${score}%</span></span>`;
    })
    .join("");

  return `<div class="cb2-radar-plot">
  ${svgHtml}
  <div class="cb2-radar-labels" aria-hidden="true">${labelsHtml}</div>
</div>`;
}

import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
} from "../../crystalBracelet/crystalBraceletScores.util.js";

const VB_W = 340;
const VB_H = 320;
const CX = 170;
const CY = 168;
const RADIUS = 120;
const RING_RADII = [24, 48, 72, 96, 120];
const RING_LABELS = ["20", "40", "60", "80", "100"];

/** @param {string} s */
function escapeSvgText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {Record<string, unknown>} axes
 * @param {string} key
 */
function axisLabelThai(axes, key) {
  const e = axes[key];
  if (e && typeof e === "object") {
    const t = String(e.labelThai || "").trim();
    if (t) return t;
  }
  return CRYSTAL_BRACELET_AXIS_LABEL_THAI[key] || key;
}

/**
 * 7-axis heptagon radar SVG (viewBox 340×320) for crystal bracelet report.
 * @param {Record<string, unknown>} axes
 * @returns {string}
 */
export function buildCrystalBraceletRadarChartSvg(axes) {
  const axisOrder = CRYSTAL_BRACELET_AXIS_ORDER;
  const n = axisOrder.length;
  const angles = axisOrder.map(
    (_, i) => -Math.PI / 2 + ((2 * Math.PI) / n) * i,
  );

  /** @type {Record<string, number>} */
  const axisScores = {};
  for (const k of axisOrder) {
    const e = axes[k];
    const sc =
      e && typeof e === "object" && e.score != null && Number.isFinite(Number(e.score))
        ? Math.max(0, Math.min(100, Math.round(Number(e.score))))
        : 0;
    axisScores[k] = sc;
  }

  const peakKey = axisOrder.reduce(
    (best, k) => (axisScores[k] > axisScores[best] ? k : best),
    axisOrder[0],
  );

  /** @param {number} r */
  const heptagonPoints = (r) =>
    angles
      .map((ang) => {
        const x = CX + r * Math.cos(ang);
        const y = CY + r * Math.sin(ang);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  const gridRings = RING_RADII.map(
    (r) =>
      `<polygon points="${heptagonPoints(r)}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`,
  ).join("");

  const ringLabelTexts = RING_RADII.map((r, idx) => {
    const y = CY - r - 5;
    const lab = escapeSvgText(RING_LABELS[idx] ?? "");
    return `<text x="${CX}" y="${y.toFixed(2)}" font-size="9" fill="#6e7681" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif">${lab}</text>`;
  }).join("");

  const spokes = angles
    .map((ang) => {
      const x2 = CX + RADIUS * Math.cos(ang);
      const y2 = CY + RADIUS * Math.sin(ang);
      return `<line x1="${CX}" y1="${CY}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
    })
    .join("");

  const dataPoints = angles
    .map((ang, i) => {
      const k = axisOrder[i];
      const v = axisScores[k] / 100;
      const x = CX + Math.cos(ang) * v * RADIUS;
      const y = CY + Math.sin(ang) * v * RADIUS;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const labelR = RADIUS + 18;
  const axisLabelsHtml = angles
    .map((ang, i) => {
      const k = axisOrder[i];
      const lx = CX + labelR * Math.cos(ang);
      const ly = CY + labelR * Math.sin(ang);
      let anchor = "middle";
      if (lx > CX + 8) anchor = "start";
      else if (lx < CX - 8) anchor = "end";
      const isPeak = k === peakKey;
      const fill = isPeak ? "#38bdf8" : "#8b949e";
      const weight = isPeak ? "700" : "400";
      const lab = escapeSvgText(axisLabelThai(axes, k));
      return `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="12" font-weight="${weight}" fill="${fill}" font-family="system-ui,sans-serif">${lab}</text>`;
    })
    .join("");

  const peakIdx = axisOrder.indexOf(peakKey);
  const peakAng = angles[peakIdx];
  const peakV = axisScores[peakKey] / 100;
  const peakX = CX + Math.cos(peakAng) * peakV * RADIUS;
  const peakY = CY + Math.sin(peakAng) * peakV * RADIUS;
  const pxf = peakX.toFixed(2);
  const pyf = peakY.toFixed(2);

  const peakMarker = `<circle cx="${pxf}" cy="${pyf}" r="9" fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.45" aria-hidden="true"/>
  <circle cx="${pxf}" cy="${pyf}" r="5" fill="#38bdf8" aria-hidden="true"/>`;

  return `<svg class="cb2-radar-svg" viewBox="0 0 ${VB_W} ${VB_H}" width="100%" style="max-width:340px" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" text-rendering="optimizeLegibility" aria-hidden="true">
  ${gridRings}
  ${spokes}
  <polygon points="${dataPoints}" fill="rgba(56,189,248,0.18)" stroke="#38bdf8" stroke-width="2" stroke-linejoin="round"/>
  ${peakMarker}
  ${axisLabelsHtml}
  ${ringLabelTexts}
</svg>`;
}

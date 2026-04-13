import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
} from "../../crystalBracelet/crystalBraceletScores.util.js";

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

const VB = 360;
const CX = 180;
const CY = 180;
const R = 108;
const GRID_PCTS = [20, 40, 60, 80, 100];

/**
 * Inline SVG radar (spider) chart for crystal bracelet full report — scale 0–100.
 * @param {Record<string, unknown>} axes
 * @returns {string}
 */
export function buildCrystalBraceletRadarChartSvg(axes) {
  const axisOrder = CRYSTAL_BRACELET_AXIS_ORDER;
  const n = axisOrder.length;
  const angles = axisOrder.map(
    (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n,
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

  /** @param {number} pct */
  const ringPolygonPoints = (pct) =>
    angles
      .map((ang) => {
        const t = pct / 100;
        const x = CX + R * t * Math.cos(ang);
        const y = CY + R * t * Math.sin(ang);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  const gridRings = GRID_PCTS.map(
    (pct) =>
      `<polygon points="${ringPolygonPoints(pct)}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`,
  ).join("");

  const spokes = angles
    .map((ang) => {
      const x2 = CX + R * Math.cos(ang);
      const y2 = CY + R * Math.sin(ang);
      return `<line x1="${CX}" y1="${CY}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>`;
    })
    .join("");

  const dataPoints = angles
    .map((ang, i) => {
      const k = axisOrder[i];
      const v = axisScores[k] / 100;
      const x = CX + R * v * Math.cos(ang);
      const y = CY + R * v * Math.sin(ang);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const labels = angles
    .map((ang, i) => {
      const k = axisOrder[i];
      const lab = escapeSvgText(axisLabelThai(axes, k));
      const sc = axisScores[k];
      const lr = R + 30;
      const lx = CX + lr * Math.cos(ang);
      const ly = CY + lr * Math.sin(ang);
      return `<text x="${lx.toFixed(2)}" y="${(ly - 7).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#8b949e" font-family="system-ui,sans-serif">${lab}</text>
  <text x="${lx.toFixed(2)}" y="${(ly + 7).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="700" fill="#38bdf8" font-family="system-ui,sans-serif">${sc}%</text>`;
    })
    .join("");

  return `<svg class="cb2-radar-svg" viewBox="0 0 ${VB} ${VB}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" text-rendering="optimizeLegibility" aria-hidden="true">
  ${gridRings}
  ${spokes}
  <polygon points="${dataPoints}" fill="rgba(56,189,248,0.32)" stroke="#38bdf8" stroke-width="2.5" stroke-linejoin="round"/>
  ${labels}
</svg>`;
}

import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
} from "../../crystalBracelet/crystalBraceletScores.util.js";

const VB_W = 340;
const VB_H = 370;
const CX = 170;
const CY = 148;
const RADIUS = 112;
const RING_RADII = [24, 48, 72, 96, 118];
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
 * @param {number} ly
 */
function axisLabelDominantBaseline(ly) {
  if (ly < CY - 8) return "auto";
  if (ly > CY + 8) return "hanging";
  return "middle";
}

/**
 * @param {Record<string, number>} scores
 * @param {number[]} angles
 * @param {string[]} axisOrder
 */
function polygonPointsFromScores(scores, angles, axisOrder) {
  return angles
    .map((ang, i) => {
      const k = axisOrder[i];
      const v = Math.max(0, Math.min(100, Number(scores[k]) || 0)) / 100;
      const x = CX + Math.cos(ang) * v * RADIUS;
      const y = CY + Math.sin(ang) * v * RADIUS;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * 7-axis radar with circular grid — stone (bracelet) + owner overlay.
 * @param {Record<string, unknown>} axes — stone/bracelet axis payload
 * @param {Record<string, number>} ownerAxisScores — 0–100 per key (เจ้าของ / จังหวะผู้สวม)
 * @returns {string}
 */
export function buildCrystalBraceletRadarChartSvg(
  axes,
  ownerAxisScores,
) {
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

  const ownerPeakKey = axisOrder.reduce(
    (best, k) =>
      (ownerAxisScores[k] || 0) > (ownerAxisScores[best] || 0) ? k : best,
    axisOrder[0],
  );

  const gridRings = RING_RADII.map(
    (r) =>
      `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`,
  ).join("");

  const ringLabelTexts = RING_RADII.map((r, idx) => {
    const x = CX + 4;
    const y = CY - r + 3;
    const lab = escapeSvgText(RING_LABELS[idx] ?? "");
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="8" fill="rgba(255,255,255,0.30)" text-anchor="start" dominant-baseline="middle" font-family="system-ui,sans-serif">${lab}</text>`;
  }).join("");

  const spokes = angles
    .map((ang) => {
      const x2 = CX + RADIUS * Math.cos(ang);
      const y2 = CY + RADIUS * Math.sin(ang);
      return `<line x1="${CX}" y1="${CY}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`;
    })
    .join("");

  const stonePoints = polygonPointsFromScores(axisScores, angles, axisOrder);
  const ownerPoints = polygonPointsFromScores(ownerAxisScores, angles, axisOrder);

  /** Extra radial padding on E/W (and a bit N/S) so two-line labels clear the outer ring. */
  const labelRadiusForAngle = (ang) =>
    RADIUS +
    22 +
    14 * Math.abs(Math.cos(ang)) +
    5 * Math.abs(Math.sin(ang));

  const axisLabelsHtml = angles
    .map((ang, i) => {
      const k = axisOrder[i];
      const labelR = labelRadiusForAngle(ang);
      const lx = CX + labelR * Math.cos(ang);
      const ly = CY + labelR * Math.sin(ang);
      let anchor = "middle";
      if (lx > CX + 8) anchor = "start";
      else if (lx < CX - 8) anchor = "end";
      const isPeak = k === peakKey;
      const fill = isPeak ? "#ffffff" : "rgba(255,255,255,0.50)";
      const weight = isPeak ? "700" : "400";
      const fs = isPeak ? "12" : "11";
      const baseline = axisLabelDominantBaseline(ly);
      const lab = escapeSvgText(
        String(CRYSTAL_BRACELET_AXIS_LABEL_THAI[k] || k),
      );
      const pct = axisScores[k];
      const scoreFill = isPeak
        ? "rgba(255,255,255,0.88)"
        : "rgba(255,255,255,0.55)";
      // score position: below label text regardless of dominant-baseline direction
      const scoreOffset = baseline === "auto" ? 14 : baseline === "hanging" ? 15 : 13;
      const lyScoreAdj = ly + scoreOffset;
      const nameEl = `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-size="${fs}" font-weight="${weight}" fill="${fill}" font-family="system-ui,sans-serif">${lab}</text>`;
      const scoreEl = `<text x="${lx.toFixed(2)}" y="${lyScoreAdj.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" font-weight="600" fill="${scoreFill}" font-family="system-ui,sans-serif">${pct}%</text>`;
      return `${nameEl}${scoreEl}`;
    })
    .join("");

  const peakIdx = axisOrder.indexOf(peakKey);
  const peakAng = angles[peakIdx];
  const peakV = axisScores[peakKey] / 100;
  const peakX = CX + Math.cos(peakAng) * peakV * RADIUS;
  const peakY = CY + Math.sin(peakAng) * peakV * RADIUS;
  const pxf = peakX.toFixed(2);
  const pyf = peakY.toFixed(2);

  const stonePeakMarker = `<circle cx="${pxf}" cy="${pyf}" r="8" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" aria-hidden="true"/>
  <circle cx="${pxf}" cy="${pyf}" r="4.5" fill="#ffffff" aria-hidden="true"/>`;

  const oIdx = axisOrder.indexOf(ownerPeakKey);
  const oAng = angles[oIdx];
  const oV = Math.max(0, Math.min(100, ownerAxisScores[ownerPeakKey] || 0)) / 100;
  const oX = CX + Math.cos(oAng) * oV * RADIUS;
  const oY = CY + Math.sin(oAng) * oV * RADIUS;
  const oxf = oX.toFixed(2);
  const oyf = oY.toFixed(2);

  const ownerPeakMarker = `<circle cx="${oxf}" cy="${oyf}" r="6" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.2" aria-hidden="true"/>
  <circle cx="${oxf}" cy="${oyf}" r="3" fill="rgba(255,255,255,0.78)" aria-hidden="true"/>`;

  return `<svg class="cb2-radar-svg" viewBox="0 0 ${VB_W} ${VB_H}" width="100%" style="max-width:340px;display:block;margin:0 auto;overflow:visible" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" text-rendering="optimizeLegibility" aria-hidden="true">
  ${gridRings}
  ${spokes}
  <polygon points="${ownerPoints}" fill="none" stroke="rgba(255,255,255,0.48)" stroke-width="1.4" stroke-dasharray="5 4" stroke-linejoin="round"/>
  <polygon points="${stonePoints}" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.85)" stroke-width="1.8" stroke-linejoin="round"/>
  ${ownerPeakMarker}
  ${stonePeakMarker}
  ${axisLabelsHtml}
  ${ringLabelTexts}
</svg>`;
}

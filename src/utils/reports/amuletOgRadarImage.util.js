import sharp from "sharp";
import { POWER_ORDER } from "../../amulet/amuletScores.util.js";
import { clamp0100 } from "../../amulet/amuletOrdAlign.util.js";

const OG_W = 1200;
const OG_H = 630;
const RADAR_CX = 600;
const RADAR_CY = 318;
const RADAR_R = 210;
const AXIS_ANGLES = POWER_ORDER.map(
  (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / POWER_ORDER.length,
);

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @returns {Record<string, number>|null}
 */
export function extractAmuletObjectScores0100(payload) {
  const av = payload?.amuletV1;
  const pc = av?.powerCategories;
  if (!pc || typeof pc !== "object") return null;
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of POWER_ORDER) {
    const e = pc[k];
    const sc =
      e && typeof e === "object" && e.score != null ? Number(e.score) : NaN;
    out[k] = clamp0100(sc);
  }
  return out;
}

/**
 * @param {Record<string, number>} scores0100
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function radarPolygonPoints(scores0100, cx, cy, r) {
  return POWER_ORDER.map((k, i) => {
    const v = Math.max(0, Math.min(100, Number(scores0100[k]) || 0)) / 100;
    const ang = AXIS_ANGLES[i];
    const x = cx + r * v * Math.cos(ang);
    const y = cy + r * v * Math.sin(ang);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function ringPolygon(cx, cy, rFrac) {
  return POWER_ORDER.map((_, i) => {
    const ang = AXIS_ANGLES[i];
    const x = cx + RADAR_R * rFrac * Math.cos(ang);
    const y = cy + RADAR_R * rFrac * Math.sin(ang);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

/**
 * Minimal radar SVG (English labels only — reliable OG / librsvg rendering).
 * @param {Record<string, number>} scores0100
 * @returns {string}
 */
export function buildAmuletOgRadarSvgString(scores0100) {
  const poly = radarPolygonPoints(scores0100, RADAR_CX, RADAR_CY, RADAR_R);
  const ring100 = ringPolygon(RADAR_CX, RADAR_CY, 1);
  const ring66 = ringPolygon(RADAR_CX, RADAR_CY, 0.66);
  const ring33 = ringPolygon(RADAR_CX, RADAR_CY, 0.33);
  const spokes = POWER_ORDER.map((_, i) => {
    const ang = AXIS_ANGLES[i];
    const x2 = RADAR_CX + RADAR_R * Math.cos(ang);
    const y2 = RADAR_CY + RADAR_R * Math.sin(ang);
    return `<line x1="${RADAR_CX}" y1="${RADAR_CY}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="rgba(120,88,28,0.2)" stroke-width="1.2"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
  <rect width="100%" height="100%" fill="#f6f6f4"/>
  <text x="600" y="56" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" fill="#5c420a">Ener Scan</text>
  <text x="600" y="92" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" fill="#7a6a58">Six-axis power (preview)</text>
  <polygon points="${ring100}" fill="none" stroke="rgba(143,103,16,0.28)" stroke-width="1.4"/>
  <polygon points="${ring66}" fill="none" stroke="rgba(143,103,16,0.2)" stroke-width="1.2"/>
  <polygon points="${ring33}" fill="none" stroke="rgba(143,103,16,0.14)" stroke-width="1"/>
  ${spokes}
  <polygon points="${poly}" fill="rgba(184,135,27,0.22)" stroke="#a07312" stroke-width="2.8" stroke-linejoin="round"/>
</svg>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @returns {Promise<Buffer>}
 */
export async function renderAmuletOgRadarPngBuffer(payload) {
  const scores = extractAmuletObjectScores0100(payload);
  if (!scores) {
    throw new Error("amulet_og_radar_missing_scores");
  }
  const svg = buildAmuletOgRadarSvgString(scores);
  return sharp(Buffer.from(svg, "utf8"))
    .resize(OG_W, OG_H)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

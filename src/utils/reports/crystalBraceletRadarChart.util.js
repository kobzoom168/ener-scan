import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
  computeCrystalBraceletAlignmentAxisKey,
} from "../../crystalBracelet/crystalBraceletScores.util.js";

// SVG viewBox: 100×100 coordinate system (same pattern as amulet radar)
const SVG_CX = 50;
const SVG_CY = 50;
const SVG_R = 38;

/** พลังกำไล (solid) — blue; จังหวะผู้สวม (dashed) — red */
const STONE_STROKE = "#60a5fa";
const STONE_FILL = "rgba(96,165,250,0.12)";
const OWNER_STROKE = "#f87171";
const STONE_DOT_FILL = "#93c5fd";
/** จุดรอง “เข้ากับคุณที่สุด” บนเส้นพลังกำไล — เทียบ moldavite mv2-radar-peak-compatibility */
const ALIGN_DOT_FILL = "rgba(148,163,184,0.9)";
const ALIGN_DOT_RING = "rgba(148,163,184,0.42)";

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
  const alignKey = computeCrystalBraceletAlignmentAxisKey(
    axisScores,
    ownerAxisScores,
  );

  // Grid rings as heptagon polygons — omit outermost ring (100% edge) per design
  const heptPoints = (r) =>
    angles
      .map((ang) => `${(SVG_CX + Math.cos(ang) * r).toFixed(2)},${(SVG_CY + Math.sin(ang) * r).toFixed(2)}`)
      .join(" ");
  const gridRings = [SVG_R * 0.25, SVG_R * 0.5, SVG_R * 0.75]
    .map((r) => {
      return `<polygon points="${heptPoints(r)}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="0.5"/>`;
    })
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

  // พลังกำไล — พีค (สูงสุด) + จุดรองที่แกน alignment เมื่อไม่ซ้ำพีค (สูตรเดียวกับมอลดาไวต์: min |owner−stone|)
  const peakIdx = CRYSTAL_BRACELET_AXIS_ORDER.indexOf(peakKey);
  const peakAng = angles[peakIdx];
  const peakV = axisScores[peakKey] / 100;
  const pxf = (SVG_CX + Math.cos(peakAng) * peakV * SVG_R).toFixed(2);
  const pyf = (SVG_CY + Math.sin(peakAng) * peakV * SVG_R).toFixed(2);
  const stonePeakMarker = `<g class="cb2-radar-blink">
  <circle cx="${pxf}" cy="${pyf}" r="3.2" fill="none" stroke="rgba(96,165,250,0.45)" stroke-width="0.8"/>
  <circle cx="${pxf}" cy="${pyf}" r="1.6" fill="${STONE_DOT_FILL}"/>
</g>`;

  let stoneAlignMarker = "";
  if (alignKey !== peakKey) {
    const ai = CRYSTAL_BRACELET_AXIS_ORDER.indexOf(alignKey);
    const aAng = angles[ai];
    const aV = axisScores[alignKey] / 100;
    const axf = (SVG_CX + Math.cos(aAng) * aV * SVG_R).toFixed(2);
    const ayf = (SVG_CY + Math.sin(aAng) * aV * SVG_R).toFixed(2);
    stoneAlignMarker = `<g class="cb2-radar-blink">
  <circle cx="${axf}" cy="${ayf}" r="2.2" fill="none" stroke="${ALIGN_DOT_RING}" stroke-width="0.7"/>
  <circle cx="${axf}" cy="${ayf}" r="1.05" fill="${ALIGN_DOT_FILL}"/>
</g>`;
  }

  /* จุดบนกราฟเฉพาะบนเส้นพลังกำไล (เทียบพระเครื่อง: พีควัตถุ + จุดเข้ากัน — ไม่มีจุดพีคเจ้าของบน SVG) */
  const svgHtml = `<svg class="cb2-radar-svg" viewBox="0 0 100 100" width="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" text-rendering="optimizeLegibility" aria-hidden="true">
  ${gridRings}
  ${spokes}
  <polygon points="${ownerPoints}" fill="none" stroke="${OWNER_STROKE}" stroke-width="0.6" stroke-dasharray="2 2" stroke-linejoin="round"/>
  <polygon points="${stonePoints}" fill="${STONE_FILL}" stroke="${STONE_STROKE}" stroke-width="0.75" stroke-linejoin="round"/>
  ${stoneAlignMarker}
  ${stonePeakMarker}
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
      const isAlign = k === alignKey && alignKey !== peakKey;
      const blinkLbl = k === peakKey || k === alignKey;
      const cls = `cb2-radar-lbl cb2-radar-lbl--${k}${isPeak ? " cb2-radar-lbl--peak" : ""}${isAlign ? " cb2-radar-lbl--align" : ""}${blinkLbl ? " cb2-radar-lbl--blink" : ""}`;
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

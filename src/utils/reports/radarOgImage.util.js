/**
 * Standalone radar SVG + PNG (Open Graph / share previews). Uses `sharp` to rasterize SVG.
 */
import sharp from "sharp";
import { POWER_ORDER } from "../../amulet/amuletScores.util.js";
import { CRYSTAL_BRACELET_AXIS_ORDER } from "../../crystalBracelet/crystalBraceletScores.util.js";

const W = 1200;
const H = 630;
const CX = 600;
const CY = 315;
const R = 220;

/** @param {string} s */
function escapeSvgText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SACRED_AMULET_AXIS_LABELS = {
  protection: "คุ้มครอง",
  metta: "เมตตา",
  baramee: "บารมี",
  luck: "โชคลาภ",
  fortune_anchor: "หนุนดวง",
  specialty: "งานเฉพาะ",
};

const CRYSTAL_BRACELET_AXIS_LABELS = {
  protection: "คุ้มกัน",
  charm: "เสน่ห์",
  aura: "ออร่า",
  opportunity: "โอกาส",
  work: "งาน",
  grounding: "ตั้งหลัก",
  third_eye: "ตาที่ 3",
};

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @returns {Record<string, number>}
 */
function extractSacredAmuletAxisScores(payload) {
  const pc = payload?.amuletV1?.powerCategories;
  if (!pc || typeof pc !== "object") return {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of POWER_ORDER) {
    const e = pc[k];
    const n =
      e && typeof e === "object" && e.score != null ? Number(e.score) : NaN;
    out[k] = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  }
  return out;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @returns {Record<string, number>}
 */
function extractCrystalBraceletAxisScores(payload) {
  const cbAxes = payload?.crystalBraceletV1?.axes || {};
  /** @type {Record<string, number>} */
  const axes = {};
  for (const [k, v] of Object.entries(cbAxes)) {
    axes[k] = typeof v === "object" && v !== null ? Number(v?.score ?? 0) || 0 : Number(v) || 0;
  }
  return axes;
}

/**
 * Moldavite lane: three life-area scores (work / money / relationship).
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @returns {Record<string, number>}
 */
function extractMoldaviteAxisScores(payload) {
  const mv = payload?.moldaviteV1?.lifeAreas;
  if (!mv || typeof mv !== "object") {
    return { work: 0, money: 0, relationship: 0 };
  }
  /** @param {string} k */
  const sc = (k) => {
    const e = mv[k];
    const n = e && typeof e === "object" && e.score != null ? Number(e.score) : NaN;
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  };
  return {
    work: sc("work"),
    money: sc("money"),
    relationship: sc("relationship"),
  };
}

/**
 * @param {object} opts
 * @param {string[]} opts.axisOrder
 * @param {Record<string, string>} opts.axisLabels
 * @param {Record<string, number>} opts.axisScores
 * @param {object} opts.colors
 * @param {string} opts.colors.bg
 * @param {string} opts.colors.ringOuterFill
 * @param {string} opts.colors.ringOuterStroke
 * @param {string} opts.colors.ringMid
 * @param {string} opts.colors.ringInner
 * @param {string} opts.colors.spoke
 * @param {string} opts.colors.polyFill
 * @param {string} opts.colors.polyStroke
 * @param {string} opts.colors.label
 * @param {string} opts.colors.peakFill
 */
export function buildRadarStandaloneSvg({ axisOrder, axisLabels, axisScores, colors }) {
  const angles = axisOrder.map(
    (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / axisOrder.length,
  );

  const polygonPts = angles
    .map((ang, i) => {
      const k = axisOrder[i];
      const v = Math.max(0, Math.min(100, Number(axisScores[k]) || 0)) / 100;
      return `${(CX + R * v * Math.cos(ang)).toFixed(1)},${(CY + R * v * Math.sin(ang)).toFixed(1)}`;
    })
    .join(" ");

  /** @param {number} pct */
  const ringPts = (pct) =>
    angles
      .map((ang) => {
        const t = pct / 100;
        return `${(CX + R * t * Math.cos(ang)).toFixed(1)},${(CY + R * t * Math.sin(ang)).toFixed(1)}`;
      })
      .join(" ");

  const spokes = angles
    .map((ang) => {
      const x = CX + R * Math.cos(ang);
      const y = CY + R * Math.sin(ang);
      return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${colors.spoke}" stroke-width="1.5"/>`;
    })
    .join("");

  const labels = angles
    .map((ang, i) => {
      const k = axisOrder[i];
      const score = Math.round(Number(axisScores[k]) || 0);
      const lx = (CX + (R + 44) * Math.cos(ang)).toFixed(1);
      const ly = (CY + (R + 44) * Math.sin(ang)).toFixed(1);
      const label = axisLabels[k] || k;
      const text = escapeSvgText(`${label} ${score}`);
      return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="22" fill="${colors.label}" font-family="system-ui,sans-serif">${text}</text>`;
    })
    .join("");

  const peakKey = axisOrder.reduce(
    (best, k) =>
      (Number(axisScores[k]) || 0) > (Number(axisScores[best]) || 0) ? k : best,
    axisOrder[0],
  );
  const peakIdx = axisOrder.indexOf(peakKey);
  const peakAng = angles[peakIdx];
  const peakV = Math.max(0, Math.min(100, Number(axisScores[peakKey]) || 0)) / 100;
  const peakX = (CX + R * peakV * Math.cos(peakAng)).toFixed(1);
  const peakY = (CY + R * peakV * Math.sin(peakAng)).toFixed(1);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${colors.bg}"/>
    <polygon points="${ringPts(100)}" fill="${colors.ringOuterFill}" stroke="${colors.ringOuterStroke}" stroke-width="1.5"/>
    <polygon points="${ringPts(66)}" fill="none" stroke="${colors.ringMid}" stroke-width="1.2"/>
    <polygon points="${ringPts(33)}" fill="none" stroke="${colors.ringInner}" stroke-width="1"/>
    ${spokes}
    <polygon points="${polygonPts}" fill="${colors.polyFill}" stroke="${colors.polyStroke}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="${peakX}" cy="${peakY}" r="10" fill="${colors.peakFill}" stroke="#f1f5f9" stroke-width="2"/>
    ${labels}
  </svg>`;
}

/**
 * @param {"sacred_amulet"|"moldavite"|"crystal_bracelet"} lane
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @returns {Promise<Buffer|null>}
 */
export async function buildRadarOgImagePng(lane, payload) {
  let svgStr;
  if (lane === "sacred_amulet") {
    const axisScores = extractSacredAmuletAxisScores(payload);
    svgStr = buildRadarStandaloneSvg({
      axisOrder: [...POWER_ORDER],
      axisLabels: SACRED_AMULET_AXIS_LABELS,
      axisScores,
      colors: {
        bg: "#1a1200",
        ringOuterFill: "rgba(184,134,11,0.08)",
        ringOuterStroke: "rgba(184,134,11,0.5)",
        ringMid: "rgba(184,134,11,0.25)",
        ringInner: "rgba(184,134,11,0.15)",
        spoke: "rgba(184,134,11,0.2)",
        polyFill: "rgba(184,134,11,0.3)",
        polyStroke: "#b8860b",
        label: "#d4a843",
        peakFill: "#d4a843",
      },
    });
  } else if (lane === "moldavite") {
    const powerObj =
      payload?.power && typeof payload.power === "object"
        ? /** @type {{ object?: Record<string, number> }} */ (payload.power).object
        : null;
    if (powerObj && typeof powerObj === "object" && !Array.isArray(powerObj)) {
      const axisOrder = [
        "protection",
        "metta",
        "baramee",
        "luck",
        "fortune_anchor",
        "specialty",
      ];
      svgStr = buildRadarStandaloneSvg({
        axisOrder,
        axisLabels: SACRED_AMULET_AXIS_LABELS,
        axisScores: /** @type {Record<string, number>} */ (powerObj),
        colors: {
          bg: "#0a1a0f",
          ringOuterFill: "rgba(34,197,94,0.06)",
          ringOuterStroke: "rgba(74,222,128,0.45)",
          ringMid: "rgba(74,222,128,0.2)",
          ringInner: "rgba(74,222,128,0.12)",
          spoke: "rgba(74,222,128,0.18)",
          polyFill: "rgba(34,197,94,0.28)",
          polyStroke: "#22c55e",
          label: "#4ade80",
          peakFill: "#4ade80",
        },
      });
    } else {
      const axisScores = extractMoldaviteAxisScores(payload);
      svgStr = buildRadarStandaloneSvg({
        axisOrder: ["work", "money", "relationship"],
        axisLabels: { work: "งาน", money: "การเงิน", relationship: "ความสัมพันธ์" },
        axisScores,
        colors: {
          bg: "#0a1a0f",
          ringOuterFill: "rgba(34,197,94,0.06)",
          ringOuterStroke: "rgba(74,222,128,0.45)",
          ringMid: "rgba(74,222,128,0.2)",
          ringInner: "rgba(74,222,128,0.12)",
          spoke: "rgba(74,222,128,0.18)",
          polyFill: "rgba(34,197,94,0.28)",
          polyStroke: "#22c55e",
          label: "#4ade80",
          peakFill: "#4ade80",
        },
      });
    }
  } else if (lane === "crystal_bracelet") {
    const axisScores = extractCrystalBraceletAxisScores(payload);
    svgStr = buildRadarStandaloneSvg({
      axisOrder: [...CRYSTAL_BRACELET_AXIS_ORDER],
      axisLabels: CRYSTAL_BRACELET_AXIS_LABELS,
      axisScores,
      colors: {
        bg: "#0c1220",
        ringOuterFill: "rgba(14,165,233,0.06)",
        ringOuterStroke: "rgba(125,211,252,0.4)",
        ringMid: "rgba(125,211,252,0.2)",
        ringInner: "rgba(125,211,252,0.12)",
        spoke: "rgba(125,211,252,0.18)",
        polyFill: "rgba(14,165,233,0.28)",
        polyStroke: "#0ea5e9",
        label: "#7dd3fc",
        peakFill: "#7dd3fc",
      },
    });
  } else {
    return null;
  }

  const buf = await sharp(Buffer.from(svgStr, "utf8")).png().toBuffer();
  return buf;
}

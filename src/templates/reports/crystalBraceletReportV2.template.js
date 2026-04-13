/**
 * Crystal bracelet lane HTML — standalone renderer (does not import Moldavite/amulet templates).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { formatBangkokDateTime } from "../../utils/dateTime.util.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
  computeCrystalBraceletOwnerAxisScoresV1,
} from "../../crystalBracelet/crystalBraceletScores.util.js";
import { buildCrystalBraceletRadarChartSvg } from "../../utils/reports/crystalBraceletRadarChart.util.js";

const DISCLAIMER_FIXED =
  "ผลนี้อ่านจากพลังรวมของกำไลทั้งเส้น ไม่ยืนยันชนิดหินรายเม็ด";

const CB_RING_COLORS = {
  charm_attraction: "#f472b6",
  money: "#22c55e",
  career: "#38bdf8",
  luck: "#eab308",
  intuition: "#a855f7",
  love: "#fb7185",
};

/** คำอธิบายใต้หลอด — สรุปจากกราฟ (ไม่ซ้ำโทนกับมิติชีวิตละเอียดแบบยาว) */
const CB_GRAPH_SUMMARY_SUB = {
  charm_attraction: {
    primary:
      "พลังรวมของกำไลเส้นนี้ไปออกกับแรงดึงดูด ภาพลักษณ์ และความรู้สึกน่าเข้าหาเด่นที่สุดในช่วงนี้",
    secondary:
      "รองลงมาคือเรื่องเสน่ห์ จึงช่วยพยุงภาพลักษณ์ ความรู้สึกน่าเข้าหา และแรงดึงดูดต่อคนรอบตัว",
    align:
      "แกนนี้เข้ากับคุณที่สุดในช่วงนี้ จึงหนุนเสน่ห์ ภาพลักษณ์ และแรงดึงดูดได้เป็นธรรมชาติ",
  },
  money: {
    primary:
      "พลังรวมของกำไลเส้นนี้ไปออกกับการเงิน การจัดการรายรับ และจังหวะเรื่องผลตอบแทนเด่นที่สุดในช่วงนี้",
    secondary:
      "รองลงมาคือเรื่องการเงิน จึงช่วยพยุงการจัดการรายรับ ความคล่องตัว และจังหวะผลตอบแทน",
    align:
      "แกนนี้เข้ากับคุณที่สุดในช่วงนี้ จึงหนุนเรื่องการเงิน การจัดการรายรับ และจังหวะผลตอบแทนได้ลื่นที่สุด",
  },
  career: {
    primary:
      "พลังรวมของกำไลเส้นนี้ไปออกกับการลงมือ ความต่อเนื่อง และความชัดในเรื่องงานเด่นที่สุดในช่วงนี้",
    secondary:
      "รองลงมาคือเรื่องการงาน จึงช่วยพยุงการลงมือ ความต่อเนื่อง และความชัดในสิ่งที่ทำ",
    align:
      "แกนนี้เข้ากับคุณที่สุดในช่วงนี้ จึงหนุนการลงมือ ความต่อเนื่อง และความชัดในสิ่งที่ทำได้ดี",
  },
  luck: {
    primary:
      "พลังรวมของกำไลเส้นนี้ไปออกกับจังหวะเปิดทาง โอกาส และเรื่องที่เข้ามาแบบไม่คาดคิดเด่นที่สุดในช่วงนี้",
    secondary:
      "รองลงมาคือเรื่องโชคลาภ จึงช่วยพยุงจังหวะเปิดทาง โอกาสใหม่ และเรื่องฟลุคที่เข้ามาได้ง่ายขึ้น",
    align:
      "แกนนี้เข้ากับคุณที่สุดในช่วงนี้ จึงหนุนจังหวะเปิดทาง โอกาสใหม่ และเรื่องที่เข้ามาแบบพอดีกับคุณ",
  },
  intuition: {
    primary:
      "พลังรวมของกำไลเส้นนี้ไปออกกับเซ้นส์ การรับสัญญาณ และการตัดสินใจจากความรู้สึกเด่นที่สุดในช่วงนี้",
    secondary:
      "รองลงมาคือเรื่องเซ้นส์ จึงช่วยพยุงความไวต่อจังหวะ การรับสัญญาณ และการตัดสินใจจากความรู้สึก",
    align:
      "แกนนี้เข้ากับคุณที่สุดในช่วงนี้ จึงหนุนเซ้นส์ การรับสัญญาณ และการตัดสินใจจากความรู้สึกได้ชัด",
  },
  love: {
    primary:
      "พลังรวมของกำไลเส้นนี้ไปออกกับความรัก ความสัมพันธ์ และความรู้สึกเชื่อมโยงกับคนรอบตัวเด่นที่สุดในช่วงนี้",
    secondary:
      "รองลงมาคือเรื่องความรัก จึงช่วยพยุงความสัมพันธ์ ความอ่อนโยน และความรู้สึกเชื่อมโยงกับคนสำคัญ",
    align:
      "แกนนี้เข้ากับคุณที่สุดในช่วงนี้ จึงหนุนความสัมพันธ์ ความอ่อนโยน และความรู้สึกเชื่อมโยงได้เป็นธรรมชาติ",
  },
};

/**
 * @param {string} axisKey
 * @param {"primary"|"secondary"|"align"} rowType
 */
function cbGraphSummarySubText(axisKey, rowType) {
  const row =
    CB_GRAPH_SUMMARY_SUB[axisKey] ||
    CB_GRAPH_SUMMARY_SUB[CRYSTAL_BRACELET_AXIS_ORDER[0]];
  if (rowType === "secondary") return row.secondary;
  if (rowType === "align") return row.align;
  return row.primary;
}

/**
 * @param {Record<string, unknown>} axes
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @param {import("../../services/reports/reportPayload.types.js").ReportCrystalBraceletV1} cb
 */
function resolveCrystalBraceletHtmlOwnerContext(axes, payload, cb) {
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
  const reportId = String(payload?.reportId || "").trim();
  const scanReqId = String(payload?.scanId || "").trim();
  const seedKey =
    String(cb?.context?.ownerAxisSeedKey || "").trim() ||
    reportId ||
    scanReqId ||
    String(cb?.context?.scanResultIdPrefix || "cb");
  /** Must match slice: second arg to owner-axis util is scan result id (report id), not scan request id first. */
  const sessionKey =
    String(cb?.context?.ownerAxisSessionKey || "").trim() ||
    reportId ||
    scanReqId ||
    String(cb?.context?.scanResultIdPrefix || "session");
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
  const ownerFitInput = ownerFitFromSummary ?? ownerFitFromCb ?? 66;
  const ownerScores = computeCrystalBraceletOwnerAxisScoresV1(
    seedKey,
    sessionKey,
    stoneScores,
    ownerFitInput,
  );
  return { stoneScores, ownerScores, ownerFitInput };
}

/**
 * แกนที่ |พลังกำไล − จังหวะผู้สวม| น้อยสุด — สอดคล้องกับ computeCrystalBraceletAlignmentAxisKey
 * @param {Record<string, number>} stoneScores
 * @param {Record<string, number>} ownerScores
 */
function pickCrystalBraceletAlignAxisKey(stoneScores, ownerScores) {
  let alignKey = CRYSTAL_BRACELET_AXIS_ORDER[0];
  let minD = Infinity;
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const d = Math.abs(
      (Number(stoneScores[k]) || 0) - (Number(ownerScores[k]) || 0),
    );
    if (d < minD) {
      minD = d;
      alignKey = k;
    }
  }
  return alignKey;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportCrystalBraceletV1} cb
 * @param {Record<string, number>} stoneScores
 * @param {Record<string, number>} ownerScores
 */
function resolveCrystalBraceletGraphAlignAxisKey(cb, stoneScores, ownerScores) {
  void cb;
  return pickCrystalBraceletAlignAxisKey(stoneScores, ownerScores);
}

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

  return `<section class="cb2-owner-card cb2-owner-card--below-summary" aria-labelledby="cb2-owner-h">
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
 * จังหวะเสริมพลัง — contract คล้าย Moldavite แต่สไตล์กำไล (ไม่ import เทมเพลต Moldavite)
 * @param {Record<string, unknown>|null|undefined} hr
 */
function buildCrystalBraceletEnergyTimingHtml(hr) {
  const et = hr?.energyTiming;
  if (!et || typeof et !== "object") return "";
  const w = String(et.recommendedWeekday || "").trim();
  const t = String(et.recommendedTimeBand || "").trim();
  const m = String(et.ritualMode || "").trim();
  const r = String(et.timingReason || "").trim();
  if (!w && !t && !m && !r) return "";
  return `<section class="cb2-card cb2-card--et" aria-labelledby="cb2-et-h">
  <h2 id="cb2-et-h">จังหวะเสริมพลัง</h2>
  <div class="cb2-et-body">
    <div class="cb2-et-grid">
      <div class="cb2-et-panel">
        <span class="cb2-et-k">วัน</span>
        <span class="cb2-et-v cb2-et-v--fact">${escapeHtml(w || "—")}</span>
      </div>
      <div class="cb2-et-panel">
        <span class="cb2-et-k">เวลา</span>
        <span class="cb2-et-v cb2-et-v--fact cb2-et-v--time">${escapeHtml(t || "—")}</span>
      </div>
    </div>
    <div class="cb2-et-panel cb2-et-panel--wide">
      <span class="cb2-et-k">โหมดแนะนำ</span>
      <span class="cb2-et-v cb2-et-v--mode">${escapeHtml(m || "—")}</span>
    </div>
    <div class="cb2-et-divider" aria-hidden="true"></div>
    <p class="cb2-et-note">${escapeHtml(r || "—")}</p>
  </div>
</section>`;
}

/**
 * Radar (spider) — ใช้ `ownerScores` ชุดเดียวกับสรุปจากกราฟ (fit input = summary ก่อน)
 * @param {Record<string, unknown>} axes
 * @param {Record<string, number>} ownerScores
 */
function createCbRadarSection(axes, ownerScores) {
  const radarSvg = buildCrystalBraceletRadarChartSvg(axes, ownerScores);
  return `<section class="cb2-card cb2-radar-card" aria-labelledby="cb2-radar-h">
    <h2 id="cb2-radar-h">มิติพลังกำไล</h2>
    <div role="img" aria-label="พลังกำไลและจังหวะผู้สวม แผนภูมิเรดาร์">
      ${radarSvg}
    </div>
    <div class="cb2-radar-legend" aria-label="คำอธิบายกราฟ">
      <div class="cb2-radar-legend-card">
        <span class="cb2-radar-legend-swatch cb2-radar-legend-swatch--solid" aria-hidden="true"></span>
        <div class="cb2-radar-legend-copy">
          <span class="cb2-radar-legend-k">เส้นทึบ</span>
          <span class="cb2-radar-legend-v">พลังกำไล</span>
        </div>
      </div>
      <div class="cb2-radar-legend-card">
        <span class="cb2-radar-legend-swatch cb2-radar-legend-swatch--dashed" aria-hidden="true"></span>
        <div class="cb2-radar-legend-copy">
          <span class="cb2-radar-legend-k">เส้นประ</span>
          <span class="cb2-radar-legend-v">จังหวะผู้สวม</span>
        </div>
      </div>
      <div class="cb2-radar-legend-card">
        <span class="cb2-radar-legend-swatch cb2-radar-legend-swatch--dot" aria-hidden="true"></span>
        <div class="cb2-radar-legend-copy">
          <span class="cb2-radar-legend-k">จุดเทา</span>
          <span class="cb2-radar-legend-v">แกนที่จังหวะคุณใกล้เคียงโทนกำไลมากที่สุด</span>
        </div>
      </div>
    </div>
  </section>`;
}

/**
 * สรุปจากกราฟ — แถว 1 พลังเด่น (คะแนนกำไลแกนหลัก) · แถว 2 เข้ากับคุณ (คะแนนกำไลที่แกน align ตามป้ายเรดาร์)
 * @param {Record<string, unknown>} axes
 * @param {string} primaryAxis
 * @param {Record<string, number>} stoneScores
 * @param {Record<string, number>} ownerScores
 * @param {string} alignAxisKey
 */
function buildCrystalBraceletGraphSummaryBarsHtml(
  axes,
  primaryAxis,
  stoneScores,
  ownerScores,
  alignAxisKey,
) {
  void ownerScores;
  const peakPct = Math.max(0, Math.min(100, stoneScores[primaryAxis] ?? 0));
  /* Bar value = bracelet score on align axis (matches radar label on that spoke) */
  const alignDisplayPct = Math.max(
    0,
    Math.min(100, Math.round(Number(stoneScores[alignAxisKey]) || 0)),
  );
  const peakName = cbAxisLabelThai(axes, primaryAxis);
  const alignName = cbAxisLabelThai(axes, alignAxisKey);
  const peakColor = CB_RING_COLORS[primaryAxis] || "#38bdf8";
  const alignColor = CB_RING_COLORS[alignAxisKey] || "#7dd3fc";

  const row = (
    rowLabel,
    headline,
    subText,
    pct,
    axisColor,
    leadClass,
  ) =>
    `<div class="cb2-gsum-bar-row${leadClass}">
  <span class="cb2-gsum-bar-k">${escapeHtml(rowLabel)}</span>
  <div class="cb2-gsum-bar-main">
    <p class="cb2-gsum-bar-headline" style="color:${axisColor}">${escapeHtml(headline)}</p>
    <div class="cb2-gsum-bar-line">
      <div class="cb2-gsum-bar-track" role="presentation"><span class="cb2-gsum-bar-fill" style="width:${pct}%;background:${axisColor}"></span></div>
      <span class="cb2-gsum-bar-num">${escapeHtml(String(pct))}</span>
    </div>
    <p class="cb2-gsum-bar-sub">${escapeHtml(subText)}</p>
  </div>
</div>`;

  return `<div class="cb2-gsum-bars">
${row(
    "พลังเด่น",
    `เด่นสุดที่ ${peakName}`,
    cbGraphSummarySubText(primaryAxis, "primary"),
    peakPct,
    peakColor,
    " cb2-gsum-bar-row--lead",
  )}
${row(
    "เข้ากับคุณ",
    `เข้ากับคุณที่สุด ${alignName}`,
    cbGraphSummarySubText(alignAxisKey, "align"),
    alignDisplayPct,
    alignColor,
    "",
  )}
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

  const { stoneScores, ownerScores } = resolveCrystalBraceletHtmlOwnerContext(
    axes,
    payload,
    cb,
  );
  const primaryAxis =
    String(cb.primaryAxis || "").trim() ||
    CRYSTAL_BRACELET_AXIS_ORDER.reduce(
      (best, k) => (stoneScores[k] > stoneScores[best] ? k : best),
      CRYSTAL_BRACELET_AXIS_ORDER[0],
    );
  const alignAxisKey = resolveCrystalBraceletGraphAlignAxisKey(
    cb,
    stoneScores,
    ownerScores,
  );
  const peakLabelThai = cbAxisLabelThai(axes, primaryAxis);

  const graphSummaryHtml = buildCrystalBraceletGraphSummaryBarsHtml(
    axes,
    primaryAxis,
    stoneScores,
    ownerScores,
    alignAxisKey,
  );

  const imgRaw = String(payload?.object?.objectImageUrl || "").trim();
  const heroImg =
    /^https:\/\//i.test(imgRaw)
      ? `<div class="cb2-hero-stack"><div class="cb2-hero-img"><img src="${escapeHtml(imgRaw)}" alt="" loading="lazy" decoding="async"/></div></div>`
      : "";

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

  const radarSectionHtml = createCbRadarSection(axes, ownerScores);
  const ownerProfileHtml = buildCrystalBraceletOwnerProfileHtml(cb);
  const energyTimingHtml = buildCrystalBraceletEnergyTimingHtml(hr);

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
    .cb2-hero-img { width: 100%; aspect-ratio: 4/3; border-radius: 16px; overflow: hidden; background: #21262d; margin-bottom: 0.85rem; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
    .cb2-header-row .cb2-hero-img { width: 88px; height: 88px; aspect-ratio: 1 / 1; border-radius: 12px; flex-shrink: 0; margin-bottom: 0; }
    .cb2-hero-img img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
    .cb2-h1 { font-size: 1.4rem; font-weight: 800; margin: 0 0 0.2rem; line-height: 1.3; color: #f0f6fc; letter-spacing: -0.01em; }
    .cb2-tag { font-size: 0.78rem; color: var(--cb2-muted); margin: 0 0 0.3rem; }
    .cb2-main { font-size: 0.88rem; font-weight: 600; color: var(--cb2-accent); margin: 0.15rem 0 0; }
    .cb2-date { font-size: 0.7rem; color: var(--cb2-muted); margin: 0.45rem 0 0; }

    /* ── Owner profile (secondary หลังสรุปกราฟ) ── */
    .cb2-owner-card {
      margin-top: 0.75rem;
      padding: 0.75rem 0 0.75rem 0.95rem;
      border-left: 3px solid rgba(255, 255, 255, 0.9);
    }
    .cb2-owner-card--below-summary {
      margin-top: 1.15rem;
      padding-top: 0.65rem;
    }
    .cb2-owner-card h2 { font-size: 0.88rem; font-weight: 700; margin: 0 0 0.55rem; color: #c9d1d9; }
    .cb2-owner-card--below-summary h2 {
      font-size: 0.82rem;
      font-weight: 600;
      color: #9ca3af;
    }
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

    /* ── Energy timing (bracelet cyan theme, Moldavite-like layout) ── */
    .cb2-card--et {
      border-left-color: rgba(56, 189, 248, 0.55);
      margin-top: 1rem;
    }
    .cb2-card--et h2 { color: #7dd3fc; }
    .cb2-et-body { margin: 0; }
    .cb2-et-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      margin-bottom: 0.55rem;
    }
    .cb2-et-panel {
      background: rgba(56, 189, 248, 0.06);
      border: 1px solid rgba(56, 189, 248, 0.22);
      border-radius: 10px;
      padding: 0.55rem 0.65rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .cb2-et-panel--wide {
      grid-column: 1 / -1;
    }
    .cb2-card--et .cb2-et-k {
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--cb2-muted);
    }
    .cb2-card--et .cb2-et-v--fact {
      font-size: 0.88rem;
      font-weight: 800;
      color: #e6edf3;
      line-height: 1.25;
    }
    @keyframes cb2-et-time-pulse {
      0%, 100% { opacity: 1; color: #7dd3fc; }
      50% { opacity: 0.72; color: #38bdf8; }
    }
    .cb2-card--et .cb2-et-v--time {
      font-variant-numeric: tabular-nums;
      animation: cb2-et-time-pulse 2.4s ease-in-out infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .cb2-card--et .cb2-et-v--time { animation: none !important; opacity: 1 !important; color: #7dd3fc !important; }
    }
    .cb2-card--et .cb2-et-v--mode {
      font-size: 0.78rem;
      font-weight: 600;
      color: #c9d1d9;
      line-height: 1.45;
    }
    .cb2-et-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(56,189,248,0.35), transparent);
      margin: 0.5rem 0 0.55rem;
    }
    .cb2-card--et .cb2-et-note {
      margin: 0;
      font-size: 0.74rem;
      line-height: 1.58;
      color: var(--cb2-sub);
    }

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
    /* แกนเข้ากับคุณที่สุด (min |owner−stone|) — เทียบจุดเทาใน SVG */
    .cb2-radar-lbl--align { color: #94a3b8; }
    .cb2-radar-lbl--align .cb2-radar-lbl-n { color: #cbd5e1; }
    @keyframes cb2-radar-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.38; }
    }
    @keyframes cb2-radar-align-pulse {
      0%, 100% { opacity: 1; filter: brightness(1.15); }
      50% { opacity: 0.5; filter: brightness(0.85); }
    }
    .cb2-radar-lbl--blink {
      animation: cb2-radar-blink 1.1s ease-in-out infinite;
    }
    .cb2-radar-lbl--align-pulse {
      animation: cb2-radar-align-pulse 0.95s ease-in-out infinite;
    }
    .cb2-radar-svg .cb2-radar-blink {
      animation: cb2-radar-blink 1.1s ease-in-out infinite;
    }
    .cb2-radar-svg .cb2-radar-align-marker {
      animation: cb2-radar-align-pulse 0.95s ease-in-out infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .cb2-radar-lbl--blink,
      .cb2-radar-lbl--align-pulse,
      .cb2-radar-svg .cb2-radar-blink,
      .cb2-radar-svg .cb2-radar-align-marker { animation: none !important; opacity: 1 !important; filter: none !important; }
    }
    .cb2-radar-legend {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.45rem;
      margin-top: 0.65rem;
    }
    .cb2-radar-legend-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 0.45rem 0.5rem;
      display: flex;
      align-items: flex-start;
      gap: 0.42rem;
      min-height: 54px;
    }
    .cb2-radar-legend-copy { min-width: 0; flex: 1; }
    .cb2-radar-legend-k {
      display: block;
      font-size: 0.58rem;
      font-weight: 700;
      color: #c9d1d9;
      line-height: 1.25;
    }
    .cb2-radar-legend-v {
      display: block;
      font-size: 0.56rem;
      line-height: 1.35;
      color: var(--cb2-muted);
      margin-top: 0.12rem;
    }
    .cb2-radar-legend-swatch {
      flex-shrink: 0;
      margin-top: 0.22rem;
    }
    .cb2-radar-legend-swatch--solid {
      width: 18px;
      height: 2px;
      border-radius: 999px;
      background: #60a5fa;
    }
    .cb2-radar-legend-swatch--dashed {
      width: 18px;
      height: 0;
      border-top: 2px dashed #fb7185;
    }
    .cb2-radar-legend-swatch--dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.42);
      border: 2px solid rgba(96, 165, 250, 0.7);
      box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.16);
    }
    @media (max-width: 380px) {
      .cb2-radar-legend { grid-template-columns: 1fr; }
    }

    /* ── Graph summary: headline → หลอด → คำอธิบายใต้หลอด ── */
    .cb2-gsum-bars { display: flex; flex-direction: column; gap: 0.95rem; }
    .cb2-gsum-bar-row {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 0.35rem 0 0.55rem;
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
      padding-top: 0.12rem;
    }
    .cb2-gsum-bar-main { flex: 1; min-width: 0; }
    .cb2-gsum-bar-headline {
      margin: 0 0 0.32rem;
      font-size: 0.8rem;
      font-weight: 700;
      line-height: 1.32;
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
    .cb2-gsum-bar-sub {
      margin: 0.42rem 0 0;
      font-size: 0.68rem;
      line-height: 1.52;
      color: var(--cb2-muted);
      font-weight: 400;
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

    ${ownerProfileHtml}

    ${energyTimingHtml}

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

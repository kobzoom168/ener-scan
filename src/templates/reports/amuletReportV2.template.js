import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { buildAmuletHtmlV2ViewModel } from "../../amulet/amuletHtmlV2.model.js";
import {
  resolveScannedAtIsoForReportMeta,
  formatEsDisplayReportId,
  formatReportVersionDisplayLine,
  formatReportMetaDatetimeOrEmpty,
} from "../../utils/reports/reportHtmlTrust.util.js";
import { score10ToEnergyGrade } from "../../utils/reports/energyLevelGrade.util.js";

const AMULET_RADAR_R = 38;
const AMULET_RADAR_CX = 50;
const AMULET_RADAR_CY = 50;
const AMULET_AXIS_KEYS = /** @type {const} */ ([
  "protection",
  "metta",
  "baramee",
  "luck",
  "fortune_anchor",
  "specialty",
]);
const AMULET_RADAR_ANGLES = AMULET_AXIS_KEYS.map(
  (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / AMULET_AXIS_KEYS.length,
);
const AMULET_AXIS_LABEL_ALIAS = {
  protection: "คุ้มครอง",
  metta: "เมตตา",
  baramee: "บารมี",
  luck: "โชคลาภ",
  fortune_anchor: "หนุนดวง",
  specialty: "งานเฉพาะ",
};

/**
 * @param {Record<string, number>} values01to100
 */
function amuletRadarPolygonPoints(values01to100) {
  return AMULET_RADAR_ANGLES.map((ang, i) => {
    const k = AMULET_AXIS_KEYS[i];
    const v = Math.max(0, Math.min(100, Number(values01to100[k]) || 0)) / 100;
    const x = AMULET_RADAR_CX + AMULET_RADAR_R * v * Math.cos(ang);
    const y = AMULET_RADAR_CY + AMULET_RADAR_R * v * Math.sin(ang);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

/**
 * @param {Record<string, number>} values01to100
 * @param {string} axisKey
 */
function amuletRadarVertexForAxis(values01to100, axisKey) {
  const i = AMULET_AXIS_KEYS.indexOf(axisKey);
  if (i < 0) return { x: AMULET_RADAR_CX, y: AMULET_RADAR_CY };
  const ang = AMULET_RADAR_ANGLES[i];
  const v = Math.max(0, Math.min(100, Number(values01to100[axisKey]) || 0)) / 100;
  return {
    x: AMULET_RADAR_CX + AMULET_RADAR_R * v * Math.cos(ang),
    y: AMULET_RADAR_CY + AMULET_RADAR_R * v * Math.sin(ang),
  };
}

/**
 * @param {string} axisKey
 * @param {string} fallbackLabel
 */
function amuletRadarAxisAlias(axisKey, fallbackLabel) {
  return AMULET_AXIS_LABEL_ALIAS[axisKey] || fallbackLabel;
}

/**
 * @param {{ id: string, labelThai: string }} axis
 * @param {number} score
 * @param {boolean} isPeak
 * @param {boolean} isAlignHighlight — แกน “เข้ากับคุณที่สุด” (`alignment.axisKey`) เมื่อไม่ใช่แกนพลังเด่น
 */
function amuletRadarAxisLabelHtml(axis, score, isPeak, isAlignHighlight) {
  const rankCls = isPeak
    ? " mv2a-radar-lbl--top1"
    : isAlignHighlight
      ? " mv2a-radar-lbl--top2"
      : "";
  const alias = amuletRadarAxisAlias(axis.id, axis.labelThai);
  return `<span class="mv2a-radar-lbl mv2a-radar-lbl--${escapeHtml(axis.id)}${rankCls}"><span class="mv2a-radar-axis-t">${escapeHtml(alias)}</span> <span class="mv2a-radar-axis-n">${escapeHtml(String(score))}</span></span>`;
}

function amuletHtmlShowRenderMetaLine() {
  const raw = String(process.env.REPORT_HTML_RENDER_META ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * Public report URL for GET /r/:publicToken. Mirrors `buildPublicReportUrl` but
 * avoids importing app `env` (so unit tests can render HTML without full .env).
 * @param {string} publicToken
 */
function buildPublicReportUrlForMeta(publicToken) {
  const tok = String(publicToken || "").trim();
  if (!tok) return "";
  const explicit = String(process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (explicit) return `${explicit}/r/${encodeURIComponent(tok)}`;
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) {
    const host = String(railway)
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "");
    if (host) return `https://${host}/r/${encodeURIComponent(tok)}`;
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    const host = String(vercel)
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "");
    if (host) return `https://${host}/r/${encodeURIComponent(tok)}`;
  }
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}/r/${encodeURIComponent(tok)}`;
}

/**
 * @param {string} canonicalPageUrl
 * @param {string} rawImage
 */
function absoluteUrlForMeta(canonicalPageUrl, rawImage) {
  const u = String(rawImage || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  const base = String(canonicalPageUrl || "").trim();
  if (!base || !/^https?:\/\//i.test(base)) return u;
  try {
    return new URL(u, base).href;
  } catch {
    return u;
  }
}

/** Short labels for use-day mini bars (Sun … Sat) */
const USE_DAY_SHORT_LABELS = {
  sunday: "อา",
  monday: "จ",
  tuesday: "อ",
  wednesday: "พ",
  thursday: "พฤ",
  friday: "ศ",
  saturday: "ส",
};

/**
 * @param {Record<string, unknown> | null | undefined} scores
 */
function normalizeUseDayScoresForBars(scores) {
  const safe = scores && typeof scores === "object" ? scores : {};
  return [
    { key: "sunday", label: USE_DAY_SHORT_LABELS.sunday, score: Math.round(Number(safe.sunday) || 0) },
    { key: "monday", label: USE_DAY_SHORT_LABELS.monday, score: Math.round(Number(safe.monday) || 0) },
    { key: "tuesday", label: USE_DAY_SHORT_LABELS.tuesday, score: Math.round(Number(safe.tuesday) || 0) },
    { key: "wednesday", label: USE_DAY_SHORT_LABELS.wednesday, score: Math.round(Number(safe.wednesday) || 0) },
    { key: "thursday", label: USE_DAY_SHORT_LABELS.thursday, score: Math.round(Number(safe.thursday) || 0) },
    { key: "friday", label: USE_DAY_SHORT_LABELS.friday, score: Math.round(Number(safe.friday) || 0) },
    { key: "saturday", label: USE_DAY_SHORT_LABELS.saturday, score: Math.round(Number(safe.saturday) || 0) },
  ];
}

/**
 * Vertical mini bars (style B) — inner HTML only; uses `tac.scores` + weekday keys from model.
 *
 * @param {{ scores?: Record<string, number>; recommendedWeekdayKey?: string; secondaryWeekdayKey?: string }} tac
 */
function buildAmuletUseDayBarsInnerHtml(tac) {
  if (!tac || !tac.scores || typeof tac.scores !== "object") return "";
  const items = normalizeUseDayScoresForBars(tac.scores);
  const primaryKey = String(tac.recommendedWeekdayKey || "").trim();
  const secondaryKey = String(tac.secondaryWeekdayKey || "").trim();
  return items
    .map((it) => {
      const score = Math.max(0, Math.min(100, Number(it.score) || 0));
      const cls =
        it.key === primaryKey
          ? "mv2-use-day-bar is-primary"
          : secondaryKey && it.key === secondaryKey
            ? "mv2-use-day-bar is-secondary"
            : "mv2-use-day-bar";
      return `<div class="${cls}" role="listitem">
      <span class="mv2-use-day-bar-label">${escapeHtml(it.label)}</span>
      <span class="mv2-use-day-bar-col">
        <span class="mv2-use-day-bar-fill" style="height:${score}%"></span>
      </span>
      <span class="mv2-use-day-bar-score">${escapeHtml(String(score))}</span>
    </div>`;
    })
    .join("");
}

/**
 * Default: white shell + dark text + grayscale accents. Dark dashboard via
 * `wording.amuletReportV2Theme: "dark"` or env `AMULET_HTML_THEME=dark`.
 *
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @returns {"dark"|"light"}
 */
function resolveAmuletHtmlTheme(payload) {
  const env = String(
    process.env.AMULET_HTML_THEME ?? process.env.REPORT_AMULET_HTML_THEME ?? "",
  )
    .trim()
    .toLowerCase();
  if (env === "dark") return "dark";
  if (env === "light") return "light";
  const w = payload?.wording && typeof payload.wording === "object" ? payload.wording : null;
  const fromPayload = String(
    /** @type {{ amuletReportV2Theme?: string }} */ (w)?.amuletReportV2Theme ?? "",
  )
    .trim()
    .toLowerCase();
  if (fromPayload === "dark") return "dark";
  if (fromPayload === "light") return "light";
  return "light";
}

/** Visual rhythm (px) — ไม่ derive จาก timing formula */
const MV2_ET_WD_H = [22, 26, 20, 28, 32, 22, 24];
const MV2_ET_WD_ACTIVE = 40;
const MV2_ET_TIME_H = [18, 24, 28, 22, 20, 26, 32];
const MV2_ET_TIME_ACTIVE = 40;

/**
 * Sacred amulet timing section — strips จาก `weekdayItems` / `timeItems` ใน model (อ่านจาก timingV1)
 * @param {object} ts — return ของ `buildSacredAmuletTimingCardDisplay`
 */
function buildAmuletTimingVisualHtml(ts) {
  const wdItems = ts.weekdayItems || [];
  const wdStrip = wdItems
    .map((it, i) => {
      const h = it.active ? MV2_ET_WD_ACTIVE : MV2_ET_WD_H[i % MV2_ET_WD_H.length];
      const cls = `mv2-et-pill${it.active ? " is-active" : ""}`;
      return `<div class="${cls}" role="listitem"${it.active ? ' aria-current="true"' : ""}>
      <span class="mv2-et-pill-shape" style="height:${h}px" aria-hidden="true"></span>
      <span class="mv2-et-pill-label">${escapeHtml(it.shortLabel)}</span>
      <span class="mv2-et-pill-sr">${escapeHtml(it.fullLabel)}</span>
    </div>`;
    })
    .join("");

  const tItems = ts.timeItems || [];
  const timeStrip = tItems
    .map((it, i) => {
      const h = it.active ? MV2_ET_TIME_ACTIVE : MV2_ET_TIME_H[i % MV2_ET_TIME_H.length];
      const cls = `mv2-et-slot${it.active ? " is-active" : ""}`;
      return `<div class="${cls}" role="listitem"${it.active ? ' aria-current="true"' : ""}>
      <span class="mv2-et-slot-bar" style="height:${h}px" aria-hidden="true"></span>
      <span class="mv2-et-slot-label" title="${escapeHtml(it.labelFull)}">${escapeHtml(it.shortLabel)}</span>
    </div>`;
    })
    .join("");

  const sub = String(ts.subtitle || "").trim();
  const tb = /** @type {{ percent?: number; label?: string; hint?: string } | undefined} */ (
    ts.timingBoost
  );
  const boostHtml =
    tb &&
    typeof tb.percent === "number" &&
    Number.isFinite(tb.percent) &&
    String(tb.label || "").trim() &&
    String(tb.hint || "").trim()
      ? `<div class="mv2-timing-boost-row" aria-label="โบนัสจังหวะ (ประมาณการแสดงผล)">
      <span class="mv2-timing-boost-chip">${escapeHtml(String(tb.label).trim())}</span>
      <span class="mv2-timing-boost-micro">${escapeHtml(String(tb.hint).trim())}</span>
    </div>`
      : "";
  return `
    <section class="mv2-card mv2-timing-card" aria-labelledby="mv2-timing-h">
      <div class="mv2-timing-head">
        <h2 id="mv2-timing-h">${escapeHtml(ts.heading)}</h2>
        ${sub ? `<p class="mv2-timing-sub">${escapeHtml(sub)}</p>` : ""}
        ${boostHtml}
      </div>
      <div class="mv2-timing-trends">
        <div class="mv2-timing-trend">
          <div class="mv2-timing-trend-top">
            <span class="mv2-timing-trend-k">${escapeHtml(String(ts.weekdayKicker || "").trim() || "วันส่งดี")}</span>
            <span class="mv2-timing-trend-v">${escapeHtml(ts.topWeekdayLabel || "—")}</span>
          </div>
          <div class="mv2-et-strip mv2-et-strip--weekday" role="list" aria-label="วันในสัปดาห์">${wdStrip}</div>
        </div>
        <div class="mv2-timing-trend">
          <div class="mv2-timing-trend-top">
            <span class="mv2-timing-trend-k">${escapeHtml(String(ts.timeKicker || "").trim() || "ช่วงเวลาที่ส่งดี")}</span>
            <span class="mv2-timing-trend-v">${escapeHtml(ts.topWindowLabel || "—")}</span>
          </div>
          <div class="mv2-et-strip mv2-et-strip--time" role="list" aria-label="ช่วงเวลา">${timeStrip}</div>
        </div>
      </div>
      <div class="mv2-timing-insight">
        <span class="mv2-timing-k mv2-timing-k--mode">${escapeHtml(String(ts.modeKicker || "").trim() || "แนวใช้ที่แนะนำ")}</span>
        <p class="mv2-timing-mode-body">${escapeHtml(ts.ritualLine)}</p>
        <p class="mv2-timing-hint mv2-timing-hint--compact">${escapeHtml(ts.hint)}</p>
      </div>
    </section>`;
}

/**
 * Display-only faith progression (ไม่เปลี่ยนคะแนนหลักของรายงาน)
 * @param {object | null | undefined} fp — `vm.faithProgressCard`
 */
function buildFaithProgressCardHtml(fp) {
  if (!fp) return "";
  const fmt = (n) =>
    n != null && Number.isFinite(Number(n)) ? Number(n).toFixed(2) : "—";
  const baseline = String(fp.baselineHint || "").trim();
  const scanNext = String(fp.scanNextHint || "").trim();
  return `<section class="mv2-card mv2-card--faith-progress" aria-labelledby="mv2-faith-progress-h">
    <div class="mv2-faith-progress-top">
      <div class="mv2-faith-progress-grade" aria-hidden="true">
        <span class="mv2-faith-progress-base">${escapeHtml(fp.baseGrade)}</span>
        <span class="mv2-faith-progress-arrow">→</span>
        <span class="mv2-faith-progress-next">${escapeHtml(fp.projectedGrade)}</span>
      </div>
      <div class="mv2-faith-progress-copy">
        <h2 id="mv2-faith-progress-h">${escapeHtml(fp.title)}</h2>
      </div>
    </div>
    <p class="mv2-faith-progress-lead">${escapeHtml(String(fp.progressHint || "").trim())}</p>
    <div class="mv2-faith-progress-metrics mv2-faith-progress-metrics--compact">
      <div>คะแนนปัจจุบัน ${escapeHtml(fmt(fp.baseScore10))} / 10</div>
      <div>คะแนนคาดการณ์ ${escapeHtml(fmt(fp.projectedScore10))} / 10</div>
    </div>
    ${baseline ? `<p class="mv2-faith-progress-baseline">${escapeHtml(baseline)}</p>` : ""}
    ${scanNext ? `<p class="mv2-faith-progress-scan">${escapeHtml(scanNext)}</p>` : ""}
  </section>`;
}

/**
 * @param {ReturnType<typeof buildAmuletHtmlV2ViewModel>} vm
 */
function mainGraphBlock(vm) {
  const ownerPts = amuletRadarPolygonPoints(vm.power.owner);
  const objectPts = amuletRadarPolygonPoints(vm.power.object);
  const alignKey = String(vm.power.alignment?.axisKey || "").trim();
  const axisLabelsHtml = vm.power.axes
    .map((ax) => {
      const isPeak = vm.power.objectPeakKey === ax.id;
      const isAlignHighlight =
        alignKey.length > 0 &&
        alignKey === ax.id &&
        alignKey !== vm.power.objectPeakKey;
      const score = Math.round(Number(vm.power.object[ax.id]) || 0);
      return amuletRadarAxisLabelHtml(ax, score, isPeak, isAlignHighlight);
    })
    .join("");
  const peak = amuletRadarVertexForAxis(vm.power.object, vm.power.objectPeakKey);
  const peakX = peak.x.toFixed(2);
  const peakY = peak.y.toFixed(2);
  const peakMarker = `<circle cx="${peakX}" cy="${peakY}" r="2.6" fill="var(--mv2a-radar-peak-halo)" stroke="none" aria-hidden="true"/><circle class="mv2a-radar-peak" cx="${peakX}" cy="${peakY}" r="1.4" fill="var(--mv2a-radar-peak-fill)" stroke="var(--mv2a-radar-peak-stroke)" stroke-width="0.26" aria-hidden="true"><title>พลังเด่นสุดของพระเครื่อง: ${escapeHtml(vm.power.objectPeakLabelThai || "")}</title></circle>`;
  const alignLabelThai = String(vm.power.alignment?.labelThai || "").trim();
  const alignMarker =
    alignKey && alignKey !== vm.power.objectPeakKey
      ? (() => {
          const p2 = amuletRadarVertexForAxis(vm.power.object, alignKey);
          const x2 = p2.x.toFixed(2);
          const y2 = p2.y.toFixed(2);
          const lab = escapeHtml(alignLabelThai);
          return `<circle cx="${x2}" cy="${y2}" r="2.6" fill="var(--mv2a-radar-peak2-halo)" stroke="none" aria-hidden="true"/><circle class="mv2a-radar-peak-secondary" cx="${x2}" cy="${y2}" r="1.4" fill="var(--mv2a-radar-peak2-fill)" stroke="var(--mv2a-radar-peak2-stroke)" stroke-width="0.26" aria-hidden="true"><title>เข้ากับคุณที่สุด (จุดพลังรองบนกราฟ): ${lab}</title></circle>`;
        })()
      : "";

  return `<section class="mv2a-card mv2a-graph-card" aria-labelledby="mv2a-graph-h">
    <h2 id="mv2a-graph-h">กราฟหกมิติพลังพระเครื่อง</h2>
    <p class="mv2a-hint">เทียบโปรไฟล์คุณกับพลังพระเครื่อง</p>
    <div class="mv2a-radar-wrap" role="img" aria-label="เปรียบเทียบพลังคุณกับพลังพระเครื่อง">
      <div class="mv2a-radar-plot">
        <svg class="mv2a-radar-svg mv2a-radar-svg--animate" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" text-rendering="optimizeLegibility">
          <polygon points="${amuletRadarPolygonPoints({ protection: 100, metta: 100, baramee: 100, luck: 100, fortune_anchor: 100, specialty: 100 })}" fill="var(--mv2a-radar-ring-outer-fill)" stroke="var(--mv2a-radar-ring-outer-stroke)" stroke-width="0.28"/>
          <polygon points="${amuletRadarPolygonPoints({ protection: 66, metta: 66, baramee: 66, luck: 66, fortune_anchor: 66, specialty: 66 })}" fill="none" stroke="var(--mv2a-radar-ring-mid-stroke)" stroke-width="0.22"/>
          <polygon points="${amuletRadarPolygonPoints({ protection: 33, metta: 33, baramee: 33, luck: 33, fortune_anchor: 33, specialty: 33 })}" fill="none" stroke="var(--mv2a-radar-ring-inner-stroke)" stroke-width="0.2"/>
          ${AMULET_RADAR_ANGLES.map((ang) => {
            const x = AMULET_RADAR_CX + AMULET_RADAR_R * Math.cos(ang);
            const y = AMULET_RADAR_CY + AMULET_RADAR_R * Math.sin(ang);
            return `<line x1="${AMULET_RADAR_CX}" y1="${AMULET_RADAR_CY}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="var(--mv2a-radar-spoke)" stroke-width="0.2"/>`;
          }).join("")}
          <g class="mv2a-radar-layer mv2a-radar-layer--owner">
            <polygon points="${ownerPts}" fill="var(--mv2a-radar-owner-fill)" stroke="var(--mv2a-radar-owner-stroke)" stroke-width="0.44" stroke-linejoin="round"/>
          </g>
          <g class="mv2a-radar-layer mv2a-radar-layer--amulet">
            <polygon points="${objectPts}" fill="var(--mv2a-radar-amulet-fill)" stroke="var(--mv2a-radar-amulet-stroke)" stroke-width="0.58" stroke-linejoin="round"/>
          </g>
          <g class="mv2a-radar-layer mv2a-radar-layer--peak">${peakMarker}${alignMarker}</g>
        </svg>
        <div class="mv2a-radar-labels" aria-hidden="true">${axisLabelsHtml}</div>
      </div>
    </div>
    <div class="mv2a-radar-key" role="group" aria-label="คุณและพลังพระเครื่อง">
      <span class="mv2a-radar-key-chip"><span class="mv2a-radar-dot mv2a-radar-dot--owner"></span>คุณ</span>
      <span class="mv2a-radar-key-chip"><span class="mv2a-radar-dot mv2a-radar-dot--amulet"></span>พลังพระเครื่อง</span>
    </div>
  </section>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 */
export function renderAmuletReportV2Html(payload) {
  const vm = buildAmuletHtmlV2ViewModel(payload);
  const htmlTheme = resolveAmuletHtmlTheme(payload);
  const h = vm.hero;
  /** “วันเวลาที่วิเคราะห์” — SSOT via `resolveScannedAtIsoForReportMeta` (report build time tiers), not raw `compatibility.inputs.scannedAt`. */
  const scannedIso = resolveScannedAtIsoForReportMeta(payload, h.reportGeneratedAt);
  const metaTimeLabel = formatReportMetaDatetimeOrEmpty(scannedIso);
  const metaReportId = formatEsDisplayReportId(payload.publicToken, payload.reportId);
  const metaVersionLine = formatReportVersionDisplayLine(payload.reportVersion);
  const score =
    vm.metrics.energyScore != null && Number.isFinite(Number(vm.metrics.energyScore))
      ? String(vm.metrics.energyScore)
      : "ไม่มี";
  const compat =
    Number.isFinite(Number(vm.metrics.compatibilityPercent))
      ? `${Math.round(Number(vm.metrics.compatibilityPercent))}%`
      : "ไม่มี";

  const lifeRowsByLabel = new Map(
    (vm.lifeAreaDetail?.rows || []).map((row) => [String(row.label || "").trim(), String(row.blurb || "").trim()]),
  );
  const axisFromSummaryValue = (v) => String(v || "").split("·")[0].trim();
  const compactExplain = (v, max = 84) => {
    const s = String(v || "").replace(/\s+/g, " ").trim();
    return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s;
  };
  const graphSummaryHtml = `<div class="mv2-gsumx-items">${vm.graphSummary.rows
    .map((r) => {
      const value = String(r.value || "").trim();
      const axisLabel = axisFromSummaryValue(value);
      const lifeBlurb = String(lifeRowsByLabel.get(axisLabel) || "").trim();
      let explain = "อ่านคู่กับการ์ดตัดสินใจเพื่อดูภาพรวมการใช้ชิ้นนี้";
      if (r.label === "พลังเด่น") {
        explain = lifeBlurb || "เป็นแรงหลักที่ผลักการใช้งานของชิ้นนี้ให้ชัดขึ้น";
      } else if (r.label === "เข้ากับคุณที่สุด") {
        explain = lifeBlurb
          ? `ตรงกับพื้นของคุณมากที่สุด · ${lifeBlurb}`
          : "ตรงกับพื้นของคุณมากที่สุด ใช้คู่กันได้ดี";
      } else if (r.label === "ควรค่อย ๆ ไป") {
        explain = value.includes("อย่าเร่ง")
          ? "ถ้าใช้แรงเกินไปอาจกลบจังหวะที่เข้ากับคุณ"
          : "ค่อย ๆ ใช้เพื่อไม่ให้กลบจังหวะหลักที่ส่งกับคุณ";
      }
      return `<div class="mv2-gsumx-item"><div class="mv2-gsumx-k">${escapeHtml(String(r.label || "").trim())}</div><div class="mv2-gsumx-v">${escapeHtml(value)}</div><p class="mv2-gsumx-sub">${escapeHtml(compactExplain(explain))}</p></div>`;
    })
    .join("")}</div>`;

  const dailyOwnerCardHtml = (() => {
    const d = /** @type {{ title?: string; line1?: string; line2?: string } | null} */ (vm.dailyOwnerCard);
    if (!d || !String(d.title || "").trim()) return "";
    const l1 = String(d.line1 || "").trim();
    const l2 = String(d.line2 || "").trim();
    if (!l1 && !l2) return "";
    return `<section class="mv2-card mv2-card--daily-owner" aria-labelledby="mv2-daily-owner-h">
      <h2 id="mv2-daily-owner-h" class="mv2-daily-owner-h">${escapeHtml(String(d.title).trim())}</h2>
      ${l1 ? `<p class="mv2-daily-owner-p">${escapeHtml(l1)}</p>` : ""}
      ${l2 ? `<p class="mv2-daily-owner-p mv2-daily-owner-p--soft">${escapeHtml(l2)}</p>` : ""}
    </section>`;
  })();

  const decisionCardHtml = (() => {
    const dc = /** @type {{ title?: string; keepGrade?: string; verdict?: string; reason?: string; baselineHint?: string; scanNextHint?: string } | null} */ (
      vm.decisionCard
    );
    if (!dc || !dc.keepGrade) return "";
    const badgeMod =
      dc.keepGrade === "S"
        ? "mv2-decision-badge--s"
        : dc.keepGrade === "A"
          ? "mv2-decision-badge--a"
          : dc.keepGrade === "B"
            ? "mv2-decision-badge--b"
            : "mv2-decision-badge--c";
    const baseH = String(dc.baselineHint || "").trim();
    const scanH = String(dc.scanNextHint || "").trim();
    return `<section class="mv2-card mv2-card--decision mv2-card--top-finder" aria-labelledby="mv2-decision-h">
      <div class="mv2-decision-top">
        <div class="mv2-decision-badge-stack">
          <span class="mv2-decision-fit-kicker">เกรดความเข้ากับคุณ</span>
          <div class="mv2-decision-badge ${badgeMod}" aria-hidden="true">${escapeHtml(dc.keepGrade)}</div>
        </div>
        <div class="mv2-decision-copy">
          <h2 id="mv2-decision-h">${escapeHtml(dc.title || "ชิ้นนี้ใช่กับคุณแค่ไหน")}</h2>
          <p class="mv2-decision-verdict">${escapeHtml(String(dc.verdict || "").trim())}</p>
        </div>
      </div>
      <p class="mv2-decision-reason">${escapeHtml(String(dc.reason || "").trim())}</p>
      ${
        baseH || scanH
          ? `<div class="mv2-decision-secondary" role="group" aria-label="ตัวตั้งรอบนี้และขั้นต่อไป">
      ${baseH ? `<p class="mv2-decision-baseline">${escapeHtml(baseH)}</p>` : ""}
      ${scanH ? `<p class="mv2-decision-scan">${escapeHtml(scanH)}</p>` : ""}
    </div>`
          : ""
      }
    </section>`;
  })();

  const usageDisclaimer = escapeHtml(vm.usageCaution.disclaimer || "");

  const ts = vm.timingSection;
  const fp = vm.faithProgressCard;
  const tac = /** @type {{ title?: string; recommendedWeekday?: string; recommendedWeekdayKey?: string; secondaryWeekday?: string; secondaryWeekdayKey?: string; confidence?: string; weekdayTip?: string; scores?: Record<string, number>; showSecondaryChip?: boolean; reasonShort?: string; actionLine?: string } | null} */ (
    vm.timingActionCard
  );
  const useDayLabel = String(tac?.recommendedWeekday || ts?.topWeekdayLabel || "—").trim();
  const useTimeLabel = String(ts?.topWindowLabel || "—").trim();
  const useModeLabel = String(ts?.ritualLine || "").trim();
  const boostPercent =
    ts?.timingBoost && Number.isFinite(Number(ts.timingBoost.percent))
      ? Number(ts.timingBoost.percent)
      : null;
  const fmt10 = (n) =>
    n != null && Number.isFinite(Number(n)) ? Number(n).toFixed(2) : "—";
  const baseGrade = String(fp?.baseGrade || "").trim().toUpperCase();
  const projectedGrade = String(fp?.projectedGrade || "").trim().toUpperCase() || "—";
  const progressTargetGrade = projectedGrade;
  const progressTargetScore = fp ? fmt10(fp.projectedScore10) : "—";
  /** Display-only gap to S threshold (8.9) — same grade boundaries as report energy grades */
  const gapToS10 = (() => {
    const base = Number(fp?.baseScore10);
    if (!Number.isFinite(base)) return null;
    return Math.max(0, 8.9 - base);
  })();
  const boostCapPercentRounded =
    fp != null && fp.boostCapPercent != null && Number.isFinite(Number(fp.boostCapPercent))
      ? Math.max(0, Math.round(Number(fp.boostCapPercent)))
      : null;
  const pipelineFromGrade = String(fp?.baseGrade || baseGrade || "B").trim() || "B";
  const boostCapScore10 = (() => {
    const base = Number(fp?.baseScore10);
    const projected = Number(fp?.projectedScore10);
    if (!Number.isFinite(base) || !Number.isFinite(projected)) return null;
    return Math.max(0, projected - base);
  })();
  const heroGradeResult = `${pipelineFromGrade} → ${progressTargetGrade}`;
  const heroVerdictLabel = (() => {
    if (pipelineFromGrade === "B" && progressTargetGrade === "A") return "คุ้มปั้น";
    if (pipelineFromGrade === "B" && progressTargetGrade === "B") return "ยังไม่คุ้มปั้น";
    if (pipelineFromGrade === "A" && progressTargetGrade === "S") return "น่าปั้นต่อ";
    if (pipelineFromGrade === "A" && progressTargetGrade === "A") return "ยังไม่ถึง S ในรอบนี้";
    if (pipelineFromGrade === "S") return "ใช้ต่อได้เลย";
    return "ควรสแกนเพิ่ม";
  })();
  const heroVerdictLine = (() => {
    if (pipelineFromGrade === "S") {
      return "ใช้ต่อได้ เกรดในระบบอยู่ระดับสูงแล้ว";
    }
    if (progressTargetGrade === "S" && pipelineFromGrade !== "S") {
      return "ชิ้นนี้ยังมีลุ้นขยับถึง S ได้ในรอบนี้";
    }
    if (pipelineFromGrade === "A" && progressTargetGrade === "A") {
      return "ใช้ต่อได้ แต่ถ้าจะดันถึง S การสแกนหาชิ้นหนุนเพิ่มอาจคุ้มกว่า";
    }
    if (pipelineFromGrade === "B" && progressTargetGrade === "A") {
      return "ชิ้นนี้เหมาะเป็นตัวตั้ง แต่ถ้าจะดันถึง S การสแกนหาชิ้นหนุนเพิ่มอาจคุ้มกว่า";
    }
    if (pipelineFromGrade === "B" && progressTargetGrade === "B") {
      return "ชิ้นนี้เหมาะเป็นตัวตั้ง แต่ยังไม่ใช่ตัวปั้นสุด";
    }
    return "ถ้าจะลุ้น S การสแกนหาอีก 2–3 ชิ้นในสายเดียวกันอาจคุ้มกว่า";
  })();
  const stepOneAnswer = `${useDayLabel} · ${useTimeLabel}`;
  const boostMetricDisplay = (() => {
    if (boostCapScore10 == null) return "—";
    const pts = boostCapScore10.toFixed(2);
    if (boostCapPercentRounded != null) return `${pts} · +${boostCapPercentRounded}%`;
    return pts;
  })();
  const durationContinuousBand = (() => {
    if (baseGrade === "B" && progressTargetGrade === "A") return "7–9 วัน";
    if (fp && Number.isFinite(Number(fp.estimatedDaysToNextTier))) {
      const d = Math.max(1, Math.round(Number(fp.estimatedDaysToNextTier)));
      return `${d}–30 วัน`;
    }
    return "7–30 วัน";
  })();
  const insightPeakSub = "จังหวะนี้เหมาะกับการใช้ต่อเนื่อง มากกว่าพกไว้เฉย ๆ";
  const insightContinuousSub =
    pipelineFromGrade === progressTargetGrade
      ? `พลังจะนิ่งขึ้น แม้เกรดยังอยู่ระดับ ${progressTargetGrade}`
      : "พลังจะนิ่งขึ้นและหนุนได้เต็มกว่าเดิมเมื่อใช้ต่อเนื่อง";
  const ceilingHorizon =
    progressTargetGrade === "S"
      ? "ถึง S ในรอบนี้"
      : `สูงสุดอยู่ที่ ${progressTargetGrade} · ยังไม่ถึง S ในรอบนี้`;
  const insightCeilingSub =
    progressTargetGrade === "S"
      ? "หนุนต่อได้แบบนิ่ง ๆ ไม่ต้องฝืนเร่งเกินจังหวะ"
      : "รอบนี้เหมาะกับการดันให้แน่น มากกว่าฝืนเร่งเกินจังหวะ";
  const fullsetMark =
    pipelineFromGrade === progressTargetGrade && (boostCapScore10 || 0) > 0
      ? `${progressTargetGrade}+`
      : progressTargetGrade;
  const continuousHorizonMain = `${fullsetMark} · ${progressTargetScore}/10 · ${durationContinuousBand}`;
  const guideCardHtml = `<section class="mv2-card mv2-card--guide mv2-card--guide-soft" aria-labelledby="mv2-guide-h">
      <h2 id="mv2-guide-h">จังหวะหนุนของชิ้นนี้</h2>
      <div class="mv2-guide-hero">
        <p class="mv2-guide-hero-k">ระดับตอนนี้ · ช่วงที่ตอบดี · พื้นที่ที่ดันได้</p>
        <p class="mv2-guide-hero-grade">${escapeHtml(heroGradeResult)}</p>
        <p class="mv2-guide-hero-verdict">${escapeHtml(heroVerdictLabel)}</p>
      </div>
      <div class="mv2-guide-metrics" role="list" aria-label="สรุปสั้นก่อนอ่านต่อ">
        <div class="mv2-guide-metric" role="listitem">
          <span class="mv2-guide-metric-k">ขยับถึง S</span>
          <span class="mv2-guide-metric-v">${escapeHtml(gapToS10 != null ? gapToS10.toFixed(2) : "—")}</span>
        </div>
        <div class="mv2-guide-metric" role="listitem">
          <span class="mv2-guide-metric-k">ดันเพิ่มได้</span>
          <span class="mv2-guide-metric-v">${escapeHtml(boostMetricDisplay)}</span>
        </div>
        <div class="mv2-guide-metric" role="listitem">
          <span class="mv2-guide-metric-k">ช่วงหนุน</span>
          <span class="mv2-guide-metric-v">${escapeHtml(durationContinuousBand)}</span>
        </div>
      </div>
      <div class="mv2-guide-horizon-stack" aria-label="อ่านต่อทีละมุม">
        <div class="mv2-guide-horizon-card">
          <span class="mv2-guide-horizon-card-k">ช่วงที่ใช้ได้เด่นสุด</span>
          <span class="mv2-guide-horizon-card-line">${escapeHtml(stepOneAnswer)}</span>
          ${useModeLabel ? `<span class="mv2-guide-horizon-card-mode">${escapeHtml(useModeLabel)}</span>` : ""}
          <p class="mv2-guide-horizon-card-hint">${escapeHtml(insightPeakSub)}</p>
        </div>
        <div class="mv2-guide-horizon-card">
          <span class="mv2-guide-horizon-card-k">ถ้าใช้ต่อเนื่อง</span>
          <span class="mv2-guide-horizon-card-line">${escapeHtml(continuousHorizonMain)}</span>
          <p class="mv2-guide-horizon-card-sub">${escapeHtml(insightContinuousSub)}</p>
        </div>
        <div class="mv2-guide-horizon-card mv2-guide-horizon-card--ceiling">
          <span class="mv2-guide-horizon-card-k">ขีดพลังรอบนี้</span>
          <span class="mv2-guide-horizon-card-line">${escapeHtml(ceilingHorizon)}</span>
          <p class="mv2-guide-horizon-card-sub">${escapeHtml(insightCeilingSub)}</p>
        </div>
      </div>
      <div class="mv2-guide-buff-table mv2-guide-belief" role="list" aria-label="แนวทางหนุนพลัง">
        <div class="mv2-guide-buff-title">แนวทางหนุนพลัง</div>
        <div class="mv2-guide-belief-tier" role="listitem">
          <span class="mv2-guide-belief-k">ระยะสั้น</span>
          <span class="mv2-guide-belief-v">อธิษฐาน / ตั้งจิต / ผลเร็ว แต่เพิ่มได้ไม่มาก</span>
        </div>
        <div class="mv2-guide-belief-tier" role="listitem">
          <span class="mv2-guide-belief-k">ระยะกลาง</span>
          <span class="mv2-guide-belief-v">ใช้ตามวันเวลาแนะนำ + สวดสั้น + ตั้งจิต / ต้องทำสม่ำเสมอ</span>
        </div>
        <div class="mv2-guide-belief-tier" role="listitem">
          <span class="mv2-guide-belief-k">ระยะยาว</span>
          <span class="mv2-guide-belief-v">สวดมนต์ + สมาธิต่อเนื่อง / เห็นผลช้า แต่หนุนน้ำหนักสุด</span>
        </div>
        <p class="mv2-guide-belief-note">พิธีหรือการตั้งจิตต่อเนื่อง · อาจเป็นโบนัสพิเศษ ไม่ใช่กติกาพื้นฐานทุกชิ้น</p>
      </div>
      <div class="mv2-guide-bottom">
        <p class="mv2-guide-boost-inline">${escapeHtml(
          boostPercent != null
            ? `โบนัสจังหวะประมาณ +${Math.round(boostPercent)}% · คะแนนหลักของรายงานยังไม่เปลี่ยน`
            : "โบนัสจังหวะประมาณ — · คะแนนหลักของรายงานยังไม่เปลี่ยน",
        )}</p>
        <p class="mv2-guide-closing">${escapeHtml(heroVerdictLine)}</p>
      </div>
    </section>`;

  const subtypeLabel = h.subtypeLabel || "พระเครื่อง";
  /** Shorter tab / share title — big `<h1>` stays the main on-page anchor */
  const docTitle = `รายงาน · ${subtypeLabel} · Ener Scan`;
  const ogTitle = docTitle;
  const ogDescription =
    "ดูรายงานพลังพระเครื่องจาก Ener Scan พร้อมพลังเด่น ความเข้ากัน และพลังทั้ง 6 ด้าน";
  const ogImageAlt = ogTitle;

  const canonicalFromWording = String(
    payload.wording && typeof payload.wording === "object"
      ? /** @type {{ publicReportUrl?: string }} */ (payload.wording).publicReportUrl ?? ""
      : "",
  ).trim();
  let canonicalUrl = "";
  if (/^https?:\/\//i.test(canonicalFromWording)) {
    try {
      const cu = new URL(canonicalFromWording);
      if (cu.protocol === "https:" || cu.protocol === "http:") canonicalUrl = cu.href;
    } catch {
      canonicalUrl = "";
    }
  }
  if (!canonicalUrl) {
    canonicalUrl = buildPublicReportUrlForMeta(String(payload.publicToken || "").trim());
  }

  const rawSocialImage = String(payload.object?.socialImageUrl || "").trim();
  const rawObjectImage = String(payload.object?.objectImageUrl || "").trim();
  const ogImageUrl = absoluteUrlForMeta(
    /^https?:\/\//i.test(canonicalUrl) ? canonicalUrl : "",
    rawSocialImage || rawObjectImage,
  );
  const ogImageTags =
    ogImageUrl !== ""
      ? `
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta property="og:image:alt" content="${escapeHtml(ogImageAlt)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />`
      : "";

  const shareTitleJson = JSON.stringify(ogTitle);
  const shareTextJson = JSON.stringify("ดูรายงานพลังจาก Ener Scan ได้ที่ลิงก์นี้");

  const heroMediaCol = h.objectImageUrl
    ? `<div class="mv2a-media"><img src="${escapeHtml(h.objectImageUrl)}" alt="" loading="lazy" /><p class="mv2a-media-caption">ภาพวัตถุที่ใช้ในการวิเคราะห์</p></div>`
    : "";

  const metaTimeRowHtml = metaTimeLabel
    ? `<div class="mv2-meta-row"><span class="mv2-meta-k">วันเวลาที่วิเคราะห์</span><span class="mv2-meta-v">${escapeHtml(metaTimeLabel)}</span></div>`
    : "";

  const metaBlockHtml = `
    <div class="mv2-meta-block" role="group" aria-label="ข้อมูลรายงาน">
      ${metaTimeRowHtml}
      <div class="mv2-meta-row"><span class="mv2-meta-k">รหัสรายงาน</span><span class="mv2-meta-v mv2-meta-id">${escapeHtml(metaReportId)}</span></div>
      <div class="mv2-meta-row"><span class="mv2-meta-k">เวอร์ชันรายงาน</span><span class="mv2-meta-v">${escapeHtml(metaVersionLine)}</span></div>
    </div>`;

  const trustInlineHtml = `<p class="mv2-trust-inline" role="note">ผลนี้อ้างอิงจากภาพวัตถุ วันเกิด และโมเดลอ่านพลัง Ener Scan</p>`;

  return `<!DOCTYPE html>
<html lang="th"${htmlTheme === "dark" ? ' class="mv2a-theme-dark"' : ""}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(ogDescription)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />${ogImageTags}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
  <title>${escapeHtml(ogTitle)}</title>
  <style>
    :root {
      color-scheme: light;
      /* Sacred light — พื้นขาว ทองสว่าง ขอบทองหนักแต่ไม่หม่น */
      --mv2a-gold: #e8c84a;
      --mv2a-gold-dim: #a88620;
      --mv2a-gold-deep: #4a3c18;
      --mv2a-bg: #ffffff;
      --mv2a-card: transparent;
      --mv2a-muted: #a89872;
      --mv2a-text: #4a3c18;
      --mv2a-text-body: rgba(74, 60, 24, 0.92);
      --mv2a-badge-border: rgba(168, 134, 32, 0.38);
      --mv2a-media-border: rgba(168, 134, 32, 0.32);
      --mv2a-hero-clarifier: #8f7a50;
      --mv2a-card-border: transparent;
      --mv2a-card-elev: none;
      --mv2a-graph-accent: #a88620;
      --mv2a-radar-ring-outer-fill: transparent;
      --mv2a-radar-ring-outer-stroke: #dcc896;
      --mv2a-radar-ring-mid-stroke: #e8dcc4;
      --mv2a-radar-ring-inner-stroke: #f2ebd8;
      --mv2a-radar-spoke: rgba(168, 134, 32, 0.16);
      --mv2a-radar-owner-fill: rgba(232, 200, 74, 0.1);
      --mv2a-radar-owner-stroke: rgba(168, 134, 32, 0.45);
      --mv2a-radar-amulet-fill: rgba(168, 134, 32, 0.14);
      --mv2a-radar-amulet-stroke: rgba(74, 60, 24, 0.85);
      --mv2a-radar-peak-halo: rgba(232, 200, 74, 0.28);
      --mv2a-radar-peak-fill: #dcb44a;
      --mv2a-radar-peak-stroke: #ffffff;
      --mv2a-radar-lbl-axis: #5c4a1f;
      --mv2a-radar-lbl-num: #6b5a28;
      --mv2a-radar-lbl-top1-glow: transparent;
      --mv2a-radar-lbl-top1-t: #6b5a28;
      --mv2a-radar-lbl-top1-n: #8f7318;
      --mv2a-radar-lbl-top2-t: #6b5a28;
      --mv2a-radar-lbl-top2-n: #8f7318;
      --mv2a-radar-key: #a89872;
      --mv2a-radar-dot-border: rgba(168, 134, 32, 0.28);
      --mv2a-radar-dot-owner: rgba(168, 134, 32, 0.58);
      --mv2a-radar-dot-amulet: rgba(74, 60, 24, 0.88);
      --mv2a-anim-peak-glow1: transparent;
      --mv2a-anim-peak-glow2: transparent;
      --mv2a-radar-peak2-halo: rgba(232, 200, 74, 0.22);
      --mv2a-radar-peak2-fill: #c9a227;
      --mv2a-radar-peak2-stroke: #ffffff;
      --mv2a-anim-peak2-glow1: transparent;
      --mv2a-anim-peak2-glow2: transparent;
      --mv2a-radar-lbl-top2-pulse-glow: transparent;
      --mv2a-gsum-bg: transparent;
      --mv2a-gsum-border: rgba(168, 134, 32, 0.22);
      --mv2a-gsum-lead-bg: transparent;
      --mv2a-gsum-lead-border: rgba(168, 134, 32, 0.3);
      --mv2a-gsum-shadow: none;
      --mv2a-gsum-k: #a89872;
      --mv2a-gsum-v: #5c4a1f;
      --mv2a-gsum-v-lead: #5c4a1f;
      --mv2a-life-border: rgba(168, 134, 32, 0.16);
      --mv2a-life-row-border: rgba(168, 134, 32, 0.16);
      --mv2a-life-row-alt: transparent;
      --mv2a-life-name: #5c4a1f;
      --mv2a-life-score: #6b5a28;
      --mv2a-life-blurb: #8f7a50;
      --mv2a-disclaimer: #a89872;
      --mv2a-footer-note: #a89872;
      --mv2a-trust-border: rgba(168, 134, 32, 0.2);
      --mv2a-render-meta: #b8a882;
      /* กล่องแยกแต่ละหัวข้อ — พื้นสีอ่อน */
      --mv2a-section-bg-a: #fbf7f0;
      --mv2a-section-bg-b: #f5f0e8;
      --mv2a-section-bg-c: #faf6ed;
      --mv2a-section-inner: rgba(255, 255, 255, 0.55);
      --mv2a-section-border: rgba(168, 134, 32, 0.16);
      --mv2a-section-radius: 14px;
      --mv2a-section-shadow: 0 1px 3px rgba(74, 60, 24, 0.06);
      /* Unified Thai + system stack (report + radar labels + cards; LINE Flex uses client fonts). */
      --mv2-font-th: "Noto Sans Thai", "Sarabun", "Kanit", ui-sans-serif, -apple-system, BlinkMacSystemFont,
        "Segoe UI", system-ui, sans-serif;
    }
    html.mv2a-theme-dark {
      color-scheme: dark;
      --mv2a-gold: #fafafa;
      --mv2a-gold-dim: #e5e5e5;
      --mv2a-bg: #0a0a0a;
      --mv2a-card: transparent;
      --mv2a-muted: #a3a3a3;
      --mv2a-text: #fafafa;
      --mv2a-text-body: rgba(250, 250, 250, 0.92);
      --mv2a-badge-border: #525252;
      --mv2a-media-border: #525252;
      --mv2a-hero-clarifier: #a3a3a3;
      --mv2a-card-border: transparent;
      --mv2a-card-elev: none;
      --mv2a-graph-accent: #fafafa;
      --mv2a-radar-ring-outer-fill: transparent;
      --mv2a-radar-ring-outer-stroke: #525252;
      --mv2a-radar-ring-mid-stroke: #404040;
      --mv2a-radar-ring-inner-stroke: #333333;
      --mv2a-radar-spoke: rgba(255, 255, 255, 0.12);
      --mv2a-radar-owner-fill: rgba(255, 255, 255, 0.06);
      --mv2a-radar-owner-stroke: rgba(255, 255, 255, 0.35);
      --mv2a-radar-amulet-fill: rgba(255, 255, 255, 0.1);
      --mv2a-radar-amulet-stroke: rgba(250, 250, 250, 0.9);
      --mv2a-radar-peak-halo: rgba(255, 255, 255, 0.06);
      --mv2a-radar-peak-fill: #fafafa;
      --mv2a-radar-peak-stroke: #0a0a0a;
      --mv2a-radar-lbl-axis: #fafafa;
      --mv2a-radar-lbl-num: #fafafa;
      --mv2a-radar-lbl-top1-glow: transparent;
      --mv2a-radar-lbl-top1-t: #fafafa;
      --mv2a-radar-lbl-top1-n: #fafafa;
      --mv2a-radar-lbl-top2-t: #fafafa;
      --mv2a-radar-lbl-top2-n: #fafafa;
      --mv2a-radar-key: #a3a3a3;
      --mv2a-radar-dot-border: rgba(255, 255, 255, 0.25);
      --mv2a-radar-dot-owner: rgba(255, 255, 255, 0.5);
      --mv2a-radar-dot-amulet: rgba(250, 250, 250, 0.95);
      --mv2a-anim-peak-glow1: transparent;
      --mv2a-anim-peak-glow2: transparent;
      --mv2a-radar-peak2-halo: rgba(255, 255, 255, 0.08);
      --mv2a-radar-peak2-fill: #a3a3a3;
      --mv2a-radar-peak2-stroke: #0a0a0a;
      --mv2a-anim-peak2-glow1: transparent;
      --mv2a-anim-peak2-glow2: transparent;
      --mv2a-radar-lbl-top2-pulse-glow: transparent;
      --mv2a-gsum-bg: transparent;
      --mv2a-gsum-border: #404040;
      --mv2a-gsum-lead-bg: transparent;
      --mv2a-gsum-lead-border: #525252;
      --mv2a-gsum-shadow: none;
      --mv2a-gsum-k: #a3a3a3;
      --mv2a-gsum-v: #fafafa;
      --mv2a-gsum-v-lead: #fafafa;
      --mv2a-life-border: #333333;
      --mv2a-life-row-border: #333333;
      --mv2a-life-row-alt: transparent;
      --mv2a-life-name: #fafafa;
      --mv2a-life-score: #fafafa;
      --mv2a-life-blurb: #a3a3a3;
      --mv2a-disclaimer: #a3a3a3;
      --mv2a-footer-note: #a3a3a3;
      --mv2a-trust-border: #333333;
      --mv2a-render-meta: #737373;
      --mv2a-section-bg-a: #161616;
      --mv2a-section-bg-b: #1a1a1a;
      --mv2a-section-bg-c: #141414;
      --mv2a-section-inner: rgba(255, 255, 255, 0.04);
      --mv2a-section-border: rgba(255, 255, 255, 0.1);
      --mv2a-section-radius: 14px;
      --mv2a-section-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
    }
    body { margin: 0; background: var(--mv2a-bg); color: var(--mv2a-text); font-family: var(--mv2-font-th); }
    .mv2a-wrap { max-width: 520px; margin: 0 auto; padding: 1rem 1rem 2.5rem; }
    @media (max-width: 520px) {
      .mv2a-wrap { padding: 0.75rem 0.85rem 2rem; }
    }
    .mv2-hero {
      margin-bottom: 0.65rem;
      padding: 0.9rem 1rem;
      background: var(--mv2a-section-bg-a);
      border: 1px solid var(--mv2a-section-border);
      border-left: 3px solid var(--mv2a-gold-dim);
      border-radius: var(--mv2a-section-radius);
      box-shadow: var(--mv2a-section-shadow);
    }
    html.mv2a-theme-dark .mv2-hero {
      border-left-color: #fafafa;
    }
    html.mv2a-theme-dark .mv2a-card,
    html.mv2a-theme-dark .mv2-card {
      border-left-color: #fafafa;
    }
    .mv2a-badge {
      display: inline-block;
      font-size: 0.62rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: var(--mv2a-muted);
      border-bottom: 1px solid rgba(168, 134, 32, 0.34);
      padding: 0 0 0.12rem;
      margin-bottom: 0.45rem;
      border-radius: 0;
    }
    .mv2-hero-main {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem 1rem;
    }
    .mv2-hero-text { flex: 1; min-width: 0; text-align: left; }
    .mv2a-media {
      flex-shrink: 0;
      width: 6.75rem;
      max-width: 38%;
    }
    .mv2a-media img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: 0;
      border: 1px solid var(--mv2a-media-border);
    }
    .mv2a-media-caption {
      margin: 0.28rem 0 0;
      font-size: 0.58rem;
      line-height: 1.3;
      color: var(--mv2a-muted);
      text-align: center;
      opacity: 0.88;
      letter-spacing: 0.02em;
    }
    .mv2-h1 {
      font-size: 1.32rem;
      margin: 0 0 0.2rem;
      color: var(--mv2a-gold);
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.01em;
      text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
    }
    .mv2-main { font-size: 0.93rem; margin: 0.28rem 0 0; color: var(--mv2a-text-body); font-weight: 500; line-height: 1.38; }
    @media (max-width: 520px) {
      .mv2-main { font-size: 0.88rem; line-height: 1.36; }
    }
    .mv2-hero-clarifier { font-size: 0.76rem; margin: 0.28rem 0 0; color: var(--mv2a-hero-clarifier); line-height: 1.38; }
    .mv2-date { font-size: 0.72rem; color: var(--mv2a-muted); margin: 0.35rem 0 0; }
    .mv2-strip {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.42rem;
      margin: 0 0 0.65rem;
      padding: 0.65rem 0.75rem;
      text-align: center;
      background: var(--mv2a-section-bg-b);
      border: 1px solid var(--mv2a-section-border);
      border-radius: var(--mv2a-section-radius);
      box-shadow: var(--mv2a-section-shadow);
    }
    .mv2-strip-k { font-size: 0.65rem; color: var(--mv2a-muted); }
    .mv2-strip-v { font-size: 1.1rem; font-weight: 700; color: var(--mv2a-gold-dim); }
    .mv2-strip-cell--level .mv2-strip-v.level-grade--S { color: var(--mv2a-gold); }
    .mv2-strip-cell--level .mv2-strip-v.level-grade--A { color: var(--mv2a-gold-dim); }
    .mv2-strip-cell--level .mv2-strip-v.level-grade--B { color: var(--mv2a-muted); }
    .mv2-strip-cell--level .mv2-strip-v.level-grade--D { color: var(--mv2a-muted); }
    .mv2-strip-cell--level .mv2-strip-v.level-grade--none { color: var(--mv2a-muted); }
    .mv2-trust-inline {
      margin: 0 0 0.65rem;
      padding: 0.5rem 0.65rem;
      font-size: 0.6rem;
      line-height: 1.32;
      color: var(--mv2a-muted);
      font-weight: 450;
      text-align: center;
      opacity: 0.92;
      background: var(--mv2a-section-bg-c);
      border: 1px solid var(--mv2a-section-border);
      border-radius: var(--mv2a-section-radius);
    }
    .mv2a-card,
    .mv2-card {
      background: var(--mv2a-section-bg-a);
      border: 1px solid var(--mv2a-section-border);
      border-radius: var(--mv2a-section-radius);
      box-shadow: var(--mv2a-section-shadow);
      padding: 0.9rem 1rem;
      margin: 0.65rem 0;
      border-left: 3px solid var(--mv2a-gold-dim);
    }
    .mv2-card--decision,
    .mv2-card--top-finder {
      background: var(--mv2a-section-bg-b);
    }
    .mv2-card--daily-owner {
      background: var(--mv2a-section-bg-a);
    }
    .mv2-card--guide {
      background: var(--mv2a-section-bg-b);
    }
    .mv2-timing-card {
      background: var(--mv2a-section-bg-a);
    }
    .mv2-card--faith-progress {
      background: var(--mv2a-section-bg-b);
      margin: 0.46rem 0 0.36rem;
      padding-top: 0.58rem;
      padding-bottom: 0.68rem;
    }
    .mv2-share-card {
      background: var(--mv2a-section-bg-a);
    }
    .mv2-card--gsum-follow {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      padding-bottom: 0.5rem;
      background: var(--mv2a-section-bg-a);
    }
    .mv2-card--gsum-follow > h2 { font-size: 0.88rem; font-weight: 700; letter-spacing: 0.02em; opacity: 0.95; color: var(--mv2a-gold-dim); }
    .mv2-gsumx-items { display: grid; gap: 0.55rem; }
    .mv2-gsumx-item {
      padding: 0 0 0.55rem;
      border-radius: 0;
      border: none;
      border-bottom: 1px solid rgba(168, 134, 32, 0.16);
      background: transparent;
    }
    .mv2-gsumx-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .mv2-gsumx-k {
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mv2a-muted);
      margin-bottom: 0.18rem;
    }
    .mv2-gsumx-v {
      font-size: 0.82rem;
      line-height: 1.3;
      font-weight: 750;
      color: var(--mv2a-text-body);
      margin-bottom: 0.12rem;
    }
    .mv2-gsumx-sub {
      margin: 0;
      font-size: 0.68rem;
      line-height: 1.36;
      color: var(--mv2a-muted);
    }
    .mv2-card--decision {
      margin-top: 0.45rem;
    }
    .mv2-card--guide {
      margin-top: 0.55rem;
    }
    .mv2-card--guide > h2 {
      margin: 0 0 0.42rem;
      font-size: 0.92rem;
      font-weight: 750;
      color: var(--mv2a-gold-dim);
    }
    .mv2-guide-hero {
      border-radius: 0;
      border: none;
      background: transparent;
      padding: 0.2rem 0 0.35rem;
      margin-bottom: 0.35rem;
      text-align: center;
    }
    .mv2-card--guide-soft .mv2-guide-hero {
      background: transparent;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .mv2-guide-hero-k {
      margin: 0;
      font-size: 0.58rem;
      line-height: 1.28;
      color: var(--mv2a-muted);
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: none;
    }
    .mv2-guide-hero-grade {
      margin: 0.1rem 0 0.04rem;
      font-size: 1.52rem;
      line-height: 1;
      font-weight: 840;
      color: var(--mv2a-gold);
      letter-spacing: 0.02em;
    }
    .mv2-guide-hero-verdict {
      margin: 0;
      font-size: 0.8rem;
      line-height: 1.25;
      font-weight: 780;
      color: var(--mv2a-text-body);
    }
    .mv2-guide-metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.35rem;
      margin-bottom: 0.28rem;
    }
    .mv2-guide-metric {
      border-radius: 10px;
      border: 1px solid rgba(168, 134, 32, 0.12);
      background: var(--mv2a-section-inner);
      padding: 0.32rem 0.2rem 0.24rem;
      text-align: center;
    }
    .mv2-card--guide-soft .mv2-guide-metric {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .mv2-guide-metric-k {
      display: block;
      margin: 0 0 0.04rem;
      font-size: 0.55rem;
      line-height: 1.2;
      color: var(--mv2a-muted);
      font-weight: 640;
    }
    .mv2-guide-metric-v {
      display: block;
      font-size: 0.73rem;
      line-height: 1.2;
      color: var(--mv2a-text-body);
      font-weight: 760;
    }
    .mv2-guide-verdict-line {
      margin: 0 0 0.24rem;
      font-size: 0.64rem;
      line-height: 1.34;
      color: var(--mv2a-text-body);
      font-weight: 620;
    }
    .mv2-guide-grade-lane {
      margin-bottom: 0.24rem;
    }
    .mv2-guide-grade-line {
      position: relative;
      height: 6px;
      border-radius: 999px;
      background: rgba(75, 75, 75, 0.1);
      overflow: hidden;
    }
    .mv2-guide-lane-pin {
      position: absolute;
      top: 50%;
      width: 7px;
      height: 7px;
      border-radius: 999px;
      transform: translate(-50%, -50%);
      border: 1px solid #ffffff;
      background: rgba(75, 75, 75, 0.88);
      box-shadow: none;
      z-index: 1;
    }
    .mv2-guide-lane-pin.is-fullset {
      background: #a3a3a3;
    }
    .mv2-guide-lane-pin.is-ceiling {
      background: #525252;
      width: 8px;
      height: 8px;
    }
    .mv2-guide-grade-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #737373 0%, #a3a3a3 80%, #d4d4d4 100%);
    }
    .mv2-guide-grade-stops {
      margin-top: 0.08rem;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      font-size: 0.58rem;
      line-height: 1.2;
      color: var(--mv2a-muted);
      font-weight: 680;
    }
    .mv2-guide-grade-stop {
      text-align: center;
      opacity: 0.62;
    }
    .mv2-guide-grade-stop.is-active {
      color: var(--mv2a-text);
      opacity: 1;
    }
    .mv2-guide-horizons {
      margin-top: 0.14rem;
      display: grid;
      gap: 0.12rem;
    }
    .mv2-guide-horizon {
      display: grid;
      grid-template-columns: 3.9rem 1fr;
      align-items: baseline;
      gap: 0.28rem;
      padding: 0.28rem 0;
      border-radius: 0;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(168, 134, 32, 0.16);
    }
    .mv2-guide-horizon-k {
      font-size: 0.56rem;
      line-height: 1.2;
      color: var(--mv2a-muted);
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .mv2-guide-horizon-v {
      font-size: 0.63rem;
      line-height: 1.3;
      color: var(--mv2a-text-body);
      font-weight: 640;
    }
    .mv2-guide-lane-pin.is-peak {
      background: rgba(75, 75, 75, 0.88);
    }
    .mv2-guide-lane-pin.is-continuous {
      background: #a3a3a3;
    }
    .mv2-guide-horizon-stack {
      display: grid;
      gap: 0.4rem;
      margin: 0.22rem 0 0.28rem;
    }
    .mv2-guide-horizon-card {
      border-radius: 10px;
      border: 1px solid rgba(168, 134, 32, 0.12);
      background: var(--mv2a-section-inner);
      padding: 0.48rem 0.55rem;
    }
    .mv2-card--guide-soft .mv2-guide-horizon-card {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .mv2-guide-horizon-card--ceiling {
      border-color: rgba(168, 134, 32, 0.14);
      background: var(--mv2a-section-inner);
    }
    .mv2-card--guide-soft .mv2-guide-horizon-card--ceiling {
      background: var(--mv2a-section-inner);
    }
    .mv2-guide-horizon-card-k {
      display: block;
      margin: 0 0 0.1rem;
      font-size: 0.58rem;
      line-height: 1.2;
      color: var(--mv2a-muted);
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: none;
    }
    .mv2-guide-horizon-card-line {
      display: block;
      font-size: 0.78rem;
      line-height: 1.28;
      color: var(--mv2a-text-body);
      font-weight: 760;
    }
    .mv2-guide-horizon-card-mode {
      display: block;
      margin-top: 0.08rem;
      font-size: 0.64rem;
      line-height: 1.3;
      color: var(--mv2a-muted);
      font-weight: 650;
    }
    .mv2-guide-horizon-card-hint {
      margin: 0.12rem 0 0;
      font-size: 0.56rem;
      line-height: 1.36;
      color: var(--mv2a-muted);
      font-weight: 520;
      font-style: normal;
    }
    .mv2-guide-horizon-card-sub {
      margin: 0.1rem 0 0;
      font-size: 0.6rem;
      line-height: 1.34;
      color: var(--mv2a-muted);
      font-weight: 560;
    }
    .mv2-guide-belief {
      margin-bottom: 0.28rem;
    }
    .mv2-guide-belief-tier {
      display: grid;
      gap: 0.06rem;
      padding: 0.35rem 0 0.4rem;
      border-radius: 0;
      border: none;
      border-bottom: 1px solid rgba(168, 134, 32, 0.16);
      margin-bottom: 0;
      background: transparent;
    }
    .mv2-guide-belief-tier:last-of-type {
      margin-bottom: 0.14rem;
    }
    .mv2-guide-belief-k {
      font-size: 0.6rem;
      line-height: 1.2;
      color: var(--mv2a-text);
      font-weight: 750;
    }
    .mv2-guide-belief-v {
      font-size: 0.6rem;
      line-height: 1.36;
      color: var(--mv2a-text-body);
      font-weight: 580;
    }
    .mv2-guide-belief-note {
      margin: 0;
      font-size: 0.56rem;
      line-height: 1.38;
      color: var(--mv2a-muted);
      font-weight: 520;
      font-style: italic;
    }
    .mv2-guide-closing {
      margin: 0.28rem 0 0;
      font-size: 0.72rem;
      line-height: 1.32;
      font-weight: 720;
      text-align: center;
      color: var(--mv2a-text-body);
    }
    .mv2-guide-mode {
      margin: 0 0 0.24rem;
      font-size: 0.63rem;
      line-height: 1.34;
      color: var(--mv2a-muted);
      font-weight: 560;
    }
    .mv2-guide-steps {
      display: grid;
      gap: 0.24rem;
      margin-bottom: 0.3rem;
    }
    .mv2-guide-step {
      padding: 0.34rem 0;
      border-radius: 0;
      border: none;
      border-bottom: 1px solid rgba(168, 134, 32, 0.16);
      background: transparent;
    }
    .mv2-guide-step-k {
      margin: 0 0 0.08rem;
      font-size: 0.59rem;
      line-height: 1.25;
      color: var(--mv2a-muted);
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .mv2-guide-step-v {
      margin: 0 0 0.06rem;
      font-size: 0.79rem;
      line-height: 1.28;
      color: var(--mv2a-text-body);
      font-weight: 760;
    }
    .mv2-guide-step-d {
      margin: 0;
      font-size: 0.61rem;
      line-height: 1.32;
      color: var(--mv2a-muted);
      font-weight: 500;
    }
    .mv2-guide-bottom {
      border-top: 1px solid #e5e5e5;
      padding-top: 0.4rem;
    }
    .mv2-guide-boost-inline {
      margin: 0 0 0.22rem;
      font-size: 0.6rem;
      line-height: 1.34;
      color: var(--mv2a-muted);
      font-weight: 560;
      text-align: center;
    }
    .mv2-guide-bonus-total {
      margin: 0 0 0.18rem;
      font-size: 0.66rem;
      line-height: 1.28;
      color: var(--mv2a-text);
      font-weight: 700;
    }
    .mv2-guide-weekday-chart {
      margin-top: 0.28rem;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 0.22rem;
      padding: 0.22rem 0.08rem 0.02rem;
    }
    .mv2-guide-weekday {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.12rem;
      min-width: 1.05rem;
    }
    .mv2-guide-weekday-dot {
      border-radius: 999px;
      background: rgba(120, 120, 120, 0.42);
      border: 1px solid #bdbdbd;
      box-sizing: border-box;
      display: block;
    }
    .mv2-guide-weekday.is-primary .mv2-guide-weekday-dot {
      background: linear-gradient(165deg, #d4d4d4 0%, #9ca3af 45%, #525252 100%);
      border-color: rgba(17, 17, 17, 0.38);
      box-shadow: none;
    }
    .mv2-guide-weekday.is-secondary .mv2-guide-weekday-dot {
      background: linear-gradient(165deg, rgba(212,212,212,0.72) 0%, rgba(115,115,115,0.68) 100%);
      border-color: rgba(17, 17, 17, 0.28);
    }
    .mv2-guide-weekday-lbl {
      font-size: 0.52rem;
      color: var(--mv2a-muted);
      line-height: 1;
      font-weight: 650;
    }
    .mv2-guide-weekday.is-primary .mv2-guide-weekday-lbl {
      color: var(--mv2a-text);
      font-weight: 750;
    }
    .mv2-guide-boost-wrap {
      margin-top: 0.12rem;
    }
    .mv2-guide-gauge {
      position: relative;
      width: 100%;
      max-width: 8.8rem;
      margin: 0 auto 0.08rem;
      aspect-ratio: 2 / 1;
      border-radius: 999px 999px 0 0;
      overflow: hidden;
      opacity: 0.72;
    }
    .mv2-guide-gauge::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: conic-gradient(
        from 180deg,
        rgba(75, 75, 75, 0.84) 0deg,
        rgba(17, 17, 17, 0.75) calc(var(--mv2-guide-gauge-pct, 0) * 1.8deg),
        rgba(0, 0, 0, 0.08) calc(var(--mv2-guide-gauge-pct, 0) * 1.8deg),
        rgba(0, 0, 0, 0.08) 180deg
      );
      mask: radial-gradient(circle at 50% 100%, transparent 58%, #000 59%);
      -webkit-mask: radial-gradient(circle at 50% 100%, transparent 58%, #000 59%);
    }
    .mv2-guide-gauge-core {
      position: absolute;
      inset: auto 0 0;
      text-align: center;
      font-size: 0.8rem;
      line-height: 1;
      font-weight: 700;
      color: var(--mv2a-text);
      padding-bottom: 0.12rem;
    }
    .mv2-guide-gauge-core > span {
      display: block;
      margin-top: 0.11rem;
      font-size: 0.5rem;
      line-height: 1.26;
      color: var(--mv2a-muted);
      font-weight: 620;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .mv2-guide-buff-table {
      border-radius: 0;
      background: transparent;
      border: none;
      border-top: 1px solid #e5e5e5;
      padding: 0.28rem 0 0.16rem;
    }
    .mv2-guide-buff-title {
      font-size: 0.56rem;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--mv2a-text);
      font-weight: 700;
      margin: 0 0 0.08rem;
    }
    .mv2-guide-buff-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.42rem;
      padding: 0.18rem 0;
      font-size: 0.61rem;
      line-height: 1.32;
      color: var(--mv2a-muted);
    }
    .mv2-guide-buff-row > :nth-child(2) {
      text-align: right;
      font-weight: 700;
      color: var(--mv2a-text-body);
    }
    .mv2-guide-progress {
      margin-top: 0.34rem;
    }
    .mv2-guide-progress-head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.4rem;
      align-items: baseline;
      margin-bottom: 0.12rem;
    }
    .mv2-guide-progress-meta {
      margin: 0;
      font-size: 0.61rem;
      line-height: 1.34;
      color: var(--mv2a-muted);
      font-weight: 560;
    }
    .mv2-guide-progress-meta--target {
      text-align: right;
      color: var(--mv2a-gold-dim);
      font-weight: 700;
    }
    .mv2-guide-progress-bar {
      height: 6px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(232, 200, 74, 0.14);
      position: relative;
    }
    .mv2-guide-progress-bar::after {
      content: "";
      position: absolute;
      right: 0.16rem;
      top: 50%;
      width: 0;
      height: 0;
      border-top: 3px solid transparent;
      border-bottom: 3px solid transparent;
      border-left: 4px solid rgba(168, 134, 32, 0.42);
      transform: translateY(-50%);
    }
    .mv2-guide-progress-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #dcb44a 0%, #e8c84a 50%, #f5e6a8 100%);
      box-shadow: none;
      min-width: 4%;
      transform-origin: left center;
      animation: mv2GuideProgressGrow 850ms ease-out both;
    }
    .mv2-guide-progress-inline {
      margin: 0.12rem 0 0;
      font-size: 0.59rem;
      line-height: 1.3;
      color: var(--mv2a-muted);
      font-weight: 580;
    }
    .mv2-guide-progress-note {
      margin: 0.22rem 0 0;
      font-size: 0.54rem;
      line-height: 1.3;
      color: var(--mv2a-muted);
      opacity: 0.72;
      font-weight: 450;
    }
    @keyframes mv2GuideProgressGrow {
      from { transform: scaleX(0.08); opacity: 0.6; }
      to { transform: scaleX(1); opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .mv2-guide-progress-fill {
        animation: none;
      }
    }
    .mv2-card--top-finder {
      background: transparent;
    }
    .mv2-decision-top {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      margin-bottom: 0.42rem;
    }
    .mv2-decision-badge-stack {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.22rem;
      min-width: 2.55rem;
    }
    .mv2-decision-fit-kicker {
      font-size: 0.52rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--mv2a-muted);
      line-height: 1.15;
      text-align: center;
      max-width: 4.2rem;
    }
    .mv2-decision-badge {
      flex-shrink: 0;
      width: 2.35rem;
      height: 2.35rem;
      border-radius: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.05rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0.02em;
      border: 1px solid var(--mv2a-gold-dim);
      box-shadow: none;
    }
    .mv2-decision-badge--s {
      color: #fffef8;
      background: linear-gradient(155deg, #c9a227 0%, #8f7318 100%);
      border-color: #a88620;
    }
    .mv2-decision-badge--a {
      color: #5c4a1f;
      background: linear-gradient(180deg, #fff8e8 0%, #f5e6c8 100%);
      border-color: var(--mv2a-gold-dim);
    }
    .mv2-decision-badge--b {
      color: #5c4a1f;
      background: #fffef6;
      border-color: rgba(168, 134, 32, 0.38);
    }
    .mv2-decision-badge--c {
      color: var(--mv2a-muted);
      background: transparent;
      border-color: rgba(168, 134, 32, 0.26);
    }
    .mv2-decision-copy { min-width: 0; flex: 1; }
    .mv2-card--decision .mv2-decision-copy h2 {
      margin: 0 0 0.18rem;
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--mv2a-gold-dim);
      line-height: 1.2;
    }
    .mv2-decision-verdict {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 750;
      color: var(--mv2a-text-body);
      line-height: 1.25;
    }
    .mv2-decision-reason {
      margin: 0 0 0.36rem;
      font-size: 0.74rem;
      line-height: 1.45;
      color: var(--mv2a-text-body);
      font-weight: 500;
    }
    .mv2-decision-secondary {
      margin-top: 0.08rem;
      padding-top: 0.42rem;
      border-top: 1px solid rgba(168, 134, 32, 0.16);
    }
    .mv2-decision-baseline {
      margin: 0 0 0.28rem;
      padding: 0;
      font-size: 0.63rem;
      line-height: 1.38;
      color: var(--mv2a-muted);
      font-weight: 500;
      border-radius: 0;
      background: transparent;
      border: none;
      opacity: 0.92;
    }
    .mv2-decision-scan {
      margin: 0;
      padding: 0;
      font-size: 0.63rem;
      line-height: 1.4;
      color: var(--mv2a-muted);
      font-weight: 600;
      border-radius: 0;
      background: transparent;
      border: none;
      opacity: 0.9;
    }
    .mv2-decision-next {
      margin: 0;
      font-size: 0.68rem;
      line-height: 1.42;
      color: var(--mv2a-muted);
      font-weight: 500;
    }
    .mv2a-card h2, .mv2-card h2 { font-size: 0.95rem; margin: 0 0 0.5rem; color: var(--mv2a-gold-dim); font-weight: 600; font-family: inherit; }
    .mv2a-hint { font-size: 0.68rem; color: var(--mv2a-muted); margin: 0 0 0.6rem; }
    .mv2a-graph-card {
      margin-top: 0;
      margin-bottom: 0.35rem;
      background: var(--mv2a-section-bg-b);
    }
    .mv2a-graph-card > h2 { font-size: 1.02rem; color: var(--mv2a-gold-dim); margin: 0 0 0.28rem; }
    .mv2a-graph-card > .mv2a-hint { margin: 0 0 0.35rem; }
    .mv2a-radar-wrap { max-width: 18rem; margin: 0 auto; }
    .mv2a-radar-plot { position: relative; container-type: inline-size; }
    .mv2a-radar-svg { width: 100%; height: auto; display: block; overflow: visible; }
    .mv2a-radar-svg--animate .mv2a-radar-layer--owner,
    .mv2a-radar-svg--animate .mv2a-radar-layer--amulet {
      transform-box: view-box;
      transform-origin: 50% 50%;
      opacity: 0;
      transform: scale(0);
    }
    .mv2a-radar-svg--animate .mv2a-radar-layer--peak { opacity: 0; }
    .mv2a-radar-labels {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    @media (prefers-reduced-motion: no-preference) {
      .mv2a-radar-svg--animate .mv2a-radar-layer--owner {
        animation: mv2aRdrPoly 1.55s cubic-bezier(0.22, 1, 0.36, 1) 0.2s forwards;
      }
      .mv2a-radar-svg--animate .mv2a-radar-layer--amulet {
        animation: mv2aRdrPoly 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.58s forwards;
      }
      .mv2a-radar-svg--animate .mv2a-radar-layer--peak {
        animation: mv2aRdrFade 0.6s ease-out 1.38s forwards;
      }
      .mv2a-radar-peak {
        animation: mv2aLblPulse 2.3s ease-in-out 2.1s infinite;
      }
      .mv2a-radar-peak-secondary {
        animation: mv2aLblPulseRed 2.3s ease-in-out 2.22s infinite;
      }
      /* พลังเด่นสุด: จังหวะเดียวกับ moldaviteReportV2 (.mv2-radar-lbl--peak + mv2LblPulse) */
      .mv2a-radar-lbl--top1 {
        animation: mv2aRadarTop1Pulse 1.2s ease-in-out 2.6s infinite;
      }
      .mv2a-radar-lbl--top2 {
        animation: mv2aRadarTop2Pulse 1.2s ease-in-out 2.72s infinite;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .mv2a-radar-svg--animate .mv2a-radar-layer,
      .mv2a-radar-peak,
      .mv2a-radar-peak-secondary {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
      .mv2a-radar-lbl--top1,
      .mv2a-radar-lbl--top2 {
        animation: none !important;
        opacity: 1 !important;
      }
    }
    @keyframes mv2aRdrPoly {
      0% { opacity: 0; transform: scale(0); }
      40% { opacity: 0.6; transform: scale(1.08); }
      70% { opacity: 0.9; transform: scale(0.97); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes mv2aRdrFade {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes mv2aLblPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.55; }
    }
    @keyframes mv2aLblPulseRed {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes mv2aRadarTop1Pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    @keyframes mv2aRadarTop2Pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.48; }
    }
    .mv2a-radar-lbl {
      position: absolute;
      white-space: nowrap;
      font-family: inherit;
      font-size: clamp(10px, 4.2cqw, 12px);
      line-height: 1.18;
      letter-spacing: 0.01em;
    }
    .mv2a-radar-lbl--protection {
      top: 1.6%;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
    }
    .mv2a-radar-lbl--metta {
      top: 20%;
      right: -1%;
      text-align: right;
    }
    .mv2a-radar-lbl--baramee {
      top: 69%;
      right: 1%;
      text-align: right;
    }
    .mv2a-radar-lbl--luck {
      bottom: 1.6%;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
    }
    .mv2a-radar-lbl--fortune_anchor {
      top: 69%;
      left: 1%;
      text-align: left;
    }
    .mv2a-radar-lbl--specialty {
      top: 20%;
      left: -1%;
      text-align: left;
    }
    .mv2a-radar-axis-t { color: var(--mv2a-radar-lbl-axis); font-weight: 600; }
    .mv2a-radar-axis-n { color: var(--mv2a-radar-lbl-num); font-weight: 700; }
    .mv2a-radar-lbl--top1 { font-size: clamp(11px, 4.65cqw, 13px); text-shadow: none; }
    .mv2a-radar-lbl--top1 .mv2a-radar-axis-t { color: var(--mv2a-radar-lbl-top1-t); font-weight: 700; }
    .mv2a-radar-lbl--top1 .mv2a-radar-axis-n { color: var(--mv2a-radar-lbl-top1-n); font-weight: 800; }
    .mv2a-radar-lbl--top2 { font-size: clamp(10.5px, 4.35cqw, 12.5px); }
    .mv2a-radar-lbl--top2 .mv2a-radar-axis-t { color: var(--mv2a-radar-lbl-top2-t); font-weight: 650; }
    .mv2a-radar-lbl--top2 .mv2a-radar-axis-n { color: var(--mv2a-radar-lbl-top2-n); }
    .mv2a-radar-key {
      margin: 0.3rem 0 0;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.48rem;
      font-size: 0.58rem;
      font-weight: 500;
      color: var(--mv2a-radar-key);
    }
    .mv2a-radar-key-chip { display: inline-flex; align-items: center; gap: 0.3rem; }
    .mv2a-radar-dot {
      width: 0.44rem;
      height: 0.44rem;
      border-radius: 50%;
      border: 1px solid var(--mv2a-radar-dot-border);
      display: inline-block;
    }
    .mv2a-radar-dot--owner { background: var(--mv2a-radar-dot-owner); }
    .mv2a-radar-dot--amulet { background: var(--mv2a-radar-dot-amulet); }
    .mv2-gsum-rows { display: flex; flex-direction: column; gap: 0; }
    .mv2-gsum-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.48rem 0;
      border-radius: 0;
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--mv2a-gsum-border);
      box-shadow: none;
    }
    .mv2-gsum-row:last-child { border-bottom: none; }
    .mv2-gsum-row:not(.mv2-gsum-row--lead) { padding: 0.42rem 0; }
    .mv2-gsum-row--lead {
      background: transparent;
      border-color: var(--mv2a-gsum-lead-border);
      border-bottom-width: 1px;
      border-bottom-style: solid;
    }
    .mv2-gsum-k { font-size: 0.72rem; font-weight: 500; color: var(--mv2a-gsum-k); white-space: nowrap; flex-shrink: 0; }
    .mv2-gsum-v {
      font-size: 0.92rem;
      font-weight: 800;
      color: var(--mv2a-gsum-v);
      text-align: right;
      flex: 1;
      min-width: 0;
      line-height: 1.25;
    }
    .mv2-gsum-row--lead .mv2-gsum-v { color: var(--mv2a-gsum-v-lead); }
    .mv2-card--gsum-follow .mv2-gsum-row--lead { box-shadow: none; }
    .mv2-gsum-row--tension {
      padding: 0.4rem 0;
      background: transparent;
      border-bottom: 1px dashed #bdbdbd;
      border-top: none;
      border-left: none;
      border-right: none;
      opacity: 0.96;
    }
    .mv2-gsum-row--tension .mv2-gsum-k { font-size: 0.68rem; }
    .mv2-gsum-row--tension .mv2-gsum-v { font-size: 0.82rem; font-weight: 700; }
    .mv2-card--use-day {
      margin: 0.5rem 0 0.4rem;
      padding-top: 0.72rem;
      padding-bottom: 0.78rem;
      background: var(--mv2a-section-bg-c);
    }
    .mv2-card--use-day > h2 {
      font-size: 0.72rem;
      margin: 0 0 0.42rem;
      color: var(--mv2a-muted);
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .mv2-use-day-main {
      margin: 0 0 0.38rem;
      font-size: 1.18rem;
      font-weight: 800;
      line-height: 1.2;
      color: var(--mv2a-text);
      letter-spacing: -0.02em;
    }
    .mv2-use-day-secondary {
      margin: -0.2rem 0 0.42rem;
      font-size: 0.74rem;
      line-height: 1.35;
      color: var(--mv2a-muted);
      font-weight: 550;
    }
    .mv2-use-day-weekday-tip {
      margin: 0 0 0.32rem;
      font-size: 0.76rem;
      line-height: 1.4;
      color: var(--mv2a-text-body);
      font-weight: 500;
    }
    .mv2-use-day-reason {
      margin: 0 0 0.28rem;
      font-size: 0.78rem;
      line-height: 1.38;
      color: var(--mv2a-text-body);
      font-weight: 500;
    }
    .mv2-use-day-action {
      margin: 0 0 0.02rem;
      font-size: 0.72rem;
      line-height: 1.38;
      color: var(--mv2a-muted);
    }
    .mv2-use-day-chip-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.5rem;
      margin: 0.42rem 0 0.28rem;
    }
    .mv2-use-day-chip-k {
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--mv2a-muted);
    }
    .mv2-use-day-chip-v {
      font-size: 0.74rem;
      font-weight: 650;
      padding: 0;
      border-radius: 0;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(168, 134, 32, 0.16);
      color: var(--mv2a-text-body);
      line-height: 1.3;
    }
    /* ===== Use-day mini bars (style B) ===== */
    .mv2-use-day-bars {
      margin-top: 0.62rem;
      padding-top: 0.56rem;
      border-top: 1px solid rgba(75, 75, 75, 0.12);
    }
    .mv2-use-day-bars-h {
      margin: 0 0 0.48rem;
      font-size: 0.62rem;
      line-height: 1.25;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--mv2a-muted);
      text-transform: uppercase;
    }
    .mv2-use-day-bars-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 0.34rem;
    }
    .mv2-use-day-bar {
      display: flex;
      flex: 1 1 0;
      min-width: 0;
      flex-direction: column;
      align-items: center;
      gap: 0.22rem;
    }
    .mv2-use-day-bar-label {
      font-size: 0.54rem;
      line-height: 1;
      color: var(--mv2a-muted);
      font-weight: 600;
      text-align: center;
    }
    .mv2-use-day-bar-col {
      position: relative;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      width: 100%;
      max-width: 1.4rem;
      height: 3.2rem;
      padding: 0.16rem 0;
      border-radius: 0;
      background: rgba(232, 200, 74, 0.08);
      border: 1px solid rgba(168, 134, 32, 0.26);
      overflow: hidden;
    }
    .mv2-use-day-bar-fill {
      display: block;
      width: 100%;
      border-radius: 999px;
      background: rgba(168, 134, 32, 0.38);
      min-height: 0.36rem;
    }
    .mv2-use-day-bar-score {
      font-size: 0.56rem;
      line-height: 1;
      color: var(--mv2a-muted);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    .mv2-use-day-bar.is-primary .mv2-use-day-bar-label {
      color: var(--mv2a-text);
      font-weight: 800;
    }
    .mv2-use-day-bar.is-primary .mv2-use-day-bar-col {
      background: rgba(201, 162, 39, 0.1);
      border-color: var(--mv2a-gold-dim);
      box-shadow: none;
    }
    .mv2-use-day-bar.is-primary .mv2-use-day-bar-fill {
      background: linear-gradient(180deg, #f5e6a8 0%, #dcb44a 48%, #a88620 100%);
    }
    .mv2-use-day-bar.is-primary .mv2-use-day-bar-score {
      color: var(--mv2a-text);
    }
    .mv2-use-day-bar.is-secondary .mv2-use-day-bar-label {
      color: var(--mv2a-muted);
      font-weight: 700;
    }
    .mv2-use-day-bar.is-secondary .mv2-use-day-bar-col {
      background: rgba(201, 162, 39, 0.05);
      border-color: rgba(168, 134, 32, 0.22);
    }
    .mv2-use-day-bar.is-secondary .mv2-use-day-bar-fill {
      background: linear-gradient(180deg, rgba(212,212,212,0.78) 0%, rgba(130,130,130,0.72) 60%, rgba(82,82,82,0.68) 100%);
    }
    .mv2-use-day-bar.is-secondary .mv2-use-day-bar-score {
      color: var(--mv2a-muted);
    }
    .mv2-use-day-bar:not(.is-primary):not(.is-secondary) .mv2-use-day-bar-fill {
      background: linear-gradient(180deg, rgba(160,160,160,0.55) 0%, rgba(120,120,120,0.5) 100%);
    }
    @media (max-width: 520px) {
      .mv2-use-day-bars {
        margin-top: 0.5rem;
        padding-top: 0.45rem;
      }
      .mv2-use-day-bars-h {
        margin-bottom: 0.38rem;
        font-size: 0.58rem;
      }
      .mv2-use-day-bars-row {
        gap: 0.24rem;
      }
      .mv2-use-day-bar-col {
        max-width: 1.18rem;
        height: 2.9rem;
      }
      .mv2-use-day-bar-label {
        font-size: 0.5rem;
      }
      .mv2-use-day-bar-score {
        font-size: 0.52rem;
      }
    }
    .mv2-life-rows { display: flex; flex-direction: column; gap: 0; margin: 0.35rem 0 0; border-radius: 0; overflow: visible; border: none; border-top: 1px solid var(--mv2a-life-border); }
    .mv2-life-row { display: grid; grid-template-columns: minmax(4.2rem, 5.2rem) 2.1rem 1fr; gap: 0.45rem; align-items: start; padding: 0.42rem 0.5rem; font-size: 0.78rem; border-top: 1px solid var(--mv2a-life-row-border); transition: opacity 0.15s ease; }
    .mv2-life-row:first-child { border-top: none; }
    .mv2-life-row:nth-child(odd) { background: var(--mv2a-life-row-alt); }
    .mv2-life-row--r1,
    .mv2-life-row--r2 {
      padding-top: 0.55rem;
      padding-bottom: 0.55rem;
      font-size: 0.84rem;
      border-top-color: rgba(0, 0, 0, 0.08);
    }
    .mv2-life-row--r1 .mv2-life-name { font-weight: 800; font-size: 0.86rem; letter-spacing: -0.01em; }
    .mv2-life-row--r2 .mv2-life-name { font-weight: 700; font-size: 0.84rem; }
    .mv2-life-row--r1 .mv2-life-score { font-size: 0.82rem; font-weight: 800; }
    .mv2-life-row--r2 .mv2-life-score { font-size: 0.8rem; }
    .mv2-life-row--r1 .mv2-life-blurb,
    .mv2-life-row--r2 .mv2-life-blurb { opacity: 0.98; }
    .mv2-life-row--r3,
    .mv2-life-row--r4 {
      opacity: 0.94;
      font-size: 0.77rem;
      padding-top: 0.4rem;
      padding-bottom: 0.4rem;
    }
    .mv2-life-row--r5,
    .mv2-life-row--r6 {
      opacity: 0.72;
      padding-top: 0.34rem;
      padding-bottom: 0.34rem;
      font-size: 0.72rem;
    }
    .mv2-life-row--r5 .mv2-life-name,
    .mv2-life-row--r6 .mv2-life-name { font-weight: 550; }
    .mv2-life-row--r5 .mv2-life-score,
    .mv2-life-row--r6 .mv2-life-score { font-size: 0.72rem; font-weight: 650; }
    .mv2-life-row--r5 .mv2-life-blurb,
    .mv2-life-row--r6 .mv2-life-blurb { opacity: 0.88; }
    .mv2-life-name { font-weight: 600; color: var(--mv2a-life-name); }
    .mv2-life-score { color: var(--mv2a-life-score); font-weight: 700; font-size: 0.76rem; text-align: right; }
    .mv2-life-blurb { color: var(--mv2a-life-blurb); line-height: 1.35; }
    .mv2-life-hint { margin: 0 0 0.45rem; font-size: 0.65rem; color: var(--mv2a-muted); opacity: 0.8; }
    /* Footer disclaimer: inside .mv2-trust (replaces former trustNote slot) — no card */
    .mv2-trust .mv2a-footer-note {
      margin: 0 0 0.85rem;
      padding: 0 0.2rem;
      font-size: 0.8rem;
      line-height: 1.55;
      color: var(--mv2a-footer-note);
      text-align: center;
      font-weight: 400;
    }
    .mv2-timing-card {
      border-left: none;
    }
    .mv2-timing-card h2 { font-size: 0.95rem; margin: 0; color: var(--mv2a-text); }
    .mv2-timing-head { margin-bottom: 0.48rem; }
    .mv2-timing-sub {
      margin: 0.22rem 0 0;
      font-size: 0.7rem;
      line-height: 1.4;
      color: var(--mv2a-muted);
      font-weight: 500;
    }
    .mv2-timing-boost-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.22rem 0.38rem;
      margin: 0.26rem 0 0;
      opacity: 0.92;
    }
    .mv2-timing-boost-chip {
      display: inline-block;
      padding: 0;
      border-radius: 0;
      font-size: 0.52rem;
      font-weight: 650;
      letter-spacing: 0.02em;
      color: var(--mv2a-muted);
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(168, 134, 32, 0.16);
      line-height: 1.18;
    }
    .mv2-timing-boost-micro {
      flex: 1 1 12rem;
      min-width: 0;
      font-size: 0.54rem;
      line-height: 1.3;
      color: var(--mv2a-muted);
      font-weight: 400;
      opacity: 0.82;
    }
    .mv2-timing-trends { display: grid; gap: 0.55rem; }
    .mv2-timing-trend {
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(168, 134, 32, 0.16);
      border-radius: 0;
      padding: 0.52rem 0;
    }
    .mv2-timing-trend:last-child {
      border-bottom: none;
    }
    .mv2-timing-trend-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.45rem;
    }
    .mv2-timing-trend-k {
      font-size: 0.66rem;
      font-weight: 600;
      color: var(--mv2a-muted);
    }
    .mv2-timing-trend-v {
      font-size: 0.78rem;
      font-weight: 800;
      color: var(--mv2a-text);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    /* Weekday = เม็ดเน้น (โทนเทา) */
    .mv2-et-strip--weekday {
      display: flex;
      flex-wrap: nowrap;
      gap: 0.26rem;
      align-items: flex-end;
      justify-content: space-between;
    }
    .mv2-et-strip--weekday .mv2-et-pill {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.28rem;
      flex: 1;
      min-width: 0;
      position: relative;
      transition: opacity 0.15s ease;
    }
    .mv2-et-pill-shape {
      display: block;
      width: 100%;
      max-width: 1.95rem;
      min-width: 1.22rem;
      margin: 0 auto;
      border-radius: 999px;
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
    }
    .mv2-et-pill-shape::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: transparent;
      opacity: 0;
      pointer-events: none;
    }
    .mv2-et-strip--weekday .mv2-et-pill:not(.is-active) { opacity: 0.5; }
    .mv2-et-strip--weekday .mv2-et-pill:not(.is-active) .mv2-et-pill-shape {
      background: rgba(232, 200, 74, 0.1);
      border: 1px solid rgba(168, 134, 32, 0.24);
      box-shadow: none;
    }
    .mv2-et-strip--weekday .mv2-et-pill:not(.is-active) .mv2-et-pill-label {
      color: var(--mv2a-muted);
      font-weight: 500;
    }
    .mv2-et-strip--weekday .mv2-et-pill.is-active { opacity: 1; }
    .mv2-et-strip--weekday .mv2-et-pill.is-active .mv2-et-pill-shape {
      background: linear-gradient(165deg, #fff4cc 0%, #e8c84a 40%, #c9a227 100%);
      border: 1px solid var(--mv2a-gold-dim);
      box-shadow: 0 0 0 1px rgba(232, 200, 74, 0.35);
    }
    .mv2-et-strip--weekday .mv2-et-pill.is-active .mv2-et-pill-shape::after { opacity: 0; }
    .mv2-et-pill-label {
      font-size: 0.56rem;
      text-align: center;
      line-height: 1.15;
      max-width: 100%;
    }
    .mv2-et-strip--weekday .mv2-et-pill.is-active .mv2-et-pill-label {
      color: var(--mv2a-gold-deep);
      font-weight: 800;
    }
    .mv2-et-pill-sr {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      white-space: nowrap;
      border: 0;
    }
    /* Time = แท่งแคบ bronze */
    .mv2-et-strip--time {
      display: flex;
      flex-wrap: nowrap;
      gap: 0.28rem;
      align-items: flex-end;
      justify-content: space-between;
    }
    .mv2-et-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.26rem;
      flex: 1;
      min-width: 0;
      transition: opacity 0.15s ease;
    }
    .mv2-et-slot-bar {
      display: block;
      width: 0.42rem;
      max-width: 40%;
      min-width: 5px;
      margin: 0 auto;
      border-radius: 6px;
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
    }
    .mv2-et-slot-bar::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: transparent;
      opacity: 0;
      pointer-events: none;
    }
    .mv2-et-slot:not(.is-active) { opacity: 0.48; }
    .mv2-et-slot:not(.is-active) .mv2-et-slot-bar {
      background: rgba(232, 200, 74, 0.12);
      border: 1px solid rgba(168, 134, 32, 0.24);
      box-shadow: none;
    }
    .mv2-et-slot:not(.is-active) .mv2-et-slot-label {
      color: var(--mv2a-muted);
      font-weight: 500;
    }
    .mv2-et-slot.is-active { opacity: 1; }
    .mv2-et-slot.is-active .mv2-et-slot-bar {
      width: 0.5rem;
      max-width: 46%;
      background: linear-gradient(180deg, #f5e6a8 0%, #dcb44a 45%, #a88620 100%);
      border: 1px solid var(--mv2a-gold-dim);
      box-shadow: 0 0 10px rgba(232, 200, 74, 0.4);
    }
    .mv2-et-slot.is-active .mv2-et-slot-bar::after { opacity: 0; }
    .mv2-et-slot-label {
      font-size: 0.48rem;
      text-align: center;
      line-height: 1.12;
      max-width: 100%;
    }
    .mv2-et-slot.is-active .mv2-et-slot-label {
      color: var(--mv2a-gold-dim);
      font-weight: 800;
    }
    .mv2-timing-insight {
      margin-top: 0.58rem;
      padding: 0.62rem 0;
      border-radius: 0;
      background: transparent;
      border: none;
      border-top: 1px solid #e5e5e5;
    }
    .mv2-timing-k--mode {
      display: block;
      font-size: 0.62rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mv2a-text);
      margin: 0 0 0.55rem;
    }
    .mv2-timing-mode-body {
      margin: 0;
      font-size: 0.88rem;
      line-height: 1.55;
      font-weight: 800;
      color: var(--mv2a-text-body);
    }
    .mv2-timing-hint {
      margin: 0.72rem 0 0;
      padding-top: 0.62rem;
      border-top: 1px solid rgba(75, 75, 75, 0.12);
      font-size: 0.68rem;
      line-height: 1.62;
      color: var(--mv2a-muted);
      font-weight: 400;
    }
    .mv2-timing-hint--compact {
      margin: 0.45rem 0 0;
      padding-top: 0.4rem;
      font-size: 0.63rem;
      line-height: 1.42;
    }
    @media (max-width: 520px) {
      .mv2-timing-hint--compact {
        margin-top: 0.38rem;
        padding-top: 0.35rem;
        font-size: 0.58rem;
        line-height: 1.36;
      }
    }
    html.mv2a-theme-dark .mv2-timing-trend {
      border-bottom-color: #333333;
    }
    html.mv2a-theme-dark .mv2-et-strip--weekday .mv2-et-pill:not(.is-active) .mv2-et-pill-shape {
      background: rgba(255, 255, 255, 0.06);
      border-color: #525252;
    }
    html.mv2a-theme-dark .mv2-et-strip--weekday .mv2-et-pill:not(.is-active) .mv2-et-pill-label {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-et-slot:not(.is-active) .mv2-et-slot-bar {
      background: rgba(255, 255, 255, 0.08);
      border-color: #525252;
    }
    html.mv2a-theme-dark .mv2-et-slot:not(.is-active) .mv2-et-slot-label {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-timing-insight {
      border-top-color: #333333;
    }
    html.mv2a-theme-dark .mv2-timing-hint {
      border-top-color: #333333;
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-timing-boost-chip {
      color: #a3a3a3;
      border-bottom-color: #333333;
    }
    html.mv2a-theme-dark .mv2-timing-boost-micro {
      color: #a3a3a3;
    }
    .mv2-meta-block {
      margin: 0.38rem 0 0.42rem;
      padding: 0.45rem 0.55rem;
      border-radius: 10px;
      background: var(--mv2a-section-inner);
      border: 1px solid rgba(168, 134, 32, 0.12);
      font-size: 0.64rem;
      line-height: 1.4;
      color: var(--mv2a-muted);
    }
    .mv2-meta-row {
      display: flex;
      gap: 0.5rem;
      justify-content: space-between;
      flex-wrap: wrap;
      margin: 0.12rem 0;
    }
    .mv2-meta-k { font-weight: 700; color: var(--mv2a-text); opacity: 0.82; }
    .mv2-meta-v { text-align: right; font-variant-numeric: tabular-nums; max-width: 68%; }
    .mv2-meta-id { font-weight: 700; letter-spacing: 0.04em; color: var(--mv2a-gold-dim); }
    .mv2-card--daily-owner {
      margin: 0.4rem 0 0.32rem;
      padding-top: 0.55rem;
      padding-bottom: 0.62rem;
    }
    .mv2-card--daily-owner > h2.mv2-daily-owner-h {
      font-size: 0.7rem;
      margin: 0 0 0.28rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: var(--mv2a-muted);
    }
    .mv2-daily-owner-p {
      margin: 0 0 0.18rem;
      font-size: 0.77rem;
      line-height: 1.36;
      color: var(--mv2a-text-body);
    }
    .mv2-daily-owner-p--soft {
      font-size: 0.72rem;
      line-height: 1.34;
      color: var(--mv2a-muted);
    }
    html.mv2a-theme-dark .mv2-meta-block {
      background: var(--mv2a-section-inner);
      border: 1px solid var(--mv2a-section-border);
    }
    html.mv2a-theme-dark .mv2-trust-sources {
      background: rgba(200, 200, 200, 0.05);
      border-color: rgba(200, 200, 200, 0.14);
    }
    html.mv2a-theme-dark .mv2-daily-owner-p {
      color: var(--mv2a-text-body);
    }
    html.mv2a-theme-dark .mv2-daily-owner-p--soft {
      color: var(--mv2a-muted);
    }
    .mv2-faith-progress-top {
      display: flex;
      align-items: flex-start;
      gap: 0.55rem;
      margin-bottom: 0.4rem;
    }
    .mv2-faith-progress-grade {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 0.24rem;
      font-size: 1.52rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.03em;
    }
    .mv2-faith-progress-base {
      color: var(--mv2a-muted);
      font-variant-numeric: tabular-nums;
    }
    .mv2-faith-progress-arrow {
      color: var(--mv2a-muted);
      font-weight: 700;
      font-size: 1.18rem;
      opacity: 0.92;
    }
    .mv2-faith-progress-next {
      color: var(--mv2a-text);
      text-shadow: none;
      font-variant-numeric: tabular-nums;
    }
    .mv2-faith-progress-copy { flex: 1; min-width: 0; }
    .mv2-faith-progress-copy h2 {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--mv2a-text);
      line-height: 1.22;
      opacity: 0.92;
    }
    .mv2-faith-progress-lead {
      margin: 0 0 0.34rem;
      font-size: 0.7rem;
      line-height: 1.34;
      color: var(--mv2a-text-body);
      font-weight: 600;
    }
    .mv2-faith-progress-baseline {
      margin: 0 0 0.26rem;
      font-size: 0.65rem;
      line-height: 1.32;
      color: var(--mv2a-muted);
      font-weight: 500;
      padding: 0;
      border-radius: 0;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(168, 134, 32, 0.16);
      padding-bottom: 0.26rem;
    }
    .mv2-faith-progress-scan {
      margin: 0 0 0.32rem;
      font-size: 0.65rem;
      line-height: 1.32;
      color: var(--mv2a-muted);
      font-weight: 600;
      padding: 0 0 0.26rem;
      border-radius: 0;
      background: transparent;
      border: none;
      border-bottom: 1px dashed #bdbdbd;
    }
    .mv2-faith-progress-metrics {
      display: grid;
      gap: 0.18rem;
      margin: 0 0 0.34rem;
      padding: 0.32rem 0;
      border-radius: 0;
      background: transparent;
      border: none;
      border-top: 1px solid #e5e5e5;
      font-size: 0.64rem;
      line-height: 1.28;
      color: var(--mv2a-text-body);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .mv2-faith-progress-metrics--compact {
      grid-template-columns: 1fr;
      gap: 0.1rem;
    }
    html.mv2a-theme-dark .mv2-card--faith-progress {
      background: var(--mv2a-section-bg-b);
      box-shadow: var(--mv2a-section-shadow);
    }
    html.mv2a-theme-dark .mv2-faith-progress-copy h2 {
      color: var(--mv2a-text);
    }
    html.mv2a-theme-dark .mv2-faith-progress-lead {
      color: var(--mv2a-text-body);
    }
    html.mv2a-theme-dark .mv2-faith-progress-baseline {
      background: transparent;
      border-bottom-color: #333333;
      color: var(--mv2a-muted);
    }
    html.mv2a-theme-dark .mv2-faith-progress-scan {
      background: transparent;
      border-bottom-color: #525252;
      color: var(--mv2a-muted);
    }
    html.mv2a-theme-dark .mv2-faith-progress-metrics {
      background: transparent;
      border-top-color: #333333;
      color: var(--mv2a-text-body);
    }
    @media (max-width: 520px) {
      .mv2-faith-progress-grade { font-size: 1.34rem; }
      .mv2-faith-progress-metrics { font-size: 0.62rem; }
    }
    .mv2-toast {
      position: fixed;
      bottom: 1.25rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 50;
      padding: 0.45rem 0.95rem;
      border-radius: 0;
      background: var(--mv2a-gold-dim);
      color: #fffef8;
      font-size: 0.75rem;
      box-shadow: 0 2px 14px rgba(168, 134, 32, 0.35);
      border: 1px solid var(--mv2a-gold-dim);
    }
    html.mv2a-theme-dark .mv2-toast {
      background: #fafafa;
      color: #111111;
      border-color: #fafafa;
    }
    .mv2-share-btn--secondary {
      background: transparent;
      border: 1px solid var(--mv2a-gold-dim);
      color: var(--mv2a-gold-dim);
      font-weight: 700;
      box-shadow: none;
      border-radius: 0;
    }
    .mv2-share-btn--secondary:hover {
      background: rgba(201, 162, 39, 0.12);
      border-color: var(--mv2a-gold);
    }
    .mv2-share-btn--secondary:active {
      background: rgba(201, 162, 39, 0.18);
    }
    html.mv2a-theme-dark .mv2-share-btn--secondary {
      background: transparent;
      border: 1px solid #fafafa;
      color: #fafafa;
      box-shadow: none;
    }
    html.mv2a-theme-dark .mv2-share-btn--secondary:hover {
      background: rgba(200, 200, 200, 0.14);
      border-color: rgba(200, 200, 200, 0.65);
    }
    .mv2-share-card h2 { font-size: 0.92rem; color: var(--mv2a-gold-dim); }
    .mv2-share-note { margin: 0 0 0.55rem; font-size: 0.68rem; line-height: 1.4; color: var(--mv2a-muted); }
    .mv2-share-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;
    }
    @media (max-width: 520px) {
      .mv2-share-actions { grid-template-columns: 1fr; }
    }
    .mv2-share-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 2.55rem;
      padding: 0.5rem 0.65rem;
      box-sizing: border-box;
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      line-height: 1.28;
      text-align: center;
      text-decoration: none;
      border-radius: 0;
      border: 1px solid transparent;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .mv2-share-btn--primary {
      background: linear-gradient(165deg, #dcb44a 0%, #c9a227 50%, #a88620 100%);
      border-color: #9a7b1e;
      color: #2a2210;
    }
    .mv2-share-btn--primary:hover {
      background: linear-gradient(165deg, #e8c84a 0%, #dcb44a 52%, #c9a227 100%);
      border-color: #a88620;
    }
    .mv2-share-btn--primary:active {
      background: #a88620;
      border-color: #8f7318;
    }
    .mv2-share-stack { display: flex; flex-direction: column; gap: 0.5rem; }
    .mv2-share-line-cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 2.48rem;
      padding: 0.48rem 0.65rem;
      box-sizing: border-box;
      font: inherit;
      font-size: 0.77rem;
      font-weight: 600;
      line-height: 1.25;
      text-align: center;
      text-decoration: none;
      border-radius: 0;
      border: 1px solid var(--mv2a-gold-dim);
      background: transparent;
      color: var(--mv2a-gold-dim);
      -webkit-tap-highlight-color: transparent;
    }
    .mv2-share-line-cta:hover {
      background: rgba(201, 162, 39, 0.08);
      border-color: var(--mv2a-gold);
    }
    html.mv2a-theme-dark .mv2-share-line-cta {
      border-color: #fafafa;
      background: transparent;
      color: #fafafa;
    }
    html.mv2a-theme-dark .mv2-share-line-cta:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    html.mv2a-theme-dark .mv2-use-day-bars {
      border-top-color: #333333;
    }
    html.mv2a-theme-dark .mv2-use-day-bar-label,
    html.mv2a-theme-dark .mv2-use-day-bar-score {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-use-day-bar-col {
      background: rgba(255, 255, 255, 0.06);
      border-color: #525252;
    }
    html.mv2a-theme-dark .mv2-use-day-bar:not(.is-primary):not(.is-secondary) .mv2-use-day-bar-fill {
      background: linear-gradient(180deg, #737373 0%, #525252 100%);
    }
    html.mv2a-theme-dark .mv2-use-day-bar.is-primary .mv2-use-day-bar-label,
    html.mv2a-theme-dark .mv2-use-day-bar.is-primary .mv2-use-day-bar-score {
      color: #fafafa;
    }
    html.mv2a-theme-dark .mv2-use-day-bar.is-primary .mv2-use-day-bar-col {
      background: rgba(255, 255, 255, 0.08);
      border-color: #fafafa;
      box-shadow: none;
    }
    html.mv2a-theme-dark .mv2-use-day-bar.is-primary .mv2-use-day-bar-fill {
      background: linear-gradient(180deg, #e5e5e5 0%, #d4d4d4 44%, #737373 100%);
    }
    html.mv2a-theme-dark .mv2-use-day-bar.is-secondary .mv2-use-day-bar-label,
    html.mv2a-theme-dark .mv2-use-day-bar.is-secondary .mv2-use-day-bar-score {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-use-day-bar.is-secondary .mv2-use-day-bar-col {
      background: rgba(255, 255, 255, 0.05);
      border-color: #525252;
    }
    html.mv2a-theme-dark .mv2-use-day-bar.is-secondary .mv2-use-day-bar-fill {
      background: linear-gradient(180deg, rgba(230,230,230,0.76) 0%, rgba(180,180,180,0.68) 60%, rgba(115,115,115,0.62) 100%);
    }
    html.mv2a-theme-dark .mv2-use-day-chip-v {
      background: transparent;
      border-bottom-color: #333333;
    }
    html.mv2a-theme-dark .mv2-gsum-row--tension {
      background: transparent;
      border-bottom-color: #525252;
    }
    html.mv2a-theme-dark .mv2-gsumx-item {
      background: transparent;
      border-color: #333333;
    }
    html.mv2a-theme-dark .mv2-gsumx-v {
      color: var(--mv2a-text-body);
    }
    html.mv2a-theme-dark .mv2-gsumx-sub {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-card--top-finder {
      background: var(--mv2a-section-bg-b);
    }
    html.mv2a-theme-dark .mv2-card--guide {
      background: var(--mv2a-section-bg-b);
    }
    html.mv2a-theme-dark .mv2-card--guide-soft .mv2-guide-metric {
      background: var(--mv2a-section-inner);
      border-color: var(--mv2a-section-border);
    }
    html.mv2a-theme-dark .mv2-card--guide-soft .mv2-guide-horizon-card {
      background: var(--mv2a-section-inner);
    }
    html.mv2a-theme-dark .mv2-card--guide-soft .mv2-guide-horizon-card--ceiling {
      background: var(--mv2a-section-inner);
    }
    html.mv2a-theme-dark .mv2-guide-hero {
      border-color: #333333;
      background: transparent;
    }
    html.mv2a-theme-dark .mv2-guide-hero-k,
    html.mv2a-theme-dark .mv2-guide-metric-k {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-guide-hero-grade {
      color: #fafafa;
    }
    html.mv2a-theme-dark .mv2-guide-hero-verdict,
    html.mv2a-theme-dark .mv2-guide-verdict-line,
    html.mv2a-theme-dark .mv2-guide-metric-v {
      color: var(--mv2a-text-body);
    }
    html.mv2a-theme-dark .mv2-guide-metric {
      border-color: #333333;
      background: transparent;
    }
    html.mv2a-theme-dark .mv2-guide-grade-line {
      background: rgba(255, 255, 255, 0.12);
    }
    html.mv2a-theme-dark .mv2-guide-lane-pin {
      border-color: #0a0a0a;
      box-shadow: none;
    }
    html.mv2a-theme-dark .mv2-guide-grade-stop {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-guide-grade-stop.is-active {
      color: #fafafa;
    }
    html.mv2a-theme-dark .mv2-guide-horizon {
      border-bottom-color: #333333;
    }
    html.mv2a-theme-dark .mv2-guide-horizon-k {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-guide-horizon-v {
      color: var(--mv2a-text-body);
    }
    html.mv2a-theme-dark .mv2-guide-step {
      border-bottom-color: #333333;
    }
    html.mv2a-theme-dark .mv2-guide-step-v {
      color: var(--mv2a-text-body);
    }
    html.mv2a-theme-dark .mv2-guide-bottom {
      border-top-color: #333333;
    }
    html.mv2a-theme-dark .mv2-guide-boost-inline {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-guide-bonus-total {
      color: #fafafa;
    }
    html.mv2a-theme-dark .mv2-guide-mode,
    html.mv2a-theme-dark .mv2-guide-progress-meta {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-guide-weekday-dot {
      background: rgba(255, 255, 255, 0.2);
      border-color: #525252;
    }
    html.mv2a-theme-dark .mv2-guide-weekday.is-primary .mv2-guide-weekday-dot {
      border-color: #fafafa;
      box-shadow: none;
    }
    html.mv2a-theme-dark .mv2-guide-weekday-lbl {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-guide-buff-row > :nth-child(2) {
      color: var(--mv2a-text-body);
    }
    html.mv2a-theme-dark .mv2-guide-buff-table,
    html.mv2a-theme-dark .mv2-guide-buff-row {
      border-color: #333333;
      background: transparent;
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-guide-buff-title {
      color: #fafafa;
    }
    html.mv2a-theme-dark .mv2-guide-gauge-core {
      color: #fafafa;
    }
    html.mv2a-theme-dark .mv2-guide-gauge-core > span {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-guide-progress-bar {
      background: rgba(255, 255, 255, 0.12);
    }
    html.mv2a-theme-dark .mv2-guide-progress-bar::after {
      border-left-color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-guide-progress-note {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-guide-progress-inline {
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-decision-verdict {
      color: var(--mv2a-text-body);
    }
    html.mv2a-theme-dark .mv2-decision-reason {
      color: var(--mv2a-text-body);
    }
    html.mv2a-theme-dark .mv2-decision-secondary {
      border-top-color: #333333;
    }
    html.mv2a-theme-dark .mv2-decision-baseline {
      background: transparent;
      border: none;
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-decision-scan {
      background: transparent;
      border: none;
      color: #a3a3a3;
    }
    html.mv2a-theme-dark .mv2-decision-badge--c {
      color: #a3a3a3;
      background: transparent;
      border-color: #525252;
    }
    .mv2-share-btn--line {
      background: linear-gradient(165deg, #c9a227 0%, #a88620 100%);
      border-color: #9a7b1e;
      color: #2a2210;
    }
    html.mv2a-theme-dark .mv2-share-btn--primary {
      background: #fafafa;
      border-color: #fafafa;
      color: #0a0a0a;
    }
    html.mv2a-theme-dark .mv2-share-btn--primary:hover {
      background: #e5e5e5;
      border-color: #e5e5e5;
    }
    .mv2-trust { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--mv2a-trust-border); text-align: center; font-size: 0.78rem; color: var(--mv2a-muted); }
    .mv2-render-meta { margin: 0.5rem 0 0; font-size: 0.65rem; color: var(--mv2a-render-meta); }
  </style>
</head>
<body>
  <div class="mv2a-wrap">
    <header class="mv2-hero">
      <div class="mv2a-badge">รายงานฉบับเต็ม</div>
      <div class="mv2-hero-main">
        <div class="mv2-hero-text">
          <h1 class="mv2-h1">${escapeHtml(h.subtypeLabel || "พระเครื่อง")}</h1>
          ${metaBlockHtml}
          <p class="mv2-main">${escapeHtml(h.displayLine || `โทนหลัก · ${h.mainEnergyLabel}`)}</p>
          ${h.clarifierLine ? `<p class="mv2-hero-clarifier">${escapeHtml(h.clarifierLine)}</p>` : ""}
        </div>
        ${heroMediaCol}
      </div>
    </header>

    <div class="mv2-strip" role="group" aria-label="สรุปตัวเลข">
      <div><div class="mv2-strip-k">คะแนนพลัง</div><div class="mv2-strip-v">${escapeHtml(score)}<small> /10</small></div></div>
      <div><div class="mv2-strip-k">เข้ากัน</div><div class="mv2-strip-v">${escapeHtml(compat)}</div></div>
      <div class="mv2-strip-cell mv2-strip-cell--level"><div class="mv2-strip-k">ความเด่นพลังงาน</div><div class="mv2-strip-v ${vm.metrics.energyLevelGradeClass}">${escapeHtml(vm.metrics.energyLevelLabel || "ไม่มี")}</div></div>
    </div>

    ${trustInlineHtml}

    ${mainGraphBlock(vm)}

    <section class="mv2-card mv2-card--gsum-follow" aria-labelledby="mv2-gsum-h">
      <h2 id="mv2-gsum-h">สรุปผล</h2>
      ${graphSummaryHtml}
    </section>

    ${decisionCardHtml}
    ${dailyOwnerCardHtml}
    ${guideCardHtml}

    <section class="mv2-card mv2-share-card" aria-labelledby="mv2-share-h">
      <h2 id="mv2-share-h">แชร์รายงาน</h2>
      <p class="mv2-share-note">แชร์ลิงก์รายงานนี้ หรือเพิ่มเพื่อน LINE OA เพื่อกลับมาดูได้อีกครั้ง</p>
      <div class="mv2-share-stack">
        <div class="mv2-share-actions">
          <button type="button" class="mv2-share-btn mv2-share-btn--primary" id="mv2-btn-share">แชร์รายงาน</button>
          <button type="button" class="mv2-share-btn mv2-share-btn--secondary" id="mv2-btn-copy">คัดลอกลิงก์</button>
        </div>
        <a class="mv2-share-line-cta" href="https://lin.ee/6YZeFZ1" target="_blank" rel="noopener noreferrer">เพิ่มเพื่อน LINE OA</a>
      </div>
    </section>

    <footer class="mv2-trust">
      <p class="mv2a-footer-note" role="note">${usageDisclaimer}</p>
      ${amuletHtmlShowRenderMetaLine() ? `<p class="mv2-render-meta">render ${escapeHtml(vm.rendererId)} · เวอร์ชัน ${escapeHtml(vm.reportVersion)}${vm.modelLabel ? ` · ${escapeHtml(vm.modelLabel)}` : ""}</p>` : ""}
    </footer>
  </div>
  <div id="mv2-copy-toast" class="mv2-toast" role="status" hidden>คัดลอกลิงก์รายงานแล้ว</div>
  <script>
(function () {
  var shareTitle = ${shareTitleJson};
  var shareText = ${shareTextJson};
  var shareBtn = document.getElementById("mv2-btn-share");
  var copyBtn = document.getElementById("mv2-btn-copy");
  var toast = document.getElementById("mv2-copy-toast");
  function showToast() {
    if (!toast) return;
    toast.hidden = false;
    clearTimeout(window.__mv2CopyToastTimer);
    window.__mv2CopyToastTimer = setTimeout(function () { toast.hidden = true; }, 2600);
  }
  function copyUrl() {
    var url = String(window.location.href || "");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () { showToast(); },
        function () { window.prompt("คัดลอกลิงก์:", url); },
      );
    } else {
      window.prompt("คัดลอกลิงก์:", url);
    }
  }
  function doShare() {
    var url = String(window.location.href || "");
    if (navigator.share) {
      navigator
        .share({ title: shareTitle, text: shareText, url: url })
        .catch(function (err) {
          if (err && err.name === "AbortError") return;
          copyUrl();
        });
    } else {
      copyUrl();
    }
  }
  if (shareBtn) shareBtn.addEventListener("click", doShare);
  if (copyBtn) copyBtn.addEventListener("click", copyUrl);
})();
  </script>
</body>
</html>`;
}

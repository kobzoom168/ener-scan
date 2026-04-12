/**
 * Crystal bracelet lane HTML — standalone renderer (does not import Moldavite/amulet templates).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { formatBangkokDateTime } from "../../utils/dateTime.util.js";
import { CRYSTAL_BRACELET_AXIS_ORDER } from "../../crystalBracelet/crystalBraceletScores.util.js";

const DISCLAIMER_FIXED =
  "ผลนี้อ่านจากพลังรวมของกำไลทั้งเส้น ไม่ยืนยันชนิดหินรายเม็ด";

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
  const mainShort = String(fs?.mainEnergyShort || "").trim() || "พลังรวมของกำไล";

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

  const imgRaw = String(payload?.object?.objectImageUrl || "").trim();
  const heroImg =
    /^https:\/\//i.test(imgRaw) ? `<div class="cb2-hero-img"><img src="${escapeHtml(imgRaw)}" alt="" loading="lazy" decoding="async"/></div>` : "";

  /** @type {{ label: string, score: number|null }[]} */
  const axisRows = [];
  const axes = cb.axes && typeof cb.axes === "object" ? cb.axes : {};
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const e = axes[k];
    const label =
      e && typeof e === "object" ? String(e.labelThai || "").trim() : "";
    const sc =
      e && typeof e === "object" && e.score != null && Number.isFinite(Number(e.score))
        ? Math.round(Number(e.score))
        : null;
    axisRows.push({ label: label || "—", score: sc });
  }
  axisRows.sort((a, b) => {
    if (a.score == null && b.score == null) return 0;
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score;
  });

  const axisBarsHtml = axisRows
    .map(({ label, score: sc }) => {
      const pct = sc == null ? 0 : Math.max(0, Math.min(100, sc));
      const w = `${pct}%`;
      return `<div class="cb2-axis-row">
  <span class="cb2-axis-l">${escapeHtml(label)}</span>
  <div class="cb2-axis-track" role="presentation"><span class="cb2-axis-fill" style="width:${w}"></span></div>
  <span class="cb2-axis-s">${sc == null ? "—" : escapeHtml(String(sc))}</span>
</div>`;
    })
    .join("");

  const graphRows = Array.isArray(hr.graphSummaryRows)
    ? hr.graphSummaryRows.map((t) => String(t || "").trim()).filter(Boolean)
    : [];
  const graphSummaryHtml = graphRows
    .map(
      (line, i) =>
        `<p class="cb2-gsum-line${i === 0 ? " cb2-gsum-line--lead" : ""}">${escapeHtml(line)}</p>`,
    )
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

  console.log(
    JSON.stringify({
      event: "CRYSTAL_BRACELET_HTML_V2_RENDER",
      scanResultIdPrefix: String(cb.context?.scanResultIdPrefix || "").slice(0, 8),
      primaryAxis: String(cb.primaryAxis || ""),
    }),
  );

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(headline)} · Ener Scan</title>
  <style>
    :root {
      --cb2-bg: #0c1220;
      --cb2-card: #111827;
      --cb2-muted: #94a3b8;
      --cb2-text: #e2e8f0;
      --cb2-accent: #7dd3fc;
      --cb2-accent2: #38bdf8;
      --cb2-strip: #0f172a;
    }
    body { margin:0; font-family: system-ui, "Segoe UI", sans-serif; background: var(--cb2-bg); color: var(--cb2-text); }
    .cb2-wrap { max-width: 28rem; margin: 0 auto; padding: 1rem 1rem 2rem; }
    .cb2-badge { font-size: 0.65rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cb2-accent); margin-bottom: 0.5rem; }
    .cb2-hero-img img { width: 100%; border-radius: 14px; display: block; background: #1e293b; }
    .cb2-h1 { font-size: 1.35rem; font-weight: 700; margin: 0.75rem 0 0.25rem; line-height: 1.35; }
    .cb2-tag { font-size: 0.8rem; color: var(--cb2-muted); margin: 0 0 0.35rem; }
    .cb2-main { font-size: 0.95rem; font-weight: 600; color: var(--cb2-accent); margin: 0.25rem 0 0; }
    .cb2-date { font-size: 0.72rem; color: var(--cb2-muted); margin: 0.5rem 0 0; }
    .cb2-strip {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.5rem;
      margin: 1rem 0;
      padding: 0.75rem;
      border-radius: 12px;
      background: var(--cb2-strip);
      border: 1px solid rgba(125, 211, 252, 0.12);
    }
    .cb2-strip-k { font-size: 0.62rem; color: var(--cb2-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .cb2-strip-v { font-size: 1.05rem; font-weight: 700; color: var(--cb2-accent); margin-top: 0.2rem; }
    .cb2-strip-v small { font-size: 0.65em; font-weight: 600; color: var(--cb2-muted); }
    .cb2-card { background: var(--cb2-card); border-radius: 16px; padding: 1rem 1.1rem; margin-top: 0.85rem; border: 1px solid rgba(148, 163, 184, 0.12); }
    .cb2-card h2 { font-size: 0.92rem; margin: 0 0 0.5rem; color: var(--cb2-accent); }
    .cb2-hint { font-size: 0.68rem; color: var(--cb2-muted); margin: 0 0 0.5rem; }
    .cb2-axis-row { display: flex; align-items: center; gap: 0.45rem; margin: 0.35rem 0; font-size: 0.78rem; }
    .cb2-axis-l { flex: 0 0 42%; color: var(--cb2-muted); line-height: 1.25; }
    .cb2-axis-track { flex: 1; height: 7px; background: #334155; border-radius: 6px; overflow: hidden; }
    .cb2-axis-fill { display: block; height: 100%; background: linear-gradient(90deg, var(--cb2-accent2), var(--cb2-accent)); border-radius: 6px; }
    .cb2-axis-s { flex: 0 0 2.2rem; text-align: right; font-weight: 700; color: var(--cb2-accent); font-variant-numeric: tabular-nums; }
    .cb2-gsum-line { margin: 0.35rem 0; font-size: 0.88rem; line-height: 1.45; color: rgba(226,232,240,0.92); }
    .cb2-gsum-line--lead { font-weight: 600; color: var(--cb2-accent); }
    .cb2-life-card { border-top: 1px solid rgba(255,255,255,0.06); padding: 0.75rem 0 0; margin-top: 0.65rem; }
    .cb2-life-card:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
    .cb2-life-title { font-weight: 600; font-size: 0.86rem; color: #e0f2fe; }
    .cb2-life-blurb { margin: 0.35rem 0 0; font-size: 0.82rem; line-height: 1.5; color: rgba(203, 213, 225, 0.95); }
    .cb2-para { margin: 0.45rem 0 0; font-size: 0.88rem; line-height: 1.55; color: rgba(226,232,240,0.94); }
    .cb2-caution { margin: 0.35rem 0 0; padding-left: 1.1rem; font-size: 0.82rem; color: rgba(203,213,225,0.9); }
    .cb2-caution-li { margin-bottom: 0.35rem; }
    .cb2-disclaimer { margin-top: 1rem; padding: 0.75rem; border-radius: 10px; background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(125, 211, 252, 0.2); font-size: 0.78rem; line-height: 1.45; color: rgba(186, 230, 253, 0.95); }
    .cb2-foot { margin-top: 1.25rem; text-align: center; font-size: 0.72rem; color: var(--cb2-muted); }
  </style>
</head>
<body>
  <div class="cb2-wrap">
    <header>
      <div class="cb2-badge">Ener Scan · กำไลหินคริสตัล · รายงานฉบับเต็ม</div>
      ${heroImg}
      <h1 class="cb2-h1">${escapeHtml(headline)}</h1>
      <p class="cb2-tag">${escapeHtml(tagline)}</p>
      <p class="cb2-main">พลังหลัก · ${escapeHtml(mainShort)}</p>
      ${generatedAt ? `<p class="cb2-date">${escapeHtml(generatedAt)}</p>` : ""}
    </header>

    <section class="cb2-strip" aria-label="คะแนนสรุป">
      <div><div class="cb2-strip-k">คะแนนพลัง</div><div class="cb2-strip-v">${escapeHtml(score)}<small> /10</small></div></div>
      <div><div class="cb2-strip-k">เข้ากัน</div><div class="cb2-strip-v">${escapeHtml(compat)}</div></div>
      <div><div class="cb2-strip-k">ระดับ</div><div class="cb2-strip-v">${escapeHtml(levelLabel)}</div></div>
    </section>

    <section class="cb2-card" aria-labelledby="cb2-axes-h">
      <h2 id="cb2-axes-h">มิติพลังกำไล</h2>
      <p class="cb2-hint">เรียงจากคะแนนสูงไปต่ำ</p>
      ${axisBarsHtml}
    </section>

    <section class="cb2-card" aria-labelledby="cb2-gsum-h">
      <h2 id="cb2-gsum-h">สรุปจากกราฟ</h2>
      ${graphSummaryHtml || `<p class="cb2-para">—</p>`}
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

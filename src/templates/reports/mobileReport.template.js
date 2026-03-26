import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { formatBangkokDateTime } from "../../utils/dateTime.util.js";
import {
  distillSummaryLine,
  summaryLineDensityClass,
} from "../../utils/reports/reportSummaryText.util.js";

/** Internal / non-display object type slugs (not shown as a label). */
const OBJECT_TYPE_INTERNAL = new Set(["single_supported", "mock"]);

/**
 * @param {unknown} raw
 * @returns {string}
 */
function humanObjectTypeLabel(raw) {
  const t = String(raw ?? "").trim();
  if (!t || OBJECT_TYPE_INTERNAL.has(t)) return "";
  return t;
}

/**
 * Opening line under hero — piece-specific from payload sections.
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function heroOpeningLine(p) {
  const w = String(p.wording?.htmlOpeningLine || "").trim();
  if (w) return w.length > 280 ? `${w.slice(0, 277)}…` : w;
  const sec = p.sections || {};
  const mp = Array.isArray(sec.messagePoints) ? sec.messagePoints : [];
  const wi = Array.isArray(sec.whatItGives) ? sec.whatItGives : [];
  const raw = String(mp[0] || wi[0] || "").trim();
  if (!raw) return "";
  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
}

/**
 * Deeper interpretation from structured wording (when present).
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function wordingInterpretationSection(p) {
  const w = p.wording;
  if (!w || typeof w !== "object") return "";
  const heroNaming = String(w.heroNaming || "").trim();
  const mainE = String(w.mainEnergy || "").trim();
  const ec = String(w.energyCharacter || "").trim();
  const lt = String(w.lifeTranslation || "").trim();
  const best = String(w.bestFor || "").trim();
  const notBest = String(w.notTheBestFor || "").trim();
  const pe = Array.isArray(w.practicalEffects) ? w.practicalEffects : [];
  const practical = pe.map((x) => String(x || "").trim()).filter(Boolean);

  const hasBody =
    mainE ||
    ec ||
    lt ||
    best ||
    notBest ||
    practical.length > 0 ||
    heroNaming;
  if (!hasBody) return "";

  const mainBlock = mainE
    ? `<p class="para wording-lead"><strong>${escapeHtml(mainE)}</strong> — พลังหลักที่อ่านได้จากชิ้นนี้</p>`
    : "";

  const narrative = [ec, lt].filter(Boolean).map(
    (t) => `<p class="para">${escapeHtml(t)}</p>`,
  );

  const fitBlock =
    best || notBest
      ? `${best ? `<p class="para"><span class="wording-label">เหมาะกับ</span> ${escapeHtml(best)}</p>` : ""}${
          notBest
            ? `<p class="para wording-muted"><span class="wording-label">ไม่ใช่จุดเน้นหลัก</span> ${escapeHtml(notBest)}</p>`
            : ""
        }`
      : "";

  const practicalBlock =
    practical.length > 0
      ? `<ul class="bullet-list">${practical
          .slice(0, 3)
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join("")}</ul>`
      : "";

  const inner = `${mainBlock}${narrative.join("")}${fitBlock}${practicalBlock}`;
  return sectionCard(
    "ความหมายเชิงลึก",
    inner,
    "",
    "card--tone-a card--wording-deep",
  );
}

/**
 * “ควรเปิดอ่านเมื่อ…” — short moments from payload.
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function whenToReadItems(p) {
  const sec = p.sections || {};
  const best = Array.isArray(sec.bestUseCases) ? sec.bestUseCases : [];
  const tips = Array.isArray(sec.guidanceTips) ? sec.guidanceTips : [];
  const merged = [...best, ...tips]
    .map((s) => String(s).trim())
    .filter(Boolean);
  return merged.slice(0, 4);
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function retentionReminderText(p) {
  const cn = p.sections?.careNotes?.[0];
  if (cn && String(cn).trim()) return String(cn).trim();
  return "บางชิ้นไม่ได้เด่นตอนสบาย แต่จะเด่นชัดในวันที่ใจรับแรงมาก — บันทึกไว้เตือนใจ";
}

/**
 * Optional section: show muted empty hint when no content (graceful).
 * @param {string} title
 * @param {string} bodyHtml
 * @param {string} [variantClass]
 */
function sectionOrEmpty(title, bodyHtml, variantClass = "") {
  const trimmed = String(bodyHtml || "").trim();
  const inner = trimmed
    ? bodyHtml
    : `<p class="empty-hint" role="status">ยังไม่มีข้อมูลในส่วนนี้</p>`;
  return sectionCard(title, inner, trimmed ? "" : " card--empty", variantClass);
}

/**
 * @param {string} title
 * @param {string} innerHtml
 * @param {string} [emptyModifier]
 * @param {string} [variantClass]
 */
function sectionCard(title, innerHtml, emptyModifier = "", variantClass = "") {
  return `
  <section class="card card--section${emptyModifier}${variantClass ? ` ${variantClass}` : ""}">
    <h2 class="card-title">${escapeHtml(title)}</h2>
    ${innerHtml}
  </section>`;
}

/**
 * @param {string[]} items
 * @returns {string}
 */
function ulList(items) {
  if (!items?.length) return "";
  return `<ul class="bullet-list">${items
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("")}</ul>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function hero(p) {
  const imageUrl = String(p.object?.objectImageUrl || "").trim();
  const labelRaw = String(p.object?.objectLabel ?? "").trim();
  const main = String(p.summary?.mainEnergyLabel ?? "").trim();
  const level = String(p.summary?.energyLevelLabel ?? "").trim();
  const genericLabels = new Set(["วัตถุของคุณ", "วัตถุจากการสแกน"]);
  const evocativeLead = "ชิ้นในรายงานนี้";
  let label;
  if (labelRaw && !genericLabels.has(labelRaw)) {
    label = labelRaw;
  } else if (main) {
    label = `${evocativeLead} · ${main}`;
  } else if (level) {
    label = `${evocativeLead} · ${level}`;
  } else if (labelRaw) {
    label = genericLabels.has(labelRaw) ? evocativeLead : labelRaw;
  } else {
    label = evocativeLead;
  }
  const typeLabel = humanObjectTypeLabel(p.object?.objectType);
  const alt = imageUrl
    ? `รูปวัตถุ — ${escapeHtml(label)}`
    : "ไม่มีรูปวัตถุจากระบบ";
  const media = imageUrl
    ? `<div class="hero-media">
    <img class="hero-img" src="${escapeHtml(imageUrl)}" alt="${alt}" loading="lazy" decoding="async" fetchpriority="high" onerror="this.classList.add('hero-img--broken'); this.closest('.hero-media')?.classList.add('hero-media--broken');" />
    <div class="hero-fallback" role="img" aria-label="ไม่สามารถโหลดรูปได้"><span class="hero-placeholder-inner">โหลดรูปไม่สำเร็จ</span></div>
  </div>`
    : `<div class="hero-media hero-media--empty" aria-label="${escapeHtml(alt)}">
    <div class="hero-placeholder"><span class="hero-placeholder-inner">ยังไม่มีรูปวัตถุในรายงาน</span></div>
  </div>`;
  const dateRaw = formatBangkokDateTime(p.generatedAt);
  const date = dateRaw !== "-" ? dateRaw : "";
  const opening = heroOpeningLine(p);
  const heroModifier = imageUrl ? " hero--with-image" : " hero--no-image";
  return `
  <header class="hero${heroModifier}">
    <div class="hero-stage">
      <div class="hero-frame">
        ${media}
      </div>
      <div class="hero-caption">
        <span class="badge"><span class="badge-inner">Ener Scan</span><span class="badge-sep" aria-hidden="true"></span><span class="badge-sub">รายงานเฉพาะชิ้น</span></span>
        <p class="hero-reading">การอ่านวัตถุชิ้นนี้</p>
        ${typeLabel ? `<p class="hero-object-kind">${escapeHtml(typeLabel)}</p>` : ""}
        ${String(p.wording?.heroNaming || "").trim() ? `<p class="hero-energy-style">${escapeHtml(String(p.wording.heroNaming).trim())}</p>` : ""}
        <h1 class="hero-object-name"><span class="hero-object-name__text">${escapeHtml(label)}</span></h1>
        ${opening ? `<p class="hero-hook">${escapeHtml(opening)}</p>` : ""}
        <p class="hero-doc-title">รายงานพลังวัตถุ</p>
        ${date ? `<p class="hero-date"><span class="hero-date-inner">${escapeHtml(date)}</span></p>` : ""}
      </div>
    </div>
  </header>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function summary(p) {
  const s = p.summary || {};
  const score =
    s.energyScore != null && Number.isFinite(Number(s.energyScore))
      ? Number(s.energyScore).toFixed(1)
      : "—";
  const compat =
    s.compatibilityPercent != null &&
    Number.isFinite(Number(s.compatibilityPercent))
      ? `${Math.round(Number(s.compatibilityPercent))}%`
      : "—";
  const meterPct = Math.min(
    100,
    Math.max(0, Number(s.energyScore) * 10 || 0),
  );
  const mainShort = s.mainEnergyLabel || "—";
  const coreSummary = distillSummaryLine(s.summaryLine);
  const summaryDensity = coreSummary ? summaryLineDensityClass(coreSummary) : "";
  return `
  <section class="card card--summary" aria-labelledby="summary-heading">
    <h2 class="summary-eyebrow" id="summary-heading">สรุปภาพรวม</h2>
    <div class="summary-stack">
      <div class="summary-tier summary-tier--score">
        <span class="summary-score-label">คะแนนพลัง</span>
        <div class="summary-score-row">
          <span class="summary-score-num gold">${escapeHtml(score)}</span>
          <span class="summary-score-denom">/ 10</span>
        </div>
        <span class="summary-score-band">${escapeHtml(s.energyLevelLabel || "—")}</span>
        <div class="summary-meter-block">
          <span class="meter-label meter-label--sr-only">ระดับพลังโดยรวม</span>
          <div class="meter meter--summary" role="presentation" aria-hidden="true"><span class="meter-fill" style="width:${meterPct}%"></span></div>
        </div>
      </div>
      <div class="summary-tier summary-tier--energy">
        <span class="summary-tier-label">พลังหลัก</span>
        <p class="summary-tier-value summary-tier-value--energy">${escapeHtml(mainShort)}</p>
      </div>
      <div class="summary-tier summary-tier--compat">
        <span class="summary-tier-label">ความเข้ากัน</span>
        <span class="summary-tier-value summary-tier-value--compat gold">${escapeHtml(compat)}</span>
      </div>
      ${coreSummary ? `<p class="summary-line summary-line--distilled ${summaryDensity}">${escapeHtml(coreSummary)}</p>` : ""}
    </div>
  </section>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function whenToReadSection(p) {
  const items = whenToReadItems(p);
  if (!items.length) return "";
  const lis = items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  return `
  <section class="card card--when-read" aria-labelledby="when-read-h">
    <h2 class="card-title card-title--when-read" id="when-read-h">ควรเปิดอ่านเมื่อ…</h2>
    <ul class="when-read-list">${lis}</ul>
  </section>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function retentionReminderBlock(p) {
  return `<p class="report-retention">${escapeHtml(retentionReminderText(p))}</p>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function ecosystemScanLink(p) {
  const url = String(p.actions?.rescanUrl || "").trim();
  if (!url) return "";
  return `<p class="report-ecosystem"><a class="report-ecosystem-link" href="${escapeHtml(url)}">สแกนอีกชิ้น</a></p>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} p
 */
function trustBlock(p) {
  const t = p.trust || {};
  const note = t.trustNote || "";
  return `
  <div class="report-trust-footer" role="contentinfo">
    <p class="report-trust-kicker">หมายเหตุ</p>
    ${note ? `<p class="trust-text">${escapeHtml(note)}</p>` : `<p class="trust-text trust-text--empty">ไม่มีหมายเหตุเพิ่มเติม</p>`}
    <p class="meta tiny">เวอร์ชันรายงาน ${escapeHtml(p.reportVersion)} · render ${escapeHtml(t.rendererVersion || "")}${t.modelLabel ? ` · ${escapeHtml(t.modelLabel)}` : ""}</p>
    <p class="report-outro-hint">ดำเนินการต่อจากแชท LINE ได้เมื่อต้องการ</p>
  </div>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 * @returns {string}
 */
export function renderMobileReportHtml(payload) {
  const p = payload || {};
  const sec = p.sections || {};

  const whatItGives = Array.isArray(sec.whatItGives) ? sec.whatItGives : [];
  const ownerMatchReason = Array.isArray(sec.ownerMatchReason)
    ? sec.ownerMatchReason
    : [];
  const bestUseCases = Array.isArray(sec.bestUseCases) ? sec.bestUseCases : [];

  const whatBody = ulList(whatItGives);
  const ownerBody = `${ownerMatchReason.length ? ulList(ownerMatchReason) : ""}${sec.roleDescription ? `<p class="para">${escapeHtml(sec.roleDescription)}</p>` : ""}`;
  const bestBody = ulList(bestUseCases);

  const what = sectionOrEmpty(
    "สิ่งที่วัตถุนี้มอบให้",
    whatBody,
    "card--tone-a card--section-lead",
  );
  const owner = sectionOrEmpty(
    "ทำไมถึงเข้ากับเจ้าของ",
    ownerBody,
    "card--tone-b card--section-support",
  );
  const best = sectionOrEmpty(
    "จังหวะที่เหมาะจะใช้",
    bestBody,
    "card--tone-c card--section-support",
  );

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <title>${escapeHtml(p.summary?.summaryLine?.slice(0, 48) || "Ener Scan — รายงาน")}</title>
  <style>
    /*
     * Visual direction: Mystic Premium (base) + light Amulet Luxury cues
     * — dark ceremonial base, restrained gold, subtle glow only, not dashboard / not flashy.
     */
    :root {
      --bg: #060608;
      --bg-elevated: #0c0d12;
      --card: #101218;
      --card-edge: rgba(255, 255, 255, 0.055);
      --text: #f0ede8;
      --muted: #a39e96;
      --muted2: #6e6962;
      --gold: #d4af37;
      --gold-bright: #e8cf6a;
      --gold-soft: rgba(212, 175, 55, 0.11);
      --gold-dim: #8a7020;
      --mystic-violet: rgba(88, 72, 120, 0.14);
      --amulet-wine: rgba(72, 38, 52, 0.35);
      --radius: 18px;
      --radius-sm: 14px;
      --font: "Sarabun", "Noto Sans Thai", system-ui, sans-serif;
      --shadow-elevated: 0 20px 48px rgba(0, 0, 0, 0.55);
      --glow-gold-soft: 0 0 42px rgba(212, 175, 55, 0.07);
      --section-accent-a: rgba(212, 175, 55, 0.28);
      --section-accent-b: rgba(130, 155, 190, 0.14);
      --section-accent-c: rgba(160, 130, 185, 0.12);
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      font-family: var(--font);
      background: var(--bg);
      background-image:
        radial-gradient(ellipse 100% 70% at 50% -15%, rgba(212, 175, 55, 0.07), transparent 52%),
        radial-gradient(ellipse 80% 50% at 100% 100%, var(--mystic-violet), transparent 45%),
        radial-gradient(ellipse 60% 40% at 0% 80%, rgba(212, 175, 55, 0.03), transparent 40%);
      color: var(--text);
      line-height: 1.75;
      font-size: 17px;
      letter-spacing: 0.02em;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    .wrap {
      max-width: 26rem;
      margin: 0 auto;
      padding: 1.35rem 1.2rem 4.25rem;
    }
    /* —— Hero: sacred focal + caption bonded to frame (“this object is being read”) —— */
    .hero {
      margin-bottom: 1.65rem;
    }
    .hero-stage {
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 0.35rem;
      padding-bottom: 0;
      border-radius: calc(var(--radius) + 4px);
      background: linear-gradient(160deg, rgba(255, 255, 255, 0.04), transparent 40%, var(--amulet-wine));
      box-shadow: var(--glow-gold-soft), var(--shadow-elevated);
      overflow: hidden;
    }
    /* Corner brackets: subtle luxury cue */
    .hero-stage::before,
    .hero-stage::after {
      content: "";
      position: absolute;
      width: 1.25rem;
      height: 1.25rem;
      pointer-events: none;
      z-index: 2;
      border-color: rgba(212, 175, 55, 0.28);
      border-style: solid;
    }
    .hero-stage::before {
      top: 0.5rem;
      left: 0.5rem;
      border-width: 1px 0 0 1px;
      border-radius: 2px 0 0 0;
    }
    .hero-stage::after {
      bottom: 0.5rem;
      right: 0.5rem;
      border-width: 0 1px 1px 0;
      border-radius: 0 0 2px 0;
    }
    .hero-frame {
      flex-shrink: 0;
      border-radius: var(--radius) var(--radius) 0 0;
      padding: 2px;
      background: linear-gradient(
        155deg,
        rgba(232, 207, 106, 0.45),
        rgba(255, 255, 255, 0.08) 38%,
        rgba(212, 175, 55, 0.15) 72%,
        rgba(72, 38, 52, 0.25)
      );
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        0 4px 24px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }
    .hero-media {
      position: relative;
      border-radius: calc(var(--radius) - 2px);
      background: linear-gradient(165deg, #141820 0%, #08090c 100%);
    }
    .hero-media::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      background: radial-gradient(ellipse 90% 75% at 50% 45%, transparent 35%, rgba(0, 0, 0, 0.45) 100%);
    }
    .hero-media--empty .hero-placeholder {
      border-radius: calc(var(--radius) - 2px);
    }
    .hero-img,
    .hero-placeholder {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 5;
      object-fit: cover;
      object-position: center;
      border-radius: calc(var(--radius) - 2px);
      background: linear-gradient(165deg, #1a1f28 0%, #0a0b0f 100%);
      border: none;
    }
    .hero--no-image .hero-img,
    .hero--no-image .hero-placeholder {
      aspect-ratio: 4 / 3;
    }
    .hero-img--broken {
      display: none !important;
    }
    .hero-fallback {
      display: none;
      width: 100%;
      aspect-ratio: 4 / 5;
      align-items: center;
      justify-content: center;
      color: var(--muted2);
      font-size: 0.9rem;
      border-radius: calc(var(--radius) - 2px);
      background: linear-gradient(165deg, #1a1f28 0%, #0a0b0f 100%);
    }
    .hero--no-image .hero-fallback {
      aspect-ratio: 4 / 3;
    }
    .hero-media--broken .hero-fallback {
      display: flex;
    }
    .hero-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted2);
      font-size: 0.9rem;
    }
    .hero-placeholder-inner {
      padding: 0.55rem 1.1rem;
      border: 1px solid rgba(212, 175, 55, 0.18);
      border-radius: var(--radius-sm);
      background: rgba(0, 0, 0, 0.2);
    }
    .hero--no-image .hero-frame {
      border-radius: var(--radius);
      background: linear-gradient(150deg, rgba(212, 175, 55, 0.18), rgba(255, 255, 255, 0.03) 50%, var(--amulet-wine));
    }
    .hero--no-image .hero-caption {
      border-radius: 0 0 calc(var(--radius) + 2px) calc(var(--radius) + 2px);
    }
    .hero-caption {
      flex-shrink: 0;
      text-align: center;
      padding: 1.25rem 1rem 1.45rem;
      margin: 0 0.1rem 0.35rem;
      border-radius: 0 0 calc(var(--radius) - 2px) calc(var(--radius) - 2px);
      border-top: 1px solid rgba(212, 175, 55, 0.22);
      background: linear-gradient(180deg, rgba(4, 5, 7, 0.97), rgba(10, 11, 15, 0.99));
    }
    .hero-reading {
      margin: 0 0 0.35rem;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(212, 175, 55, 0.75);
    }
    .hero-object-kind {
      margin: 0 0 0.35rem;
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.1em;
      color: rgba(188, 182, 172, 0.88);
    }
    .hero-object-name {
      margin: 0.4rem 0 0.25rem;
      font-size: 1.42rem;
      font-weight: 700;
      line-height: 1.35;
      color: rgba(248, 245, 240, 0.98);
      letter-spacing: 0.02em;
      text-shadow: 0 2px 20px rgba(0, 0, 0, 0.35);
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .hero-object-name__text {
      display: inline-block;
      max-width: 100%;
      padding-bottom: 0.38rem;
      border-bottom: 1px solid rgba(212, 175, 55, 0.38);
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
      background: linear-gradient(180deg, rgba(248, 245, 240, 0.04), transparent 65%);
      border-radius: 2px;
    }
    .hero-hook {
      margin: 0.45rem auto 0.5rem;
      max-width: 22rem;
      font-size: 0.88rem;
      line-height: 1.55;
      font-weight: 400;
      color: rgba(200, 195, 186, 0.92);
    }
    .hero-doc-title {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(163, 158, 150, 0.88);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--gold-bright);
      background: rgba(0, 0, 0, 0.35);
      padding: 0.4rem 0.85rem;
      border-radius: 999px;
      margin: 0 0 0.55rem;
      border: 1px solid rgba(212, 175, 55, 0.22);
    }
    .badge-sep {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: rgba(212, 175, 55, 0.5);
    }
    .badge-sub {
      letter-spacing: 0.08em;
      font-weight: 500;
      color: var(--muted);
      text-transform: none;
      font-size: 0.72rem;
    }
    .hero-date {
      margin: 0.75rem 0 0;
    }
    .hero-date-inner {
      display: inline-block;
      font-size: 0.78rem;
      color: var(--muted2);
      padding: 0.3rem 0.75rem;
      background: rgba(255, 255, 255, 0.035);
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .card--when-read {
      margin-bottom: 1rem;
      padding: 0.95rem 1.05rem;
      border-left: 2px solid rgba(212, 175, 55, 0.22);
      background: rgba(10, 11, 14, 0.72);
      border-color: rgba(255, 255, 255, 0.04);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
    }
    .card-title--when-read {
      font-size: 0.88rem;
      margin: 0 0 0.5rem;
      color: rgba(200, 192, 175, 0.95);
      font-weight: 600;
    }
    .when-read-list {
      margin: 0;
      padding-left: 1.1rem;
      font-size: 0.86rem;
      line-height: 1.52;
      color: rgba(175, 170, 162, 0.85);
    }
    .when-read-list li {
      margin-bottom: 0.35rem;
    }
    .report-retention {
      margin: 1rem 0 0;
      padding: 0 0.5rem;
      font-size: 0.78rem;
      line-height: 1.62;
      color: rgba(125, 120, 112, 0.9);
      text-align: center;
    }
    .report-ecosystem {
      margin: 0.75rem 0 0;
      text-align: center;
    }
    .report-ecosystem-link {
      font-size: 0.68rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: rgba(105, 102, 96, 0.95);
      text-decoration: none;
      border-bottom: 1px solid rgba(212, 175, 55, 0.12);
      padding-bottom: 0.12rem;
    }
    /* —— Cards: hierarchy (lead vs support vs fine print) —— */
    .card {
      background: var(--card);
      border-radius: var(--radius);
      padding: 1.2rem 1.25rem;
      margin-bottom: 1.1rem;
      border: 1px solid var(--card-edge);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.28);
    }
    .card--section {
      border-left: 3px solid var(--section-accent-a);
      background: linear-gradient(175deg, rgba(15, 16, 22, 0.98) 0%, var(--card) 100%);
    }
    .card--section-lead {
      border-left-width: 5px;
      padding: 1.45rem 1.35rem 1.5rem;
      background: linear-gradient(168deg, rgba(212, 175, 55, 0.06) 0%, rgba(16, 18, 24, 0.99) 55%);
      box-shadow:
        0 4px 28px rgba(0, 0, 0, 0.38),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }
    .card--section-lead .card-title {
      font-size: 1.18rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: var(--gold-bright);
    }
    .card--section-support {
      border-left-width: 2px;
      padding: 0.68rem 0.82rem 0.76rem;
      margin-bottom: 0.85rem;
      opacity: 0.73;
      background: rgba(7, 8, 10, 0.76);
      border-color: rgba(255, 255, 255, 0.02);
      box-shadow: 0 1px 5px rgba(0, 0, 0, 0.09);
    }
    .card--section-support .card-title {
      font-size: 0.78rem;
      font-weight: 600;
      color: rgba(138, 134, 130, 0.82);
      margin-bottom: 0.38rem;
      letter-spacing: 0.05em;
    }
    .card--section-support .bullet-list,
    .card--section-support .para {
      font-size: 0.86rem;
      line-height: 1.52;
      color: rgba(168, 164, 156, 0.78);
    }
    .card--tone-a { border-left-color: rgba(212, 175, 55, 0.65); }
    .card--tone-b { border-left-color: rgba(130, 155, 190, 0.38); }
    .card--tone-c { border-left-color: rgba(170, 140, 195, 0.32); }
    .card--section-support.card--tone-b {
      border-left-color: rgba(130, 155, 190, 0.26);
    }
    .card--section-support.card--tone-c {
      border-left-color: rgba(170, 140, 195, 0.22);
    }
    .card--empty {
      border-left-color: rgba(255, 255, 255, 0.1);
      opacity: 0.92;
    }
    .card--empty .card-title {
      opacity: 0.85;
    }
    .empty-hint {
      margin: 0;
      font-size: 0.9rem;
      color: var(--muted2);
      font-style: normal;
    }
    .card-title {
      font-size: 1.02rem;
      margin: 0 0 0.75rem;
      color: var(--gold);
      font-weight: 600;
      line-height: 1.45;
    }
    /* —— Summary: tier 1 score → tier 2 main energy → tier 3 compat → short line —— */
    .card--summary {
      margin-top: 0.15rem;
      margin-bottom: 1.35rem;
      padding: 1.35rem 1.2rem 1.4rem;
      background: linear-gradient(168deg, rgba(212, 175, 55, 0.07) 0%, rgba(16, 18, 24, 0.98) 42%, var(--card) 100%);
      border-color: rgba(212, 175, 55, 0.2);
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    .summary-eyebrow {
      margin: 0 0 1.1rem;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(163, 158, 150, 0.9);
      text-align: center;
    }
    .summary-stack {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .summary-tier--score {
      text-align: center;
      padding: 0.25rem 0 1.05rem;
    }
    .summary-score-label {
      display: block;
      font-size: 0.72rem;
      color: var(--muted);
      margin-bottom: 0.4rem;
      letter-spacing: 0.08em;
    }
    .summary-score-row {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 0.15rem;
      line-height: 1;
    }
    .summary-score-num {
      font-size: 3.5rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      text-shadow: 0 0 32px rgba(212, 175, 55, 0.14);
    }
    .summary-score-denom {
      font-size: 1.1rem;
      font-weight: 500;
      color: var(--muted2);
      align-self: flex-end;
      padding-bottom: 0.4rem;
    }
    .summary-score-band {
      display: block;
      margin-top: 0.4rem;
      margin-bottom: 0.85rem;
      font-size: 0.82rem;
      color: rgba(232, 207, 106, 0.92);
      font-weight: 600;
      letter-spacing: 0.06em;
    }
    .summary-meter-block {
      max-width: 17rem;
      margin: 0 auto;
    }
    .meter-label--sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .summary-tier--energy {
      padding: 1rem 0.15rem 1rem;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
    }
    .summary-tier-label {
      display: block;
      font-size: 0.68rem;
      color: var(--muted2);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 0.45rem;
    }
    .summary-tier-value--energy {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 600;
      line-height: 1.55;
      color: rgba(248, 245, 240, 0.96);
      max-width: 22rem;
      margin-left: auto;
      margin-right: auto;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .summary-tier--compat {
      padding: 0.65rem 0.15rem 0.75rem;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    .summary-tier--compat .summary-tier-label {
      margin-bottom: 0.25rem;
      font-size: 0.65rem;
      opacity: 0.9;
    }
    .summary-tier-value--compat {
      font-size: 1.12rem;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .summary-line {
      margin: 0;
      padding: 0.85rem 0.15rem 0;
      font-size: 0.92rem;
      line-height: 1.65;
      color: rgba(212, 208, 200, 0.88);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .summary-line--distilled {
      padding-top: 0.5rem;
      font-size: 0.82rem;
      line-height: 1.36;
      letter-spacing: 0.01em;
      color: rgba(172, 168, 160, 0.86);
      margin-left: auto;
      margin-right: auto;
      text-align: center;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .summary-line--distilled.summary-line--tight {
      -webkit-line-clamp: 1;
      max-width: 19rem;
      line-height: 1.34;
    }
    .summary-line--distilled.summary-line--roomy {
      -webkit-line-clamp: 2;
      max-width: 21.5rem;
      line-height: 1.42;
    }
    .gold { color: var(--gold-bright); }
    .meter-label {
      display: block;
      font-size: 0.7rem;
      color: var(--muted2);
      margin-bottom: 0.45rem;
      text-align: center;
      letter-spacing: 0.04em;
    }
    .meter {
      height: 6px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 999px;
      overflow: hidden;
    }
    .meter--summary {
      height: 8px;
    }
    .meter-fill {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--gold-dim), var(--gold-bright));
      border-radius: 999px;
      box-shadow: 0 0 12px rgba(212, 175, 55, 0.2);
    }
    .bullet-list {
      margin: 0;
      padding-left: 1.15rem;
    }
    .bullet-list li {
      margin-bottom: 0.6rem;
      padding-left: 0.1rem;
    }
    .bullet-list li::marker {
      color: var(--gold-dim);
    }
    .para {
      margin: 0.65rem 0 0;
      color: var(--muted);
      font-size: 0.94rem;
      line-height: 1.75;
    }
    .hero-energy-style {
      margin: 0.35rem 0 0.5rem;
      font-size: 0.88rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: rgba(232, 207, 106, 0.88);
      line-height: 1.45;
    }
    .wording-lead {
      margin-top: 0.15rem;
      color: rgba(240, 237, 232, 0.94);
    }
    .wording-label {
      display: inline-block;
      margin-right: 0.35rem;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(163, 158, 150, 0.95);
    }
    .wording-muted {
      opacity: 0.92;
    }
    /* —— Trust: footer strip, not a content card —— */
    .report-trust-footer {
      margin-top: 1.35rem;
      padding: 0.85rem 0.35rem 0.85rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      text-align: center;
    }
    .report-trust-kicker {
      margin: 0 0 0.45rem;
      font-size: 0.62rem;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(110, 105, 98, 0.95);
    }
    .report-trust-footer .trust-text {
      margin: 0 0 0.55rem;
      font-size: 0.84rem;
      line-height: 1.65;
      color: rgba(163, 158, 150, 0.96);
    }
    .trust-text--empty {
      opacity: 0.8;
    }
    .report-trust-footer .tiny {
      opacity: 0.72;
    }
    .report-trust-footer .report-outro-hint {
      margin: 1rem 0 0;
      padding-top: 0.9rem;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 0.66rem;
      font-weight: 400;
      letter-spacing: 0.035em;
      line-height: 1.55;
      color: rgba(98, 95, 90, 0.9);
    }
    .tiny {
      font-size: 0.68rem;
      color: var(--muted2);
      margin: 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrap">
    ${hero(p)}
    ${summary(p)}
    ${wordingInterpretationSection(p)}
    ${what}
    ${owner}
    ${best}
    ${whenToReadSection(p)}
    ${trustBlock(p)}
    ${retentionReminderBlock(p)}
    ${ecosystemScanLink(p)}
  </div>
</body>
</html>`;
}

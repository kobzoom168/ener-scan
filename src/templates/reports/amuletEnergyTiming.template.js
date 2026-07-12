/**
 * Standalone public page: วิธีคำนวณจังหวะเสริมพลัง (sacred amulet HTML v2 lane).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { resolveSacredAmuletTimingForEnergyPage } from "../../utils/reports/sacredAmuletTimingEnrich.util.js";
import { TIMING_HOUR_WINDOWS } from "../../config/timing/timingWindows.config.js";
import { TIMING_WEEKDAY_LABEL_TH } from "../../config/timing/timingWeekdayAffinity.config.js";
import {
  amuletSubpageAutoDarkScriptHtml,
  buildAmuletSubpageDarkThemeCss,
} from "../../utils/reports/amuletSubpageTheme.util.js";

/** Sunday-first — แกนเรดาร์ (สั้น) */
const WEEKDAY_RADAR_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** ช่วงเวลา — ป้ายสั้นสำหรับกราห์แท่ง */
const HOUR_BAR_SHORT = ["รุ่ง", "เช้า", "กลางวัน", "บ่าย", "เย็น", "คืน", "ดึก"];

/** Sunday-first — ข้อความอ่านง่าย ไม่ใช่คะแนน */
const WEEKDAY_MEANING_TH = [
  "มีแนวโน้มเด่นเรื่องความมั่นใจ การเริ่มต้น และการออกแรงนำ",
  "มีแนวโน้มเหมาะกับเมตตาและการคุยกับคน",
  "มีแนวโน้มมีแรงผลัก แต่ควรใช้แบบพอดี",
  "มีแนวโน้มเหมาะกับงาน การติดต่อ และการค้าขาย",
  "มีแนวโน้มเหมาะกับครู วิชา ผู้ใหญ่ และการตั้งหลัก",
  "มีแนวโน้มเหมาะกับเมตตา เสน่ห์ และความสัมพันธ์",
  "มีแนวโน้มเหมาะกับความหนักแน่นและการป้องกัน",
];

/** ตาม key ของช่วงเวลาในระบบ — ใช้คู่กับคะแนนจริงจากเครื่องมือคำนวณ */
const HOUR_USE_HINT_TH = {
  dawn_05_06: "เหมาะกับตั้งจิตเงียบ ๆ ในช่วงต้นวัน",
  morning_07_10: "เหมาะกับตั้งจิต เริ่มงาน หรือขอพรเรื่องสำคัญ",
  noon_11_13: "เหมาะกับพกติดตัวหรือใช้ระหว่างทำงาน",
  afternoon_14_16: "เหมาะกับงานต่อเนื่อง อาจไม่ใช่ช่วงเด่นสุดของทุกชิ้น",
  evening_17_19: "เหมาะกับการเคลียร์ใจหรือขอบคุณสิ่งศักดิ์สิทธิ์",
  night_20_22: "เหมาะกับการสวดมนต์ ตั้งจิต หรือทบทวนเป้าหมาย",
  late_night_23_04: "มักไม่ใช่ช่วงเด่นของหลายชิ้น ควรใช้แบบเบา ๆ",
};

/**
 * @param {number} sc
 * @returns {string}
 */
function timingScorePillClass(sc) {
  const n = Math.round(Number(sc));
  if (!Number.isFinite(n)) return "aet-score-pill aet-score-pill--na";
  if (n >= 80) return "aet-score-pill aet-score-pill--t80";
  if (n >= 60) return "aet-score-pill aet-score-pill--t60";
  if (n >= 40) return "aet-score-pill aet-score-pill--t40";
  return "aet-score-pill aet-score-pill--tlt40";
}

/**
 * @param {number} sc
 * @returns {string}
 */
function timingMiniBarHtml(sc) {
  const n = Math.round(Number(sc));
  const pct = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  return `<div class="aet-mini-bar-track" aria-hidden="true"><div class="aet-mini-bar-fill" style="width:${pct}%"></div></div>`;
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} deg
 */
function polarSvg(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportTimingSlot[]} rows — Sunday-first length 7
 */
function buildWeekdayRadarBlock(rows) {
  const n = 7;
  const scores = rows.map((slot) => {
    const v = Math.round(Number(slot.score));
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) / 100 : 0;
  });
  const W = 300;
  const H = 220;
  const cx = 150;
  const cy = 100;
  const R = 82;
  const Rlabel = 108;
  const rings = [0.33, 0.66, 1];
  let d = "";
  for (const frac of rings) {
    const pts = [];
    for (let i = 0; i < n; i += 1) {
      const deg = -90 + (i * 360) / n;
      const p = polarSvg(cx, cy, R * frac, deg);
      pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    }
    d += `M ${pts[0]} L ${pts.slice(1).join(" L ")} Z `;
  }
  let axes = "";
  for (let i = 0; i < n; i += 1) {
    const deg = -90 + (i * 360) / n;
    const pe = polarSvg(cx, cy, R, deg);
    axes += `<line x1="${cx}" y1="${cy}" x2="${pe.x.toFixed(2)}" y2="${pe.y.toFixed(2)}" stroke="#ede8dd" stroke-width="1"/>`;
  }
  const polyPts = [];
  for (let i = 0; i < n; i += 1) {
    const deg = -90 + (i * 360) / n;
    const p = polarSvg(cx, cy, R * scores[i], deg);
    polyPts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  const poly = polyPts.join(" ");
  let labels = "";
  for (let i = 0; i < n; i += 1) {
    const deg = -90 + (i * 360) / n;
    const pl = polarSvg(cx, cy, Rlabel, deg);
    const sc = Math.round(Number(rows[i]?.score));
    const lab = escapeHtml(WEEKDAY_RADAR_SHORT[i] || String(i + 1));
    const scStr = Number.isFinite(sc) ? escapeHtml(String(sc)) : "—";
    labels += `<text x="${pl.x.toFixed(2)}" y="${pl.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" class="aet-radar-lbl">${lab}</text><text x="${pl.x.toFixed(2)}" y="${(pl.y + 14).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" class="aet-radar-sc">${scStr}</text>`;
  }
  return `<figure class="aet-radar-fig" aria-label="คะแนนวันในสัปดาห์แบบเรดาร์">
    <svg class="aet-radar-svg" viewBox="0 0 ${W} ${H}" width="100%" height="220" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img">
      <defs>
        <linearGradient id="aetTimingGoldLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#c8971e"/>
          <stop offset="100%" stop-color="#e8c060"/>
        </linearGradient>
      </defs>
      <path d="${d}" fill="none" stroke="#ede8dd" stroke-width="1"/>
      ${axes}
      <polygon points="${poly}" fill="rgba(200,151,30,0.15)" stroke="url(#aetTimingGoldLine)" stroke-width="2" stroke-linejoin="round"/>
      ${labels}
    </svg>
  </figure>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportTimingSlot[]} hrRows
 */
function buildHourBarsBlock(hrRows) {
  const byKey = Object.fromEntries(hrRows.map((r) => [r.key, r]));
  const vals = TIMING_HOUR_WINDOWS.map((w) => {
    const slot = byKey[w.key];
    const sc = slot != null ? Math.round(Number(slot.score)) : null;
    return Number.isFinite(sc) ? sc : null;
  });
  const finite = vals.filter((v) => v != null);
  const maxSc = finite.length ? Math.max(...finite.map(Number)) : -Infinity;
  const cols = TIMING_HOUR_WINDOWS.map((w, idx) => {
    const sc = vals[idx];
    const short = escapeHtml(HOUR_BAR_SHORT[idx] || w.labelTh);
    if (sc == null) {
      return `<div class="aet-hour-bar-col"><span class="aet-hour-bar-num">—</span><div class="aet-hour-bar-track"><div class="aet-hour-bar-fill" style="height:0%"></div></div><span class="aet-hour-bar-lbl">${short}</span></div>`;
    }
    const hPct = Math.min(100, Math.max(0, sc));
    const isMax = sc === maxSc && finite.length > 0;
    return `<div class="aet-hour-bar-col${isMax ? " is-max" : ""}"><span class="aet-hour-bar-num">${escapeHtml(String(sc))}</span><div class="aet-hour-bar-track"><div class="aet-hour-bar-fill" style="height:${hPct}%"></div></div><span class="aet-hour-bar-lbl">${short}</span></div>`;
  });
  return `<div class="aet-hour-bars" role="img" aria-label="คะแนนช่วงเวลาแบบแท่ง">${cols.join("")}</div>`;
}

function buildFormulaDonutBlock() {
  const cx = 80;
  const cy = 80;
  const r0 = 44;
  const r1 = 70;
  const colors = ["#f5e6c8", "#ebd49a", "#e0c26e", "#c9a227", "#8a6a18"];
  let paths = "";
  for (let k = 0; k < 5; k += 1) {
    const deg0 = -90 + k * 72;
    const deg1 = -90 + (k + 1) * 72;
    const p0o = polarSvg(cx, cy, r1, deg0);
    const p1o = polarSvg(cx, cy, r1, deg1);
    const p1i = polarSvg(cx, cy, r0, deg1);
    const p0i = polarSvg(cx, cy, r0, deg0);
    const large = 0;
    paths += `<path d="M ${p0o.x.toFixed(2)} ${p0o.y.toFixed(2)} A ${r1} ${r1} 0 ${large} 1 ${p1o.x.toFixed(2)} ${p1o.y.toFixed(2)} L ${p1i.x.toFixed(2)} ${p1i.y.toFixed(2)} A ${r0} ${r0} 0 ${large} 0 ${p0i.x.toFixed(2)} ${p0i.y.toFixed(2)} Z" fill="${colors[k]}" stroke="#ede8dd" stroke-width="0.75"/>`;
  }
  const legendItems = [
    "ความเข้ากับเจ้าของ",
    "พลังเด่นของวัตถุ",
    "จังหวะของวัน",
    "ช่วงเวลาที่เหมาะ",
    "ความสอดคล้องรวม",
  ]
    .map(
      (t, i) =>
        `<li class="aet-donut-legend-item"><span class="aet-donut-legend-n" style="background:${colors[i]}">${i + 1}</span><span>${escapeHtml(t)}</span></li>`,
    )
    .join("");
  return `<div class="aet-formula-viz">
    <div class="aet-donut-wrap">
      <svg class="aet-donut-svg" viewBox="0 0 160 160" width="160" height="160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="สัดส่วนปัจจัยในสูตร (แบ่งเท่า ๆ กันเชิงอธิบาย)">
        ${paths}
        <circle cx="${cx}" cy="${cy}" r="${r0 - 2}" fill="var(--aet-donut-hole)"/>
      </svg>
    </div>
    <ol class="aet-donut-legend">${legendItems}</ol>
  </div>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportTimingV1} tv
 * @param {boolean} hasScoreTables
 */
function buildSectionAHtml(tv, hasScoreTables) {
  const day = String(tv.summary?.topWeekdayLabel || "").trim() || "—";
  const win = String(tv.summary?.topWindowLabel || "").trim() || "—";
  const mode = String(tv.ritualMode || "").trim() || "—";
  const hint = String(tv.summary?.practicalHint || "").trim();
  const bridge = hasScoreTables
    ? `จากคะแนนรวม อาจารย์พบว่า ${day} กับ ${win} เป็นจังหวะที่เข้ากับพลังของวัตถุชิ้นนี้มากที่สุดเมื่อเทียบกับช่วงอื่นในตารางด้านล่าง`
    : `อาจารย์ประเมินจากวันเกิดของเจ้าของ พลังเด่นของวัตถุ และจังหวะวันเวลา แล้วเลือก ${day} กับ ${win} เป็นจังหวะที่เหมาะที่สุดในรอบนี้`;

  return `
    <section class="aet-card aet-card--hero" aria-labelledby="aet-a-h">
      <h2 id="aet-a-h" class="aet-h2">สรุปผลที่อาจารย์แนะนำ</h2>
      <div class="aet-hero-summary" role="group" aria-label="สรุปจังหวะแนะนำ">
        <div class="aet-hero-row">
          <span class="aet-hero-k">วันแนะนำ</span>
          <span class="aet-hero-v">${escapeHtml(day)}</span>
        </div>
        <div class="aet-hero-row">
          <span class="aet-hero-k">ช่วงเวลาแนะนำ</span>
          <span class="aet-hero-v">${escapeHtml(win)}</span>
        </div>
        <div class="aet-hero-row aet-hero-row--last">
          <span class="aet-hero-k">แนวใช้แนะนำ</span>
          <span class="aet-hero-v">${escapeHtml(mode)}</span>
        </div>
      </div>
      ${hint ? `<p class="aet-hero-hint">${escapeHtml(hint)}</p>` : ""}
      <p class="aet-hero-bridge">${escapeHtml(bridge)}</p>
    </section>`;
}

function buildSectionBHtml() {
  const boxes = [
    {
      t: "วันเกิดของเจ้าของ",
      b: "ดูจังหวะพื้นฐานและวันที่เข้ากับเจ้าของ",
    },
    {
      t: "พลังเด่นของวัตถุ",
      b: "ดูว่าชิ้นนี้เด่นด้านใด เช่น โชคลาภ เมตตา หรือคุ้มครอง",
    },
    {
      t: "วันในสัปดาห์",
      b: "เทียบว่าวันไหนส่งแรงสอดคล้องที่สุด",
    },
    {
      t: "ช่วงเวลาในวัน",
      b: "เลือกช่วงที่เหมาะกับการตั้งจิตหรือพกติดตัว",
    },
  ];
  return `
    <section class="aet-section" aria-labelledby="aet-b-h">
      <h2 id="aet-b-h" class="aet-h2">อาจารย์ดูจากอะไรบ้าง</h2>
      <div class="aet-b-grid">
        ${boxes
          .map(
            (x, bi) => `
        <div class="aet-b-box">
          <span class="aet-b-step" aria-hidden="true">${bi + 1}</span>
          <h3 class="aet-h3">${escapeHtml(x.t)}</h3>
          <p class="aet-p">${escapeHtml(x.b)}</p>
        </div>`,
          )
          .join("")}
      </div>
    </section>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportTimingSlot[]} rows
 */
function buildWeekdayTableHtml(rows) {
  const rounded = rows.map((slot) => Math.round(Number(slot.score)));
  const maxSc =
    rounded.length && rounded.every((n) => Number.isFinite(n))
      ? Math.max(...rounded)
      : -Infinity;
  const items = rows.map((slot, i) => {
    const label =
      TIMING_WEEKDAY_LABEL_TH[i] ||
      String(slot.key || "").replace(/^weekday_/, "วัน");
    const sc = Number(slot.score);
    const scR = Math.round(sc);
    const meaning =
      WEEKDAY_MEANING_TH[i] ||
      (String(slot.reasonText || "").trim() || "—");
    const rank = String(i + 1).padStart(2, "0");
    const isTop = Number.isFinite(scR) && scR === maxSc;
    const badge = isTop ? `<span class="aet-top-badge">เด่นสุด</span>` : "";
    const pillCls = timingScorePillClass(sc);
    const pillInner = `${escapeHtml(String(scR))}/100`;
    const mini = timingMiniBarHtml(sc);
    return {
      row: `<tr class="${isTop ? "is-top" : ""}"><td class="aet-cell-name">${badge}${escapeHtml(label)}</td><td><span class="${pillCls}">${pillInner}</span></td><td class="aet-cell-desc"><div class="aet-desc-txt">${escapeHtml(meaning)}</div>${mini}</td></tr>`,
      card: `<article class="aet-rank-card ${isTop ? "is-top" : ""}"><div class="aet-rank-head"><span class="aet-rank-n">${escapeHtml(rank)}</span><strong class="aet-rank-title">${badge}${escapeHtml(label)}</strong><span class="${pillCls}">${pillInner}</span></div><p class="aet-rank-body">${escapeHtml(meaning)}</p>${mini}</article>`,
    };
  });
  return `
    <section class="aet-section" aria-labelledby="aet-c-h">
      <h2 id="aet-c-h" class="aet-h2">ตารางคะแนนวัน</h2>
      <p class="aet-p aet-muted">คะแนนเป็นคะแนนประกอบที่อาจารย์ใช้เปรียบเทียบวันในสัปดาห์กับเจ้าของและพลังของวัตถุ</p>
      ${buildWeekdayRadarBlock(rows)}
      <div class="aet-rank-list aet-rank-list--mobile">${items.map((x) => x.card).join("")}</div>
      <div class="aet-table-wrap">
        <table class="aet-table" aria-label="คะแนนตามวัน">
          <thead><tr><th>วัน</th><th>คะแนน</th><th>ความหมายโดยสังเขป</th></tr></thead>
          <tbody>${items.map((x) => x.row).join("")}</tbody>
        </table>
      </div>
    </section>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportTimingSlot[]} rows — same order as TIMING_HOUR_WINDOWS
 */
function buildHourTableHtml(rows) {
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const hourScores = TIMING_HOUR_WINDOWS.map((w) => {
    const slot = byKey[w.key];
    const sc = slot != null ? Math.round(Number(slot.score)) : null;
    return sc != null && Number.isFinite(sc) ? sc : null;
  });
  const finiteHr = hourScores.filter((v) => v != null);
  const maxHr = finiteHr.length ? Math.max(...finiteHr.map(Number)) : -Infinity;
  const items = TIMING_HOUR_WINDOWS.map((w, idx) => {
    const slot = byKey[w.key];
    const sc = slot != null ? Math.round(Number(slot.score)) : null;
    const useHint =
      HOUR_USE_HINT_TH[w.key] || "ใช้เป็นข้อมูลประกอบการตั้งจิตหรือพกติดตัว";
    const rank = String(idx + 1).padStart(2, "0");
    const isTop = sc != null && Number.isFinite(sc) && sc === maxHr;
    const badge = isTop ? `<span class="aet-top-badge">เด่นสุด</span>` : "";
    if (sc == null || !Number.isFinite(sc)) {
      return {
        row: `<tr><td class="aet-cell-name">${escapeHtml(w.labelTh)}</td><td><span class="aet-score-pill aet-score-pill--na">—</span></td><td class="aet-cell-desc"><div class="aet-desc-txt">${escapeHtml(useHint)}</div></td></tr>`,
        card: `<article class="aet-rank-card"><div class="aet-rank-head"><span class="aet-rank-n">${escapeHtml(rank)}</span><strong class="aet-rank-title">${escapeHtml(w.labelTh)}</strong><span class="aet-score-pill aet-score-pill--na">—</span></div><p class="aet-rank-body">${escapeHtml(useHint)}</p></article>`,
      };
    }
    const pillCls = timingScorePillClass(sc);
    const pillInner = `${escapeHtml(String(sc))}/100`;
    const mini = timingMiniBarHtml(sc);
    return {
      row: `<tr class="${isTop ? "is-top" : ""}"><td class="aet-cell-name">${badge}${escapeHtml(w.labelTh)}</td><td><span class="${pillCls}">${pillInner}</span></td><td class="aet-cell-desc"><div class="aet-desc-txt">${escapeHtml(useHint)}</div>${mini}</td></tr>`,
      card: `<article class="aet-rank-card ${isTop ? "is-top" : ""}"><div class="aet-rank-head"><span class="aet-rank-n">${escapeHtml(rank)}</span><strong class="aet-rank-title">${badge}${escapeHtml(w.labelTh)}</strong><span class="${pillCls}">${pillInner}</span></div><p class="aet-rank-body">${escapeHtml(useHint)}</p>${mini}</article>`,
    };
  });
  return `
    <section class="aet-section" aria-labelledby="aet-d-h">
      <h2 id="aet-d-h" class="aet-h2">ตารางคะแนนช่วงเวลา</h2>
      <p class="aet-p aet-muted">คะแนนเป็นคะแนนประกอบต่อช่วงเวลาในแต่ละวัน ใช้ดูว่าช่วงไหนมีแนวโน้มเข้ากับเจ้าของและพลังของชิ้นนี้มากที่สุด</p>
      ${buildHourBarsBlock(rows)}
      <div class="aet-rank-list aet-rank-list--mobile">${items.map((x) => x.card).join("")}</div>
      <div class="aet-table-wrap">
        <table class="aet-table" aria-label="คะแนนตามช่วงเวลา">
          <thead><tr><th>ช่วงเวลา</th><th>คะแนน</th><th>เหมาะกับ</th></tr></thead>
          <tbody>${items.map((x) => x.row).join("")}</tbody>
        </table>
      </div>
    </section>`;
}

function buildSectionEHtml() {
  const parts = [
    {
      t: "ความเข้ากับเจ้าของ",
      b: "ดูจากวันเกิดและจังหวะพื้นฐานของเจ้าของ",
    },
    {
      t: "พลังเด่นของวัตถุ",
      b: "ดูว่าชิ้นนี้เด่นเรื่องใด เช่น โชคลาภ บารมี เมตตา หรือคุ้มครอง",
    },
    {
      t: "จังหวะของวัน",
      b: "ดูว่าวันใดมีแนวโน้มส่งเสริมพลังเด่นของชิ้นนี้มากที่สุด",
    },
    {
      t: "ช่วงเวลาที่เหมาะ",
      b: "ดูว่าช่วงเวลาใดเหมาะกับการตั้งจิต ขอพร หรือพกติดตัว",
    },
    {
      t: "ความสอดคล้องรวม",
      b: "รวมคะแนนประกอบทั้งหมดเพื่อเลือกวันและเวลาที่แนะนำที่สุด",
    },
  ];
  return `
    <section class="aet-section" aria-labelledby="aet-e-h">
      <h2 id="aet-e-h" class="aet-h2">สูตรแบบอ่านง่าย</h2>
      <div class="aet-formula-card">
        <p class="aet-formula-title">คะแนนจังหวะเสริมพลัง</p>
        <div class="aet-formula-stack">
          <span class="aet-formula-chip">ความเข้ากับเจ้าของ</span>
          <span class="aet-formula-plus">+</span>
          <span class="aet-formula-chip">พลังเด่นของวัตถุ</span>
          <span class="aet-formula-plus">+</span>
          <span class="aet-formula-chip">จังหวะของวัน</span>
          <span class="aet-formula-plus">+</span>
          <span class="aet-formula-chip">ช่วงเวลาที่เหมาะ</span>
          <span class="aet-formula-plus">+</span>
          <span class="aet-formula-chip">ความสอดคล้องรวม</span>
        </div>
      </div>
      ${buildFormulaDonutBlock()}
      <p class="aet-p aet-muted">อาจารย์ประเมินจาก 5 ส่วนหลักดังนี้</p>
      <div class="aet-e-cards">
        ${parts
          .map(
            (p, idx) => `
        <div class="aet-e-card">
          <div class="aet-e-bar" aria-hidden="true"></div>
          <div class="aet-e-body">
            <span class="aet-e-n">${idx + 1}</span>
            <h3 class="aet-h3">${escapeHtml(p.t)}</h3>
            <p class="aet-p">${escapeHtml(p.b)}</p>
          </div>
        </div>`,
          )
          .join("")}
      </div>
    </section>`;
}

/** @param {string} primary */
function buildSectionFHtml(primary) {
  const pk = String(primary || "").trim() || "protection";
  const base =
    "ในวันที่อาจารย์แนะนำ ให้ใช้วัตถุชิ้นนี้แบบตั้งใจมากกว่าปกติ เช่น พกติดตัว สวดคาถา ตั้งจิต หรือขอพรในเรื่องที่เกี่ยวกับพลังเด่นของชิ้นนี้";
  const extraBy = {
    luck: "ถ้าวัตถุเด่นโชคลาภ เหมาะกับการขอเปิดทางเรื่องงาน เงิน โอกาส หรือลูกค้า",
    baramee:
      "ถ้าวัตถุเด่นบารมี เหมาะกับการขอแรงหนุนเรื่องงาน ผู้ใหญ่ ความน่าเชื่อถือ และการตัดสินใจ",
    metta:
      "ถ้าวัตถุเด่นเมตตา เหมาะกับการขอให้คนรอบตัวเปิดใจ เจรจาง่าย และได้รับความเอ็นดู",
    protection:
      "ถ้าวัตถุเด่นคุ้มครอง เหมาะกับการพกติดตัวก่อนเดินทาง หรือก่อนเจอสถานการณ์ที่ต้องการความมั่นใจ",
    specialty:
      "ถ้าวัตถุเด่นงานเฉพาะทาง เหมาะกับการตั้งจิตขอพรเรื่องงาน ฝีมือ วิชา ลูกค้า เคสงาน หรืออาชีพที่เจ้าของทำอยู่จริง",
    fortune_anchor:
      "ถ้าวัตถุเด่นความมั่นคงภายใน เหมาะกับการตั้งจิตให้นิ่งและขอพรเรื่องตั้งหลักในชีวิต",
  };
  const extra = extraBy[pk] || extraBy.protection;
  return `
    <section class="aet-section" aria-labelledby="aet-f-h">
      <h2 id="aet-f-h" class="aet-h2">ควรใช้จังหวะนี้อย่างไร</h2>
      <div class="aet-steps">
        <article class="aet-step-card">
          <span class="aet-step-n">1</span>
          <h3 class="aet-h3">ตั้งจิตให้ชัด</h3>
          <p class="aet-p">เลือกเรื่องที่อยากขอหรืออยากหนุนเพียง 1 เรื่อง แล้วตั้งใจให้ชัดเจนก่อนเริ่ม</p>
        </article>
        <article class="aet-step-card">
          <span class="aet-step-n">2</span>
          <h3 class="aet-h3">ใช้ในช่วงเวลาที่แนะนำ</h3>
          <p class="aet-p">พกติดตัว สวดภาวนา หรือตั้งไว้ใกล้ตัวในช่วงเวลาที่อาจารย์แนะนำ</p>
        </article>
        <article class="aet-step-card">
          <span class="aet-step-n">3</span>
          <h3 class="aet-h3">ใช้เป็นแนวทางเสริม</h3>
          <p class="aet-p">ไม่ฝืนเกินไป และไม่ใช้แทนการตัดสินใจจริงในชีวิตประจำวัน</p>
        </article>
      </div>
      <p class="aet-p aet-muted">${escapeHtml(base)}</p>
      <p class="aet-p aet-muted">${escapeHtml(extra)}</p>
    </section>`;
}

function buildFallbackBody() {
  return `
    ${buildSectionBHtml()}
    <section class="aet-section" aria-labelledby="aet-fb-h">
      <h2 id="aet-fb-h" class="aet-h2">เมื่อยังไม่มีตารางคะแนนรายวัน</h2>
      <p class="aet-p">ถ้ายังไม่มีวันเกิดครบถ้วน หรืออาจารย์ยังประเมินจังหวะไม่ได้ชัดเจน หน้านี้จะไม่แสดงตัวเลขคะแนนเพื่อไม่ให้เข้าใจผิดว่าเป็นตัวเลขสุ่ม</p>
      <p class="aet-p">โดยหลักแล้ว อาจารย์จะดูวันเกิดของเจ้าของ พลังเด่นของวัตถุ แล้วจับคู่กับวันและช่วงเวลาที่มีแนวโน้มเข้ากันมากที่สุด เมื่อข้อมูลพร้อม ตารางคะแนนจะแสดงในหน้านี้โดยอัตโนมัติ</p>
    </section>
    ${buildSectionEHtml()}
    ${buildSectionFHtml("protection")}
    <p class="aet-disclaimer" role="note">จังหวะเสริมพลังเป็นการประเมินเชิงความเชื่อจากข้อมูลของเจ้าของและพลังของวัตถุ ใช้เพื่อเป็นแนวทางในการตั้งจิต พกติดตัว หรือขอพร ไม่ควรใช้แทนการตัดสินใจสำคัญในชีวิต</p>`;
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload — normalized (amulet lane)
 * @returns {string}
 */
export function renderAmuletEnergyTimingHtml(payload) {
  const token = String(payload.publicToken || "").trim();
  const reportBackHref = token
    ? `/r/${encodeURIComponent(token)}`
    : "/r/";

  const tv = resolveSacredAmuletTimingForEnergyPage(payload);
  const hasTimingCore =
    tv &&
    String(tv.summary?.topWeekdayLabel || "").trim() &&
    String(tv.summary?.topWindowLabel || "").trim();

  const wdRows = tv?.allWeekdayScores;
  const hrRows = tv?.allHourScores;
  const hasScoreTables =
    Array.isArray(wdRows) &&
    wdRows.length === 7 &&
    Array.isArray(hrRows) &&
    hrRows.length >= 1 &&
    wdRows.every(
      (s) =>
        s &&
        Number.isFinite(Number(s.score)) &&
        String(s.key || "").startsWith("weekday_"),
    ) &&
    TIMING_HOUR_WINDOWS.every((w) =>
      hrRows.some((h) => h && h.key === w.key && Number.isFinite(Number(h.score))),
    );

  const primary = String(payload.amuletV1?.primaryPower || "").trim();

  let mainHtml;
  if (hasTimingCore && tv) {
    mainHtml =
      buildSectionAHtml(tv, Boolean(hasScoreTables)) +
      buildSectionBHtml() +
      (hasScoreTables
        ? buildWeekdayTableHtml(wdRows) + buildHourTableHtml(hrRows)
        : "") +
      buildSectionEHtml() +
      buildSectionFHtml(primary) +
      `<p class="aet-disclaimer" role="note">จังหวะเสริมพลังเป็นการประเมินเชิงความเชื่อจากข้อมูลของเจ้าของและพลังของวัตถุ ใช้เพื่อเป็นแนวทางในการตั้งจิต พกติดตัว หรือขอพร ไม่ควรใช้แทนการตัดสินใจสำคัญในชีวิต</p>`;
  } else {
    mainHtml = buildFallbackBody();
  }

  const docTitle = "วิธีคำนวณจังหวะเสริมพลัง · Ener Scan";

  return `<!DOCTYPE html>
${amuletSubpageAutoDarkScriptHtml()}
<html lang="th">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(docTitle)}</title>
  <meta name="robots" content="noindex,nofollow"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    :root {
      color-scheme: light;
      --aet-bg: #f6f6f4;
      --aet-surface: #fcfcfa;
      --aet-elevated: #fffefb;
      --aet-border: rgba(180, 140, 40, 0.18);
      --aet-border-active: rgba(180, 140, 40, 0.32);
      --aet-gold: #b8871b;
      --aet-gold-soft: #8f6710;
      --aet-text: #241c12;
      --aet-body: rgba(36, 28, 18, 0.92);
      --aet-muted: #7a6a58;
      --aet-subtitle: rgba(36, 28, 18, 0.82);
      --aet-chip-bg: rgba(200, 155, 30, 0.08);
      --aet-chip-border: rgba(180, 140, 40, 0.22);
      --aet-panel-bg: linear-gradient(180deg, #fffdf7 0%, #fdf8ee 100%);
      --aet-guide-bg: linear-gradient(180deg, #faf8f2 0%, #f5f1e6 100%);
      --aet-btn-text: #1a1610;
      --aet-shadow: 0 4px 18px rgba(0, 0, 0, 0.07);
      --aet-divider: #ede8dd;
      --aet-score-high: #fdf3dc;
      --aet-score-mid: #f2f7ec;
      --aet-score-low: #f5f5f5;
      --aet-score-none: #f0f0f0;
      --aet-pill-bg: #fdf8ee;
      --aet-note-bg: #f9f7f2;
      --aet-donut-hole: #fffdf9;
      --aet-hero-summary-bg: rgba(252, 252, 250, 0.85);
      --aet-hero-k: #888888;
      --aet-hero-v: #a07000;
      --aet-score-pill-high-text: #a07000;
      --aet-score-pill-mid-text: #4a7020;
      --aet-score-pill-low-text: #666666;
      --aet-legend-n-text: #1a1610;
      --aet-radar-lbl-fill: #3d3320;
      --aet-radar-sc-fill: #a07000;
    }
    ${buildAmuletSubpageDarkThemeCss("aet")}
    html.amulet-subpage-dark {
      --aet-border-active: rgba(232, 197, 71, 0.32);
      --aet-divider: rgba(148, 163, 184, 0.22);
      --aet-guide-bg: linear-gradient(180deg, #151820 0%, #11141b 100%);
      --aet-score-high: rgba(232, 197, 71, 0.18);
      --aet-score-mid: rgba(110, 231, 160, 0.12);
      --aet-score-low: rgba(148, 163, 184, 0.12);
      --aet-score-none: rgba(148, 163, 184, 0.08);
      --aet-pill-bg: #151820;
      --aet-note-bg: #151820;
      --aet-donut-hole: #13151c;
      --aet-hero-summary-bg: #151820;
      --aet-hero-k: #94a3b8;
      --aet-hero-v: #e8c547;
      --aet-score-pill-high-text: #e8c547;
      --aet-score-pill-mid-text: #6ee7a0;
      --aet-score-pill-low-text: #94a3b8;
      --aet-legend-n-text: #090a0d;
      --aet-radar-lbl-fill: rgba(241, 245, 249, 0.88);
      --aet-radar-sc-fill: #e8c547;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Sarabun, system-ui, -apple-system, "Segoe UI", sans-serif;
      background: var(--aet-bg);
      color: var(--aet-text);
      line-height: 1.62;
      font-size: 1.05rem;
      -webkit-font-smoothing: antialiased;
    }
    .aet-wrap { max-width: 720px; margin: 0 auto; padding: 1.25rem 1.1rem 2.7rem; }
    .aet-back {
      display: inline-block;
      margin-bottom: 1rem;
      font-size: 0.9rem;
      color: var(--aet-gold-soft);
      text-decoration: none;
      font-weight: 600;
    }
    .aet-back:hover { text-decoration: underline; color: var(--aet-gold); }
    .aet-hero {
      margin: 0 0 1rem;
      padding: 1rem 1rem 1.05rem;
      border-radius: 20px;
      border: 1px solid var(--aet-border);
      background: var(--aet-panel-bg);
      box-shadow: var(--aet-shadow);
    }
    .aet-eyebrow {
      margin: 0 0 0.28rem;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--aet-gold-soft);
    }
    .aet-h1 {
      margin: 0 0 0.45rem;
      font-size: 1.42rem;
      font-weight: 700;
      color: var(--aet-gold);
      letter-spacing: 0.02em;
      line-height: 1.35;
    }
    .aet-sub {
      margin: 0 0 0.8rem;
      font-size: 0.95rem;
      color: var(--aet-subtitle);
      line-height: 1.66;
    }
    .aet-hero-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }
    .aet-hero-chip {
      border-radius: 999px;
      border: 1px solid var(--aet-chip-border);
      background: var(--aet-chip-bg);
      color: var(--aet-gold);
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.25rem 0.62rem;
    }
    .aet-h2 {
      margin: 0 0 0.55rem;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--aet-gold);
    }
    .aet-h3 {
      margin: 0 0 0.35rem;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--aet-gold);
    }
    .aet-p { margin: 0 0 0.75rem; font-size: 0.95rem; line-height: 1.72; color: var(--aet-body); }
    .aet-muted { color: var(--aet-muted); font-size: 0.92rem; }
    .aet-section { margin-bottom: 1.2rem; }
    .aet-card {
      background: var(--aet-surface);
      border: 1px solid rgba(180, 140, 40, 0.16);
      border-radius: 18px;
      padding: 1rem 1rem 1.05rem;
      margin-bottom: 1rem;
      box-shadow: 0 4px 18px rgba(0,0,0,0.07);
    }
    .aet-card--hero { border-color: var(--aet-border-active); }
    .aet-hero-summary {
      border: 1px solid var(--aet-border);
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 0.72rem;
      background: var(--aet-hero-summary-bg);
    }
    .aet-hero-row {
      padding: 0.62rem 0.78rem;
      border-bottom: 1px solid var(--aet-divider);
    }
    .aet-hero-row--last { border-bottom: none; }
    .aet-hero-row .aet-hero-k {
      display: block;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--aet-hero-k);
      letter-spacing: 0.02em;
      margin-bottom: 0.22rem;
    }
    .aet-hero-row .aet-hero-v {
      display: block;
      font-size: 1rem;
      font-weight: 600;
      color: var(--aet-hero-v);
      line-height: 1.35;
    }
    .aet-hero-hint { margin: 0 0 0.55rem; font-size: 0.94rem; color: var(--aet-text); line-height: 1.65; }
    .aet-hero-bridge { margin: 0; font-size: 0.93rem; color: var(--aet-subtitle); line-height: 1.65; }
    .aet-b-grid {
      display: grid;
      gap: 0.7rem;
      grid-template-columns: 1fr;
    }
    @media (min-width: 700px) {
      .aet-b-grid { grid-template-columns: 1fr 1fr; }
    }
    .aet-b-box {
      position: relative;
      background: var(--aet-surface);
      border: 1px solid rgba(180, 140, 40, 0.16);
      border-radius: 14px;
      padding: 0.82rem 2.1rem 0.82rem 0.9rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.04);
    }
    .aet-b-step {
      position: absolute;
      top: 0.55rem;
      right: 0.55rem;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1.5px solid #c8971e;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--aet-gold);
      line-height: 1;
      box-sizing: border-box;
    }
    .aet-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 0.35rem; }
    .aet-rank-list--mobile { display: grid; gap: 0.55rem; margin-top: 0.4rem; }
    .aet-rank-card {
      background: var(--aet-surface);
      border: 1px solid rgba(180, 140, 40, 0.16);
      border-radius: 13px;
      padding: 0.62rem 0.7rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.04);
    }
    .aet-rank-card.is-top {
      border-color: var(--aet-border-active);
      background: var(--aet-pill-bg);
    }
    .aet-rank-head { display: flex; align-items: center; gap: 0.45rem; }
    .aet-rank-n { font-size: 0.72rem; color: var(--aet-gold-soft); font-weight: 700; letter-spacing: 0.08em; }
    .aet-rank-title { color: var(--aet-text); font-size: 0.94rem; flex: 1; }
    .aet-rank-body { margin: 0.4rem 0 0; color: var(--aet-body); font-size: 0.88rem; line-height: 1.62; }
    .aet-score-pill {
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0.18rem 0.5rem;
      white-space: nowrap;
      display: inline-block;
    }
    .aet-score-pill--t80 {
      background: var(--aet-score-high);
      border: 1px solid #c8971e;
      color: var(--aet-score-pill-high-text);
    }
    .aet-score-pill--t60 {
      background: var(--aet-score-mid);
      border: 1px solid #7a9e4e;
      color: var(--aet-score-pill-mid-text);
    }
    .aet-score-pill--t40 {
      background: var(--aet-score-low);
      border: 1px solid #9e9e9e;
      color: var(--aet-score-pill-low-text);
    }
    .aet-score-pill--tlt40 {
      background: var(--aet-score-none);
      border: 1px solid #c5c5c5;
      color: var(--aet-score-pill-low-text);
    }
    .aet-score-pill--na {
      background: var(--aet-score-low);
      border: 1px solid #c5c5c5;
      color: var(--aet-score-pill-low-text);
    }
    .aet-top-badge {
      display: inline-block;
      margin-right: 0.35rem;
      vertical-align: middle;
      border-radius: 999px;
      padding: 0.06rem 0.42rem;
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--aet-gold);
      background: var(--aet-score-high);
      border: 1px solid #c8971e;
    }
    .aet-mini-bar-track {
      height: 4px;
      border-radius: 999px;
      background: var(--aet-divider);
      margin-top: 0.38rem;
      overflow: hidden;
      max-width: 100%;
    }
    .aet-mini-bar-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #c8971e, #e8c060);
      min-width: 0;
    }
    .aet-cell-desc .aet-desc-txt { margin: 0; }
    .aet-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    .aet-table th, .aet-table td {
      border: 1px solid var(--aet-border);
      padding: 0.45rem 0.5rem;
      text-align: left;
      vertical-align: top;
    }
    .aet-table th { background: rgba(200, 155, 30, 0.12); color: var(--aet-gold); font-weight: 700; }
    .aet-table tr.is-top td {
      border-color: var(--aet-border-active);
      background: var(--aet-pill-bg);
    }
    .aet-num { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 700; color: var(--aet-gold); }
    .aet-radar-fig { margin: 0.45rem 0 0.85rem; width: 100%; }
    .aet-radar-svg { display: block; width: 100%; max-width: 100%; }
    .aet-radar-svg .aet-radar-lbl {
      fill: var(--aet-radar-lbl-fill);
      font-size: 11px;
      font-family: Sarabun, system-ui, sans-serif;
      font-weight: 600;
    }
    .aet-radar-svg .aet-radar-sc {
      fill: var(--aet-radar-sc-fill);
      font-size: 10px;
      font-family: Sarabun, system-ui, sans-serif;
      font-weight: 700;
    }
    .aet-hour-bars {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 0.32rem;
      margin: 0.45rem 0 0.85rem;
      min-height: 108px;
      padding: 0 0.05rem 0.15rem;
    }
    .aet-hour-bar-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.28rem;
      min-width: 0;
    }
    .aet-hour-bar-num {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--aet-gold);
      line-height: 1.1;
    }
    .aet-hour-bar-track {
      width: 100%;
      max-width: 40px;
      height: 80px;
      background: var(--aet-divider);
      border-radius: 999px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      overflow: hidden;
      padding: 3px;
      box-sizing: border-box;
    }
    .aet-hour-bar-fill {
      width: 100%;
      border-radius: 999px;
      background: linear-gradient(180deg, #e8c060, #c8971e);
      min-height: 0;
      transition: height 0.2s ease;
    }
    .aet-hour-bar-col.is-max .aet-hour-bar-fill {
      box-shadow: 0 0 12px rgba(200, 151, 30, 0.55);
    }
    .aet-hour-bar-lbl {
      font-size: 0.66rem;
      color: var(--aet-body);
      text-align: center;
      line-height: 1.2;
      max-width: 100%;
    }
    .aet-formula-viz {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.85rem 1.1rem;
      margin: 0.55rem 0 0.75rem;
    }
    .aet-donut-wrap { flex-shrink: 0; }
    .aet-donut-svg { display: block; }
    .aet-donut-legend {
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1;
      min-width: 160px;
    }
    .aet-donut-legend-item {
      display: flex;
      align-items: center;
      gap: 0.42rem;
      margin-bottom: 0.32rem;
      font-size: 0.86rem;
      color: var(--aet-body);
      line-height: 1.35;
    }
    .aet-donut-legend-n {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 800;
      color: var(--aet-legend-n-text);
      border: 1px solid rgba(0,0,0,0.06);
    }
    .aet-formula-card {
      margin: 0 0 0.65rem;
      padding: 0.8rem 0.85rem;
      background: var(--aet-guide-bg);
      border: 1px solid var(--aet-border);
      border-radius: 14px;
    }
    .aet-formula-title { margin: 0 0 0.48rem; font-size: 0.92rem; font-weight: 700; color: var(--aet-gold); }
    .aet-formula-stack { display: flex; flex-wrap: wrap; align-items: center; gap: 0.32rem; }
    .aet-formula-chip {
      border-radius: 999px;
      border: 1px solid var(--aet-chip-border);
      background: var(--aet-chip-bg);
      color: var(--aet-body);
      font-size: 0.8rem;
      padding: 0.2rem 0.5rem;
    }
    .aet-formula-plus { color: var(--aet-gold-soft); font-size: 0.9rem; font-weight: 700; }
    .aet-steps { display: grid; gap: 0.55rem; margin-bottom: 0.65rem; }
    .aet-step-card {
      position: relative;
      background: var(--aet-surface);
      border: 1px solid rgba(180, 140, 40, 0.16);
      border-radius: 13px;
      padding: 0.7rem 0.8rem 0.3rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.04);
    }
    .aet-step-n {
      position: absolute;
      right: 0.7rem;
      top: 0.6rem;
      color: var(--aet-gold-soft);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .aet-e-cards { display: flex; flex-direction: column; gap: 0.55rem; }
    .aet-e-card {
      display: flex;
      gap: 0.65rem;
      background: var(--aet-surface);
      border: 1px solid rgba(180, 140, 40, 0.16);
      border-radius: 14px;
      padding: 0.65rem 0.75rem;
      align-items: stretch;
      box-shadow: 0 2px 10px rgba(0,0,0,0.04);
    }
    .aet-e-bar {
      width: 4px;
      min-width: 4px;
      border-radius: 4px;
      background: linear-gradient(180deg, #d4b04a, #a07800);
      opacity: 0.9;
    }
    .aet-e-body { flex: 1; min-width: 0; position: relative; padding-left: 0.15rem; }
    .aet-e-n {
      position: absolute;
      top: 0;
      right: 0;
      font-size: 0.7rem;
      font-weight: 800;
      color: rgba(160, 120, 40, 0.45);
    }
    .aet-disclaimer {
      margin: 1.25rem 0 1.1rem;
      padding: 0.85rem 0.95rem;
      font-size: 0.88rem;
      line-height: 1.62;
      color: var(--aet-muted);
      background: var(--aet-note-bg);
      border-radius: 10px;
      border: 1px solid rgba(180, 140, 40, 0.16);
    }
    .aet-cta {
      display: block;
      width: 100%;
      text-align: center;
      padding: 0.72rem 1rem;
      font-size: 1rem;
      font-weight: 700;
      font-family: inherit;
      color: var(--aet-btn-text);
      background: linear-gradient(165deg, #e8c547, #c9a227);
      border: none;
      border-radius: 15px;
      text-decoration: none;
      box-shadow: 0 2px 12px rgba(180, 140, 40, 0.2);
    }
    .aet-cta:hover { filter: brightness(1.05); }
    .aet-cta-wrap { margin-top: 0.25rem; }
    @media (max-width: 699px) {
      .aet-table-wrap { display: none; }
      .aet-wrap { padding: 1.2rem 1.05rem 2.5rem; }
    }
    @media (min-width: 700px) {
      .aet-rank-list--mobile { display: none; }
    }
  </style>
</head>
<body>
  <div class="aet-wrap">
    <a class="aet-back" href="${escapeHtml(reportBackHref)}">← รายงาน</a>
    <section class="aet-hero">
      <p class="aet-eyebrow">รายงาน</p>
      <h1 class="aet-h1">วิธีคำนวณจังหวะเสริมพลัง</h1>
      <p class="aet-sub">อาจารย์ประเมินจากวันเกิดของเจ้าของ พลังเด่นของวัตถุ และจังหวะวันเวลา เพื่อแนะนำช่วงที่เหมาะกับการตั้งจิต ใช้งาน หรือพกติดตัว</p>
      <div class="aet-hero-chips">
        <span class="aet-hero-chip">วันแนะนำ</span>
        <span class="aet-hero-chip">ช่วงเวลา</span>
        <span class="aet-hero-chip">แนวใช้</span>
        <span class="aet-hero-chip">Score-based</span>
      </div>
    </section>
    ${mainHtml}
    <div class="aet-cta-wrap">
      <a class="aet-cta" href="${escapeHtml(reportBackHref)}">กลับไปหน้ารายงาน</a>
    </div>
  </div>
</body>
</html>`;
}

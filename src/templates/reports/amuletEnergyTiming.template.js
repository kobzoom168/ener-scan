/**
 * Standalone public page: วิธีคำนวณจังหวะเสริมพลัง (sacred amulet HTML v2 lane).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { resolveSacredAmuletTimingForEnergyPage } from "../../utils/reports/sacredAmuletTimingEnrich.util.js";
import { TIMING_HOUR_WINDOWS } from "../../config/timing/timingWindows.config.js";
import { TIMING_WEEKDAY_LABEL_TH } from "../../config/timing/timingWeekdayAffinity.config.js";

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
 * @param {import("../../services/reports/reportPayload.types.js").ReportTimingV1} tv
 * @param {boolean} hasScoreTables
 */
function buildSectionAHtml(tv, hasScoreTables) {
  const day = String(tv.summary?.topWeekdayLabel || "").trim() || "—";
  const win = String(tv.summary?.topWindowLabel || "").trim() || "—";
  const mode = String(tv.ritualMode || "").trim() || "—";
  const hint = String(tv.summary?.practicalHint || "").trim();
  const bridge = hasScoreTables
    ? `จากคะแนนรวม ระบบพบว่า ${day} กับ ${win} เป็นจังหวะที่เข้ากับพลังของวัตถุชิ้นนี้มากที่สุดเมื่อเทียบกับช่วงอื่นในตารางด้านล่าง`
    : `ระบบประเมินจากวันเกิดของเจ้าของ พลังเด่นของวัตถุ และจังหวะวันเวลา แล้วเลือก ${day} กับ ${win} เป็นจังหวะที่เหมาะที่สุดในรอบนี้`;

  return `
    <section class="aet-card aet-card--hero" aria-labelledby="aet-a-h">
      <h2 id="aet-a-h" class="aet-h2">สรุปผลที่ระบบแนะนำ</h2>
      <div class="aet-hero-grid">
        <div class="aet-hero-item"><span class="aet-hero-k">วันแนะนำ</span><span class="aet-hero-v">${escapeHtml(day)}</span></div>
        <div class="aet-hero-item"><span class="aet-hero-k">ช่วงเวลาแนะนำ</span><span class="aet-hero-v">${escapeHtml(win)}</span></div>
        <div class="aet-hero-item"><span class="aet-hero-k">แนวใช้แนะนำ</span><span class="aet-hero-v">${escapeHtml(mode)}</span></div>
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
      <h2 id="aet-b-h" class="aet-h2">ระบบดูจากอะไรบ้าง</h2>
      <div class="aet-b-grid">
        ${boxes
          .map(
            (x) => `
        <div class="aet-b-box">
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
 * @param {string} [topWeekdayLabel]
 */
function buildWeekdayTableHtml(rows, topWeekdayLabel = "") {
  const items = rows.map((slot, i) => {
    const label =
      TIMING_WEEKDAY_LABEL_TH[i] ||
      String(slot.key || "").replace(/^weekday_/, "วัน");
    const sc = Number(slot.score);
    const meaning =
      WEEKDAY_MEANING_TH[i] ||
      (String(slot.reasonText || "").trim() || "—");
    const rank = String(i + 1).padStart(2, "0");
    const isTop = String(label).trim() === String(topWeekdayLabel).trim();
    return {
      row: `<tr class="${isTop ? "is-top" : ""}"><td>${escapeHtml(label)}</td><td class="aet-num">${escapeHtml(String(Math.round(sc)))}</td><td>${escapeHtml(meaning)}</td></tr>`,
      card: `<article class="aet-rank-card ${isTop ? "is-top" : ""}"><div class="aet-rank-head"><span class="aet-rank-n">${escapeHtml(rank)}</span><strong class="aet-rank-title">${escapeHtml(label)}</strong><span class="aet-score-pill">${escapeHtml(String(Math.round(sc)))}/100</span></div><p class="aet-rank-body">${escapeHtml(meaning)}</p></article>`,
    };
  });
  return `
    <section class="aet-section" aria-labelledby="aet-c-h">
      <h2 id="aet-c-h" class="aet-h2">ตารางคะแนนวัน</h2>
      <p class="aet-p aet-muted">คะแนนเป็นคะแนนประกอบจากระบบ ใช้เปรียบเทียบวันในสัปดาห์กับเจ้าของและพลังของวัตถุ</p>
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
 * @param {string} [topWindowLabel]
 */
function buildHourTableHtml(rows, topWindowLabel = "") {
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const items = TIMING_HOUR_WINDOWS.map((w, idx) => {
    const slot = byKey[w.key];
    const sc = slot != null ? Math.round(Number(slot.score)) : null;
    const useHint =
      HOUR_USE_HINT_TH[w.key] || "ใช้เป็นข้อมูลประกอบการตั้งจิตหรือพกติดตัว";
    const rank = String(idx + 1).padStart(2, "0");
    const isTop = String(w.labelTh).trim() === String(topWindowLabel).trim();
    if (sc == null || !Number.isFinite(sc)) {
      return {
        row: `<tr><td>${escapeHtml(w.labelTh)}</td><td class="aet-num">—</td><td>${escapeHtml(useHint)}</td></tr>`,
        card: `<article class="aet-rank-card"><div class="aet-rank-head"><span class="aet-rank-n">${escapeHtml(rank)}</span><strong class="aet-rank-title">${escapeHtml(w.labelTh)}</strong><span class="aet-score-pill is-muted">—</span></div><p class="aet-rank-body">${escapeHtml(useHint)}</p></article>`,
      };
    }
    return {
      row: `<tr class="${isTop ? "is-top" : ""}"><td>${escapeHtml(w.labelTh)}${isTop ? '<span class="aet-recommend">แนะนำ</span>' : ""}</td><td class="aet-num">${escapeHtml(String(sc))}</td><td>${escapeHtml(useHint)}</td></tr>`,
      card: `<article class="aet-rank-card ${isTop ? "is-top" : ""}"><div class="aet-rank-head"><span class="aet-rank-n">${escapeHtml(rank)}</span><strong class="aet-rank-title">${escapeHtml(w.labelTh)}</strong><span class="aet-score-pill">${escapeHtml(String(sc))}/100</span></div><p class="aet-rank-body">${escapeHtml(useHint)}</p></article>`,
    };
  });
  return `
    <section class="aet-section" aria-labelledby="aet-d-h">
      <h2 id="aet-d-h" class="aet-h2">ตารางคะแนนช่วงเวลา</h2>
      <p class="aet-p aet-muted">คะแนนเป็นคะแนนประกอบต่อช่วงเวลาในแต่ละวัน ใช้ดูว่าช่วงไหนมีแนวโน้มเข้ากับเจ้าของและพลังของชิ้นนี้มากที่สุด</p>
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
      <p class="aet-p aet-muted">ระบบประเมินจาก 5 ส่วนหลักดังนี้</p>
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
    "ในวันที่ระบบแนะนำ ให้ใช้วัตถุชิ้นนี้แบบตั้งใจมากกว่าปกติ เช่น พกติดตัว สวดคาถา ตั้งจิต หรือขอพรในเรื่องที่เกี่ยวกับพลังเด่นของชิ้นนี้";
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
          <p class="aet-p">พกติดตัว สวดภาวนา หรือตั้งไว้ใกล้ตัวในช่วงเวลาที่ระบบแนะนำ</p>
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
      <p class="aet-p">ถ้ายังไม่มีวันเกิดครบถ้วน หรือระบบยังประเมินจังหวะไม่ได้ชัดเจน หน้านี้จะไม่แสดงตัวเลขคะแนนเพื่อไม่ให้เข้าใจผิดว่าเป็นตัวเลขสุ่ม</p>
      <p class="aet-p">โดยหลักแล้ว ระบบจะดูวันเกิดของเจ้าของ พลังเด่นของวัตถุ แล้วจับคู่กับวันและช่วงเวลาที่มีแนวโน้มเข้ากันมากที่สุด เมื่อข้อมูลพร้อม ตารางคะแนนจะแสดงในหน้านี้โดยอัตโนมัติ</p>
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
        ? buildWeekdayTableHtml(wdRows, tv.summary?.topWeekdayLabel) +
          buildHourTableHtml(hrRows, tv.summary?.topWindowLabel)
        : "") +
      buildSectionEHtml() +
      buildSectionFHtml(primary) +
      `<p class="aet-disclaimer" role="note">จังหวะเสริมพลังเป็นการประเมินเชิงความเชื่อจากข้อมูลของเจ้าของและพลังของวัตถุ ใช้เพื่อเป็นแนวทางในการตั้งจิต พกติดตัว หรือขอพร ไม่ควรใช้แทนการตัดสินใจสำคัญในชีวิต</p>`;
  } else {
    mainHtml = buildFallbackBody();
  }

  const docTitle = "วิธีคำนวณจังหวะเสริมพลัง · Ener Scan";

  return `<!DOCTYPE html>
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
      --aet-bg: #07090d;
      --aet-surface: linear-gradient(180deg, #111722 0%, #0b1018 100%);
      --aet-border: rgba(242, 201, 76, 0.14);
      --aet-border-active: rgba(242, 201, 76, 0.32);
      --aet-gold: #f2c94c;
      --aet-gold-soft: rgba(242, 201, 76, 0.65);
      --aet-text: rgba(245, 247, 250, 0.92);
      --aet-body: rgba(225, 231, 240, 0.8);
      --aet-muted: rgba(160, 170, 190, 0.68);
      --aet-subtitle: rgba(225, 231, 240, 0.82);
      --aet-chip-bg: rgba(242, 201, 76, 0.08);
      --aet-chip-border: rgba(242, 201, 76, 0.18);
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
      background: linear-gradient(135deg, rgba(17,23,34,1), rgba(38,31,12,.55));
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
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
      color: var(--aet-gold-soft);
    }
    .aet-p { margin: 0 0 0.75rem; font-size: 0.95rem; line-height: 1.72; color: var(--aet-body); }
    .aet-muted { color: var(--aet-muted); font-size: 0.92rem; }
    .aet-section { margin-bottom: 1.2rem; }
    .aet-card {
      background: var(--aet-surface);
      border: 1px solid var(--aet-border);
      border-radius: 18px;
      padding: 1rem 1rem 1.05rem;
      margin-bottom: 1rem;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
    }
    .aet-card--hero { border-color: var(--aet-border-active); }
    .aet-hero-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.6rem;
      margin-bottom: 0.72rem;
    }
    .aet-hero-item {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(242, 201, 76, 0.16);
      border-radius: 12px;
      padding: 0.62rem 0.72rem;
    }
    .aet-hero-k {
      display: block;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--aet-muted);
      letter-spacing: 0.04em;
      margin-bottom: 0.2rem;
    }
    .aet-hero-v { font-size: 1rem; font-weight: 800; color: var(--aet-gold); }
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
      background: var(--aet-surface);
      border: 1px solid var(--aet-border);
      border-radius: 14px;
      padding: 0.82rem 0.9rem;
    }
    .aet-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 0.35rem; }
    .aet-rank-list--mobile { display: grid; gap: 0.55rem; margin-top: 0.4rem; }
    .aet-rank-card {
      background: var(--aet-surface);
      border: 1px solid var(--aet-border);
      border-radius: 13px;
      padding: 0.62rem 0.7rem;
    }
    .aet-rank-card.is-top { border-color: var(--aet-border-active); }
    .aet-rank-head { display: flex; align-items: center; gap: 0.45rem; }
    .aet-rank-n { font-size: 0.72rem; color: var(--aet-gold-soft); font-weight: 700; letter-spacing: 0.08em; }
    .aet-rank-title { color: var(--aet-text); font-size: 0.94rem; flex: 1; }
    .aet-rank-body { margin: 0.4rem 0 0; color: var(--aet-body); font-size: 0.88rem; line-height: 1.62; }
    .aet-score-pill {
      border-radius: 999px;
      border: 1px solid var(--aet-chip-border);
      background: var(--aet-chip-bg);
      color: var(--aet-gold);
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0.18rem 0.5rem;
      white-space: nowrap;
    }
    .aet-score-pill.is-muted { color: var(--aet-muted); }
    .aet-recommend {
      margin-left: 0.4rem;
      border-radius: 999px;
      border: 1px solid var(--aet-chip-border);
      background: var(--aet-chip-bg);
      color: var(--aet-gold);
      font-size: 0.72rem;
      padding: 0.04rem 0.38rem;
    }
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
    .aet-table th { background: rgba(242, 201, 76, 0.1); color: var(--aet-gold-soft); font-weight: 700; }
    .aet-table tr.is-top td { border-color: var(--aet-border-active); }
    .aet-num { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 700; color: var(--aet-gold); }
    .aet-formula-card {
      margin: 0 0 0.65rem;
      padding: 0.8rem 0.85rem;
      background: var(--aet-surface);
      border: 1px solid var(--aet-border);
      border-radius: 14px;
    }
    .aet-formula-title { margin: 0 0 0.48rem; font-size: 0.92rem; font-weight: 700; color: var(--aet-gold); }
    .aet-formula-stack { display: flex; flex-wrap: wrap; align-items: center; gap: 0.32rem; }
    .aet-formula-chip {
      border-radius: 999px;
      border: 1px solid var(--aet-chip-border);
      background: var(--aet-chip-bg);
      color: var(--aet-text);
      font-size: 0.8rem;
      padding: 0.2rem 0.5rem;
    }
    .aet-formula-plus { color: var(--aet-gold-soft); font-size: 0.9rem; font-weight: 700; }
    .aet-steps { display: grid; gap: 0.55rem; margin-bottom: 0.65rem; }
    .aet-step-card {
      position: relative;
      background: var(--aet-surface);
      border: 1px solid var(--aet-border);
      border-radius: 13px;
      padding: 0.7rem 0.8rem 0.3rem;
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
      border: 1px solid var(--aet-border);
      border-radius: 14px;
      padding: 0.65rem 0.75rem;
      align-items: stretch;
    }
    .aet-e-bar {
      width: 4px;
      min-width: 4px;
      border-radius: 4px;
      background: linear-gradient(180deg, #e8c547, #8a7020);
      opacity: 0.85;
    }
    .aet-e-body { flex: 1; min-width: 0; position: relative; padding-left: 0.15rem; }
    .aet-e-n {
      position: absolute;
      top: 0;
      right: 0;
      font-size: 0.7rem;
      font-weight: 800;
      color: rgba(212, 175, 55, 0.45);
    }
    .aet-disclaimer {
      margin: 1.25rem 0 1.1rem;
      padding: 0.85rem 0.95rem;
      font-size: 0.88rem;
      line-height: 1.62;
      color: var(--aet-muted);
      background: rgba(255,255,255,0.03);
      border-radius: 10px;
      border-left: 2px solid rgba(242, 201, 76, 0.42);
    }
    .aet-cta {
      display: block;
      width: 100%;
      text-align: center;
      padding: 0.72rem 1rem;
      font-size: 1rem;
      font-weight: 700;
      font-family: inherit;
      color: #0a0c10;
      background: linear-gradient(165deg, #e8c547, #c9a227);
      border: none;
      border-radius: 15px;
      text-decoration: none;
      box-shadow: 0 2px 12px rgba(212, 175, 55, 0.25);
    }
    .aet-cta:hover { filter: brightness(1.05); }
    .aet-cta-wrap { margin-top: 0.25rem; }
    @media (max-width: 699px) {
      .aet-table-wrap { display: none; }
      .aet-hero-grid { grid-template-columns: 1fr; }
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
      <p class="aet-sub">ระบบประเมินจากวันเกิดของเจ้าของ พลังเด่นของวัตถุ และจังหวะวันเวลา เพื่อแนะนำช่วงที่เหมาะกับการตั้งจิต ใช้งาน หรือพกติดตัว</p>
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

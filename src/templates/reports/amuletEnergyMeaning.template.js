/**
 * Standalone public page: ความหมายพลังทั้ง 6 ด้าน (sacred amulet HTML v2 lane).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { buildAmuletHtmlV2ViewModel } from "../../amulet/amuletHtmlV2.model.js";
import { POWER_LABEL_THAI, POWER_ORDER } from "../../amulet/amuletScores.util.js";

/** @typedef {import("../../amulet/amuletScores.util.js").AmuletPowerKey} AmuletPowerKey */

/**
 * @type {Record<AmuletPowerKey, { body: string, useFor: string[], foot: string }>}
 */
const AXIS_MEANING = {
  baramee: {
    body: "ด้านนี้สื่อถึงพลังของความหนักแน่น ความน่าเชื่อถือ และแรงนำในตัวเจ้าของ ถ้าคะแนนด้านนี้สูง แปลว่าวัตถุชิ้นนี้มีแนวโน้มช่วยเสริมบุคลิกให้ดูมั่นคงขึ้น พูดแล้วมีน้ำหนักขึ้น หรือเหมาะกับช่วงที่ต้องตัดสินใจ เจรจา พบผู้ใหญ่ นำทีม หรือทำเรื่องที่ต้องใช้ความน่าเชื่อถือ",
    useFor: [
      "งานบริหาร",
      "การเจรจา",
      "การพบผู้ใหญ่",
      "การตัดสินใจเรื่องสำคัญ",
      "การสร้างความน่าเชื่อถือ",
    ],
    foot: "คะแนนสูงไม่ได้หมายถึงการมีอำนาจเหนือผู้อื่น แต่หมายถึงแรงหนุนให้เจ้าของดูนิ่ง หนักแน่น และมีหลักมากขึ้น",
  },
  specialty: {
    body: "ด้านนี้สื่อถึงพลังที่ช่วยหนุนงานที่ต้องใช้ฝีมือ ความชำนาญ หรือความสามารถเฉพาะตัว เช่น งานขาย งานช่าง งานบริการ งานรักษา งานเจรจา งานสายวิชา หรืองานที่ต้องใช้ประสบการณ์ของเจ้าของโดยตรง ถ้าคะแนนด้านนี้สูง แปลว่าวัตถุชิ้นนี้มีแนวโน้มช่วยเสริมจังหวะการทำงาน ให้ทำงานได้เข้าทางขึ้น ใช้ความสามารถได้ชัดขึ้น หรือเหมาะกับคนที่มีอาชีพเฉพาะทาง",
    useFor: [
      "งานที่ต้องใช้ทักษะ",
      "งานขายหรือติดต่อลูกค้า",
      "งานบริการ",
      "งานฝีมือ",
      "งานที่ต้องใช้ความชำนาญส่วนตัว",
    ],
    foot: "ด้านนี้ไม่ใช่โชคลอย ๆ แต่เป็นพลังที่ช่วยหนุนสิ่งที่เจ้าของลงมือทำอยู่แล้ว",
  },
  luck: {
    body: "ด้านนี้สื่อถึงโอกาส ช่องทางใหม่ และจังหวะที่เรื่องต่าง ๆ เริ่มขยับ ถ้าคะแนนด้านนี้สูง แปลว่าวัตถุชิ้นนี้มีแนวโน้มช่วยเรื่องการเปิดทาง เช่น มีคนแนะนำ มีโอกาสใหม่เข้ามา งานเริ่มเดิน เงินเริ่มขยับ หรือเรื่องที่ติดอยู่เริ่มมีทางออก",
    useFor: [
      "การค้าขาย",
      "การเริ่มงานใหม่",
      "การหาโอกาสใหม่",
      "การเปิดช่องทางรายได้",
      "การผลักดันเรื่องที่ค้างอยู่",
    ],
    foot: "โชคลาภในที่นี้ไม่ได้หมายถึงการถูกรางวัลอย่างเดียว แต่รวมถึงโอกาสและจังหวะดี ๆ ที่เข้ามาในชีวิต",
  },
  fortune_anchor: {
    body: "ด้านนี้สื่อถึงพลังที่ช่วยประคองจังหวะชีวิต ทำให้เจ้าของตั้งหลักได้ดีขึ้น ไม่แกว่งง่าย และกลับมาอยู่กับตัวเองได้เร็วขึ้น ถ้าคะแนนด้านนี้สูง แปลว่าวัตถุชิ้นนี้เหมาะกับช่วงที่ชีวิตมีเรื่องให้คิดหลายทาง กำลังเปลี่ยนแปลง เหนื่อยง่าย หรืออยากเรียกความมั่นคงกลับมา",
    useFor: [
      "ช่วงชีวิตไม่นิ่ง",
      "ช่วงเปลี่ยนงานหรือเปลี่ยนเส้นทาง",
      "ช่วงต้องตัดสินใจหลายเรื่อง",
      "การเรียกความมั่นใจกลับมา",
      "การตั้งหลักใหม่",
    ],
    foot: "พลังด้านนี้จะออกแนวประคองและช่วยให้มั่นคง ไม่ได้พุ่งแรงแบบโชคลาภหรือเปิดทาง",
  },
  metta: {
    body: "ด้านนี้สื่อถึงพลังของความนุ่มนวล เสน่ห์ทางใจ และการได้รับความเมตตาจากคนรอบตัว ถ้าคะแนนด้านนี้สูง แปลว่าวัตถุชิ้นนี้มีแนวโน้มช่วยให้เจ้าของดูเข้าถึงง่ายขึ้น คนฟังง่ายขึ้น เจรจาง่ายขึ้น หรือมีโอกาสได้รับความช่วยเหลือและความเอ็นดูจากผู้อื่นมากขึ้น",
    useFor: [
      "งานขาย",
      "งานบริการ",
      "การเจรจา",
      "การขอความช่วยเหลือ",
      "ความสัมพันธ์กับคนรอบตัว",
      "การติดต่อลูกค้าหรือผู้ใหญ่",
    ],
    foot: "พลังเมตตาไม่ได้แปลว่าทุกคนต้องรักเราเสมอไป แต่เป็นแรงที่ช่วยให้บรรยากาศรอบตัวนุ่มขึ้นและคุยกันง่ายขึ้น",
  },
  protection: {
    body: "ด้านนี้สื่อถึงพลังของการป้องกัน การตั้งขอบเขต และการช่วยกันแรงกระทบจากสิ่งรอบตัว ถ้าคะแนนด้านนี้สูง แปลว่าวัตถุชิ้นนี้มีแนวโน้มช่วยให้เจ้าของรู้สึกมั่นคงขึ้น มีเกราะทางใจมากขึ้น หรือเหมาะกับการพกติดตัวในช่วงที่ต้องเดินทาง เจอคนเยอะ หรืออยู่ในสถานการณ์ที่รู้สึกไม่สบายใจ",
    useFor: [
      "การเดินทาง",
      "การพกติดตัว",
      "ช่วงเจอสภาพแวดล้อมวุ่นวาย",
      "ช่วงต้องการความมั่นใจ",
      "การตั้งขอบเขตให้ตัวเอง",
    ],
    foot: "พลังคุ้มครองไม่ได้หมายถึงการกันทุกอย่างได้แน่นอน แต่เป็นพลังเชิงประคอง ช่วยให้เจ้าของนิ่งขึ้นและไม่รับแรงรอบตัวมากเกินไป",
  },
};

/** @type {Record<AmuletPowerKey, string>} */
const AXIS_SUMMARY = {
  baramee: "พลังความหนักแน่น ความน่าเชื่อถือ และแรงนำในบทบาทสำคัญ",
  specialty: "พลังหนุนงานที่ต้องใช้ทักษะเฉพาะ ฝีมือ และความชำนาญ",
  luck: "พลังโอกาสใหม่ การเปิดทาง และจังหวะที่เรื่องเริ่มขยับ",
  fortune_anchor: "พลังประคองจังหวะชีวิต ช่วยตั้งหลักให้ใจนิ่งและมั่นคง",
  metta: "พลังเมตตา เสน่ห์ทางใจ และความราบรื่นในการสื่อสาร",
  protection: "พลังคุ้มครอง การตั้งขอบเขต และลดแรงกระทบจากรอบตัว",
};

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload normalized (amulet lane)
 * @returns {string}
 */
export function renderAmuletEnergyMeaningHtml(payload) {
  const vm = buildAmuletHtmlV2ViewModel(payload);
  const rows = vm.lifeAreaDetail?.rows;
  const token = String(payload.publicToken || "").trim();
  const reportBackHref = token
    ? `/r/${encodeURIComponent(token)}`
    : "/r/";

  /** @type {AmuletPowerKey[]} */
  let order;
  if (Array.isArray(rows) && rows.length === 6) {
    order = rows.map((r) => /** @type {AmuletPowerKey} */ (r.key));
  } else {
    order = [...POWER_ORDER];
  }

  /** @type {Record<string, number | null>} */
  const scoreByKey = {};
  if (Array.isArray(rows)) {
    for (const r of rows) {
      scoreByKey[r.key] =
        r.score != null && Number.isFinite(Number(r.score)) ? Number(r.score) : null;
    }
  }

  const cardsHtml = order
    .map((key) => {
      const block = AXIS_MEANING[key];
      if (!block) return "";
      const title = POWER_LABEL_THAI[key] || key;
      const sc = scoreByKey[key];
      const useList = block.useFor
        .map((line) => `<span class="aem-chip">${escapeHtml(line)}</span>`)
        .join("");
      const idx = String(order.indexOf(key) + 1).padStart(2, "0");
      const scorePill =
        sc != null
          ? `<span class="aem-score-pill">${escapeHtml(String(Math.round(sc)))}/100</span>`
          : `<span class="aem-score-pill is-muted">N/A</span>`;
      return `
    <article class="aem-card" data-axis="${escapeHtml(key)}">
      <div class="aem-card-head">
        <div class="aem-title-wrap">
          <span class="aem-index">${escapeHtml(idx)}</span>
          <h2 class="aem-card-title">${escapeHtml(title)}</h2>
        </div>
        ${scorePill}
      </div>
      <p class="aem-card-summary">${escapeHtml(AXIS_SUMMARY[key] || block.body)}</p>
      <div class="aem-use-wrap">
        <p class="aem-use-h">เหมาะกับ</p>
        <div class="aem-chip-list">${useList}</div>
      </div>
      <p class="aem-card-detail">${escapeHtml(block.body)}</p>
      <p class="aem-card-foot">${escapeHtml(block.foot)}</p>
    </article>`;
    })
    .join("");

  const docTitle = "ความหมายพลังทั้ง 6 ด้าน · Ener Scan";

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
      --aem-bg: #07090d;
      --aem-surface: linear-gradient(180deg, #141923 0%, #0f131b 100%);
      --aem-border: rgba(218, 176, 65, 0.24);
      --aem-gold: #f4c542;
      --aem-gold-soft: #b9922f;
      --aem-text: #f8fafc;
      --aem-muted: #a1a1aa;
      --aem-subtitle: #c6cad3;
      --aem-chip-bg: rgba(244, 197, 66, 0.08);
      --aem-chip-border: rgba(244, 197, 66, 0.2);
      --aem-score-bg: rgba(244, 197, 66, 0.1);
      --aem-score-border: rgba(244, 197, 66, 0.36);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Sarabun, system-ui, -apple-system, "Segoe UI", sans-serif;
      background: var(--aem-bg);
      color: var(--aem-text);
      line-height: 1.6;
      font-size: 1.05rem;
      -webkit-font-smoothing: antialiased;
    }
    .aem-wrap { max-width: 720px; margin: 0 auto; padding: 1.25rem 1.15rem 2.8rem; }
    .aem-back {
      display: inline-block;
      margin-bottom: 1rem;
      font-size: 0.9rem;
      color: var(--aem-gold-soft);
      text-decoration: none;
      font-weight: 600;
    }
    .aem-back:hover { text-decoration: underline; color: var(--aem-gold); }
    .aem-hero {
      margin-bottom: 1rem;
      padding: 1rem 1rem 1.05rem;
      border-radius: 20px;
      border: 1px solid var(--aem-border);
      background:
        radial-gradient(circle at top right, rgba(244,197,66,0.11), rgba(244,197,66,0) 48%),
        #0d1118;
      box-shadow: 0 8px 28px rgba(0,0,0,0.35);
    }
    .aem-eyebrow {
      margin: 0 0 0.25rem;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--aem-gold-soft);
      font-weight: 700;
    }
    .aem-h1 {
      margin: 0 0 0.45rem;
      font-size: 1.45rem;
      font-weight: 700;
      color: var(--aem-gold);
      letter-spacing: 0.02em;
      line-height: 1.35;
    }
    .aem-sub {
      margin: 0 0 0.8rem;
      font-size: 0.96rem;
      color: var(--aem-subtitle);
      line-height: 1.65;
    }
    .aem-mini-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .aem-mini-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.28rem 0.62rem;
      border-radius: 999px;
      border: 1px solid var(--aem-chip-border);
      background: var(--aem-chip-bg);
      color: var(--aem-gold);
      font-size: 0.8rem;
      font-weight: 600;
    }
    .aem-guide {
      margin: 0 0 1rem;
      border: 1px solid var(--aem-border);
      border-radius: 18px;
      padding: 0.95rem;
      background: #0d1118;
    }
    .aem-guide-title {
      margin: 0 0 0.55rem;
      color: var(--aem-gold);
      font-size: 0.94rem;
      font-weight: 700;
    }
    .aem-guide-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.45rem;
    }
    .aem-guide-chip {
      padding: 0.46rem 0.6rem;
      border: 1px solid var(--aem-chip-border);
      border-radius: 10px;
      background: var(--aem-chip-bg);
      color: var(--aem-subtitle);
      font-size: 0.83rem;
      line-height: 1.35;
    }
    .aem-card {
      background: var(--aem-surface);
      border: 1px solid var(--aem-border);
      border-radius: 20px;
      padding: 0.96rem 1rem 1.02rem;
      margin-bottom: 1.06rem;
      box-shadow: 0 8px 28px rgba(0,0,0,0.35);
      transition: transform 0.18s ease, border-color 0.18s ease;
    }
    @media (hover: hover) and (pointer: fine) {
      .aem-card:hover {
        transform: translateY(-2px);
        border-color: rgba(244, 197, 66, 0.38);
      }
    }
    .aem-card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.45rem;
    }
    .aem-title-wrap {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      min-width: 0;
    }
    .aem-index {
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      color: var(--aem-gold-soft);
      padding: 0.2rem 0.28rem 0.15rem;
      border: 1px solid rgba(244, 197, 66, 0.18);
      border-radius: 8px;
      background: rgba(244, 197, 66, 0.04);
      line-height: 1;
      flex-shrink: 0;
    }
    .aem-card-title {
      margin: 0;
      font-size: 1.04rem;
      font-weight: 700;
      color: var(--aem-gold);
      line-height: 1.35;
    }
    .aem-score-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.24rem 0.56rem;
      border-radius: 999px;
      border: 1px solid var(--aem-score-border);
      background: var(--aem-score-bg);
      color: var(--aem-gold);
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      flex-shrink: 0;
    }
    .aem-score-pill.is-muted { color: var(--aem-muted); }
    .aem-card-summary {
      margin: 0 0 0.62rem;
      font-size: 0.95rem;
      color: var(--aem-text);
      line-height: 1.58;
    }
    .aem-use-wrap { margin: 0 0 0.66rem; }
    .aem-use-h {
      margin: 0 0 0.42rem;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--aem-muted);
    }
    .aem-chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.42rem;
    }
    .aem-chip {
      display: inline-flex;
      align-items: center;
      padding: 0.24rem 0.56rem;
      border-radius: 999px;
      border: 1px solid var(--aem-chip-border);
      background: var(--aem-chip-bg);
      font-size: 0.82rem;
      color: var(--aem-subtitle);
    }
    .aem-card-detail {
      margin: 0;
      font-size: 0.89rem;
      line-height: 1.58;
      color: #d6d9e0;
    }
    .aem-card-foot {
      margin: 0.6rem 0 0;
      font-size: 0.84rem;
      color: var(--aem-muted);
      line-height: 1.56;
      padding: 0.52rem 0.58rem;
      border: 1px solid rgba(244, 197, 66, 0.15);
      border-radius: 10px;
      background: rgba(255,255,255,0.02);
    }
    .aem-disclaimer {
      margin: 1.5rem 0 1.25rem;
      padding: 0.85rem 0.95rem;
      font-size: 0.88rem;
      line-height: 1.62;
      color: var(--aem-muted);
      background: rgba(0,0,0,0.25);
      border-radius: 10px;
      border: 1px solid rgba(218, 176, 65, 0.16);
    }
    .aem-cta {
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
      border-radius: 12px;
      text-decoration: none;
      box-shadow: 0 2px 12px rgba(212, 175, 55, 0.25);
    }
    .aem-cta:hover { filter: brightness(1.06); }
    .aem-cta-wrap { margin-top: 0.25rem; }
  </style>
</head>
<body>
  <div class="aem-wrap">
    <a class="aem-back" href="${escapeHtml(reportBackHref)}">← รายงาน</a>
    <section class="aem-hero">
      <p class="aem-eyebrow">รายงาน</p>
      <h1 class="aem-h1">ความหมายพลังทั้ง 6 ด้าน</h1>
      <p class="aem-sub">คะแนนพลังแต่ละด้านใช้เพื่อบอกแนวโน้มว่าแรงของวัตถุเด่นไปทางไหน คะแนนสูงไม่ได้แปลว่าดีที่สุดเสมอไป แต่บอกว่าด้านนั้นส่งแรงชัดกว่าด้านอื่น</p>
      <div class="aem-mini-stats">
        <span class="aem-mini-chip">6 มิติพลัง</span>
        <span class="aem-mini-chip">Score-based</span>
        <span class="aem-mini-chip">Sacred Amulet Lane</span>
      </div>
    </section>
    <section class="aem-guide" aria-label="วิธีอ่านคะแนน">
      <p class="aem-guide-title">วิธีอ่านคะแนน</p>
      <div class="aem-guide-grid">
        <div class="aem-guide-chip">80–100: เด่นชัด</div>
        <div class="aem-guide-chip">60–79: มีแรงสนับสนุนดี</div>
        <div class="aem-guide-chip">40–59: พลังรอง / พอมี</div>
        <div class="aem-guide-chip">ต่ำกว่า 40: ไม่ใช่แกนหลัก</div>
      </div>
    </section>
    ${cardsHtml}
    <p class="aem-disclaimer" role="note">ผลการอ่านพลังเป็นการตีความเชิงความเชื่อและการสะท้อนแนวพลังของวัตถุ ควรใช้ประกอบการพิจารณา ไม่ควรใช้แทนการตัดสินใจสำคัญในชีวิต</p>
    <div class="aem-cta-wrap">
      <a class="aem-cta" href="${escapeHtml(reportBackHref)}">กลับไปหน้ารายงาน</a>
    </div>
  </div>
</body>
</html>`;
}

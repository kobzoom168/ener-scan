/**
 * Standalone public page: ความหมายพลังทั้ง 6 ด้าน (sacred amulet HTML v2 lane).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import { buildAmuletHtmlV2ViewModel } from "../../amulet/amuletHtmlV2.model.js";
import { POWER_LABEL_THAI, POWER_ORDER } from "../../amulet/amuletScores.util.js";

/** @typedef {import("../../amulet/amuletScores.util.js").AmuletPowerKey} AmuletPowerKey */

/**
 * Long-form copy per axis — plain Thai, no fortune-telling absolutes.
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

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload normalized (amulet lane)
 * @returns {string} full HTML document
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
      const scoreLine =
        sc != null
          ? `<p class="aem-score-line">คะแนนของชิ้นนี้: <strong>${escapeHtml(String(Math.round(sc)))}</strong></p>`
          : "";
      const useList = block.useFor
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("");
      return `
    <article class="aem-card" data-axis="${escapeHtml(key)}">
      <h2 class="aem-card-title">${escapeHtml(title)}</h2>
      ${scoreLine}
      <p class="aem-card-body">${escapeHtml(block.body)}</p>
      <div class="aem-use-wrap">
        <p class="aem-use-h">เหมาะกับ</p>
        <ul class="aem-use-list">${useList}</ul>
      </div>
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
      --aem-bg: #0a0c10;
      --aem-surface: #12151c;
      --aem-border: rgba(212, 175, 55, 0.22);
      --aem-gold: #d4af37;
      --aem-gold-soft: #c9a961;
      --aem-text: #ece8e0;
      --aem-muted: #9a958c;
      --aem-subtitle: #b8b3a8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Sarabun, system-ui, -apple-system, "Segoe UI", sans-serif;
      background: var(--aem-bg);
      color: var(--aem-text);
      line-height: 1.65;
      font-size: 1.05rem;
      -webkit-font-smoothing: antialiased;
    }
    .aem-wrap {
      max-width: 34rem;
      margin: 0 auto;
      padding: 1.25rem 1rem 2.5rem;
    }
    .aem-back {
      display: inline-block;
      margin-bottom: 1rem;
      font-size: 0.9rem;
      color: var(--aem-gold-soft);
      text-decoration: none;
      font-weight: 600;
    }
    .aem-back:hover { text-decoration: underline; color: var(--aem-gold); }
    .aem-h1 {
      margin: 0 0 0.5rem;
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--aem-gold);
      letter-spacing: 0.02em;
      line-height: 1.35;
    }
    .aem-sub {
      margin: 0 0 1.35rem;
      font-size: 0.98rem;
      color: var(--aem-subtitle);
      line-height: 1.62;
    }
    .aem-card {
      background: var(--aem-surface);
      border: 1px solid var(--aem-border);
      border-radius: 14px;
      padding: 1.05rem 1.1rem 1.15rem;
      margin-bottom: 1rem;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
    }
    .aem-card-title {
      margin: 0 0 0.45rem;
      font-size: 1.12rem;
      font-weight: 700;
      color: var(--aem-gold);
      line-height: 1.35;
    }
    .aem-score-line {
      margin: 0 0 0.65rem;
      font-size: 0.95rem;
      color: var(--aem-gold-soft);
    }
    .aem-score-line strong { color: var(--aem-gold); font-weight: 700; }
    .aem-card-body {
      margin: 0 0 0.85rem;
      font-size: 1rem;
      color: var(--aem-text);
      line-height: 1.68;
    }
    .aem-use-wrap { margin: 0 0 0.85rem; }
    .aem-use-h {
      margin: 0 0 0.35rem;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--aem-muted);
    }
    .aem-use-list {
      margin: 0;
      padding-left: 1.2rem;
      color: var(--aem-text);
      font-size: 0.98rem;
      line-height: 1.62;
    }
    .aem-use-list li { margin: 0.25rem 0; }
    .aem-card-foot {
      margin: 0;
      font-size: 0.92rem;
      color: var(--aem-muted);
      line-height: 1.62;
      padding-top: 0.5rem;
      border-top: 1px solid rgba(212, 175, 55, 0.12);
    }
    .aem-disclaimer {
      margin: 1.5rem 0 1.25rem;
      padding: 0.85rem 0.95rem;
      font-size: 0.88rem;
      line-height: 1.62;
      color: var(--aem-muted);
      background: rgba(0,0,0,0.25);
      border-radius: 10px;
      border: 1px solid rgba(212, 175, 55, 0.1);
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
      cursor: pointer;
      box-shadow: 0 2px 12px rgba(212, 175, 55, 0.25);
    }
    .aem-cta:hover { filter: brightness(1.06); }
    .aem-cta-wrap { margin-top: 0.25rem; }
  </style>
</head>
<body>
  <div class="aem-wrap">
    <a class="aem-back" href="${escapeHtml(reportBackHref)}">← รายงาน</a>
    <h1 class="aem-h1">ความหมายพลังทั้ง 6 ด้าน</h1>
    <p class="aem-sub">คะแนนแต่ละด้านใช้เพื่อบอกแนวพลังเด่นของวัตถุ ว่าชิ้นนี้ส่งแรงไปทางไหนมากเป็นพิเศษ</p>
    ${cardsHtml}
    <p class="aem-disclaimer" role="note">ผลการอ่านพลังเป็นการตีความเชิงความเชื่อและการสะท้อนแนวพลังของวัตถุ ควรใช้ประกอบการพิจารณา ไม่ควรใช้แทนการตัดสินใจสำคัญในชีวิต</p>
    <div class="aem-cta-wrap">
      <a class="aem-cta" href="${escapeHtml(reportBackHref)}">กลับไปหน้ารายงาน</a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Standalone public page: ความหมายพลังทั้ง 6 ด้าน (crystal bracelet lane) —
 * bracelet counterpart of amuletEnergyMeaning, in the feminine light theme.
 * Copy is intentionally short (per กบ: กระชับ อ่านง่าย).
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
} from "../../crystalBracelet/crystalBraceletScores.util.js";

/** @type {Record<string, { sum: string, body: string, useFor: string[], foot: string }>} */
const AXIS_MEANING = {
  charm_attraction: {
    sum: "พลังเสน่ห์ แรงดึงดูด และความน่าเข้าหา",
    body: "ด้านนี้คือเสน่ห์และแรงดึงดูด ถ้าคะแนนสูง กำไลเส้นนี้ช่วยหนุนภาพลักษณ์ ให้คนรอบตัวอยากเข้าหา คุยด้วยแล้วรู้สึกดี",
    useFor: ["งานที่ต้องพบผู้คน", "การนำเสนอ ขายของ", "ออกงานสังคม", "เสริมความมั่นใจ"],
    foot: "เสน่ห์ในที่นี้คือบรรยากาศรอบตัวที่นุ่มขึ้น ไม่ใช่การบังคับใจใคร",
  },
  money: {
    sum: "พลังการเงิน ความคล่องตัว และจังหวะรายรับ",
    body: "ด้านนี้คือเรื่องเงิน ถ้าคะแนนสูง กำไลเส้นนี้ช่วยหนุนความคล่องตัวเรื่องรายรับ การจัดการเงิน และจังหวะผลตอบแทน",
    useFor: ["ค้าขาย", "เจรจาเรื่องเงิน", "เริ่มลงทุนเล็ก ๆ", "ตั้งเป้าเก็บออม"],
    foot: "พลังนี้ช่วยหนุนจังหวะ แต่วินัยการเงินของเราคือตัวหลักเสมอ",
  },
  career: {
    sum: "พลังการงาน การลงมือ และความต่อเนื่อง",
    body: "ด้านนี้คือการงาน ถ้าคะแนนสูง กำไลเส้นนี้ช่วยหนุนให้ลงมือได้ต่อเนื่อง งานเดินเป็นขั้นเป็นตอน เห็นผลชัดขึ้น",
    useFor: ["เริ่มโปรเจกต์ใหม่", "งานที่ต้องสม่ำเสมอ", "ช่วงเร่งผลงาน", "ปรับระบบการทำงาน"],
    foot: "เหมาะกับคนที่กำลังลงมือทำจริง พลังจะหนุนสิ่งที่ทำอยู่ให้เดินง่ายขึ้น",
  },
  luck: {
    sum: "พลังโชคลาภ โอกาสใหม่ และจังหวะเปิดทาง",
    body: "ด้านนี้คือโชคและโอกาส ถ้าคะแนนสูง กำไลเส้นนี้ช่วยหนุนจังหวะเปิดทาง มีคนแนะนำ โอกาสใหม่เข้ามาแบบพอดี",
    useFor: ["หาโอกาสใหม่", "เปิดช่องทางรายได้", "เรื่องค้างคาที่รอทางออก", "การเสี่ยงดวงพอประมาณ"],
    foot: "โชคลาภหมายรวมถึงโอกาสดี ๆ ที่เข้ามา ไม่ใช่แค่เรื่องรางวัล",
  },
  intuition: {
    sum: "พลังเซ้นส์ การรับสัญญาณ และการตัดสินใจ",
    body: "ด้านนี้คือสัญชาตญาณ ถ้าคะแนนสูง กำไลเส้นนี้ช่วยให้อ่านจังหวะไว รู้สึกได้ว่าอะไรใช่ไม่ใช่ ตัดสินใจได้เฉียบขึ้น",
    useFor: ["ช่วงต้องตัดสินใจ", "อ่านคนอ่านสถานการณ์", "งานสายความรู้สึก ศิลปะ", "การฝึกสมาธิ"],
    foot: "เซ้นส์ที่ดีมาจากใจที่นิ่ง กำไลช่วยหนุน แต่การพักใจก็สำคัญ",
  },
  love: {
    sum: "พลังความรัก ความสัมพันธ์ และความเชื่อมโยง",
    body: "ด้านนี้คือความรักและความสัมพันธ์ ถ้าคะแนนสูง กำไลเส้นนี้ช่วยหนุนความอ่อนโยน ความเข้าใจกัน และความรู้สึกเชื่อมโยงกับคนสำคัญ",
    useFor: ["เสริมความสัมพันธ์", "เปิดใจรับคนใหม่", "คลายเรื่องขัดใจกับคนใกล้ตัว", "ดูแลครอบครัว"],
    foot: "ความรักที่ดีเริ่มจากใจเรา กำไลเป็นแรงหนุนให้บรรยากาศอ่อนโยนขึ้น",
  },
};

const SCORE_BANDS = [
  ["80–100", "เด่นชัด"],
  ["60–79", "มีแรงสนับสนุนดี"],
  ["40–59", "พลังรอง / พอมี"],
  ["ต่ำกว่า 40", "ไม่ใช่แกนหลัก"],
];

function axisScoreOf(axes, key) {
  const v = axes?.[key];
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v.score ?? v.value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function tier(sc) {
  if (sc == null) return "t0";
  if (sc >= 80) return "t80";
  if (sc >= 60) return "t60";
  if (sc >= 40) return "t40";
  return "t0";
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 */
export function renderCrystalBraceletEnergyMeaningHtml(payload) {
  const cb = payload?.crystalBraceletV1;
  if (!cb || typeof cb !== "object") {
    throw new Error("CB_ENERGY_MEANING_MISSING_PAYLOAD");
  }
  const axes = cb.axes && typeof cb.axes === "object" ? cb.axes : {};
  const token = String(payload.publicToken || "").trim();
  const backHref = token ? `/r/${encodeURIComponent(token)}` : "/";

  // Sort axes by this bracelet's own scores (highest first) like the report list.
  const orderByScore = [...CRYSTAL_BRACELET_AXIS_ORDER].sort(
    (a, b) => (axisScoreOf(axes, b) ?? -1) - (axisScoreOf(axes, a) ?? -1),
  );

  const cards = orderByScore
    .map((key, i) => {
      const m = AXIS_MEANING[key];
      if (!m) return "";
      const label = CRYSTAL_BRACELET_AXIS_LABEL_THAI[key] || key;
      const sc = axisScoreOf(axes, key);
      const chips = m.useFor
        .map((u) => `<span class="cbem-chip">${escapeHtml(u)}</span>`)
        .join("");
      return `
  <section class="cbem-card" aria-labelledby="cbem-h-${escapeHtml(key)}">
    <div class="cbem-card-head">
      <span class="cbem-idx">${String(i + 1).padStart(2, "0")}</span>
      <h2 id="cbem-h-${escapeHtml(key)}">${escapeHtml(label)}</h2>
      <span class="cbem-score cbem-score--${tier(sc)}">${sc == null ? "—" : `${sc}/100`}</span>
    </div>
    <div class="cbem-bar"><span style="width:${Math.max(2, Math.min(100, sc ?? 0))}%"></span></div>
    <p class="cbem-sum">${escapeHtml(m.sum)}</p>
    <p class="cbem-k">เหมาะกับ</p>
    <div class="cbem-chips">${chips}</div>
    <p class="cbem-body">${escapeHtml(m.body)}</p>
    <p class="cbem-foot">${escapeHtml(m.foot)}</p>
  </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>ความหมายพลังทั้ง 6 ด้าน · กำไล · Ener Scan</title>
<style>
  :root{
    --bg:#fdf3f8; --card:#ffffff; --border:rgba(120,60,95,.12); --text:#4a2b40;
    --sub:#8a6478; --muted:#a988a0; --accent:#d97bb0; --accent2:#b98be0; --deep:#b34d8f;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
  .wrap{max-width:40rem;margin:0 auto;padding:1rem 1rem 2.5rem}
  .back{display:inline-block;margin:.3rem 0 .8rem;color:var(--deep);text-decoration:none;font-size:.86rem;font-weight:700}
  .hero{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1rem 1.1rem;box-shadow:0 2px 12px rgba(190,120,165,.14)}
  .hero .k{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--deep)}
  .hero h1{margin:.25rem 0 .4rem;font-size:1.25rem}
  .hero p{margin:0;font-size:.86rem;color:var(--sub)}
  .bands{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:.9rem 1.1rem;margin-top:.8rem}
  .bands .t{font-size:.82rem;font-weight:800;margin:0 0 .55rem}
  .bands .grid{display:grid;grid-template-columns:1fr 1fr;gap:.45rem}
  .band{border:1px solid rgba(217,123,176,.35);border-radius:10px;padding:.4rem .6rem;font-size:.76rem}
  .band b{color:var(--deep)}
  .cbem-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1rem 1.1rem;margin-top:.8rem;box-shadow:0 2px 12px rgba(190,120,165,.10)}
  .cbem-card-head{display:flex;align-items:center;gap:.55rem}
  .cbem-idx{font-size:.68rem;font-weight:800;color:var(--deep);border:1px solid rgba(217,123,176,.4);border-radius:8px;padding:.12rem .4rem}
  .cbem-card h2{margin:0;font-size:1.02rem;flex:1}
  .cbem-score{font-size:.78rem;font-weight:800;border-radius:999px;padding:.18rem .6rem;border:1px solid}
  .cbem-score--t80{color:#0e7a4e;border-color:rgba(14,122,78,.4);background:rgba(14,122,78,.08)}
  .cbem-score--t60{color:var(--deep);border-color:rgba(217,123,176,.45);background:rgba(217,123,176,.10)}
  .cbem-score--t40{color:#a06a1f;border-color:rgba(160,106,31,.35);background:rgba(160,106,31,.08)}
  .cbem-score--t0{color:var(--muted);border-color:rgba(169,136,160,.35);background:rgba(169,136,160,.08)}
  .cbem-bar{height:6px;border-radius:99px;background:rgba(217,123,176,.15);margin:.6rem 0 .55rem;overflow:hidden}
  .cbem-bar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent2),var(--accent))}
  .cbem-sum{margin:0 0 .5rem;font-size:.88rem;font-weight:700;color:var(--deep)}
  .cbem-k{margin:0 0 .3rem;font-size:.68rem;font-weight:800;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
  .cbem-chips{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.6rem}
  .cbem-chip{font-size:.74rem;border:1px solid rgba(217,123,176,.4);border-radius:999px;padding:.2rem .6rem;color:var(--sub);background:rgba(217,123,176,.06)}
  .cbem-body{margin:0 0 .55rem;font-size:.86rem;color:var(--text)}
  .cbem-foot{margin:0;padding:.55rem .7rem;font-size:.76rem;color:var(--sub);background:rgba(185,139,224,.10);border:1px solid rgba(185,139,224,.28);border-radius:10px}
  .cta{display:block;text-align:center;margin-top:1rem;padding:.8rem;border-radius:999px;text-decoration:none;font-weight:800;
    color:#fff;background:linear-gradient(165deg,#eab6dc,#d97bb0 55%,#b34d8f)}
</style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="${escapeHtml(backHref)}">← กลับไปที่รายงาน</a>
    <div class="hero">
      <span class="k">รายงาน · กำไล</span>
      <h1>ความหมายพลังทั้ง 6 ด้าน</h1>
      <p>คะแนนบอกว่ากำไลเส้นนี้ส่งพลังด้านไหนชัดที่สุด เรียงจากด้านที่เด่นสุดของเส้นนี้</p>
    </div>
    <div class="bands">
      <p class="t">วิธีอ่านคะแนน</p>
      <div class="grid">
        ${SCORE_BANDS.map(([r, l]) => `<span class="band"><b>${escapeHtml(r)}</b>: ${escapeHtml(l)}</span>`).join("")}
      </div>
    </div>
    ${cards}
    <a class="cta" href="${escapeHtml(backHref)}">กลับไปดูรายงานของฉัน</a>
  </div>
</body>
</html>`;
}

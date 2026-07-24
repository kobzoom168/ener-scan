/**
 * Standalone public page: วิธีคำนวณจังหวะเสริมพลัง (crystal bracelet lane) —
 * bracelet counterpart of amuletEnergyTiming, feminine light theme, concise copy.
 */
import { escapeHtml } from "../../utils/reports/reportHtml.util.js";

const FACTORS = [
  ["วันเกิดของเจ้าของ", "ดูจังหวะพื้นฐานและวันที่เข้ากับเจ้าของ"],
  ["พลังเด่นของกำไล", "ดูว่าเส้นนี้เด่นด้านใด เช่น เสน่ห์ การเงิน หรือโชคลาภ"],
  ["วันในสัปดาห์", "เทียบว่าวันไหนส่งแรงสอดคล้องที่สุด"],
  ["ช่วงเวลาในวัน", "เลือกช่วงที่เหมาะกับการตั้งจิตหรือใส่ออกไป"],
];

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload
 */
export function renderCrystalBraceletEnergyTimingHtml(payload) {
  const cb = payload?.crystalBraceletV1;
  const et = cb?.htmlReport?.energyTiming;
  if (!cb || typeof cb !== "object") {
    throw new Error("CB_ENERGY_TIMING_MISSING_PAYLOAD");
  }
  const token = String(payload.publicToken || "").trim();
  const backHref = token ? `/r/${encodeURIComponent(token)}` : "/";

  const w = String(et?.recommendedWeekday || "").trim() || "—";
  const t = String(et?.recommendedTimeBand || "").trim() || "—";
  const m = String(et?.ritualMode || "").trim() || "—";
  const r = String(et?.timingReason || "").trim();

  const factorsHtml = FACTORS.map(
    ([k, v], i) => `
    <div class="cbet-factor">
      <span class="cbet-fno">${i + 1}</span>
      <p class="cbet-fk">${escapeHtml(k)}</p>
      <p class="cbet-fv">${escapeHtml(v)}</p>
    </div>`,
  ).join("");

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>วิธีคำนวณจังหวะเสริมพลัง · กำไล · Ener Scan</title>
<style>
  :root{
    --bg:#f6f6f4; --card:#ffffff; --border:rgba(100,92,82,.12); --text:#241c12;
    --sub:#5a4a38; --muted:#7a6a58; --accent:#b8871b; --deep:#8f6710;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
  .wrap{max-width:40rem;margin:0 auto;padding:1rem 1rem 2.5rem}
  .back{display:inline-block;margin:.3rem 0 .8rem;color:var(--deep);text-decoration:none;font-size:.86rem;font-weight:700}
  .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1rem 1.1rem;margin-top:.8rem;box-shadow:0 2px 12px rgba(184,135,27,.12)}
  .k{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--deep)}
  h1{margin:.25rem 0 .4rem;font-size:1.22rem}
  .lead{margin:0;font-size:.86rem;color:var(--sub)}
  .sumt{margin:0 0 .6rem;font-size:.9rem;font-weight:800}
  .sumrow{border:1px solid rgba(184,135,27,.3);border-radius:12px;padding:.55rem .8rem;margin-bottom:.5rem}
  .sumrow .sk{display:block;font-size:.66rem;color:var(--muted)}
  .sumrow .sv{display:block;font-size:1rem;font-weight:800;color:var(--deep)}
  .reason{margin:.6rem 0 0;font-size:.84rem;color:var(--text)}
  .reason-sub{margin:.45rem 0 0;font-size:.78rem;color:var(--sub)}
  .ft{margin:1rem 0 .4rem;font-size:.92rem;font-weight:800}
  .factors{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}
  .cbet-factor{position:relative;border:1px solid var(--border);border-radius:14px;padding:.7rem .8rem;background:var(--card)}
  .cbet-fno{position:absolute;top:.5rem;right:.6rem;width:20px;height:20px;border-radius:99px;border:1px solid rgba(184,135,27,.5);
    display:grid;place-items:center;font-size:.68rem;font-weight:800;color:var(--deep)}
  .cbet-fk{margin:0 0 .2rem;font-size:.84rem;font-weight:800;color:var(--deep)}
  .cbet-fv{margin:0;font-size:.76rem;color:var(--sub)}
  .note{margin-top:.9rem;padding:.65rem .8rem;border-radius:12px;font-size:.78rem;color:var(--sub);
    background:rgba(184,135,27,.10);border:1px solid rgba(184,135,27,.28)}
  .cta{display:block;text-align:center;margin-top:1rem;padding:.8rem;border-radius:999px;text-decoration:none;font-weight:800;
    color:#fff;background:linear-gradient(165deg,#e8c547,#b8871b 55%,#8f6710)}
  @media (max-width:420px){.factors{grid-template-columns:1fr}}
</style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="${escapeHtml(backHref)}">← กลับไปที่รายงาน</a>
    <div class="card">
      <span class="k">รายงาน · กำไล</span>
      <h1>วิธีคำนวณจังหวะเสริมพลัง</h1>
      <p class="lead">อาจารย์ดูวันเกิดของคุณคู่กับพลังเด่นของกำไล แล้วเลือกวันและช่วงเวลาที่พลังตอบกันได้ดีที่สุด</p>
    </div>
    <div class="card">
      <p class="sumt">สรุปผลที่อาจารย์แนะนำ</p>
      <div class="sumrow"><span class="sk">วันแนะนำ</span><span class="sv">${escapeHtml(w)}</span></div>
      <div class="sumrow"><span class="sk">ช่วงเวลาแนะนำ</span><span class="sv">${escapeHtml(t)}</span></div>
      <div class="sumrow"><span class="sk">แนวใช้แนะนำ</span><span class="sv">${escapeHtml(m)}</span></div>
      ${r ? `<p class="reason">${escapeHtml(r)}</p>` : ""}
      <p class="reason-sub">จากการเทียบทุกวันและทุกช่วงเวลา อาจารย์พบว่าชุดนี้เข้ากับพลังของกำไลเส้นนี้และจังหวะของคุณมากที่สุด</p>
    </div>
    <p class="ft">อาจารย์ดูจากอะไรบ้าง</p>
    <div class="factors">${factorsHtml}</div>
    <p class="note">จังหวะแนะนำคือช่วงที่พลังหนุนกันง่ายที่สุด ไม่ใช่ข้อบังคับ วันอื่นก็ใช้กำไลได้ตามปกติ</p>
    <a class="cta" href="${escapeHtml(backHref)}">กลับไปดูรายงานของฉัน</a>
  </div>
</body>
</html>`;
}

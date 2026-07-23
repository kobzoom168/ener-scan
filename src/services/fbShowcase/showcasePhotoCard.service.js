/**
 * การ์ดอวดพระโฉมรูปเต็ม (กบเคาะ 23 ก.ค. 2026 หลังเทียบ mockup หลายแบบ):
 * รูปถ่ายจริงเต็มใบ 1080×1350 + ตัวหนังสือทับบนเงามืด — ENER+ชื่อสายซ้ายบน /
 * QR ชวนสแกนขวาบน / เรดาร์ 6 แกนซ้ายบนใต้ชื่อ (แกนเด่นขาวหนา+คะแนน) /
 * พลังรวม+เกรด+ดาวล่างซ้าย / สกิลท็อป 2 / เข้ากับเจ้าของ%ขวาล่าง
 *
 * ใช้กับระบบโพสต์เพจ Facebook (fbShowcase) — เสิร์ฟที่ /r/:token/photo-card.png
 * หมายเหตุ: "เข้ากับเจ้าของ %" กบเคาะให้แสดง (ไม่ระบุตัวตน ไม่มีชื่อ/วันเกิดบนการ์ด)
 * ตัวเลขทุกตัวมาจาก report payload จริงเท่านั้น
 */
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";
import { resolveEnergyLevelDisplayGrade } from "../../utils/reports/energyLevelGrade.util.js";

const FONT_DIR = path.join(process.cwd(), "src", "brand", "fonts");
const OA_ADD_FRIEND_URL = "https://lin.ee/6YZeFZ1";
const W = 1080;
const H = 1350;

const GOLD_HI = "#ffe9b0";
const GOLD = "#ffc555";
const CREAM = "#f5edd8";
const STROKE_TXT =
  'stroke="#000000" stroke-width="4" stroke-opacity="0.7" paint-order="stroke"';

/** ชื่อย่อ 6 แกนบนเรดาร์ (ตาม key จริงใน powerCategories) */
const AXIS_SHORT_BY_KEY = {
  luck: "โชคลาภ",
  metta: "เมตตา",
  baramee: "บารมี",
  specialty: "งานเฉพาะ",
  protection: "คุ้มครอง",
  fortune_anchor: "หนุนดวง",
};
const AXIS_ORDER = ["luck", "metta", "baramee", "specialty", "protection", "fortune_anchor"];

let qrDataUriCache = null;
async function getOaQrDataUri() {
  if (!qrDataUriCache) {
    qrDataUriCache = await QRCode.toDataURL(OA_ADD_FRIEND_URL, {
      margin: 1,
      width: 300,
      color: { dark: "#14100aff", light: "#ffffffff" },
    });
  }
  return qrDataUriCache;
}

function escapeXml(s) {
  return (
    String(s ?? "")
      // resvg-js วาดสระอำตัวประกอบเพี้ยน — แตกเป็น ํ + า (บทเรียนการ์ดเดิม 17 ก.ค.)
      .replace(/ำ/g, "ํา")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

/**
 * ดึงข้อมูลการ์ดจาก report payload (เลนพระเท่านั้น) — null = ทำการ์ดไม่ได้
 * @param {object} payload report_payload_json
 */
export function deriveShowcaseCardData(payload) {
  const p = payload;
  if (!p || typeof p !== "object") return null;
  const a = p.amuletV1;
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const energyScore = Number(p.summary?.energyScore);
  if (!Number.isFinite(energyScore)) return null;
  const objectImageUrl = String(p.objectImageUrl || p.object?.objectImageUrl || "").trim();
  if (!/^https:\/\//i.test(objectImageUrl)) return null;

  // ชื่อสายบนการ์ด: ส่วนหลัง "·" ของ heroNamingLine (กบ: ตัดคำ generic "พระ/เทวรูป" ทิ้ง)
  const hero = String(
    a.flexSurface?.heroNamingLine || p.flexSurface?.heroNamingLine || "",
  ).trim();
  const heroTail = hero.includes("·") ? hero.split("·").pop().trim() : hero;
  const name =
    heroTail || String(a.flexSurface?.headline || "").trim() || "พลังเฉพาะองค์";

  const cats = a.powerCategories || {};
  const axes = [];
  for (const key of AXIS_ORDER) {
    const sc = Number(cats[key]?.score);
    if (!Number.isFinite(sc)) continue;
    axes.push({
      key,
      label: AXIS_SHORT_BY_KEY[key] || String(cats[key]?.labelThai || key).split("และ")[0].trim(),
      labelFull: String(cats[key]?.labelThai || key).trim(),
      score: Math.round(sc),
    });
  }
  if (axes.length < 3) return null; // เรดาร์ต้องมีแกนพอวาด

  const skills = [...axes].sort((x, y) => y.score - x.score).slice(0, 2);
  const gradeRaw = resolveEnergyLevelDisplayGrade(p.summary?.energyLevelLabel, energyScore);
  const grade = ["S", "A", "B"].includes(gradeRaw) ? gradeRaw : null; // เกรดต่ำไม่ขึ้นการ์ด
  const compatRaw = Number(p.summary?.compatibilityPercent);
  const compat = Number.isFinite(compatRaw) ? Math.round(compatRaw) : null;

  return { name, energyScore, grade, compat, axes, skills, objectImageUrl };
}

function starPath(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(1)},${(cy + rr * Math.sin(rad)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function starsRow(x, y, grade) {
  const n = grade === "S" ? 5 : grade === "A" ? 4 : 3;
  return Array.from({ length: 5 }, (_, i) => {
    const cx = x + i * 44;
    return `<polygon points="${starPath(cx, y, 16)}" fill="${i < n ? "#ffd54f" : "#ffffff"}" ${
      i < n ? 'filter="url(#glowSoft)"' : 'opacity="0.28"'
    }/>`;
  }).join("");
}

function radarSvg(data, cx, cy, r) {
  const axes = data.axes;
  const n = axes.length;
  const pt = (i, rr) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)];
  };
  const rings = [0.33, 0.66, 1]
    .map((f) => {
      const pts = Array.from({ length: n }, (_, i) =>
        pt(i, r * f).map((v) => v.toFixed(1)).join(","),
      );
      return `<polygon points="${pts.join(" ")}" fill="none" stroke="#d4af37" stroke-width="1.5" opacity="0.45"/>`;
    })
    .join("");
  const spokes = Array.from({ length: n }, (_, i) => {
    const [x, y] = pt(i, r);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d4af37" stroke-width="1" opacity="0.35"/>`;
  }).join("");
  const valuePts = axes
    .map((a, i) => pt(i, (r * Math.min(100, Math.max(0, a.score))) / 100).map((v) => v.toFixed(1)).join(","))
    .join(" ");
  const topScore = Math.max(...axes.map((a) => a.score));
  const labels = axes
    .map((a, i) => {
      const [x, y] = pt(i, r + 38);
      const isTop = a.score === topScore;
      // ตัวคมไม่ฟุ้ง: ขอบดำหนุนแทน glow — แกนเด่นขาวหนา + คะแนนกำกับ
      return `<text x="${x.toFixed(1)}" y="${(y + 9).toFixed(1)}" text-anchor="middle"
        font-family="Kanit" font-weight="${isTop ? 800 : 600}" font-size="${isTop ? 36 : 29}"
        fill="${isTop ? "#ffffff" : "#f0e8d2"}" stroke="#000000" stroke-width="${isTop ? 7 : 5}"
        stroke-opacity="0.8" paint-order="stroke">${escapeXml(a.label)}${isTop ? ` ${a.score}` : ""}</text>`;
    })
    .join("");
  return `
  <g filter="url(#glowSoft)">
    ${rings}${spokes}
    <polygon points="${valuePts}" fill="${GOLD}" fill-opacity="0.32"
             stroke="${GOLD_HI}" stroke-width="3"/>
  </g>
  ${labels}`;
}

function buildSvg(data, photoDataUri, qrDataUri) {
  const scoreText = (Math.round(data.energyScore * 10) / 10).toFixed(1);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="0.35" stop-color="#000000" stop-opacity="0.78"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.94"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD_HI}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowSoft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <image href="${photoDataUri}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="0" width="${W}" height="330" fill="url(#topShade)"/>
  <rect x="0" y="${H - 620}" width="${W}" height="620" fill="url(#bottomShade)"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="18" fill="none"
        stroke="#d4af37" stroke-width="2" opacity="0.55"/>

  <text x="60" y="108" font-family="Cormorant Garamond" font-weight="600" font-size="44"
        fill="url(#gold)" filter="url(#glowSoft)">E N E R</text>
  <text x="60" y="182" font-family="Kanit" font-weight="600" font-size="52"
        fill="#ffffff" ${STROKE_TXT}>${escapeXml(data.name)}</text>

  <!-- เรดาร์ขวาบน / QR ขวาล่าง (กบ 23 ก.ค. — สลับตำแหน่งกัน) -->
  ${radarSvg(data, 855, 350, 92)}

  <rect x="${W - 210}" y="960" width="150" height="150" rx="16" fill="#ffffff"/>
  <image href="${qrDataUri}" x="${W - 202}" y="968" width="134" height="134"/>
  <text x="${W - 135}" y="1142" text-anchor="middle" font-family="Kanit" font-size="22"
        fill="${CREAM}" ${STROKE_TXT}>สแกนดูพลังชิ้นคุณ</text>

  <text x="60" y="${H - 388}" font-family="Kanit" font-size="32" fill="${CREAM}" ${STROKE_TXT}>พลังรวม</text>
  <text x="60" y="${H - 258}" font-family="Kanit" font-weight="800" font-size="150"
        fill="url(#gold)" filter="url(#glow)">${scoreText}</text>
  ${
    data.grade
      ? `
  <text x="330" y="${H - 388}" font-family="Kanit" font-size="32" fill="${CREAM}" ${STROKE_TXT}>เกรด</text>
  <text x="330" y="${H - 288}" font-family="Kanit" font-weight="800" font-size="96"
        fill="#ffffff" filter="url(#glowSoft)">${data.grade}</text>
  ${starsRow(500, H - 316, data.grade)}`
      : ""
  }

  ${data.skills
    .map((s, i) => {
      const y = H - 180 + i * 58;
      return `
  <circle cx="72" cy="${y - 12}" r="6" fill="${GOLD}" filter="url(#glowSoft)"/>
  <text x="98" y="${y}" font-family="Kanit" font-weight="600" font-size="36"
        fill="${CREAM}" ${STROKE_TXT}>${escapeXml(s.labelFull)}</text>
  <text x="470" y="${y}" font-family="Kanit" font-weight="800" font-size="42"
        fill="url(#gold)">${s.score}</text>`;
    })
    .join("")}

  <text x="${W - 60}" y="${H - 96}" text-anchor="end" font-family="Kanit" font-size="28"
        fill="#e5dcc4" ${STROKE_TXT}>สแกนพระ 1 ชิ้น = การ์ดพลังงาน 1 ใบ</text>
</svg>`;
}

/** แคชต่อ token (in-memory ต่อ instance) */
const cardCache = new Map();
const CARD_CACHE_MAX = 100;

/**
 * เรนเดอร์การ์ดรูปเต็มเป็น PNG — โยน error เมื่อรูปโหลดไม่ได้ (caller จัดการ)
 * @param {string} publicToken ใช้เป็น cache key
 * @param {object} payload report_payload_json
 * @returns {Promise<Buffer|null>} null = payload ไม่เข้าเงื่อนไข
 */
export async function renderShowcasePhotoCardPng(publicToken, payload) {
  const tok = String(publicToken || "").trim();
  const data = deriveShowcaseCardData(payload);
  if (!data) return null;
  const hit = tok ? cardCache.get(tok) : null;
  if (hit) return hit;

  const imgRes = await fetch(data.objectImageUrl, {
    signal: AbortSignal.timeout(20000),
  });
  if (!imgRes.ok) throw new Error(`SHOWCASE_PHOTO_FETCH_${imgRes.status}`);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  const mime = String(imgRes.headers.get("content-type") || "image/jpeg").split(";")[0];
  const photoDataUri = `data:${mime};base64,${imgBuf.toString("base64")}`;

  const svg = buildSvg(data, photoDataUri, await getOaQrDataUri());
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: {
      // fontDirs เท่านั้น — fontBuffers บน linux โหลดฟอนต์ไทยไม่เข้า (บทเรียน 16 ก.ค.)
      fontDirs: [FONT_DIR],
      loadSystemFonts: false,
      defaultFontFamily: "Kanit",
    },
  });
  const buf = Buffer.from(resvg.render().asPng());

  if (tok) {
    if (cardCache.size >= CARD_CACHE_MAX) {
      const first = cardCache.keys().next().value;
      cardCache.delete(first);
    }
    cardCache.set(tok, buf);
  }
  return buf;
}

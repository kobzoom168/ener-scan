/**
 * การ์ดผลแชร์ได้ (กบเคาะธีมทองเข้ม 16 ก.ค. 2026) — awareness ตัวแรก:
 * ลูกค้าอวดพระลงเฟซ/ไลน์กลุ่ม ทุกแชร์ = ป้ายโฆษณา+QR เข้า OA
 *
 * เรนเดอร์ฝั่งเซิร์ฟเวอร์เป็น PNG 1080×1350 (ไซซ์ฟีด FB/IG) ด้วย resvg + ฟอนต์ Kanit
 * ที่แนบมากับรีโป (src/brand/fonts) — ไม่พึ่งฟอนต์ระบบ ตัดปัญหาสระไทยเพี้ยนบนเซิร์ฟเวอร์
 *
 * กติกาข้อมูลบนการ์ด: ของวัตถุล้วน (รูป/คะแนน/เกรด/พลังเด่น/ประเภท) —
 * ห้ามมีข้อมูลส่วนตัวลูกค้า (ชื่อ วันเกิด เข้ากับคุณ%) ลูกค้าอวดได้โดยไม่เผยดวงตัวเอง
 */
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";

const FONT_DIR = path.join(process.cwd(), "src", "brand", "fonts");

/** ลิงก์แอดเพื่อน OA (ตัวเดียวกับปุ่มสแกนบนหน้ารายงาน) */
const OA_ADD_FRIEND_URL = "https://lin.ee/6YZeFZ1";

const CARD_W = 1080;
const CARD_H = 1350;

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

/** แคชการ์ดต่อ token (in-memory ต่อ instance — เรนเดอร์ครั้งเดียวพอ) */
const cardCache = new Map();
const CARD_CACHE_MAX = 200;

function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * เส้นพลังชี้รอบรูป (กบวาดสเก็ตช์ 16 ก.ค.): พลังท็อป 3 ขององค์นั้นตามคะแนนจริง
 * จุดยึดฝั่งวัตถุกะจากองค์กลางรูป (รูปมือถือพระ วัตถุอยู่กลางเฟรมแทบทุกใบ)
 * @param {Array<{label: string, score: number}>} topAxes — สูงสุดก่อน ไม่เกิน 3
 */
function buildPowerCalloutsSvg(topAxes) {
  const spots = [
    // [จุดแตะวัตถุ x,y] [ปลายเส้น x,y] [text x, anchor]
    { ax: 640, ay: 250, ex: 800, ey: 215, tx: 812, anchor: "start" },
    { ax: 430, ay: 400, ex: 255, ey: 400, tx: 243, anchor: "end" },
    { ax: 650, ay: 520, ex: 806, ey: 545, tx: 818, anchor: "start" },
  ];
  let out = "";
  (topAxes || []).slice(0, 3).forEach((a, i) => {
    const s = spots[i];
    const label = `${escapeXml(a.label)} ${Math.round(a.score)}`;
    out += `
  <circle cx="${s.ax}" cy="${s.ay}" r="7" fill="#e8c547" stroke="#14100a" stroke-width="2"/>
  <path d="M${s.ax} ${s.ay} L${s.ex} ${s.ey}" stroke="#e8c547" stroke-width="3" stroke-linecap="round"/>
  <text x="${s.tx}" y="${s.ey + 13}" text-anchor="${s.anchor}" font-family="Kanit" font-weight="600" font-size="38" fill="#f4e9d0" stroke="#14100a" stroke-width="8" paint-order="stroke" stroke-linejoin="round">${label}</text>`;
  });
  return out;
}

/**
 * @param {object} p
 * @param {string} p.objectImageDataUri — รูปวัตถุเป็น data URI (jpeg/png)
 * @param {string} p.typeLabel — เช่น "พระ/เทวรูป/เครื่องราง" หรือชื่อพิมพ์
 * @param {number} p.powerTotal — 0-100 (energyScore × 10 — เลขชุดเดียวกับคลัง)
 * @param {string} p.gradeLabel — เช่น "A"
 * @param {string} p.peakLabel — เช่น "คุ้มครองป้องกัน"
 * @param {Array<{label: string, score: number}>} [p.topAxes] — เส้นพลังท็อป 3
 * @param {string} p.qrDataUri
 * @returns {string} SVG
 */
function buildShareCardSvg({ objectImageDataUri, typeLabel, powerTotal, gradeLabel, peakLabel, topAxes, qrDataUri }) {
  const type = escapeXml(typeLabel);
  const peak = escapeXml(`เด่น ${peakLabel}`);
  // เกรดขึ้นเฉพาะเมื่อ controller ปล่อยมา (S/A/B) — เกรดต่ำไม่ตะโกนบนการ์ดอวด
  const gradeLine = escapeXml(gradeLabel ? `พลังรวม · เกรด ${gradeLabel}` : "พลังรวม");
  // ความกว้างป้ายพลังเด่นโดยประมาณ (Kanit ~0.52em/ตัวอักษรไทย ที่ 38px + padding)
  const pillW = Math.min(760, Math.max(320, peak.length * 26 + 140));
  const pillX = (CARD_W - pillW) / 2;

  return `<svg width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14100a" stop-opacity="0"/>
      <stop offset="1" stop-color="#14100a" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e9cf93"/><stop offset="1" stop-color="#a5813a"/>
    </linearGradient>
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" fill="#14100a"/>

  <!-- รูปวัตถุ (cover) + เงาจางลงหาพื้นด้านล่าง -->
  <image href="${objectImageDataUri}" x="0" y="0" width="${CARD_W}" height="760" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="540" width="${CARD_W}" height="220" fill="url(#fade)"/>

  <!-- เส้นพลังชี้รอบองค์ (สเก็ตช์กบ 16 ก.ค.) -->
  ${buildPowerCalloutsSvg(topAxes)}

  <!-- กรอบทองซ้อนสอง (กรอบในจบที่ขอบแถบแบรนด์ ไม่ตัดผ่านตัวหนังสือ) -->
  <rect x="26" y="26" width="${CARD_W - 52}" height="${CARD_H - 52}" fill="none" stroke="#c9a24d" stroke-width="3" opacity="0.85"/>
  <rect x="38" y="38" width="${CARD_W - 76}" height="1140" fill="none" stroke="#c9a24d" stroke-width="1" opacity="0.45"/>

  <!-- ประเภท / คะแนน / ป้ายพลังเด่น -->
  <text x="540" y="836" text-anchor="middle" font-family="Kanit" font-weight="400" font-size="36" fill="#c9b98c" letter-spacing="1">${type}</text>
  <text x="540" y="990" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="170" fill="#e8c547">${Math.round(powerTotal)}</text>
  <text x="540" y="1046" text-anchor="middle" font-family="Kanit" font-weight="500" font-size="38" fill="#c9b98c">${gradeLine}</text>

  <rect x="${pillX}" y="1080" width="${pillW}" height="72" rx="36" fill="rgba(201,162,77,0.12)" stroke="#c9a24d" stroke-width="2"/>
  <text x="540" y="1129" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="40" fill="#e9cf93">${peak}</text>

  <!-- แถบแบรนด์ -->
  <rect x="26" y="1178" width="${CARD_W - 52}" height="${CARD_H - 26 - 1178}" fill="rgba(201,162,77,0.08)"/>
  <line x1="26" y1="1178" x2="${CARD_W - 26}" y2="1178" stroke="#c9a24d" stroke-width="1.5" opacity="0.6"/>

  <text x="64" y="1246" font-family="Cormorant Garamond" font-weight="600" font-size="62" fill="#e3bc5f" letter-spacing="18">ENER</text>
  <text x="64" y="1284" font-family="Kanit" font-weight="400" font-size="27" fill="#c9b98c">อาจารย์อ่านพลังพระเครื่อง กำไลหิน</text>
  <text x="64" y="1322" font-family="Kanit" font-weight="600" font-size="27" fill="#e8c547">สแกนฟรีวันละ 1 ชิ้น · สแกน QR แอดไลน์</text>

  <rect x="${CARD_W - 64 - 158}" y="1198" width="158" height="158" rx="8" fill="#ffffff"/>
  <image href="${qrDataUri}" x="${CARD_W - 64 - 150}" y="1206" width="142" height="142"/>
</svg>`;
}

/**
 * เรนเดอร์การ์ดแชร์ของรายงาน (เลนพระ) — แคชต่อ token
 * @param {object} p
 * @param {string} p.publicToken
 * @param {string} p.objectImageUrl
 * @param {string} p.typeLabel
 * @param {number} p.energyScore10 — 0-10
 * @param {string} p.gradeLabel
 * @param {string} p.peakLabel
 * @param {Array<{label: string, score: number}>} [p.topAxes]
 * @returns {Promise<Buffer>}
 */
export async function renderShareCardPng(p) {
  const tok = String(p.publicToken || "").trim();
  const hit = cardCache.get(tok);
  if (hit) return hit;

  const imgRes = await fetch(String(p.objectImageUrl));
  if (!imgRes.ok) throw new Error(`SHARE_CARD_IMAGE_FETCH_${imgRes.status}`);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  const mime = String(imgRes.headers.get("content-type") || "image/jpeg").split(";")[0];
  const objectImageDataUri = `data:${mime};base64,${imgBuf.toString("base64")}`;

  const svg = buildShareCardSvg({
    objectImageDataUri,
    typeLabel: p.typeLabel,
    powerTotal: Math.min(100, Math.max(0, Number(p.energyScore10) * 10)),
    gradeLabel: p.gradeLabel,
    peakLabel: p.peakLabel,
    topAxes: Array.isArray(p.topAxes) ? p.topAxes : [],
    qrDataUri: await getOaQrDataUri(),
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: CARD_W },
    font: {
      // ⚠️ ต้องใช้ fontDirs — โหมด fontBuffers ของ resvg-js 2.6.2 บน linux
      // โหลดฟอนต์ไทยไม่เข้า (สระกลายเป็นกล่อง — พิสูจน์แล้ว 16 ก.ค.)
      fontDirs: [FONT_DIR],
      loadSystemFonts: false,
      defaultFontFamily: "Kanit",
    },
  });
  const png = resvg.render().asPng();
  const buf = Buffer.from(png);

  if (cardCache.size >= CARD_CACHE_MAX) {
    const first = cardCache.keys().next().value;
    cardCache.delete(first);
  }
  cardCache.set(tok, buf);
  return buf;
}

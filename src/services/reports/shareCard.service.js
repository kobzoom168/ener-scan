/**
 * การ์ดผลแชร์ได้ โฉมหรู (กบเคาะ 17 ก.ค. 2026 จากม็อก card_luxe_radar):
 * ฉากดำทอง+วงมนตร์ / รูปพระกรอบวงรีทองเรืองแสง / ป้ายพลังท็อป 3 มีไอคอน+เส้นชี้ /
 * แผ่นคะแนน = เรดาร์ 6 แกนจริง + พลังรวมทองไล่เฉด + ป้ายเด่น / แถบล่างโลโก้ตราเพชร + QR
 *
 * เรนเดอร์ PNG 1080×1350 (ไซซ์ฟีด FB/IG) ด้วย resvg + ฟอนต์แนบรีโป (src/brand/fonts)
 * — ต้นทุนต่อใบศูนย์ ไม่พึ่งฟอนต์ระบบ (กันสระไทยเพี้ยน)
 *
 * กติกาข้อมูล: ของวัตถุล้วน ห้ามมีข้อมูลส่วนตัวลูกค้า (ชื่อ วันเกิด เข้ากับคุณ%)
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

/** ไอคอนป้ายพลัง (stroke 24×24) ตามแกน */
const AXIS_ICONS = {
  หนุนดวง: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7a5 5 0 1 0 5 5"/><circle cx="12" cy="12" r="1.6" fill="#e8c547" stroke="none"/>',
  บารมี: '<path d="M12 4c1.8 2.6 1.8 5.4 0 8-1.8-2.6-1.8-5.4 0-8z"/><path d="M5 10c2.8.4 4.8 1.9 6 4.5M19 10c-2.8.4-4.8 1.9-6 4.5"/><path d="M6 17c3.5 2 8.5 2 12 0"/>',
  คุ้มครอง: '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/><path d="M9.5 12l2 2 3.5-4"/>',
  เมตตา: '<path d="M12 20C7 16 3 12.5 3 8.8 3 6.2 5 4.5 7.3 4.5c1.8 0 3.5 1 4.7 2.8 1.2-1.8 2.9-2.8 4.7-2.8C19 4.5 21 6.2 21 8.8c0 3.7-4 7.2-9 11.2z"/>',
  โชคลาภ: '<path d="M12 4l1.8 5.4L19 11l-5.2 1.6L12 18l-1.8-5.4L5 11l5.2-1.6z"/><path d="M18.5 4.5l.7 2 .7-2M4.5 16.5l.7 2 .7-2" stroke-width="1.4"/>',
  งานเฉพาะ: '<path d="M12 3l2.2 5.4L20 9l-4.4 3.8L17 19l-5-3.2L7 19l1.4-6.2L4 9l5.8-.6z"/>',
};
const AXIS_ICON_FALLBACK = AXIS_ICONS["งานเฉพาะ"];

/** ลำดับแกนบนเรดาร์ (ตามเข็มจากบน) — ตรงกับม็อกที่กบเคาะ */
const RADAR_ORDER = ["หนุนดวง", "เมตตา", "โชคลาภ", "งานเฉพาะ", "คุ้มครอง", "บารมี"];

/**
 * เรดาร์ 6 แกนจากคะแนนจริง — วาดใน viewBox 0 0 200 176 แล้ว scale ที่จุดวาง
 * @param {Record<string, number>} axisScores — key = ชื่อย่อแกนไทย, value 0-100
 */
function buildRadarSvg(axisScores) {
  const CX = 100;
  const CY = 88;
  const R = 62;
  const pt = (i, r) => {
    const a = (Math.PI / 180) * (i * 60 - 90);
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  };
  const ring = (r) =>
    Array.from({ length: 6 }, (_, i) => pt(i, r).map((v) => v.toFixed(1)).join(",")).join(" ");
  const spokes = Array.from({ length: 6 }, (_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join("");

  const vals = RADAR_ORDER.map((k) => {
    const v = Number(axisScores?.[k]);
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
  });
  const valuePts = vals
    .map((v, i) => pt(i, (v / 100) * R).map((n) => n.toFixed(1)).join(","))
    .join(" ");
  // จุดเน้นแกนที่คะแนนสูงสุด
  const maxIdx = vals.indexOf(Math.max(...vals));
  const [px, py] = pt(maxIdx, (vals[maxIdx] / 100) * R);

  const LABELS = [
    [100, 14, "middle"],
    [170, 52, "middle"],
    [170, 130, "middle"],
    [100, 168, "middle"],
    [31, 130, "middle"],
    [31, 52, "middle"],
  ];
  const labels = RADAR_ORDER.map(
    (k, i) =>
      `<text x="${LABELS[i][0]}" y="${LABELS[i][1]}" text-anchor="${LABELS[i][2]}" font-family="Kanit" font-size="11.5" font-weight="500" fill="#cbb686">${escapeXml(k)}</text>`,
  ).join("");

  return `
    <polygon points="${ring(R)}" fill="none" stroke="rgba(201,162,77,0.35)" stroke-width="1"/>
    <polygon points="${ring(R * 0.66)}" fill="none" stroke="rgba(201,162,77,0.20)" stroke-width="0.8"/>
    <polygon points="${ring(R * 0.33)}" fill="none" stroke="rgba(201,162,77,0.15)" stroke-width="0.8"/>
    <g stroke="rgba(201,162,77,0.18)" stroke-width="0.8">${spokes}</g>
    <polygon points="${valuePts}" fill="url(#rg)" stroke="#e8c547" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="#e8c547"/>
    ${labels}`;
}

/** ป้ายพลัง (กล่องมน+ไอคอน+ข้อความ) — คืน {svg, w} เพื่อวางชิดขวา/ซ้ายได้ */
function buildTagSvg({ x, y, label, score, anchorRight }) {
  const text = `${label} ${Math.round(score)}`;
  const w = Math.round(text.length * 19 + 92);
  const h = 62;
  const rx = anchorRight ? x - w : x;
  const icon = AXIS_ICONS[label] || AXIS_ICON_FALLBACK;
  return {
    w,
    svg: `
  <g>
    <rect x="${rx}" y="${y}" width="${w}" height="${h}" rx="20" fill="rgba(18,13,7,0.92)" stroke="#c9a24d" stroke-width="2.5"/>
    <g transform="translate(${rx + 20}, ${y + 15}) scale(1.35)" fill="none" stroke="#e8c547" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
    <text x="${rx + 62}" y="${y + 42}" font-family="Kanit" font-weight="600" font-size="31" fill="#f0e2bd">${escapeXml(label)} <tspan fill="#e8c547" font-weight="700">${Math.round(score)}</tspan></text>
  </g>`,
  };
}

/**
 * @param {object} p
 * @param {string} p.objectImageDataUri
 * @param {number} p.powerTotal — 0-100
 * @param {string|null} p.gradeLabel — S/A/B หรือ null (ไม่โชว์)
 * @param {string} p.peakLabel — ป้ายเด่น (ชื่อเต็ม)
 * @param {Array<{label: string, score: number}>} p.topAxes — ท็อป 3 สำหรับป้ายชี้
 * @param {Record<string, number>} p.axisScores — ครบ 6 แกน (ชื่อย่อ → คะแนน) สำหรับเรดาร์
 * @param {string} p.qrDataUri
 * @returns {string} SVG
 */
function buildShareCardSvg({ objectImageDataUri, powerTotal, gradeLabel, peakLabel, topAxes, axisScores, qrDataUri }) {
  const peak = escapeXml(peakLabel);
  const lbText = gradeLabel ? `พลังรวม · เกรด ${escapeXml(gradeLabel)}` : "พลังรวม";

  // ป้ายท็อป 3: ขวาบน / ซ้ายกลาง / ขวาล่าง (ตำแหน่ง ×2 จากม็อก 540)
  const tags = Array.isArray(topAxes) ? topAxes.slice(0, 3) : [];
  const tagSvgs = [];
  const leads = [];
  if (tags[0]) {
    const t = buildTagSvg({ x: CARD_W - 52, y: 128, label: tags[0].label, score: tags[0].score, anchorRight: true });
    tagSvgs.push(t.svg);
    leads.push(`<line x1="668" y1="212" x2="${CARD_W - 52 - t.w + 8}" y2="164" />`);
  }
  if (tags[1]) {
    const t = buildTagSvg({ x: 36, y: 300, label: tags[1].label, score: tags[1].score, anchorRight: false });
    tagSvgs.push(t.svg);
    leads.push(`<line x1="${36 + t.w - 8}" y1="332" x2="392" y2="368" />`);
  }
  if (tags[2]) {
    const t = buildTagSvg({ x: CARD_W - 76, y: 496, label: tags[2].label, score: tags[2].score, anchorRight: true });
    tagSvgs.push(t.svg);
    leads.push(`<line x1="662" y1="500" x2="${CARD_W - 76 - t.w + 8}" y2="528" />`);
  }

  // ป้ายเด่น: ประมาณความกว้างจากข้อความ
  const peakText = `เด่น ${peak}`;
  const peakW = Math.min(880, Math.max(360, peakText.length * 22 + 150));
  const peakX = (CARD_W - peakW) / 2;

  return `<svg width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#16110a"/><stop offset="0.45" stop-color="#0d0a06"/><stop offset="1" stop-color="#090704"/>
    </linearGradient>
    <radialGradient id="glowTop" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#e9cf93" stop-opacity="0.22"/><stop offset="1" stop-color="#e9cf93" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowBot" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#a07828" stop-opacity="0.14"/><stop offset="1" stop-color="#a07828" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="picGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#e9c547" stop-opacity="0.34"/><stop offset="1" stop-color="#e9c547" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="goldTxt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.08" stop-color="#f8e7b0"/><stop offset="0.42" stop-color="#e8c547"/>
      <stop offset="0.78" stop-color="#a5721d"/><stop offset="1" stop-color="#d8b054"/>
    </linearGradient>
    <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e8c547" stop-opacity="0.55"/><stop offset="1" stop-color="#a5721d" stop-opacity="0.25"/>
    </linearGradient>
    <linearGradient id="eg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e9cf93"/><stop offset="1" stop-color="#a5813a"/>
    </linearGradient>
    <linearGradient id="plateBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#261c0e" stop-opacity="0.55"/><stop offset="1" stop-color="#0e0a05" stop-opacity="0.75"/>
    </linearGradient>
    <!-- ใช้ mask แทน clip-path: resvg ตัด clip-path บน image ไม่ครบขอบบน (เจอ 17 ก.ค.) -->
    <mask id="picMask">
      <rect x="0" y="0" width="${CARD_W}" height="${CARD_H}" fill="black"/>
      <ellipse cx="540" cy="348" rx="234" ry="280" fill="white"/>
    </mask>
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/>
  <ellipse cx="540" cy="360" rx="520" ry="330" fill="url(#glowTop)"/>
  <ellipse cx="540" cy="1380" rx="680" ry="400" fill="url(#glowBot)"/>

  <!-- วงมนตร์จาง ๆ -->
  <circle cx="540" cy="240" r="430" fill="none" stroke="rgba(201,162,77,0.10)" stroke-width="2" stroke-dasharray="3 15"/>
  <circle cx="540" cy="290" r="340" fill="none" stroke="rgba(201,162,77,0.10)" stroke-width="2"/>
  <circle cx="46" cy="1050" r="210" fill="none" stroke="rgba(201,162,77,0.09)" stroke-width="2" stroke-dasharray="2 11"/>
  <circle cx="1076" cy="920" r="260" fill="none" stroke="rgba(201,162,77,0.09)" stroke-width="2"/>

  <!-- รูปพระ วงรีทอง -->
  <ellipse cx="540" cy="348" rx="300" ry="342" fill="url(#picGlow)"/>
  <image href="${objectImageDataUri}" x="306" y="68" width="468" height="560" preserveAspectRatio="xMidYMid slice" mask="url(#picMask)"/>
  <ellipse cx="540" cy="348" rx="234" ry="280" fill="none" stroke="#c9a24d" stroke-width="6"/>
  <ellipse cx="540" cy="348" rx="224" ry="270" fill="none" stroke="rgba(233,207,147,0.35)" stroke-width="2"/>

  <!-- เส้นชี้ + ป้ายพลังท็อป 3 -->
  <g stroke="#e8c547" stroke-width="4" stroke-linecap="round" opacity="0.85">${leads.join("")}</g>
  ${tagSvgs.join("")}

  <!-- แผ่นคะแนน -->
  <rect x="60" y="692" width="960" height="420" rx="32" fill="url(#plateBg)" stroke="rgba(201,162,77,0.65)" stroke-width="3"/>
  <rect x="70" y="702" width="940" height="400" rx="26" fill="none" stroke="rgba(233,207,147,0.28)" stroke-width="1"/>

  <g transform="translate(100, 716) scale(1.8)">${buildRadarSvg(axisScores)}</g>

  <text x="770" y="806" text-anchor="middle" font-family="Kanit" font-weight="500" font-size="30" letter-spacing="4" fill="#cbb686">◆  ${escapeXml(lbText)}  ◆</text>
  <text x="770" y="962" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="150" fill="url(#goldTxt)">${Math.round(powerTotal)}</text>

  <rect x="${peakX}" y="1022" width="${peakW}" height="66" rx="33" fill="rgba(201,162,77,0.10)" stroke="#c9a24d" stroke-width="2.5"/>
  <text x="540" y="1068" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="36" fill="#f4e6bd"><tspan fill="#e8c547">เด่น</tspan> ${peak}</text>

  <!-- แถบล่าง: ตราเพชร + ENER + QR -->
  <g transform="translate(64, 1158) scale(0.92)">
    <circle cx="60" cy="60" r="47" fill="none" stroke="url(#eg)" stroke-width="1.6" stroke-dasharray="1.5 7" stroke-linecap="round"/>
    <circle cx="60" cy="60" r="39" fill="none" stroke="url(#eg)" stroke-width="1.8"/>
    <path d="M60 40 L76 60 L60 80 L44 60 Z" fill="none" stroke="url(#eg)" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M60 40 L60 80 M44 60 L76 60 M51 51 L69 51 M51 69 L69 69" stroke="url(#eg)" stroke-width="1.1" opacity="0.65"/>
    <circle cx="60" cy="60" r="3.6" fill="url(#eg)"/>
  </g>
  <text x="200" y="1222" font-family="Cormorant Garamond" font-weight="700" font-size="64" letter-spacing="18" fill="#e3bc5f">ENER</text>
  <text x="200" y="1262" font-family="Kanit" font-weight="400" font-size="25" fill="#bfa878">อาจารย์อ่านพลังพระ/เครื่องราง/หิน</text>
  <text x="200" y="1300" font-family="Kanit" font-weight="600" font-size="25" fill="#e8c547">สแกนฟรีวันละ 1 ชิ้น</text>

  <rect x="838" y="1136" width="178" height="196" rx="18" fill="#fffdf6" stroke="rgba(201,162,77,0.7)" stroke-width="3"/>
  <image href="${qrDataUri}" x="852" y="1148" width="150" height="150"/>
  <text x="927" y="1320" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="17" fill="#6b5d40">สแกนเพื่อดูดวงเพิ่มเติม</text>
</svg>`;
}

/**
 * เรนเดอร์การ์ดแชร์ของรายงาน (เลนพระ) — แคชต่อ token
 * @param {object} p
 * @param {string} p.publicToken
 * @param {string} p.objectImageUrl
 * @param {string} p.typeLabel — (คงรับไว้เพื่อ compat แต่โฉมหรูไม่โชว์)
 * @param {number} p.energyScore10 — 0-10
 * @param {string|null} p.gradeLabel
 * @param {string} p.peakLabel
 * @param {Array<{label: string, score: number}>} [p.topAxes]
 * @param {Record<string, number>} [p.axisScores] — ครบ 6 แกน (ชื่อย่อ → คะแนน)
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
    powerTotal: Math.min(100, Math.max(0, Number(p.energyScore10) * 10)),
    gradeLabel: p.gradeLabel || null,
    peakLabel: p.peakLabel,
    topAxes: Array.isArray(p.topAxes) ? p.topAxes : [],
    axisScores: p.axisScores && typeof p.axisScores === "object" ? p.axisScores : {},
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

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
import sharp from "sharp";
import { resolveEnergyLevelDisplayGrade } from "../../utils/reports/energyLevelGrade.util.js";

const FONT_DIR = path.join(process.cwd(), "src", "brand", "fonts");
const OA_ADD_FRIEND_URL = "https://lin.ee/6YZeFZ1";
const W = 1080;
const H = 1200;

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

/** กลุ่มคนที่เหมาะ ตามด้านเด่นจริง (copy ตายตัว — ไม่ใช่ตัวเลข ไม่มโนคะแนน) */
const AXIS_AUDIENCE = {
  luck: "ค้าขาย / เสี่ยงโชค",
  metta: "งานบริการ / เจรจาต่อรอง",
  baramee: "หัวหน้างาน / งานปกครอง",
  specialty: "งานเฉพาะทาง / งานฝีมือ",
  protection: "เดินทางบ่อย / งานเสี่ยงภัย",
  fortune_anchor: "ผู้เริ่มต้นทำงาน / ตั้งหลักชีวิต",
};

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
  // ชื่อบนการ์ด = พลังหลักตามคะแนนจริง (กบ 23 ก.ค. — เดิมใช้ป้ายสายจาก heroNamingLine
  // แล้วขัดกับเรดาร์: การ์ดขึ้น "ปกป้อง" แต่แกนเด่นจริงคือหนุนดวง)
  const heroTail = String(
    a.flexSurface?.heroNamingLine || p.flexSurface?.heroNamingLine || "",
  )
    .split("·")
    .pop()
    .trim();
  const name = skills[0]?.label || heroTail || "พลังเฉพาะองค์";
  const gradeRaw = resolveEnergyLevelDisplayGrade(p.summary?.energyLevelLabel, energyScore);
  const grade = ["S", "A", "B"].includes(gradeRaw) ? gradeRaw : null; // เกรดต่ำไม่ขึ้นการ์ด
  const compatRaw = Number(p.summary?.compatibilityPercent);
  const compat = Number.isFinite(compatRaw) ? Math.round(compatRaw) : null;

  // แถบล่าง 3 ช่อง: พลังเด่น / จังหวะที่เหมาะ (timingV1 จริง) / เหมาะกับ (map จากด้านเด่น)
  const peakLine = skills.map((s) => s.label).join(" · ");
  const timingDay = String(p.timingV1?.summary?.topWeekdayLabel || "").trim();
  const timingWindow = String(p.timingV1?.summary?.topWindowLabel || "")
    .trim()
    .replace(/[–—]/g, "-");
  const audience = skills
    .map((s) => AXIS_AUDIENCE[s.key])
    .filter(Boolean)
    .join(" / ");

  return {
    name,
    energyScore,
    grade,
    compat,
    axes,
    skills,
    objectImageUrl,
    peakLine,
    timingDay,
    timingWindow,
    audience,
  };
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
  // ทุกแกน: ชื่อขาว + คะแนนทองใต้ชื่อ (ตาม mockup กบ 23 ก.ค.)
  const labels = axes
    .map((a, i) => {
      const [x, y] = pt(i, r + 46);
      return `<text x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="middle"
        font-family="Kanit" font-weight="600" font-size="28" fill="#ffffff"
        stroke="#000000" stroke-width="5" stroke-opacity="0.8" paint-order="stroke">${escapeXml(a.label)}</text>
      <text x="${x.toFixed(1)}" y="${(y + 32).toFixed(1)}" text-anchor="middle"
        font-family="Kanit" font-weight="800" font-size="30" fill="${GOLD}"
        stroke="#000000" stroke-width="5" stroke-opacity="0.8" paint-order="stroke">${a.score}</text>`;
    })
    .join("");
  return `
  <g filter="url(#glowSoft)">
    ${rings}${spokes}
    <polygon points="${valuePts}" fill="${GOLD}" fill-opacity="0.35"
             stroke="${GOLD_HI}" stroke-width="3"/>
  </g>
  ${labels}`;
}

/** ตัดข้อความไทยเป็นบรรทัด (ตัดที่ช่องว่าง) */
function wrapText(s, maxChars) {
  const words = String(s || "").split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = `${cur} ${w}`;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

/** คำระดับจากคะแนนแกนเด่น / เกรดรวม (mapping ตายตัว) */
function peakLevelWord(score) {
  if (score >= 85) return "โดดเด่นมาก";
  if (score >= 70) return "โดดเด่น";
  if (score >= 60) return "ค่อนข้างชัด";
  return "พื้นฐาน";
}
function gradeWord(grade) {
  return grade === "S" ? "ระดับสูงสุด" : grade === "A" ? "ยอดเยี่ยม" : grade === "B" ? "ดีมาก" : "";
}

/** ประโยคคำแนะนำตายตัวต่อแกนเด่น (ใช้ทั้ง Flex และการ์ดรูป — ไม่มโน) */
const AXIS_ADVICE = {
  luck: "พกติดตัวช่วงมีนัดเจรจา ตั้งจิตให้ชัดก่อนออกจากบ้าน",
  metta: "พกติดตัวเวลาพบผู้คน ตั้งจิตขอความราบรื่นก่อนเริ่มงาน",
  baramee: "พกติดตัววันประชุมหรือพบผู้ใหญ่ ตั้งจิตอย่างสงบก่อนเข้างาน",
  specialty: "พกติดตัวเวลาทำงานสายเฉพาะ ตั้งจิตอธิษฐานก่อนเริ่มงาน",
  protection: "พกติดตัวเวลาเดินทาง ตั้งจิตขอความแคล้วคลาดก่อนออกเดินทาง",
  fortune_anchor: "พกติดตัว ตั้งจิตอธิษฐานก่อนเริ่มงาน จะเสริมพลังให้ราบรื่น",
};

function radarPanelSvg(data, cx, cy, r) {
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
      return `<polygon points="${pts.join(" ")}" fill="none" stroke="#b18f3e" stroke-width="1.5" opacity="0.5"/>`;
    })
    .join("");
  const valuePts = axes
    .map((a, i) => pt(i, (r * Math.min(100, Math.max(0, a.score))) / 100).map((v) => v.toFixed(1)).join(","))
    .join(" ");
  const dots = axes
    .map((a, i) => {
      const [x, y] = pt(i, (r * Math.min(100, Math.max(0, a.score))) / 100);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${GOLD_HI}"/>`;
    })
    .join("");
  const labels = axes
    .map((a, i) => {
      const [x, y] = pt(i, r + 40);
      return `<text x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="middle"
        font-family="Kanit" font-weight="600" font-size="24" fill="${CREAM}">${escapeXml(a.label)}</text>
      <text x="${x.toFixed(1)}" y="${(y + 26).toFixed(1)}" text-anchor="middle"
        font-family="Kanit" font-weight="800" font-size="26" fill="${GOLD}">${a.score}</text>`;
    })
    .join("");
  return `${rings}
    <polygon points="${valuePts}" fill="${GOLD}" fill-opacity="0.35" stroke="${GOLD_HI}" stroke-width="3" filter="url(#glowSoft)"/>
    ${dots}${labels}`;
}

function buildSvg(data, photoDataUri, qrDataUri) {
  const scoreText = (Math.round(data.energyScore * 10) / 10).toFixed(1);
  const top = data.skills[0];
  const second = data.skills[1];
  const stars = data.grade === "S" ? 5 : data.grade === "A" ? 4 : data.grade === "B" ? 3 : 0;
  const starsSvg = (x, y, size, n) =>
    Array.from({ length: 5 }, (_, i) =>
      `<polygon points="${starPath(x + i * (size * 2.4), y, size)}" fill="${i < n ? "#ffd54f" : "#57503f"}"/>`,
    ).join("");
  const advice = AXIS_ADVICE[top?.key] || "";
  const adviceLines = wrapText(advice, 30).slice(0, 2);
  const audienceLines = (data.audience || "").split(" / ").slice(0, 2);

  // กล่องคอลัมน์ขวา (เรียง stack — กล่องไหนไม่มีข้อมูลข้ามไป)
  const RX = 660;
  const RW = 384;
  let ry = 640;
  const rightBoxes = [];
  const infoBox = (title, lines) => {
    if (!lines.length) return;
    const h = 46 + lines.length * 30;
    rightBoxes.push(`
  <rect x="${RX}" y="${ry}" width="${RW}" height="${h}" rx="14" fill="#171310" stroke="#6b5320" stroke-width="1.5"/>
  <text x="${RX + 22}" y="${ry + 34}" font-family="Kanit" font-weight="600" font-size="24" fill="${GOLD}">${escapeXml(title)}</text>
  ${lines
    .map(
      (ln, i) =>
        `<text x="${RX + 22}" y="${ry + 64 + i * 30}" font-family="Kanit" font-size="22" fill="${CREAM}">${escapeXml(ln)}</text>`,
    )
    .join("")}`);
    ry += h + 14;
  };
  const timingLines = [data.timingDay, data.timingWindow].filter(Boolean);
  infoBox("วันที่เหมาะ", timingLines);
  infoBox("เหมาะกับ", audienceLines);
  infoBox("คำแนะนำ", adviceLines);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bgGlow" cx="0.32" cy="0.4" r="0.9">
      <stop offset="0" stop-color="#3a2c14"/>
      <stop offset="0.55" stop-color="#1d150c"/>
      <stop offset="1" stop-color="#0d0a06"/>
    </radialGradient>
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

  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bgGlow)"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="26" fill="none" stroke="#c9a136" stroke-width="2.5" opacity="0.9"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="22" fill="none" stroke="#6b5320" stroke-width="1"/>

  <!-- หัวซ้าย -->
  <text x="52" y="86" font-family="Cormorant Garamond" font-weight="600" font-size="40"
        fill="url(#gold)" letter-spacing="4" filter="url(#glowSoft)">ENER SCAN</text>
  <text x="52" y="122" font-family="Kanit" font-size="22" fill="#bfae8a">รายงานพลังงานวัตถุมงคล</text>

  <!-- ป้ายพลังเด่น + ชื่อ -->
  <rect x="52" y="152" width="150" height="46" rx="23" fill="none" stroke="${GOLD}" stroke-width="2"/>
  <text x="127" y="184" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="26" fill="${GOLD}">พลังเด่น</text>
  <text x="52" y="272" font-family="Kanit" font-weight="800" font-size="72" fill="#ffffff" filter="url(#glowSoft)">${escapeXml(data.name)}</text>
  ${top ? `<text x="52" y="318" font-family="Kanit" font-size="28" fill="${CREAM}">${peakLevelWord(top.score)}</text>` : ""}
  ${stars ? starsSvg(70, 356, 15, stars) : ""}

  <!-- ตราเกรด -->
  ${
    data.grade
      ? `
  <g transform="translate(490, 60)">
    <path d="M60 0 L120 18 V64 Q120 108 60 132 Q0 108 0 64 V18 Z" fill="#171310" stroke="url(#gold)" stroke-width="4" filter="url(#glowSoft)"/>
    <text x="60" y="76" text-anchor="middle" font-family="Kanit" font-weight="800" font-size="58" fill="#ffffff">${data.grade}</text>
    <text x="60" y="108" text-anchor="middle" font-family="Kanit" font-size="20" fill="${GOLD}">RANK</text>
  </g>
  ${starsSvg(505, 216, 12, stars)}`
      : ""
  }

  <!-- รูปพระวงกลม + วงแหวนทอง -->
  <circle cx="340" cy="560" r="218" fill="#0d0a06" filter="url(#glowSoft)"/>
  <image href="${photoDataUri}" x="130" y="350" width="420" height="420"/>
  <circle cx="340" cy="560" r="212" fill="none" stroke="url(#gold)" stroke-width="6" filter="url(#glowSoft)"/>
  <circle cx="340" cy="560" r="224" fill="none" stroke="#6b5320" stroke-width="1.5"/>

  <!-- กล่องพลังรวม -->
  <rect x="52" y="826" width="588" height="190" rx="18" fill="#171310" stroke="#c9a136" stroke-width="2"/>
  <rect x="76" y="806" width="140" height="40" rx="20" fill="#2a2214" stroke="${GOLD}" stroke-width="1.5"/>
  <text x="146" y="834" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="22" fill="${GOLD}">พลังรวม</text>
  <text x="84" y="948" font-family="Kanit" font-weight="800" font-size="96" fill="url(#gold)" filter="url(#glow)">${scoreText}<tspan font-size="40" fill="#bfae8a"> /10</tspan></text>
  <rect x="84" y="966" width="300" height="12" rx="6" fill="#3a2f1a"/>
  <rect x="84" y="966" width="${(300 * Math.min(100, data.energyScore * 10)) / 100}" height="12" rx="6" fill="url(#gold)"/>
  ${data.grade ? `<text x="84" y="1006" font-family="Kanit" font-weight="600" font-size="26" fill="${CREAM}">${gradeWord(data.grade)}</text>` : ""}

  <!-- ท้ายซ้าย -->
  <text x="52" y="${H - 34}" font-family="Kanit" font-size="24" fill="#bfae8a">สแกนพระ 1 ชิ้น = การ์ดพลังงาน 1 ใบ</text>

  <!-- คอลัมน์ขวา: เรดาร์ -->
  <rect x="${RX}" y="60" width="${RW}" height="560" rx="16" fill="#171310" stroke="#6b5320" stroke-width="1.5"/>
  <rect x="${RX + 40}" y="76" width="${RW - 80}" height="44" rx="22" fill="#2a2214" stroke="${GOLD}" stroke-width="1.5"/>
  <text x="${RX + RW / 2}" y="107" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="26" fill="${GOLD}">พลังงาน 6 ด้าน</text>
  ${radarPanelSvg(data, RX + RW / 2, 316, 116)}
  ${data.skills
    .map((s, i) => {
      const y = 546 + i * 36;
      return `
  <circle cx="${RX + 30}" cy="${y - 9}" r="5" fill="${GOLD}"/>
  <text x="${RX + 48}" y="${y}" font-family="Kanit" font-weight="600" font-size="24" fill="${CREAM}">${escapeXml(s.labelFull)}</text>
  <text x="${RX + RW - 26}" y="${y}" text-anchor="end" font-family="Kanit" font-weight="800" font-size="28" fill="${GOLD}">${s.score}</text>`;
    })
    .join("")}

  ${rightBoxes.join("")}

  <!-- QR -->
  <rect x="${RX}" y="${H - 190}" width="${RW}" height="150" rx="14" fill="#171310" stroke="#6b5320" stroke-width="1.5"/>
  <rect x="${RX + 18}" y="${H - 172}" width="114" height="114" rx="10" fill="#ffffff"/>
  <image href="${qrDataUri}" x="${RX + 24}" y="${H - 166}" width="102" height="102"/>
  <text x="${RX + 150}" y="${H - 122}" font-family="Kanit" font-size="24" fill="${CREAM}">สแกนเพื่อดูรายงานเต็ม</text>
  <text x="${RX + 150}" y="${H - 88}" font-family="Kanit" font-size="24" fill="${CREAM}">และแชร์การ์ดนี้</text>
</svg>`;
}

/**
 * รูปเรดาร์เพียว ๆ ธีมครีมทอง (ใช้แทรกใน Flex — Flex วาดกราฟเองไม่ได้ ต้องเป็นรูป)
 * @param {string} publicToken
 * @returns {Promise<Buffer|null>}
 */
export async function renderRadarChipPng(publicToken) {
  const tok = String(publicToken || "").trim();
  if (!tok) return null;
  const { getScanResultPayloadByPublicToken } = await import(
    "../../stores/scanV2/scanResultsV2.db.js"
  );
  const payload = await getScanResultPayloadByPublicToken(tok);
  const data = deriveShowcaseCardData(payload);
  if (!data) return null;
  const { buildRadarStandaloneSvg } = await import(
    "../../utils/reports/radarOgImage.util.js"
  );
  const axisOrder = data.axes.map((a) => a.key);
  const axisLabels = Object.fromEntries(data.axes.map((a) => [a.key, a.label]));
  const axisScores = Object.fromEntries(data.axes.map((a) => [a.key, a.score]));
  const svg = buildRadarStandaloneSvg({
    axisOrder,
    axisLabels,
    axisScores,
    colors: {
      bg: "#fffdf6",
      ringOuterFill: "rgba(201,161,54,0.06)",
      ringOuterStroke: "rgba(165,129,58,0.5)",
      ringMid: "rgba(165,129,58,0.25)",
      ringInner: "rgba(165,129,58,0.15)",
      spoke: "rgba(165,129,58,0.22)",
      polyFill: "rgba(201,161,54,0.35)",
      polyStroke: "#a5813a",
      peakFill: "#a5813a",
      label: "#3b3324",
    },
  });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 640 },
    font: { fontDirs: [FONT_DIR], loadSystemFonts: false, defaultFontFamily: "Kanit" },
  });
  return Buffer.from(resvg.render().asPng());
}

/**
 * ข้อความแชทแบบ B (กบเคาะ 23 ก.ค.): รูปการ์ด (กดซูมได้) + Flex ใบเล็ก
 * (คะแนน + เข้ากับคุณ% + ปุ่มเปิดรายงานเต็ม) — แทนการ์ด Flex สรุปเดิมเฉพาะเลนพระ
 * คืน null = ใช้ไม่ได้ (เลนอื่น/ไม่มีรูป/render พัง) → caller ถอยไปส่ง Flex เดิม
 * @param {string} publicToken
 * @param {string} reportUrl ลิงก์รายงาน HTML
 * @returns {Promise<Array<object> | null>}
 */
export async function buildChatPhotoCardMessages(publicToken, reportUrl, lineUserId) {
  const token = String(publicToken || "").trim();
  if (!token) return null;
  const { getScanResultPayloadByPublicToken } = await import(
    "../../stores/scanV2/scanResultsV2.db.js"
  );
  const payload = await getScanResultPayloadByPublicToken(token);
  const data = deriveShowcaseCardData(payload);
  if (!data) return null;
  // validate render จริงก่อนส่ง URL — กันภาพพังโผล่ในแชท (ผล render มี cache ต่อ instance)
  const buf = await renderShowcasePhotoCardPng(token, payload);
  if (!buf) return null;

  const base = String(process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) return null; // LINE ต้องการ https เท่านั้น
  const cardUrl = `${base}/r/${encodeURIComponent(token)}/photo-card.png`;
  const rUrl = String(reportUrl || `${base}/r/${encodeURIComponent(token)}`);

  const imageMessage = {
    type: "image",
    originalContentUrl: cardUrl,
    previewImageUrl: cardUrl,
  };

  // อันดับชิ้นนี้ในคลังลูกค้า (ของที่ไม่มีบนรูปการ์ด — กบ 23 ก.ค.) · พัง = ไม่แสดง
  let rankLine = "";
  try {
    const uid = String(lineUserId || "").trim();
    if (uid) {
      const { listScanResultsV2PayloadRowsForLineUser } = await import(
        "../../stores/scanV2/scanResultsV2.db.js"
      );
      const rows = await listScanResultsV2PayloadRowsForLineUser(uid, 150);
      const seen = new Set();
      const pieces = [];
      for (const r of rows || []) {
        const d = deriveShowcaseCardData(r?.report_payload_json);
        if (!d) continue;
        const key = `${d.name}|${d.energyScore}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pieces.push({ token: String(r?.report_payload_json?.publicToken || ""), score: d.energyScore });
      }
      if (pieces.length >= 2) {
        const sorted = [...pieces].sort((a, b) => b.score - a.score);
        let rank = sorted.findIndex((p) => p.token === token) + 1;
        if (rank === 0) {
          rank = sorted.filter((p) => p.score > data.energyScore).length + 1;
        }
        rankLine = `ชิ้นนี้พลังแรงเป็นอันดับ ${rank} จาก ${pieces.length} ชิ้นในคลังของคุณ`;
      } else {
        rankLine = "ชิ้นแรกในคลังของคุณ สะสมเพิ่มได้เรื่อย ๆ ครับ";
      }
    }
  } catch {
    rankLine = "";
  }

  const compatPct = data.compat != null ? Math.min(100, Math.max(0, data.compat)) : null;
  const altText = `ผลการอ่านพลัง: พลังรวม ${(Math.round(data.energyScore * 10) / 10).toFixed(1)}`;
  const scoreText = (Math.round(data.energyScore * 10) / 10).toFixed(1);
  const top = data.skills[0];
  const second = data.skills[1];
  const gradeStars = data.grade === "S" ? 5 : data.grade === "A" ? 4 : data.grade === "B" ? 3 : 0;

  // ประโยคอธิบายพลังเด่น (ตายตัวต่อแกน — ไม่มโนตัวเลข ไม่การันตีผล)
  const AXIS_BLURB = {
    luck: "ชิ้นนี้มีพลังเด่นด้านการเปิดทางและจังหวะโอกาส เหมาะกับการพกในวันเจรจา ค้าขาย หรือวันที่มีนัดสำคัญ",
    metta: "ชิ้นนี้มีพลังเด่นด้านเมตตาและไมตรี เหมาะกับการพกในวันพบผู้คน งานบริการ หรือวันที่ต้องเจรจาให้ราบรื่น",
    baramee: "ชิ้นนี้มีพลังเด่นด้านบารมีและภาวะผู้นำ เหมาะกับการพกในวันประชุม คุมงาน หรือเข้าพบผู้ใหญ่",
    specialty: "ชิ้นนี้มีพลังเด่นด้านงานเฉพาะทาง เหมาะกับการพกในวันที่ต้องใช้ฝีมือหรือความชำนาญเฉพาะตัว",
    protection: "ชิ้นนี้มีพลังเด่นด้านคุ้มครองป้องกัน เหมาะกับการพกในวันเดินทางหรือวันที่งานต้องระวังตัวเป็นพิเศษ",
    fortune_anchor: "ชิ้นนี้มีพลังเด่นด้านการหนุนโอกาสและเสริมความมั่นคง เหมาะกับการพกในวันทำงานหรือช่วงเริ่มต้นสิ่งใหม่",
  };
  const blurb = AXIS_BLURB[top?.key] || "";

  const statCol = (contents) => ({
    type: "box",
    layout: "vertical",
    flex: 1,
    alignItems: "center",
    contents,
  });
  const miniFlex = {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      size: "giga",
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#fffdf6",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            contents: [
              {
                type: "box",
                layout: "vertical",
                flex: 1,
                alignItems: "center",
                backgroundColor: "#faf3e0",
                cornerRadius: "12px",
                paddingAll: "10px",
                contents: [
                  {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                      { type: "text", text: "✨", size: "xl", flex: 0, gravity: "center" },
                      {
                        type: "box",
                        layout: "vertical",
                        margin: "sm",
                        contents: [
                          { type: "text", text: "พลังเด่น", size: "xxs", color: "#8a8272" },
                          {
                            type: "text",
                            text: top?.label || "-",
                            weight: "bold",
                            size: "lg",
                            color: "#a5813a",
                            margin: "xs",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: "box",
                layout: "vertical",
                flex: 1,
                alignItems: "center",
                backgroundColor: "#faf3e0",
                cornerRadius: "12px",
                paddingAll: "10px",
                contents: [
                  {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                      { type: "text", text: "🍀", size: "xl", flex: 0, gravity: "center" },
                      {
                        type: "box",
                        layout: "vertical",
                        margin: "sm",
                        contents: [
                          { type: "text", text: "พลังเข้ากับคุณ", size: "xxs", color: "#8a8272" },
                          {
                            type: "text",
                            text: second?.label || "-",
                            weight: "bold",
                            size: "lg",
                            color: "#3b3324",
                            margin: "xs",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { type: "separator", margin: "md", color: "#e2d8ba" },
          {
            type: "box",
            layout: "horizontal",
            margin: "lg",
            contents: [
              statCol([
                {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    {
                      type: "text",
                      text: scoreText,
                      size: "xxl",
                      weight: "bold",
                      color: "#a5813a",
                      flex: 0,
                    },
                    { type: "text", text: "/10", size: "xs", color: "#8a8272", margin: "sm", flex: 0 },
                  ],
                },
                { type: "text", text: "⚡ พลังรวม", size: "xxs", color: "#8a8272", margin: "xs" },
              ]),
              { type: "separator", color: "#e2d8ba" },
              statCol(
                data.grade
                  ? [
                      {
                        type: "box",
                        layout: "baseline",
                        contents: [
                          {
                            type: "text",
                            text: data.grade,
                            size: "xxl",
                            weight: "bold",
                            color: "#3b3324",
                            flex: 0,
                          },
                          { type: "text", text: "RANK", size: "xxs", color: "#8a8272", margin: "sm", flex: 0 },
                        ],
                      },
                      {
                        type: "box",
                        layout: "baseline",
                        margin: "xs",
                        contents: [
                          {
                            type: "text",
                            text: "★".repeat(gradeStars),
                            size: "xs",
                            color: "#c9a136",
                            flex: 0,
                          },
                          ...(gradeStars < 5
                            ? [
                                {
                                  type: "text",
                                  text: "★".repeat(5 - gradeStars),
                                  size: "xs",
                                  color: "#d9d2c0",
                                  flex: 0,
                                },
                              ]
                            : []),
                        ],
                      },
                      { type: "text", text: "เกรด", size: "xxs", color: "#8a8272", margin: "xs" },
                    ]
                  : [
                      {
                        type: "text",
                        text: data.name,
                        size: "lg",
                        weight: "bold",
                        color: "#3b3324",
                      },
                      { type: "text", text: "สายพลัง", size: "xxs", color: "#8a8272", margin: "xs" },
                    ],
              ),
              { type: "separator", color: "#e2d8ba" },
              statCol([
                ...(compatPct != null
                  ? [
                      {
                        type: "text",
                        text: `${compatPct}%`,
                        size: "xxl",
                        weight: "bold",
                        color: "#a5813a",
                      },
                      {
                        type: "box",
                        layout: "vertical",
                        margin: "sm",
                        width: "64px",
                        height: "8px",
                        backgroundColor: "#eee5cc",
                        cornerRadius: "4px",
                        contents: [
                          {
                            type: "box",
                            layout: "vertical",
                            width: `${Math.max(3, compatPct)}%`,
                            height: "8px",
                            backgroundColor: "#c9a136",
                            cornerRadius: "4px",
                            contents: [{ type: "filler" }],
                          },
                        ],
                      },
                      { type: "text", text: "เข้ากับคุณ", size: "xxs", color: "#8a8272", margin: "xs" },
                    ]
                  : [{ type: "text", text: "-", size: "lg", color: "#8a8272" }]),
              ]),
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#fffdf6",
        paddingStart: "14px",
        paddingEnd: "14px",
        paddingBottom: "14px",
        paddingTop: "0px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#a5813a",
            cornerRadius: "10px",
            paddingAll: "12px",
            action: { type: "uri", label: "เปิดรายงาน", uri: rUrl },
            contents: [
              {
                type: "text",
                text: "🔒 เปิดรายงานพลังงานเต็ม",
                weight: "bold",
                size: "md",
                color: "#ffffff",
                align: "center",
              },
              {
                type: "text",
                text: "ดูรายละเอียดครบทุกด้าน + คำแนะนำเฉพาะคุณ",
                size: "xxs",
                color: "#f5edd8",
                align: "center",
                margin: "xs",
              },
            ],
          },
        ],
      },
      styles: { body: { backgroundColor: "#fffdf6" }, footer: { backgroundColor: "#fffdf6" } },
    },
  };

  // สไตล์ส่ง (กบ 23 ก.ค. ลองเทียบ): image_plus_flex = รูปซูมได้ + flex แยก (default)
  // single_flex = flex ใบเดียว รูป hero บน + หลอด/อันดับ/ปุ่มล่าง (กดรูปเปิดภาพเต็ม)
  const style = String(process.env.SCAN_CHAT_PHOTO_CARD_STYLE || "image_plus_flex")
    .trim()
    .toLowerCase();
  if (style === "single_flex") {
    return [
      {
        type: "flex",
        altText,
        contents: {
          type: "bubble",
          size: "mega",
          hero: {
            type: "image",
            url: cardUrl,
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
            action: { type: "uri", uri: cardUrl },
          },
          body: miniFlex.contents.body,
          footer: miniFlex.contents.footer,
          styles: miniFlex.contents.styles,
        },
      },
    ];
  }
  return [imageMessage, miniFlex];
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
  // crop วงกลมด้วย sharp — resvg ไม่รองรับ clip-path (บทเรียนการ์ด TCG 22 ก.ค.)
  const CIRCLE = 420;
  const circleMask = Buffer.from(
    `<svg width="${CIRCLE}" height="${CIRCLE}"><circle cx="${CIRCLE / 2}" cy="${CIRCLE / 2}" r="${CIRCLE / 2}" fill="#fff"/></svg>`,
  );
  const circleBuf = await sharp(imgBuf)
    .rotate()
    .resize(CIRCLE, CIRCLE, { fit: "cover", position: "centre" })
    .composite([{ input: circleMask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const photoDataUri = `data:image/png;base64,${circleBuf.toString("base64")}`;

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

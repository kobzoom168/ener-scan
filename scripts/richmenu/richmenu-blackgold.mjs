import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";

const W = 2500, H = 1686;
const CW = W / 3, CH = H / 2;
const G = "#0b0906";        // ดำอมน้ำตาลลึก
const G2 = "#1b150c";       // ดำอุ่นรอง (ไล่เฉดหัวจอ)
const GOLD = "#B8871B";
const GOLD_BRIGHT = "#E8C547";
const CREAM = "#F5EDD8";
const CREAM_DIM = "#CBB98A";

// ไอคอนเวกเตอร์ (วาดใน viewBox 100x100, ไม่มีอีโมจิ)
const icons = {
  camera: `<rect x="14" y="30" width="72" height="50" rx="10" fill="none" stroke="{C}" stroke-width="6"/>
    <path d="M38 30 L44 18 L56 18 L62 30" fill="none" stroke="{C}" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="50" cy="55" r="15" fill="none" stroke="{C}" stroke-width="6"/>
    <circle cx="74" cy="42" r="3.5" fill="{C}"/>`,
  compare: `<path d="M22 20 h20 a4 4 0 0 1 4 4 v40 a14 14 0 0 1 -28 0 v-40 a4 4 0 0 1 4 -4 z" fill="none" stroke="{C}" stroke-width="6"/>
    <path d="M58 20 h20 a4 4 0 0 1 4 4 v40 a14 14 0 0 1 -28 0 v-40 a4 4 0 0 1 4 -4 z" fill="none" stroke="{C}" stroke-width="6"/>
    <path d="M44 86 h12 M50 80 v12" stroke="{C}" stroke-width="6" stroke-linecap="round"/>`,
  history: `<circle cx="52" cy="52" r="34" fill="none" stroke="{C}" stroke-width="6"/>
    <path d="M52 32 v22 l16 9" fill="none" stroke="{C}" stroke-width="6" stroke-linecap="round"/>
    <path d="M18 40 l-6 12 12 2" fill="none" stroke="{C}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  coin: `<circle cx="44" cy="46" r="26" fill="none" stroke="{C}" stroke-width="6"/>
    <text x="44" y="57" text-anchor="middle" font-family="Kanit" font-weight="700" font-size="30" fill="{C}">฿</text>
    <path d="M62 74 a26 12 0 0 0 26 -8 M60 86 a30 10 0 0 0 30 -10" fill="none" stroke="{C}" stroke-width="5" stroke-linecap="round"/>`,
  app: `<rect x="30" y="12" width="40" height="76" rx="9" fill="none" stroke="{C}" stroke-width="6"/>
    <path d="M44 20 h12" stroke="{C}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="50" cy="78" r="3.5" fill="{C}"/>
    <path d="M50 34 l4.5 9 10 1.4 -7.2 7 1.7 9.9 -9 -4.7 -9 4.7 1.7 -9.9 -7.2 -7 10 -1.4 z" fill="none" stroke="{C}" stroke-width="4.5" stroke-linejoin="round"/>`,
  gift: `<rect x="18" y="42" width="64" height="44" rx="6" fill="none" stroke="{C}" stroke-width="6"/>
    <path d="M50 42 v44 M18 60 h64" stroke="{C}" stroke-width="5"/>
    <path d="M50 42 c-16 0 -22 -8 -18 -16 c4 -7 14 -4 18 8 c4 -12 14 -15 18 -8 c4 8 -2 16 -18 16 z" fill="none" stroke="{C}" stroke-width="5"/>`,
};

const cells = [
  { icon: "camera",  main: "ส่งรูปให้อาจารย์", sub: "ฟรีวันละ 1 ชิ้น", hero: true },
  { icon: "compare", main: "เทียบพระในคลัง",  sub: "ชิ้นไหนเข้ากับคุณสุด" },
  { icon: "history", main: "ดูผลเก่า",        sub: "รายงานทุกชิ้นที่เคยสแกน" },
  { icon: "coin",    main: "ค่าครูและสิทธิ์",  sub: "เช็คสิทธิ์คงเหลือ" },
  { icon: "app",     main: "เปิดแอป Ener",     sub: "ดวงวันนี้ · สถิติ · ข้อมูลของฉัน" },
  { icon: "gift",    main: "ชวนเพื่อน",        sub: "รับสิทธิ์สแกนฟรีทั้งคู่" },
];

let body = `
<defs>
  <linearGradient id="goldg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#E8C547"/><stop offset="0.5" stop-color="#C89A2B"/><stop offset="1" stop-color="#A87E14"/>
  </linearGradient>
  <linearGradient id="bgg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${G2}"/><stop offset="1" stop-color="${G}"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bgg)"/>`;

cells.forEach((c, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = col * CW, y = row * CH;
  const pad = 26;
  const cx = x + CW / 2;
  const iconColor = c.hero ? G : GOLD_BRIGHT;
  const mainColor = c.hero ? G : CREAM;
  const subColor = c.hero ? "#3d2f10" : CREAM_DIM;

  if (c.hero) {
    body += `<rect x="${x + pad}" y="${y + pad}" width="${CW - pad * 2}" height="${CH - pad * 2}" rx="36" fill="url(#goldg)"/>
      <rect x="${x + pad + 10}" y="${y + pad + 10}" width="${CW - pad * 2 - 20}" height="${CH - pad * 2 - 20}" rx="28" fill="none" stroke="#0b090633" stroke-width="3"/>`;
  } else {
    body += `<rect x="${x + pad}" y="${y + pad}" width="${CW - pad * 2}" height="${CH - pad * 2}" rx="36" fill="#ffffff0a" stroke="${GOLD}77" stroke-width="3"/>`;
  }

  const iconSize = 300;
  const ix = cx - iconSize / 2, iy = y + 130;
  body += `<g transform="translate(${ix},${iy}) scale(${iconSize / 100})">${icons[c.icon].replaceAll("{C}", iconColor)}</g>`;

  body += `<text x="${cx}" y="${y + 560}" text-anchor="middle" font-family="Kanit" font-weight="600" font-size="86" fill="${mainColor}">${c.main}</text>
    <text x="${cx}" y="${y + 660}" text-anchor="middle" font-family="Kanit" font-weight="400" font-size="52" fill="${subColor}">${c.sub}</text>`;
});

// เส้นทองบางๆ กลางจอ + โลโก้เล็กมุม
body += `<text x="${W - 40}" y="${H - 34}" text-anchor="end" font-family="Kanit" font-weight="500" font-size="40" fill="${CREAM_DIM}" opacity="0.6">ENER SCAN</text>`;

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

const FONT_DIR = path.join("/root/work/ener-scan", "src", "brand", "fonts");
const fonts = fs.readdirSync(FONT_DIR).filter(f => /\.(ttf|otf)$/i.test(f)).map(f => path.join(FONT_DIR, f));
const resvg = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { fontFiles: fonts, defaultFontFamily: "Kanit", loadSystemFonts: false } });
fs.writeFileSync(path.join(process.cwd(), "scripts", "richmenu", "richmenu-blackgold.png"), resvg.render().asPng());
console.log("OK richmenu-v1.png");

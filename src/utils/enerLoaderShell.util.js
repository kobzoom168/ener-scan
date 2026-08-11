/**
 * หน้ารอโหลดกลาง (โลโก้ LIFF: emblem วาดตัวเอง + Ener + จุดวิ่ง — กบ 4 ส.ค.
 * "logo ตอนเข้า html อยากให้เหมือนเข้า lift" ใช้ทั้ง /synergy และ /r report หลัก)
 * ตอบทันทีแล้ว fetch เนื้อจริงจาก bodyUrlExpr (นิพจน์ JS ฝั่ง browser) มา document.write ทับ
 */
export function buildLoaderShellHtml({ title, message, bodyUrlExpr, metaDescription }) {
  // SEO (UX audit 11 ส.ค.): shell คือ head ที่ Google เห็น — ต้องมี description + JSON-LD ที่นี่
  const desc = String(metaDescription || "ดูรายงานพลังพระ/เทวรูป/เครื่องรางจาก Ener Scan พร้อมพลังเด่น ความเข้ากัน และพลังทั้ง 7 ด้าน").slice(0, 300);
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc.replace(/"/g, "&quot;")}">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Ener Scan","url":"https://scan.my-ener.uk"}</script>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%230d0b08'/%3E%3Ctext x='50' y='68' font-size='52' text-anchor='middle' fill='%23e8c547'%3E✦%3C/text%3E%3C/svg%3E">
<style>body{margin:0;background:#0d0b08;display:grid;place-items:center;min-height:100vh;font-family:system-ui,sans-serif}
.load-wrap{display:flex;flex-direction:column;align-items:center;text-align:center}
.emblem{width:150px;height:150px;display:block;overflow:visible}
.serif{font-family:"Didot","Bodoni 72","Playfair Display","Iowan Old Style",Palatino,Georgia,serif}
.wordmark{font-size:2.6rem;color:#a5813a;letter-spacing:.16em;margin-top:18px;line-height:1;padding-left:.16em;background:linear-gradient(100deg,#a5813a 34%,#f6e7b6 50%,#a5813a 66%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.loaddots{display:flex;gap:9px;margin-top:22px}
.loaddots i{width:6px;height:6px;border-radius:99px;background:#e9cf93;opacity:.3}
.tx{color:#b3a479;font-size:13.5px;margin-top:16px}
@media (prefers-reduced-motion:no-preference){
.dw{stroke-dasharray:1;stroke-dashoffset:1;animation:draw .55s ease forwards}
.dw-circle{animation-delay:.05s}
.dw-ray{animation-delay:.3s;animation-duration:.4s}
.dw-gem{animation-delay:.35s}
.dw-gem2{animation-delay:.6s;animation-duration:.4s}
@keyframes draw{to{stroke-dashoffset:0}}
.em-glow{opacity:0;transform-origin:60px 60px;animation:fadein .55s ease 0s forwards,glow 3.6s ease-in-out 1s infinite}
.em-center{opacity:0;transform-origin:60px 60px;animation:pop .55s cubic-bezier(.2,1.5,.4,1) .7s forwards}
.em-ring{opacity:0;transform-origin:60px 60px;animation:fadein .6s ease .45s forwards,spin 28s linear .45s infinite}
.em-orbit{opacity:0;transform-origin:60px 60px;animation:fadein .6s ease .7s forwards,spin 10s linear .7s infinite}
.em-gem{transform-origin:60px 60px;animation:gem 3.6s ease-in-out 1s infinite}
.em-rays{opacity:0;transform-origin:60px 60px;animation:rays .5s ease .3s forwards}
@keyframes rays{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}
.aura{transform-origin:60px 60px;opacity:0;animation:aura 3.2s ease-out .9s infinite}
.aura2{animation-delay:2.5s}
.wordmark{opacity:0;animation:fadeup .6s ease .5s forwards,shine 3.6s ease-in-out 1.6s infinite}
.loaddots i{animation:dot 1.3s ease-in-out infinite}
.loaddots i:nth-child(2){animation-delay:.16s}
.loaddots i:nth-child(3){animation-delay:.32s}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes gem{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes glow{0%,100%{opacity:.4}50%{opacity:.95}}
@keyframes fadein{to{opacity:1}}
@keyframes pop{0%{opacity:0;transform:scale(0)}70%{opacity:1;transform:scale(1.35)}100%{opacity:1;transform:scale(1)}}
@keyframes aura{0%{opacity:.5;transform:scale(.55)}70%{opacity:.12}100%{opacity:0;transform:scale(1.55)}}
@keyframes fadeup{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes shine{0%{background-position:180% 0}45%,100%{background-position:-80% 0}}
@keyframes dot{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-5px)}}
}</style></head><body>
<div class="load-wrap">
      <svg class="emblem" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="eg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#e9cf93"/><stop offset="1" stop-color="#a5813a"/>
          </linearGradient>
          <radialGradient id="eglow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stop-color="#e9cf93" stop-opacity=".55"/><stop offset="1" stop-color="#e9cf93" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle class="aura" cx="60" cy="60" r="40" fill="none" stroke="url(#eg)" stroke-width="1"/>
        <circle class="aura aura2" cx="60" cy="60" r="40" fill="none" stroke="url(#eg)" stroke-width="1"/>
        <circle class="em-glow" cx="60" cy="60" r="52" fill="url(#eglow)"/>
        <g class="em-ring"><circle cx="60" cy="60" r="47" fill="none" stroke="url(#eg)" stroke-width="1" stroke-dasharray="1.5 7" stroke-linecap="round"/></g>
        <circle class="dw dw-circle" pathLength="1" cx="60" cy="60" r="39" fill="none" stroke="url(#eg)" stroke-width="1.3"/>
        <g class="em-rays" stroke="url(#eg)" stroke-width="1.2" stroke-linecap="round">
          <line x1="60" y1="14" x2="60" y2="19"/><line x1="92.5" y1="27.5" x2="89" y2="31"/>
          <line x1="106" y1="60" x2="101" y2="60"/><line x1="92.5" y1="92.5" x2="89" y2="89"/>
          <line x1="60" y1="106" x2="60" y2="101"/><line x1="27.5" y1="92.5" x2="31" y2="89"/>
          <line x1="14" y1="60" x2="19" y2="60"/><line x1="27.5" y1="27.5" x2="31" y2="31"/>
        </g>
        <g class="em-gem">
          <path class="dw dw-gem" pathLength="1" d="M60 40 L76 60 L60 80 L44 60 Z" fill="none" stroke="url(#eg)" stroke-width="1.6" stroke-linejoin="round"/>
          <path class="dw dw-gem2" pathLength="1" d="M60 40 L60 80 M44 60 L76 60 M51 51 L69 51 M51 69 L69 69" stroke="url(#eg)" stroke-width=".8" opacity=".65"/>
          <circle class="em-center" cx="60" cy="60" r="3" fill="url(#eg)"/>
        </g>
        <g class="em-orbit"><circle cx="60" cy="13" r="2.6" fill="#a5813a"/></g>
      </svg>
<div class="wordmark serif">Ener</div>
<div class="loaddots"><i></i><i></i><i></i></div>
<div class="tx">${message}</div>
</div>
<script>fetch(${bodyUrlExpr}).then(function(r){return r.text()}).then(function(h){document.open();document.write(h);document.close();}).catch(function(){document.querySelector(".tx").textContent="โหลดไม่สำเร็จ ลองรีเฟรชอีกครั้งครับ"});</script>
</body></html>`;
}

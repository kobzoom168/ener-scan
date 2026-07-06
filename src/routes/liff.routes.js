/**
 * Ener สายมู — LIFF app (Phase 1, staging-first).
 * v6 design: White & Gold, elderly-friendly large type.
 *
 * GET  /liff                    → single-page LIFF app (onboarding → home)
 * GET  /api/liff/profile        → ?userId= → { found, profile }
 * POST /api/liff/profile        → upsert profile (registration) into liff_profiles
 * GET  /api/liff/daily          → ?userId= → deterministic "ดวงวันนี้" (same user+day = same result)
 *
 * NOTE: MVP trusts the LIFF-provided userId (no idToken verification yet) — staging only;
 * verify LINE idToken server-side before prod.
 */
import express from "express";
import { supabase } from "../config/supabase.js";

export const liffRouter = express.Router();

/* ---------------- deterministic daily reading ---------------- */

function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function bangkokDateKey(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

const DAILY_MESSAGES = [
  "วันนี้เหมาะกับการเริ่มต้นสิ่งใหม่ โดยเฉพาะช่วงเช้า",
  "โชคจากผู้ใหญ่เข้ามาช่วยหนุน งานที่ค้างอยู่จะคลี่คลาย",
  "พลังเมตตาเด่น คนรอบตัวพร้อมช่วยเหลือ อย่าลืมยิ้มรับ",
  "วันนี้ควรใจเย็นเป็นพิเศษ ช้าแต่ชัวร์จะได้ผลดีกว่า",
  "การเงินมีจังหวะดีช่วงบ่าย ตัดสินใจด้วยสติจะได้เปรียบ",
  "เหมาะกับการไหว้พระเสริมดวง จิตใจจะสงบและเห็นทางออก",
  "ความรักและครอบครัวเด่น หาเวลาอยู่กับคนสำคัญ",
  "พลังกำลังฟื้นตัว พักผ่อนให้พอ แล้วพรุ่งนี้จะแรงกว่าเดิม",
];

function gradeFor(score) {
  if (score >= 90) return "ดีเยี่ยม";
  if (score >= 80) return "ดีมาก";
  if (score >= 70) return "ดี";
  if (score >= 62) return "ปานกลาง";
  return "ค่อยเป็นค่อยไป";
}

function buildDaily(userId, now = Date.now()) {
  const day = bangkokDateKey(now);
  const seed = String(userId || "guest").trim() + "|" + day;
  const score = 55 + (fnv1a32(seed + "|score") % 41); // 55..95
  const message = DAILY_MESSAGES[fnv1a32(seed + "|msg") % DAILY_MESSAGES.length];
  const luckyNum = fnv1a32(seed + "|num") % 10;
  return { day, score, grade: gradeFor(score), message, luckyNum };
}

liffRouter.get("/api/liff/daily", (req, res) => {
  const userId = String(req.query.userId || "").trim();
  res.json({ ok: true, ...buildDaily(userId) });
});

/* ---------------- profile API ---------------- */

const PROFILE_FIELDS = [
  "nickname",
  "phone",
  "birthdate",
  "birth_time",
  "gender",
  "interest",
  "channel",
];

liffRouter.get("/api/liff/profile", async (req, res) => {
  const userId = String(req.query.userId || "").trim();
  if (!userId) return res.status(400).json({ ok: false, error: "missing_userId" });
  try {
    const { data, error } = await supabase
      .from("liff_profiles")
      .select("*")
      .eq("line_user_id", userId)
      .maybeSingle();
    if (error) throw error;
    res.json({ ok: true, found: Boolean(data), profile: data || null });
  } catch (e) {
    console.error(JSON.stringify({ event: "LIFF_PROFILE_GET_ERROR", message: String(e?.message || e).slice(0, 200) }));
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

liffRouter.post("/api/liff/profile", express.json(), async (req, res) => {
  const b = req.body || {};
  const userId = String(b.userId || "").trim();
  if (!userId) return res.status(400).json({ ok: false, error: "missing_userId" });

  const row = { line_user_id: userId, display_name: String(b.displayName || "").slice(0, 120) || null };
  for (const f of PROFILE_FIELDS) {
    const v = b[f];
    row[f] = v == null || String(v).trim() === "" ? null : String(v).slice(0, 160);
  }
  row.updated_at = new Date().toISOString();

  try {
    const { data: existing, error: selErr } = await supabase
      .from("liff_profiles")
      .select("line_user_id")
      .eq("line_user_id", userId)
      .maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
      const { error } = await supabase.from("liff_profiles").update(row).eq("line_user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("liff_profiles").insert(row);
      if (error) throw error;
    }
    console.log(JSON.stringify({ event: "LIFF_PROFILE_SAVED", lineUserIdPrefix: userId.slice(0, 8), isNew: !existing }));
    res.json({ ok: true });
  } catch (e) {
    console.error(JSON.stringify({ event: "LIFF_PROFILE_SAVE_ERROR", message: String(e?.message || e).slice(0, 200) }));
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

/* ---------------- the LIFF single-page app ---------------- */

liffRouter.get("/liff", (req, res) => {
  const liffId = String(process.env.LIFF_ID || "").trim();
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(buildLiffHtml(liffId));
});

function buildLiffHtml(liffId) {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>Ener สายมู</title>
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>
  :root{
    --bg:#faf8f3; --card:#ffffff; --line:#efe8d9; --line-gold:#e2d3b0;
    --gold:#c9a35c; --gold-deep:#a5813a; --gold-hi:#e3c98f;
    --ink:#37332b; --sub:#8b8577; --faint:#b8b1a0;
    --shadow:0 12px 32px -18px rgba(165,129,58,.28);
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html{-webkit-text-size-adjust:100%;overflow-x:hidden}
  /* elderly-friendly: large base type, big targets */
  body{margin:0;font-family:"IBM Plex Sans Thai","Noto Sans Thai","Sukhumvit Set",-apple-system,system-ui,sans-serif;
    background:var(--bg);color:var(--ink);font-size:17.5px;line-height:1.6;min-height:100dvh;
    width:100%;max-width:100%;overflow-x:hidden;overscroll-behavior-x:none}
  .serif{font-family:"Didot","Bodoni 72","Playfair Display","Iowan Old Style",Palatino,Georgia,serif}
  .app{width:100%;max-width:520px;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column;
    padding:18px 18px calc(26px + env(safe-area-inset-bottom));gap:15px;overflow-x:hidden}
  .hidden{display:none!important}
  button{font:inherit;border:none;cursor:pointer}

  .apphead{display:flex;align-items:center;justify-content:space-between}
  .lg{font-size:1.9rem;color:var(--gold-deep);letter-spacing:.05em}
  .mywrap{display:flex;align-items:center;gap:8px}
  .mybtn{background:#fff;border:1px solid var(--line);border-radius:999px;padding:9px 16px;font-size:.86rem;color:var(--gold-deep);font-weight:700}

  .greet small{color:var(--sub);font-size:.95rem}
  .greet .nm{font-weight:800;font-size:1.55rem;line-height:1.3}
  .greet .ds{color:var(--sub);font-size:.92rem;margin-top:2px}

  .score{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:20px;box-shadow:var(--shadow);position:relative;overflow:hidden}
  .score::before{content:"";position:absolute;right:-40px;top:-60px;width:180px;height:180px;border-radius:50%;
    background:radial-gradient(closest-side, rgba(201,163,92,.10), transparent 70%)}
  .score .k{font-size:1.02rem;font-weight:800}
  .score .k small{display:block;font-weight:500;color:var(--faint);font-size:.82rem;margin-top:2px}
  .score .mid{display:flex;align-items:center;gap:10px;margin-top:4px}
  .score .num{font-size:4rem;line-height:1.08;color:var(--gold-deep);font-weight:500}
  .score .per{font-size:1.05rem;color:var(--faint)}
  .score .grade{margin-left:auto;text-align:right}
  .score .grade b{display:block;color:var(--gold-deep);font-size:1.25rem}
  .score .grade small{color:var(--faint);font-size:.8rem}
  .score .ft{font-size:.98rem;color:var(--sub);margin-top:8px;line-height:1.65}
  .score .lucky{display:inline-flex;align-items:center;gap:9px;margin-top:12px;border:1px solid var(--line-gold);
    background:#fdf8ec;border-radius:999px;padding:7px 15px;font-size:.9rem;color:var(--gold-deep);font-weight:700}

  .sect{font-size:1.08rem;font-weight:800;margin-top:2px}
  .rows{display:flex;flex-direction:column;gap:11px}
  .row{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:13px;display:flex;align-items:center;gap:13px;
    box-shadow:var(--shadow);text-align:left;width:100%}
  /* bespoke Ener medallions (gold line-icons) instead of stock emoji */
  .med{width:58px;height:54px;border-radius:16px;flex:0 0 auto;display:grid;place-items:center;position:relative;
    box-shadow:inset 0 0 0 1px rgba(165,129,58,.18)}
  .med svg{width:28px;height:28px;stroke:var(--gold-deep);fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
  .med1{background:linear-gradient(150deg,#f8ecd6,#efdab6)}
  .med2{background:linear-gradient(150deg,#f4ebd8,#e7d1a3)}
  .med3{background:linear-gradient(150deg,#f1e9db,#ddcaa6)}
  .row .rt{font-weight:800;font-size:1.08rem}
  .row .rd{font-size:.88rem;color:var(--sub);margin-top:1px;line-height:1.5}
  .row .chev{margin-left:auto;color:var(--faint);font-size:1.3rem;padding-right:2px}

  .note{color:var(--faint);font-size:.85rem;text-align:center;line-height:1.6}

  /* onboarding */
  .obt{text-align:center;margin-top:6px}
  .obt .t{font-size:1.5rem;font-weight:800}
  .obt small{display:block;color:var(--sub);font-size:.95rem;margin-top:5px}
  .dots{display:flex;gap:8px;justify-content:center;margin-top:12px}
  .dot{height:6px;width:34px;border-radius:99px;background:#e7dfcd}
  .dot.on{background:var(--gold);width:52px}
  .q{font-size:1.5rem;font-weight:800;line-height:1.45;margin-top:16px;text-align:center}
  .why{color:var(--sub);font-size:.95rem;text-align:center;margin-top:8px;line-height:1.6}
  .bigfield{margin-top:18px}
  .bigfield label{display:block;font-size:.95rem;font-weight:700;color:var(--sub);margin:0 4px 8px}
  .bigin{width:100%;background:#fff;border:1.5px solid var(--line-gold);border-radius:18px;padding:17px 18px;
    font-size:1.25rem;font-weight:700;color:var(--ink);outline:none;font-family:inherit}
  .bigin:focus{border-color:var(--gold);box-shadow:0 0 0 4px rgba(201,163,92,.15)}
  .pills{display:flex;flex-wrap:wrap;gap:11px;margin-top:14px;justify-content:center}
  .pill{background:#fff;border:1.5px solid var(--line);border-radius:999px;padding:14px 24px;font-size:1.08rem;font-weight:700;color:var(--sub)}
  .pill.on{border-color:var(--gold);color:var(--gold-deep);background:#fdf8ec;font-weight:800}
  .obfoot{margin-top:auto;display:flex;flex-direction:column;gap:11px;padding-top:18px}
  .goldbtn{width:100%;background:linear-gradient(165deg,#e3c98f,#c9a35c 60%,#b08a40);color:#fff;font-weight:800;
    text-align:center;padding:17px;border-radius:18px;font-size:1.2rem;box-shadow:0 14px 30px -12px rgba(176,138,64,.55)}
  .goldbtn:disabled{opacity:.5}
  .backbtn{width:100%;background:transparent;color:var(--faint);font-size:.98rem;font-weight:600;padding:6px;text-align:center}

  /* date selects (custom Thai picker) */
  .row3{display:grid;grid-template-columns:1fr 1.3fr 1.2fr;gap:9px}
  select.bigin{-webkit-appearance:none;appearance:none;background:#fff;padding-right:34px;
    text-align:center;text-align-last:center;background-image:none}
  .selwrap{position:relative}
  .selwrap::after{content:"";position:absolute;right:15px;top:50%;width:9px;height:9px;pointer-events:none;
    border-right:2px solid var(--gold-deep);border-bottom:2px solid var(--gold-deep);transform:translateY(-70%) rotate(45deg)}
  select.bigin:focus{border-color:var(--gold);box-shadow:0 0 0 4px rgba(201,163,92,.15)}

  /* premium loading emblem */
  .center{display:grid;place-items:center;min-height:80dvh;text-align:center}
  .load-wrap{display:flex;flex-direction:column;align-items:center}
  .emblem{width:138px;height:138px;display:block}
  .wordmark{font-size:2.6rem;color:var(--gold-deep);letter-spacing:.16em;margin-top:16px;line-height:1;padding-left:.16em}
  .wordmark-sub{font-size:.82rem;color:var(--gold);letter-spacing:.62em;margin-top:9px;padding-left:.62em}
  .loaddots{display:flex;gap:8px;margin-top:22px}
  .loaddots i{width:7px;height:7px;border-radius:99px;background:var(--gold);opacity:.35}
  .ld{color:var(--sub);font-size:1rem;margin-top:16px}
  @media (prefers-reduced-motion:no-preference){
    .em-ring{transform-origin:60px 60px;animation:spin 26s linear infinite}
    .em-orbit{transform-origin:60px 60px;animation:spin 9s linear infinite}
    .em-gem{transform-origin:60px 60px;animation:gem 3.6s ease-in-out infinite}
    .em-glow{transform-origin:60px 60px;animation:glow 3.6s ease-in-out infinite}
    .loaddots i{animation:dot 1.3s ease-in-out infinite}
    .loaddots i:nth-child(2){animation-delay:.16s}
    .loaddots i:nth-child(3){animation-delay:.32s}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes gem{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
    @keyframes glow{0%,100%{opacity:.45}50%{opacity:.95}}
    @keyframes dot{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-5px)}}
  }
</style>
</head>
<body>
<div class="app">

  <!-- loading (bespoke Ener energy sigil) -->
  <div id="v-load" class="center">
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
        <circle class="em-glow" cx="60" cy="60" r="52" fill="url(#eglow)"/>
        <g class="em-ring"><circle cx="60" cy="60" r="47" fill="none" stroke="url(#eg)" stroke-width="1" stroke-dasharray="1.5 7" stroke-linecap="round"/></g>
        <circle cx="60" cy="60" r="39" fill="none" stroke="url(#eg)" stroke-width="1.3"/>
        <g stroke="url(#eg)" stroke-width="1.2" stroke-linecap="round">
          <line x1="60" y1="14" x2="60" y2="19"/><line x1="92.5" y1="27.5" x2="89" y2="31"/>
          <line x1="106" y1="60" x2="101" y2="60"/><line x1="92.5" y1="92.5" x2="89" y2="89"/>
          <line x1="60" y1="106" x2="60" y2="101"/><line x1="27.5" y1="92.5" x2="31" y2="89"/>
          <line x1="14" y1="60" x2="19" y2="60"/><line x1="27.5" y1="27.5" x2="31" y2="31"/>
        </g>
        <g class="em-gem">
          <path d="M60 40 L76 60 L60 80 L44 60 Z" fill="none" stroke="url(#eg)" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M60 40 L60 80 M44 60 L76 60 M51 51 L69 51 M51 69 L69 69" stroke="url(#eg)" stroke-width=".8" opacity=".65"/>
          <circle cx="60" cy="60" r="3" fill="url(#eg)"/>
        </g>
        <g class="em-orbit"><circle cx="60" cy="13" r="2.6" fill="#a5813a"/></g>
      </svg>
      <div class="wordmark serif">Ener</div>
      <div class="wordmark-sub">สายมู</div>
      <div class="loaddots"><i></i><i></i><i></i></div>
      <p class="ld" id="loadmsg" style="display:none"></p>
    </div>
  </div>

  <!-- onboarding -->
  <div id="v-ob" class="hidden" style="display:flex;flex-direction:column;flex:1">
    <div class="obt"><div class="t">เริ่มต้นใช้งาน Ener</div><small>ตอบทีละข้อ ง่าย ๆ ไม่กี่ขั้น</small></div>
    <div class="dots"><span class="dot" id="d0"></span><span class="dot" id="d1"></span><span class="dot" id="d2"></span><span class="dot" id="d3"></span></div>

    <div id="st0">
      <div class="q">ให้อาจารย์เรียกคุณ<br>ว่าอะไรดี</div>
      <div class="bigfield"><label>ชื่อเล่น</label><input class="bigin" id="f-nick" placeholder="เช่น กบ" maxlength="40"/></div>
    </div>

    <div id="st1" class="hidden">
      <div class="q">เกิดวันไหน<br>บอกอาจารย์หน่อย</div>
      <div class="why">ใช้ผูกดวงของคุณ ข้อมูลนี้เก็บเป็นความลับ</div>
      <div class="bigfield"><label>วันเกิด</label>
        <div class="row3">
          <span class="selwrap"><select class="bigin" id="f-day"></select></span>
          <span class="selwrap"><select class="bigin" id="f-mon"></select></span>
          <span class="selwrap"><select class="bigin" id="f-year"></select></span>
        </div>
      </div>
      <div class="bigfield"><label>ช่วงเวลาที่เกิด (ถ้าทราบ)</label>
        <span class="selwrap" style="display:block"><select class="bigin" id="f-bt"></select></span>
      </div>
    </div>

    <div id="st2" class="hidden">
      <div class="q">เพศของคุณ</div>
      <div class="pills" id="g-sex">
        <button class="pill" data-v="หญิง">หญิง</button>
        <button class="pill" data-v="ชาย">ชาย</button>
        <button class="pill" data-v="ไม่ระบุ">ไม่ระบุ</button>
      </div>
    </div>

    <div id="st3" class="hidden">
      <div class="q">สนใจบริการไหน<br>มากที่สุด</div>
      <div class="pills" id="g-int">
        <button class="pill" data-v="ดูดวง">🔮 ดูดวง</button>
        <button class="pill" data-v="สแกนพระ">🪬 สแกนพระ</button>
        <button class="pill" data-v="ฮวงจุ้ย">🏠 ฮวงจุ้ย</button>
        <button class="pill" data-v="เครื่องราง">🧿 เครื่องราง</button>
      </div>
      <div class="why" style="margin-top:18px">รู้จัก Ener จากช่องทางไหน</div>
      <div class="pills" id="g-ch">
        <button class="pill" data-v="Facebook">Facebook</button>
        <button class="pill" data-v="TikTok">TikTok</button>
        <button class="pill" data-v="เพื่อนแนะนำ">เพื่อนแนะนำ</button>
        <button class="pill" data-v="อื่นๆ">อื่น ๆ</button>
      </div>
      <div class="bigfield"><label>เบอร์โทร (ไม่บังคับ)</label><input class="bigin" id="f-ph" type="tel" placeholder="เบอร์มือถือ 10 หลัก" maxlength="20"/></div>
    </div>

    <div class="obfoot">
      <button class="goldbtn" id="ob-next">ต่อไป</button>
      <button class="backbtn hidden" id="ob-back">ย้อนกลับ</button>
    </div>
  </div>

  <!-- home -->
  <div id="v-home" class="hidden" style="display:flex;flex-direction:column;gap:15px">
    <div class="apphead">
      <span class="lg serif">Ener</span>
      <span class="mywrap"><button class="mybtn" id="btn-edit">ข้อมูลของฉัน</button></span>
    </div>
    <div class="greet">
      <small id="h-when">สวัสดี</small>
      <div class="nm" id="h-name">คุณ...</div>
      <div class="ds">ให้ Ener เป็นพลังบวกในการใช้ชีวิตของคุณ</div>
    </div>

    <div class="score">
      <div class="k">ดวงวันนี้ของคุณ<small id="s-date"></small></div>
      <div class="mid">
        <span class="num serif" id="s-num">–</span><span class="per serif">/100</span>
        <span class="grade"><b id="s-grade"></b><small>พลังงานโดยรวม</small></span>
      </div>
      <div class="ft" id="s-msg"></div>
      <span class="lucky">✦ เลขนำโชควันนี้ <b id="s-lucky" style="font-size:1.15rem">–</b></span>
    </div>

    <div class="sect">บริการแนะนำ</div>
    <div class="rows">
      <button class="row" data-say="สแกนพระ"><span class="med med1"><svg viewBox="0 0 24 24"><path d="M4 8.5V6a2 2 0 0 1 2-2h2.5"/><path d="M15.5 4H18a2 2 0 0 1 2 2v2.5"/><path d="M20 15.5V18a2 2 0 0 1-2 2h-2.5"/><path d="M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><path d="M12 8.2c-1.9 0-3 1.5-3 3.3 0 2 1.5 3.3 3 4.8 1.5-1.5 3-2.8 3-4.8 0-1.8-1.1-3.3-3-3.3z"/><circle cx="12" cy="11.4" r=".9" fill="#a5813a" stroke="none"/></svg></span><span><span class="rt">สแกนพระ</span><br/><span class="rd">ส่งรูปพระ ให้อาจารย์อ่านพลัง</span></span><span class="chev">›</span></button>
      <button class="row" data-say="ดูฮวงจุ้ยห้อง"><span class="med med2"><svg viewBox="0 0 24 24"><path d="M4 11l8-6 8 6"/><path d="M6 10.2V19h12v-8.8"/><path d="M12 12.3v4.4M9.9 14.5h4.2"/><path d="M12 12.3l1.5 2.2-1.5-.6-1.5.6z" fill="#a5813a" stroke="none"/></svg></span><span><span class="rt">ฮวงจุ้ยจากรูป</span><br/><span class="rd">ถ่ายรูปห้อง เช็คพลังงานบ้าน</span></span><span class="chev">›</span></button>
      <button class="row" data-say="ถามอาจารย์"><span class="med med3"><svg viewBox="0 0 24 24"><path d="M20 11.4c0 3.5-3.4 6.3-7.6 6.3-.9 0-1.8-.1-2.6-.4L5.2 18.8l1.2-3.4C5.2 14.3 4.4 13 4.4 11.4 4.4 7.9 7.8 5.1 12 5.1s8 2.8 8 6.3z"/><path d="M12 8.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="#a5813a" stroke="none"/></svg></span><span><span class="rt">ถามอาจารย์</span><br/><span class="rd">คุยเรื่องมู ถามได้ทุกเรื่อง</span></span><span class="chev">›</span></button>
    </div>
    <p class="note">กดบริการแล้วกลับไปคุยกับอาจารย์ในแชตได้เลย</p>
  </div>

</div>

<script>
(function(){
  var LIFF_ID = ${JSON.stringify(liffId)};
  var state = { userId:"", displayName:"", step:0, sex:"", interest:"", channel:"" };
  function $(id){ return document.getElementById(id); }
  function show(id){ ["v-load","v-ob","v-home"].forEach(function(v){ $(v).classList.add("hidden"); }); $(id).classList.remove("hidden"); }
  function showLoadMsg(t){ var lm=$("loadmsg"); if(lm){ lm.style.display="block"; lm.textContent=t; } }
  function pad2(x){ x=String(x); return x.length<2 ? "0"+x : x; }

  /* ---- Thai date/time picker (no native OS locale dependence) ---- */
  var TH_MONTHS=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  var TH_TIMES=["ไม่ทราบเวลา","เช้าตรู่","ตอนเช้า","ตอนสาย","เที่ยง","ตอนบ่าย","ตอนเย็น","ตอนค่ำ","กลางดึก"];
  function addOpt(sel,val,txt,placeholder){ var o=document.createElement("option"); o.value=val; o.textContent=txt;
    if(placeholder){ o.disabled=true; o.selected=true; } sel.appendChild(o); }
  function fillDates(){
    var d=$("f-day"), m=$("f-mon"), y=$("f-year"), t=$("f-bt");
    if(!d||d.options.length) return;
    addOpt(d,"","วัน",true); for(var i=1;i<=31;i++) addOpt(d,i,String(i));
    addOpt(m,"","เดือน",true); for(var j=0;j<12;j++) addOpt(m,j+1,TH_MONTHS[j]);
    addOpt(y,"","ปีเกิด",true);
    var nowBE=(new Date(Date.now()+7*3600*1000)).getUTCFullYear()+543;
    for(var b=nowBE;b>=nowBE-95;b--) addOpt(y,b,"พ.ศ. "+b);
    TH_TIMES.forEach(function(w,k){ addOpt(t, k===0?"":w, w, k===0); });
  }

  /* ---- pill groups ---- */
  function wireGroup(gid, key){
    var g = $(gid);
    g.addEventListener("click", function(e){
      var b = e.target.closest(".pill"); if(!b) return;
      Array.prototype.forEach.call(g.querySelectorAll(".pill"), function(p){ p.classList.remove("on"); });
      b.classList.add("on"); state[key] = b.getAttribute("data-v");
    });
  }
  wireGroup("g-sex","sex"); wireGroup("g-int","interest"); wireGroup("g-ch","channel");

  /* ---- onboarding stepper ---- */
  function renderStep(){
    for(var i=0;i<4;i++){ $("st"+i).classList.toggle("hidden", i!==state.step); $("d"+i).classList.toggle("on", i<=state.step); }
    $("ob-back").classList.toggle("hidden", state.step===0);
    $("ob-next").textContent = state.step===3 ? "เริ่มใช้งาน ✦" : "ต่อไป";
  }
  $("ob-back").addEventListener("click", function(){ if(state.step>0){ state.step--; renderStep(); } });
  $("ob-next").addEventListener("click", function(){
    if(state.step===0 && !$("f-nick").value.trim()){ $("f-nick").focus(); return; }
    if(state.step===1){
      if(!$("f-day").value){ $("f-day").focus(); return; }
      if(!$("f-mon").value){ $("f-mon").focus(); return; }
      if(!$("f-year").value){ $("f-year").focus(); return; }
    }
    if(state.step<3){ state.step++; renderStep(); return; }
    saveProfile();
  });

  function buildBirthdate(){
    var dd=$("f-day").value, mm=$("f-mon").value, yy=$("f-year").value;
    if(!(dd&&mm&&yy)) return "";
    return (parseInt(yy,10)-543) + "-" + pad2(mm) + "-" + pad2(dd); // BE -> CE, YYYY-MM-DD
  }

  function saveProfile(){
    var btn = $("ob-next"); btn.disabled = true; btn.textContent = "กำลังบันทึก...";
    fetch("/api/liff/profile", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        userId: state.userId, displayName: state.displayName,
        nickname: $("f-nick").value.trim(), birthdate: buildBirthdate(), birth_time: $("f-bt").value || "",
        gender: state.sex, interest: state.interest, channel: state.channel, phone: $("f-ph").value.trim()
      })
    }).then(function(r){ return r.json(); }).then(function(j){
      btn.disabled=false;
      if(j && j.ok){ enterHome($("f-nick").value.trim()); } else { btn.textContent="ลองอีกครั้ง"; }
    }).catch(function(){ btn.disabled=false; btn.textContent="ลองอีกครั้ง"; });
  }

  /* ---- home ---- */
  function greetWord(){
    var h = (new Date(Date.now() + 7*3600*1000)).getUTCHours();
    if(h<12) return "สวัสดีตอนเช้า"; if(h<17) return "สวัสดีตอนบ่าย"; return "สวัสดีตอนเย็น";
  }
  function thDate(){
    var d = new Date(Date.now() + 7*3600*1000);
    var m = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
    return d.getUTCDate() + " " + m[d.getUTCMonth()] + " " + (d.getUTCFullYear()+543);
  }
  function enterHome(nickname){
    $("h-when").textContent = greetWord();
    $("h-name").textContent = "คุณ" + (nickname || state.displayName || "");
    $("s-date").textContent = thDate();
    fetch("/api/liff/daily?userId=" + encodeURIComponent(state.userId))
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(!j || !j.ok) return;
        $("s-num").textContent = j.score; $("s-grade").textContent = j.grade;
        $("s-msg").textContent = j.message; $("s-lucky").textContent = j.luckyNum;
      }).catch(function(){});
    show("v-home");
  }
  $("btn-edit").addEventListener("click", function(){ state.step=0; renderStep(); show("v-ob"); });

  /* service rows → send message into the chat then close */
  Array.prototype.forEach.call(document.querySelectorAll(".row[data-say]"), function(btn){
    btn.addEventListener("click", function(){
      var say = btn.getAttribute("data-say");
      try{
        liff.sendMessages([{ type:"text", text: say }])
          .then(function(){ liff.closeWindow(); })
          .catch(function(){ alert("กลับไปที่แชต แล้วพิมพ์คำว่า " + say + " ได้เลยครับ"); liff.closeWindow(); });
      }catch(e){ alert("กลับไปที่แชต แล้วพิมพ์คำว่า " + say + " ได้เลยครับ"); }
    });
  });

  /* ---- boot ---- */
  function boot(){
    fillDates();
    if(!LIFF_ID){ showLoadMsg("หน้านี้พร้อมแล้ว (รอผูก LIFF ID)"); return; }
    liff.init({ liffId: LIFF_ID }).then(function(){
      if(!liff.isLoggedIn()){ liff.login(); return; }
      return liff.getProfile().then(function(p){
        state.userId = p.userId; state.displayName = p.displayName || "";
        return fetch("/api/liff/profile?userId=" + encodeURIComponent(p.userId)).then(function(r){ return r.json(); });
      }).then(function(j){
        if(j && j.found && j.profile && j.profile.nickname){ enterHome(j.profile.nickname); }
        else { renderStep(); show("v-ob"); }
      });
    }).catch(function(){ showLoadMsg("เชื่อมต่อไม่สำเร็จ ลองเปิดใหม่อีกครั้ง"); });
  }
  boot();
})();
</script>
</body>
</html>`;
}

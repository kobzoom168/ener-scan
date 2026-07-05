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
  html{-webkit-text-size-adjust:100%}
  /* elderly-friendly: large base type, big targets */
  body{margin:0;font-family:"IBM Plex Sans Thai","Noto Sans Thai","Sukhumvit Set",-apple-system,system-ui,sans-serif;
    background:var(--bg);color:var(--ink);font-size:17.5px;line-height:1.6;min-height:100dvh}
  .serif{font-family:"Didot","Bodoni 72","Playfair Display","Iowan Old Style",Palatino,Georgia,serif}
  .app{max-width:520px;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column;padding:18px 18px 26px;gap:15px}
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
  .row .ph{width:64px;height:56px;border-radius:14px;flex:0 0 auto;display:grid;place-items:center;font-size:27px}
  .p1{background:linear-gradient(150deg,#f6e3cf,#e8c9a8)} .p2{background:linear-gradient(150deg,#f9ecd2,#ddb96f)}
  .p3{background:linear-gradient(150deg,#e9e4f6,#c4b7e2)} .p4{background:linear-gradient(150deg,#e2f2ea,#a9d8c3)}
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

  .center{display:grid;place-items:center;min-height:70dvh;text-align:center}
  .orb{width:84px;height:84px;border-radius:26px;background:linear-gradient(150deg,#f2e2bd,#c9a35c);display:grid;place-items:center;
    font-size:40px;box-shadow:var(--shadow);margin:0 auto 16px}
  .ld{color:var(--sub);font-size:1.05rem}
  @media (prefers-reduced-motion:no-preference){
    .pulse{animation:pu 1.6s ease-in-out infinite}
    @keyframes pu{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
  }
</style>
</head>
<body>
<div class="app">

  <!-- loading -->
  <div id="v-load" class="center">
    <div>
      <div class="orb pulse">🔮</div>
      <div class="lg serif" style="font-size:2.2rem">Ener</div>
      <p class="ld" id="loadmsg">กำลังเชื่อมต่อ...</p>
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
      <div class="why">ใช้ผูกดวงของคุณ — ข้อมูลเก็บเป็นความลับ</div>
      <div class="bigfield"><label>วันเกิด</label><input class="bigin" id="f-bd" type="date"/></div>
      <div class="bigfield"><label>เวลาเกิด (ถ้าทราบ ไม่บังคับ)</label><input class="bigin" id="f-bt" type="time"/></div>
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
      <div class="bigfield"><label>เบอร์โทร (ไม่บังคับ)</label><input class="bigin" id="f-ph" type="tel" placeholder="08x-xxx-xxxx" maxlength="20"/></div>
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
      <button class="row" data-say="สแกนพระ"><span class="ph p1">🪬</span><span><span class="rt">สแกนพระ</span><br/><span class="rd">ส่งรูปพระ ให้อาจารย์อ่านพลัง</span></span><span class="chev">›</span></button>
      <button class="row" data-say="ดูฮวงจุ้ยห้อง"><span class="ph p2">🏠</span><span><span class="rt">ฮวงจุ้ยจากรูป</span><br/><span class="rd">ถ่ายรูปห้อง เช็คพลังงานบ้าน</span></span><span class="chev">›</span></button>
      <button class="row" data-say="ถามอาจารย์"><span class="ph p3">🧙‍♂️</span><span><span class="rt">ถามอาจารย์</span><br/><span class="rd">คุยเรื่องมู ถามได้ทุกเรื่อง</span></span><span class="chev">›</span></button>
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
    if(state.step<3){ state.step++; renderStep(); return; }
    saveProfile();
  });

  function saveProfile(){
    var btn = $("ob-next"); btn.disabled = true; btn.textContent = "กำลังบันทึก...";
    fetch("/api/liff/profile", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        userId: state.userId, displayName: state.displayName,
        nickname: $("f-nick").value.trim(), birthdate: $("f-bd").value || "", birth_time: $("f-bt").value || "",
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
          .catch(function(){ alert("กลับไปที่แชต แล้วพิมพ์ \\"" + say + "\\" ได้เลยครับ"); liff.closeWindow(); });
      }catch(e){ alert("กลับไปที่แชต แล้วพิมพ์ \\"" + say + "\\" ได้เลยครับ"); }
    });
  });

  /* ---- boot ---- */
  function boot(){
    if(!LIFF_ID){ $("loadmsg").textContent = "หน้านี้พร้อมแล้ว (รอผูก LIFF ID)"; return; }
    liff.init({ liffId: LIFF_ID }).then(function(){
      if(!liff.isLoggedIn()){ liff.login(); return; }
      return liff.getProfile().then(function(p){
        state.userId = p.userId; state.displayName = p.displayName || "";
        return fetch("/api/liff/profile?userId=" + encodeURIComponent(p.userId)).then(function(r){ return r.json(); });
      }).then(function(j){
        if(j && j.found && j.profile && j.profile.nickname){ enterHome(j.profile.nickname); }
        else { renderStep(); show("v-ob"); }
      });
    }).catch(function(e){ $("loadmsg").textContent = "เชื่อมต่อไม่สำเร็จ: " + (e && e.message ? e.message : e); });
  }
  boot();
})();
</script>
</body>
</html>`;
}

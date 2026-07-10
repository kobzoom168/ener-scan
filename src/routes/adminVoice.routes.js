/**
 * /admin/voice — ตั้งค่าเสียงอาจารย์ท้าย report: เลือกเสียงจากบัญชี ElevenLabs,
 * ความเร็วพูด, เปิด/ปิด, กลุ่มผู้ได้ยิน + ปุ่มพรีวิวฟังสคริปต์จริงก่อนบันทึก.
 * ค่าเก็บใน app_settings (sql/041) มีผลสดไม่ต้อง restart.
 */
import express from "express";
import { requireAdminSession } from "../middleware/requireAdmin.js";
import { env } from "../config/env.js";
import { getAppSetting, setAppSetting } from "../stores/appSettings.db.js";
import {
  buildVoiceScript,
  synthesizeMp3,
  getVoiceNoteConfig,
} from "../services/voiceNote/scanVoiceNote.service.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ตัวอย่างสคริปต์เดียวกับที่ลูกค้าได้ยินจริงหลังสแกน */
function sampleScript() {
  return buildVoiceScript({
    score: 8.2,
    mainEnergy: "เมตตา",
    compatibility: 86,
    lane: "sacred_amulet",
    seed: "preview",
  });
}

async function listElevenLabsVoices() {
  const apiKey = String(env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) return [];
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`elevenlabs_voices_${res.status}`);
  const j = await res.json();
  const voices = Array.isArray(j?.voices) ? j.voices : [];
  return voices.map((v) => ({
    id: String(v?.voice_id || ""),
    name: String(v?.name || "(ไม่มีชื่อ)"),
    category: String(v?.category || ""),
    previewUrl: String(v?.preview_url || ""),
  }));
}

function pageHtml({ cfg, voices, voicesError, savedMsg }) {
  const clonedFirst = [...voices].sort((a, b) => {
    const ac = a.category === "premade" ? 1 : 0;
    const bc = b.category === "premade" ? 1 : 0;
    return ac - bc;
  });
  const voiceRows = clonedFirst
    .map((v) => {
      const on = v.id === cfg.voiceId;
      return `
      <label class="vrow${on ? " on" : ""}">
        <input type="radio" name="voiceId" value="${esc(v.id)}"${on ? " checked" : ""} />
        <span class="vname"><b>${esc(v.name)}</b><small>${esc(v.category)} · ${esc(v.id)}</small></span>
        ${v.previewUrl ? `<button type="button" class="btn mini js-sample" data-url="${esc(v.previewUrl)}">🔊 ตัวอย่างต้นเสียง</button>` : ""}
      </label>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Ener Scan — เสียงอาจารย์</title>
<style>
  :root{--bg:#14120d;--card:#1e1b14;--line:#3a3426;--ink:#efe8d8;--muted:#9c937d;--accent:#e6c34a;--ok:#69b47c}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:780px;margin:0 auto;padding:18px 14px 60px}
  .topbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px}
  h1{font-size:1.25rem;margin:0}
  a.btn,button.btn{background:#2a2618;border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:8px 14px;
    font-size:.9rem;font-weight:700;text-decoration:none;cursor:pointer}
  button.save{background:var(--accent);color:#1c1808;border:none}
  .btn.mini{padding:5px 10px;font-size:.78rem}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:14px}
  .card h2{font-size:.95rem;margin:0 0 10px;color:var(--accent)}
  .vrow{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer}
  .vrow.on{border-color:var(--accent);background:#26210f}
  .vname{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
  .vname small{color:var(--muted);font-size:.72rem;word-break:break-all}
  .row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
  .row label{font-size:.9rem;font-weight:700}
  input[type=range]{flex:1;min-width:180px;accent-color:var(--accent)}
  select{background:#2a2618;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:.9rem}
  .speedval{font-weight:800;color:var(--accent);min-width:44px;text-align:center}
  .hint{color:var(--muted);font-size:.8rem;line-height:1.6;margin:6px 0 0}
  .script{background:#26220f;border:1px dashed var(--line);border-radius:10px;padding:10px 12px;font-size:.86rem;line-height:1.7}
  .toast{position:fixed;top:14px;left:50%;transform:translateX(-50%);background:var(--ok);color:#0d1a10;font-weight:800;
    padding:10px 18px;border-radius:10px;display:none;z-index:9}
  .toast.show{display:block}
  .switch{display:inline-flex;align-items:center;gap:8px;font-weight:700}
</style></head>
<body>
<div class="toast" id="toast">บันทึกแล้ว ✓</div>
<div class="wrap">
  <div class="topbar">
    <h1>🎙️ เสียงอาจารย์ (ท้าย report)</h1>
    <span style="display:flex;gap:8px">
      <a class="btn" href="/admin/users">👥 จัดการ User</a>
      <a class="btn" href="/admin/payments">💳 Payments</a>
    </span>
  </div>
  ${savedMsg ? `<div class="card" style="border-color:var(--ok)">${esc(savedMsg)}</div>` : ""}
  <form method="post" action="/admin/voice/save" id="f">
    <div class="card">
      <h2>สถานะ</h2>
      <div class="row">
        <label class="switch"><input type="checkbox" name="enabled" value="1"${cfg.enabled ? " checked" : ""}/> เปิดใช้เสียง</label>
        <select name="audience">
          <option value="paid_and_first_free"${cfg.audience !== "all" ? " selected" : ""}>จ่ายเงิน=ทุกสแกน · ฟรี=ครั้งแรกครั้งเดียว (คุมต้นทุน)</option>
          <option value="all"${cfg.audience === "all" ? " selected" : ""}>ทุกคนทุกสแกน (โหมดเทส — เปลืองเครดิต)</option>
        </select>
      </div>
    </div>
    <div class="card">
      <h2>เลือกเสียง (จากบัญชี ElevenLabs)</h2>
      ${voicesError ? `<p class="hint">โหลดรายชื่อเสียงไม่สำเร็จ: ${esc(voicesError)}</p>` : voiceRows || '<p class="hint">ไม่พบเสียงในบัญชี</p>'}
      <p class="hint">🔊 ตัวอย่างต้นเสียง = คลิปที่ ElevenLabs ทำไว้ · ปุ่มพรีวิวด้านล่าง = พูดสคริปต์จริงของเราด้วยความเร็วที่ตั้ง</p>
    </div>
    <div class="card">
      <h2>ความเร็วพูด</h2>
      <div class="row">
        <input type="range" name="speed" id="speed" min="0.7" max="1.2" step="0.05" value="${esc(cfg.speed)}"/>
        <span class="speedval" id="speedval">${esc(cfg.speed)}</span>
      </div>
      <p class="hint">1.0 = ปกติ · ต่ำกว่า = ช้าลง (ต่ำสุด 0.7)</p>
    </div>
    <div class="card">
      <h2>สคริปต์ที่ลูกค้าจะได้ยิน (ตัวอย่างคะแนน 8.2 เมตตา 86%)</h2>
      <div class="script">${esc(sampleScript())}</div>
      <div class="row" style="margin-top:12px">
        <button type="button" class="btn" id="preview">▶️ พรีวิวเสียง+ความเร็วนี้</button>
        <button type="submit" class="btn save">💾 บันทึก (มีผลทันที)</button>
      </div>
      <p class="hint" id="pvstate"></p>
    </div>
  </form>
</div>
<script>
  var speed = document.getElementById("speed"), sv = document.getElementById("speedval");
  speed.addEventListener("input", function(){ sv.textContent = Number(speed.value).toFixed(2).replace(/0$/,""); });
  var player = new Audio();
  document.body.addEventListener("click", function(e){
    var b = e.target.closest(".js-sample");
    if(b){ e.preventDefault(); player.src = b.dataset.url; player.play(); }
  });
  document.getElementById("preview").addEventListener("click", function(){
    var picked = document.querySelector('input[name=voiceId]:checked');
    if(!picked){ alert("เลือกเสียงก่อนครับ"); return; }
    var st = document.getElementById("pvstate");
    st.textContent = "กำลังสร้างเสียงพรีวิว... (ใช้เครดิตนิดหน่อย รอ 3-8 วิ)";
    fetch("/admin/voice/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ voiceId: picked.value, speed: Number(speed.value) })
    }).then(function(r){
      if(!r.ok) throw new Error("preview_" + r.status);
      return r.blob();
    }).then(function(blob){
      st.textContent = "";
      player.src = URL.createObjectURL(blob);
      player.play();
    }).catch(function(err){ st.textContent = "พรีวิวไม่สำเร็จ: " + err.message; });
  });
</script>
</body></html>`;
}

export default function createAdminVoiceRouter() {
  const router = express.Router();

  router.get("/admin/voice", requireAdminSession, async (req, res) => {
    try {
      const cfg = await getVoiceNoteConfig();
      let voices = [];
      let voicesError = "";
      try {
        voices = await listElevenLabsVoices();
      } catch (e) {
        voicesError = String(e?.message || e).slice(0, 120);
      }
      const savedMsg = req.query?.saved ? "บันทึกการตั้งค่าเสียงแล้ว — มีผลกับสแกนถัดไปทันที ✓" : "";
      res.status(200).type("html").send(pageHtml({ cfg, voices, voicesError, savedMsg }));
    } catch (e) {
      console.error(JSON.stringify({ event: "ADMIN_VOICE_PAGE_ERROR", message: String(e?.message || e).slice(0, 200) }));
      res.status(500).type("text").send("admin voice page error");
    }
  });

  router.post(
    "/admin/voice/save",
    requireAdminSession,
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const b = req.body || {};
        const speedN = Number(b.speed);
        await setAppSetting("voice_note", {
          enabled: b.enabled === "1",
          audience: b.audience === "all" ? "all" : "paid_and_first_free",
          voiceId: String(b.voiceId || env.ELEVENLABS_VOICE_ID).trim().slice(0, 64),
          speed: Number.isFinite(speedN) ? Math.min(1.2, Math.max(0.7, speedN)) : env.ELEVENLABS_SPEED,
        });
        res.redirect(302, "/admin/voice?saved=1");
      } catch (e) {
        console.error(JSON.stringify({ event: "ADMIN_VOICE_SAVE_ERROR", message: String(e?.message || e).slice(0, 200) }));
        res.status(500).type("text").send("save error");
      }
    },
  );

  router.post(
    "/admin/voice/preview",
    requireAdminSession,
    express.json(),
    async (req, res) => {
      try {
        const voiceId = String(req.body?.voiceId || "").trim().slice(0, 64);
        const speedN = Number(req.body?.speed);
        const mp3 = await synthesizeMp3(sampleScript(), {
          voiceId: voiceId || undefined,
          speed: Number.isFinite(speedN) ? speedN : undefined,
        });
        res.status(200).type("audio/mpeg").send(mp3);
      } catch (e) {
        console.error(JSON.stringify({ event: "ADMIN_VOICE_PREVIEW_ERROR", message: String(e?.message || e).slice(0, 200) }));
        res.status(500).json({ ok: false, error: String(e?.message || e).slice(0, 120) });
      }
    },
  );

  return router;
}

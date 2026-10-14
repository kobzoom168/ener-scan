/**
 * หน้า Admin: สิทธิ์ฟรี 3 โหมด + ตั้งเวลา (sql/067 · Codex/กบ 14 ต.ค. 2026)
 *  - session login **เท่านั้น** (requireAdminSessionOnly) + CSRF ใน session (timing-safe)
 *  - เลือกโหมด: ฟรีรายวัน / ลูกค้าใหม่ 2 ครั้ง / ปิดฟรี → "เปลี่ยนทันที" หรือ "ตั้งเวลา"
 *  - กติกาทั้งหมด (โหมดเดียว · 72 ชม.จากเวลาประกาศเมื่อถอนฟรีรายวัน · cutoff = เวลามีผล · กำหนดการเดียว) บังคับใน DB
 *    หน้านี้แค่ส่งค่าและแสดงรหัส error เป็นไทย — ไม่มีทางลัด
 *  - เวลาที่กรอกตีความเป็นเวลาไทย (Asia/Bangkok, UTC+7)
 *  - เปิดหน้า = reconcile กำหนดการที่ถึงเวลาแล้ว (ถ้า key พร้อม) เพื่อให้สถานะที่เห็นตรงกับที่มีผล
 *  - ไม่ broadcast · ไม่แตะสิทธิ์รายบัญชี · ไม่แก้ cutoff เดิม
 */
import express from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { requireAdminSessionOnly } from "../middleware/requireAdmin.js";
import { loadActiveScanOffer } from "../services/scanOffer.loader.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const thai = (iso) => (iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }) + " น." : "-");
/** "2026-10-20T09:00" (datetime-local, เวลาไทย) → ISO UTC · ค่าว่าง → null · รูปแบบผิด → error */
export function bangkokLocalToIso(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) { const e = new Error("invalid_datetime"); e.code = "invalid_datetime"; throw e; }
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || "00"}+07:00`);
  if (!Number.isFinite(d.getTime())) { const e = new Error("invalid_datetime"); e.code = "invalid_datetime"; throw e; }
  return d.toISOString();
}

export default function createAdminFreePolicyRouter({
  authorize = requireAdminSessionOnly,
  store = null,          // ฉีดได้เพื่อทดสอบ (freePolicy.store)
  offer = loadActiveScanOffer,
  envSrc = process.env,
  now = () => new Date(),
} = {}) {
  const router = express.Router();
  const loadStore = async () => store ?? (await import("../services/freePolicy.store.js"));
  const envLabel = () => String(envSrc.APP_ENV || envSrc.NODE_ENV || "unknown");

  async function readState() {
    const st = await loadStore();
    const readiness = st.freePolicyStoreReadiness(envSrc);
    let reconcile = null;
    if (readiness.ready) {
      try { reconcile = await st.applyDueFreePolicySchedule({ env: envSrc }); } catch (e) { reconcile = { error: e.code || "rpc_failed" }; }
    }
    let status = null, statusError = null, audit = [], auditError = null;
    try { status = await st.getFreePolicyStatus({ env: envSrc }); } catch (e) { statusError = e.code || "rpc_failed"; }
    if (readiness.ready) {
      try { audit = await st.listFreePolicyAudit(20, { env: envSrc }); } catch (e) { auditError = e.code || "rpc_failed"; }
    }
    return { st, readiness, status, statusError, audit, auditError, reconcile };
  }

  function render(req, state, { saved = null, error = null } = {}) {
    const { st, readiness, status, statusError, audit, auditError } = state;
    const L = st.MODE_LABEL_TH;
    const canWrite = readiness.ready && !statusError;
    const mode = status?.mode || null;
    const stored = status?.stored_mode || null;
    const sched = status?.schedule || null;
    const last = status?.last_applied || null;
    const daily = Number(offer()?.freeQuotaPerDay) || 1;
    const nowIso = now().toISOString();
    const schedDue = Boolean(sched && Date.parse(String(sched.effective_at || "")) <= now().getTime()); // (c) ถึงเวลาแล้ว = ยกเลิกไม่ได้
    const modeColor = { daily: "#2e7d32", new_customer: "#1565c0", none: "#8a6d3b" }[mode] || "#a94442";
    const radio = (m, help) => `<label class="opt"><input type="radio" name="mode" value="${m}" ${mode === m ? "checked" : ""} ${canWrite ? "" : "disabled"} required> <strong>${esc(L[m])}</strong><span class="muted">${esc(help)}</span></label>`;
    return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ตั้งค่าสิทธิ์ฟรี — Ener Scan</title>
<style>body{font-family:system-ui,sans-serif;max-width:780px;margin:24px auto;padding:0 16px;color:#222;font-size:16px}
.card{border:1px solid #ddd;border-radius:10px;padding:16px;margin:12px 0}.status{padding:12px 14px;border-radius:8px;background:#f6f6f6;border-left:6px solid ${modeColor}}
.opt{display:block;padding:10px 12px;border:1px solid #ddd;border-radius:8px;margin:8px 0;cursor:pointer}.opt span{display:block;font-weight:400;margin-top:2px}
label{font-weight:600}.muted{color:#666;font-size:13px}.btn{padding:10px 16px;border-radius:8px;border:0;background:#1976d2;color:#fff;font-size:15px;cursor:pointer}
.btn.warn{background:#8a6d3b}.btn[disabled]{background:#bbb}.ok{background:#e8f5e9;border:1px solid #a5d6a7;padding:10px;border-radius:8px}.err{background:#fdecea;border:1px solid #f5c6cb;padding:10px;border-radius:8px}
.note{background:#fff8e1;border:1px solid #ffe08a;padding:10px;border-radius:8px}input[type=datetime-local]{padding:8px;border:1px solid #bbb;border-radius:6px;font-size:15px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #eee;padding:6px 4px;text-align:left;vertical-align:top}</style></head>
<body>
<a href="/admin/promo">← โปรโมชันและแพ็ก</a>
<h1>ตั้งค่าสิทธิ์ฟรี</h1>
<p class="muted">Environment: <strong>${esc(envLabel())}</strong> · host ${esc(req.hostname || "")} · หน้านี้ตั้งค่า <strong>ระบบนี้เท่านั้น</strong> · เวลาทั้งหมดเป็นเวลาไทย</p>
<div class="status">
<div><strong>โหมดที่มีผลตอนนี้:</strong> ${mode ? esc(L[mode]) : `<span style="color:#a94442">อ่านไม่ได้ (${esc(statusError || "")})</span>`}${mode === "daily" ? ` <span class="muted">(${esc(daily)} ครั้ง/วัน/คน ตามหน้าโปรโมชัน)</span>` : ""}</div>
${mode && stored && stored !== mode ? `<div class="note" style="margin-top:8px">กำหนดการถึงเวลาแล้วและ<strong>มีผลกับลูกค้าแล้ว</strong> (ค่าที่บันทึกเดิม: ${esc(L[stored])}) — ระบบจะบันทึกให้ตรงกันอัตโนมัติภายใน 1 นาที</div>` : ""}
<div class="muted" style="margin-top:6px">Cutoff ลูกค้าใหม่ (eligible_since): ${status?.eligible_since ? `${esc(thai(status.eligible_since))} · <code>${esc(status.eligible_since)}</code>` : "ยังไม่ตั้ง — จะบันทึกถาวรเมื่อโหมดลูกค้าใหม่มีผลครั้งแรก (ตั้งเวลา = เวลาที่มีผล ไม่ใช่เวลาที่ระบบบันทึก)"}</div>
${last ? `<div class="muted">เปลี่ยนตามกำหนดการล่าสุด: → ${esc(L[last.target_mode] || last.target_mode)} มีผล ${esc(thai(last.effective_at))} (บันทึก ${esc(thai(last.applied_at))})</div>` : ""}
</div>
${sched ? `<div class="card" style="border-color:#ffe08a;background:#fffdf5"><strong>${schedDue ? "กำหนดการถึงเวลาแล้ว (มีผลกับลูกค้าแล้ว รอระบบบันทึก):" : "กำหนดการที่รออยู่:"}</strong> เปลี่ยนเป็น <strong>${esc(L[sched.target_mode] || sched.target_mode)}</strong> มีผล <strong>${esc(thai(sched.effective_at))}</strong>
<div class="muted">ตั้งโดย ${esc(sched.created_by || "-")} เมื่อ ${esc(thai(sched.created_at))}${sched.announced_at ? ` · ประกาศลูกค้าแล้ว ${esc(thai(sched.announced_at))}` : ""} · เมื่อถึงเวลา ระบบใช้โหมดใหม่ทันทีกับทุกด่าน แม้ตัวบันทึกจะมาช้า</div>
${schedDue ? `<p class="note" style="margin:8px 0 0">ถึงเวลาแล้ว — ยกเลิกย้อนหลังไม่ได้ ถ้าต้องการโหมดอื่นให้เปลี่ยนนโยบายใหม่ด้านล่าง (กติกา ${st.NOTICE_HOURS} ชม. ตามปกติ)</p>` : `<form method="post" action="/admin/free-policy" style="margin-top:8px"><input type="hidden" name="csrf" value="${esc(req.session?.freePolicyCsrf || "")}"><input type="hidden" name="action" value="cancel"><input type="hidden" name="schedule_id" value="${esc(sched.id)}">
<button class="btn warn" type="submit" ${canWrite ? "" : "disabled"}>ยกเลิกกำหนดการนี้</button> <span class="muted">ยกเลิก = คงโหมดปัจจุบันไว้ ไม่เปลี่ยนอะไร</span></form>`}</div>` : ""}
${saved ? `<p class="ok">${esc(saved)}</p>` : ""}
${error ? `<p class="err">${esc(error)}</p>` : ""}
${!readiness.ready ? `<p class="note">${esc(st.RPC_ERROR_TH.db_key_missing)} (ขาด: ${esc(readiness.missing.join(", "))}) — ดูสถานะได้อย่างเดียว</p>` : ""}
<form method="post" action="/admin/free-policy" class="card" autocomplete="off">
<input type="hidden" name="csrf" value="${esc(req.session?.freePolicyCsrf || "")}">
<h2 style="font-size:18px;margin:0 0 8px">1) เลือกโหมดสิทธิ์ฟรี</h2>
${radio("daily", `ทุกบัญชีได้ฟรี ${daily} ครั้ง/วัน (จำนวนตั้งที่หน้าโปรโมชัน) · เปิดได้ทันที ไม่ต้องประกาศล่วงหน้า`)}
${radio("new_customer", "บัญชีที่สมัครตั้งแต่ cutoff ได้ทดลองฟรีรวม 2 ครั้งต่อบัญชี ไม่เติมใหม่รายวัน · บัญชีเก่าไม่ได้ฟรี · cutoff ตั้งครั้งเดียวไม่รีเซ็ต")}
${radio("none", "ไม่มีสิทธิ์ฟรีทุกบัญชี · แพ็กที่ซื้อและโบนัสที่มีอยู่ยังใช้ได้ตามเดิม · ไม่แตะยอดใคร")}
<h2 style="font-size:18px;margin:16px 0 8px">2) จะเปลี่ยนเมื่อไร</h2>
<label class="opt"><input type="radio" name="when" value="now" checked ${canWrite ? "" : "disabled"}> <strong>เปลี่ยนทันที</strong><span class="muted">มีผลกับทุกด่าน (LINE / LIFF / การสร้างงาน) ทันทีที่บันทึก</span></label>
<label class="opt"><input type="radio" name="when" value="schedule" ${canWrite ? "" : "disabled"}> <strong>ตั้งเวลา</strong><span class="muted">มีผลตรงเวลาที่ตั้งแม้ระบบบันทึกจะมาช้า · มีได้ครั้งละ 1 กำหนดการ (ตั้งใหม่ = แทนที่ของเดิม)</span>
<span style="margin-top:6px">เวลามีผล (เวลาไทย): <input type="datetime-local" name="effective_at" ${canWrite ? "" : "disabled"}></span></label>
<h2 style="font-size:18px;margin:16px 0 8px">3) เวลาที่ประกาศลูกค้า <span class="muted">(จำเป็นเมื่อ "ถอน" ฟรีรายวัน → ลูกค้าใหม่/ปิดฟรี)</span></h2>
<p class="muted">กติกา: ถอนฟรีรายวันต้องประกาศลูกค้าก่อนอย่างน้อย <strong>${st.NOTICE_HOURS} ชั่วโมง</strong> (นับจากเวลาที่ประกาศจริงถึงเวลามีผล) ระบบตรวจใน DB ไม่มีทางลัด · ส่งประกาศเอง หน้านี้ไม่ broadcast</p>
<label>ประกาศลูกค้าแล้วเมื่อ (เวลาไทย): <input type="datetime-local" name="announced_at" ${canWrite ? "" : "disabled"}></label>
${sched && !schedDue ? `<p><label style="font-weight:400"><input type="checkbox" name="cancel_pending" value="1" ${canWrite ? "" : "disabled"}> ยกเลิกกำหนดการที่รออยู่ด้วย (จำเป็นเมื่อ "เปลี่ยนทันที" ขณะมีกำหนดการ) — ไม่ได้ข้ามกติกา ${st.NOTICE_HOURS} ชม.</label></p>` : ""}
<p><label style="font-weight:400"><input type="checkbox" name="confirmed" value="1" required ${canWrite ? "" : "disabled"}> ยืนยัน: เข้าใจว่าการเปลี่ยนมีผลกับลูกค้าจริงของระบบนี้ และไม่กระทบแพ็ก/โบนัส/คลังเดิม</label></p>
<p><button class="btn" type="submit" name="action" value="save" ${canWrite ? "" : "disabled"}>บันทึก</button> <span class="muted">บันทึกแล้วหน้าจะแสดงโหมดที่มีผลจริง</span></p>
</form>
<div class="card"><strong>ประวัติการเปลี่ยน (ล่าสุด 20)</strong>
${auditError ? `<p class="muted">อ่านประวัติไม่ได้ (${esc(auditError)})</p>` : ""}
${audit.length ? `<table><tr><th>เวลา</th><th>การกระทำ</th><th>จาก → เป็น</th><th>ผู้ทำ</th><th>ประกาศเมื่อ</th><th>มีผล</th></tr>${audit.map((a) => `<tr><td>${esc(thai(a.at))}</td><td>${esc(a.action)}</td><td>${esc(a.from_mode ? L[a.from_mode] || a.from_mode : "-")} → ${esc(a.to_mode ? L[a.to_mode] || a.to_mode : "-")}</td><td>${esc(a.actor || "-")}</td><td>${esc(a.announced_at ? thai(a.announced_at) : "-")}</td><td>${esc(a.detail?.effective_at ? thai(a.detail.effective_at) : a.action === "mode_set" ? "ทันที" : "-")}</td></tr>`).join("")}</table>` : (!auditError ? `<p class="muted">ยังไม่มีประวัติ</p>` : "")}
<p class="muted">ตอนนี้ ${esc(thai(nowIso))}</p></div>
</body></html>`;
  }

  router.get("/admin/free-policy", authorize, async (req, res) => {
    if (!req.session) return res.status(503).send("admin_session_unavailable");
    req.session.freePolicyCsrf ||= randomBytes(24).toString("hex");
    const state = await readState();
    const saved = req.query?.saved === "1" ? "บันทึกแล้ว — ด้านบนคือโหมดที่มีผลจริงตอนนี้" : req.query?.saved === "scheduled" ? "ตั้งเวลาแล้ว — ระบบจะใช้โหมดใหม่ตรงเวลาที่ตั้ง (ยังไม่เปลี่ยนอะไรตอนนี้)" : req.query?.saved === "cancelled" ? "ยกเลิกกำหนดการแล้ว — โหมดปัจจุบันคงเดิม" : null;
    res.set("Cache-Control", "no-store").type("html").send(render(req, state, { saved }));
  });

  router.post("/admin/free-policy", authorize, express.urlencoded({ extended: false, limit: "4kb" }), async (req, res) => {
    if (!req.session) return res.status(503).send("admin_session_unavailable");
    const expected = Buffer.from(req.session.freePolicyCsrf || "");
    const received = Buffer.from(String(req.body?.csrf || ""));
    if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) return res.status(403).send("invalid_csrf");
    const state = await readState();
    const fail = (code, http = 400) => {
      const msg = state.st.RPC_ERROR_TH[code] || (code === "invalid_datetime" ? "รูปแบบเวลาไม่ถูกต้อง" : `บันทึกไม่สำเร็จ (${code}) ยังไม่เปลี่ยนค่า`);
      console.log(JSON.stringify({ event: "ADMIN_FREE_POLICY_REJECTED", code: String(code).slice(0, 60) }));
      return res.status(http).type("html").send(render(req, state, { error: msg }));
    };
    if (!state.readiness.ready) return fail("db_key_missing", 503);
    if (state.statusError) return fail(state.statusError, 503);
    const b = req.body || {};
    const actor = String(req.session?.adminUser || req.session?.adminName || "admin").slice(0, 80);
    const action = String(b.action || "save");
    try {
      if (action === "cancel") {
        const r = await state.st.cancelFreePolicySchedule({ id: b.schedule_id, actor }, { env: envSrc });
        console.log(JSON.stringify({ event: "ADMIN_FREE_POLICY_SCHEDULE_CANCELLED", actor, scheduleId: r?.id ?? null }));
        return res.redirect(303, "/admin/free-policy?saved=cancelled");
      }
      if (b.confirmed !== "1") return fail("confirmation_required");
      const mode = String(b.mode || "");
      if (!state.st.FREE_POLICY_MODES.includes(mode)) return fail("invalid_mode");
      const announcedAt = bangkokLocalToIso(b.announced_at);
      if (String(b.when || "now") === "schedule") {
        const effectiveAt = bangkokLocalToIso(b.effective_at);
        if (!effectiveAt) return fail("effective_at_must_be_future");
        const r = await state.st.scheduleFreePolicy({ mode, effectiveAt, announcedAt, actor }, { env: envSrc });
        console.log(JSON.stringify({ event: "ADMIN_FREE_POLICY_SCHEDULED", actor, mode, effectiveAt, announced: Boolean(announcedAt), scheduleId: r?.id ?? null }));
        return res.redirect(303, "/admin/free-policy?saved=scheduled");
      }
      const r = await state.st.setFreePolicyMode({ mode, actor, announcedAt, cancelPending: b.cancel_pending === "1" }, { env: envSrc });
      console.log(JSON.stringify({ event: "ADMIN_FREE_POLICY_SAVED", actor, mode, effectiveMode: r?.mode ?? null, announced: Boolean(announcedAt) }));
      return res.redirect(303, "/admin/free-policy?saved=1");
    } catch (e) {
      const code = e?.code || "rpc_failed";
      const http = ["permission_denied", "db_key_missing", "trial_policy_unavailable"].includes(code) ? 503 : /^[a-z_0-9]+$/.test(code) && code !== "rpc_failed" ? 400 : 500;
      return fail(code, http);
    }
  });
  return router;
}

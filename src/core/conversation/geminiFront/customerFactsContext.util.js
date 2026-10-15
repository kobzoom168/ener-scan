/**
 * "Data agent" for the front AI: checks the customer's REAL records before the
 * model answers — stored birthdate, free/paid scan quota (with the actual reset
 * rule), and scan count — so อาจารย์ never asks for what the system already
 * knows and never guesses service facts. Cheap parallel DB reads (~50ms), no
 * extra model call.
 */
import { supabase } from "../../../config/supabase.js";
import { getSavedBirthdate } from "../../../stores/userProfile.db.js";
import {
  countScanResultsTodayForAppUser,
  getLocalDateKey,
} from "../../../stores/paymentAccess.db.js";
import { computePaidActive } from "../../../services/scanOfferAccess.resolver.js";
import { loadActiveScanOffer } from "../../../services/scanOffer.loader.js";
import { getNewCustomerTrialStatus, freePolicyModeOf } from "../../../services/newCustomerTrial.service.js";

// ป้ายโหมดสิทธิ์ฟรี (sql/067) สำหรับบอกอาจารย์ — ห้ามเดา ให้ยึดโหมดที่มีผลจริง + กำหนดการที่ประกาศแล้ว
const FREE_MODE_LABEL = {
  daily: "ฟรีรายวัน",
  new_customer: "เฉพาะบัญชีใหม่ทดลองฟรีรวม 2 ครั้ง (ไม่มีฟรีรายวัน)",
  none: "ปิดสิทธิ์ฟรีทุกบัญชี (แพ็ก/โบนัสที่มีใช้ได้)",
};
function thaiDateTime(iso) {
  const ms = Date.parse(String(iso || ""));
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const date = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date} ${time} น.`;
}
/**
 * สถานะนโยบายฟรี snapshot เดียว (free_policy_status(uid) — sql/067): โหมดที่มีผล + สิทธิ์คนนี้ + schedule + last_applied
 * สอดคล้องกันในคำสั่งเดียว · DB ก่อน 067 (ไม่มี RPC) → fallback new_customer_trial_status ไม่มีกำหนดการ
 * แยก (Codex 15 ต.ค.): กำหนดการ "อนาคต" (effective_at > now) vs "มีผลแล้วแต่แถวยัง pending" (worker ยังไม่บันทึก) —
 * อย่างหลังถือว่าเปลี่ยนแล้ว (mode ที่มีผลสะท้อนอยู่แล้ว) ห้ามพูดว่า "จะเปลี่ยน"
 */
async function readFreePolicySnapshot(db, uid, now, pinnedNow = false) {
  let data = null;
  try {
    const r = await db.rpc("free_policy_status", { p_line_user_id: uid });
    if (!r.error && r.data && typeof r.data.enabled === "boolean") data = r.data;
  } catch { data = null; }
  if (!data) {
    const t = await getNewCustomerTrialStatus(uid);
    return { trial: t, mode: freePolicyModeOf(t), upcoming: null, changedAt: null, changedTo: null, changedFrom: null };
  }
  const trial = { ...data, mode: freePolicyModeOf(data) };
  const mode = trial.mode;
  const stored = String(data.stored_mode || "");
  const sched = data.schedule && data.schedule.status === "pending" && FREE_MODE_LABEL[data.schedule.target_mode] ? data.schedule : null;
  const tAfter = pinnedNow ? now.getTime() : Date.now(); // เวลาหลัง DB ตอบ (DB ประเมินก่อนหน้านี้) — ใช้แค่กันกรณีเวลาผ่านไปแล้วแต่โหมดยังไม่สะท้อน
  const effMs = sched ? Date.parse(String(sched.effective_at || "")) : NaN;
  let upcoming = null, changedAt = null, changedTo = null, changedFrom = null;
  if (sched && Number.isFinite(effMs)) {
    const target = String(sched.target_mode);
    if (mode === target && stored !== target) {
      // snapshot บอกเองว่าโหมดที่มีผล = เป้าหมายแล้ว แต่แถวยังไม่บันทึก (worker ช้า) → เปลี่ยนแล้ว แม้ now ที่จับไว้ก่อนอ่าน DB จะยังไม่ถึง
      changedAt = sched.effective_at; changedTo = target; changedFrom = stored;
    } else if (effMs > tAfter) {
      upcoming = { target, effectiveAt: sched.effective_at, announcedAt: sched.announced_at || null, from: mode };
    }
    // อื่น ๆ (ช่วงเสี้ยววินาทีที่ DB ยังไม่สะท้อน หรือข้อมูลไม่สอดคล้อง) → ไม่พูดถึงกำหนดการ ดีกว่าพูดสวนโหมด
  }
  // last_applied ไม่รับประกันว่าเป็นการเปลี่ยนโหมดครั้งล่าสุด (อาจมีการเปลี่ยนมือหลังจากนั้น) → ไม่ใช้อ้างวัน
  return { trial, mode, upcoming, changedAt, changedTo, changedFrom };
}
/** บรรทัดกำหนดการอนาคต — ข้อความตามโหมดเป้าหมาย · "ประกาศแล้ว" เฉพาะเมื่อมี announced_at จริง */
function buildUpcomingPolicyLine(up, currentMode, freeQuota) {
  const when = thaiDateTime(up.effectiveAt);
  const announced = up.announcedAt ? `ประกาศลูกค้าแล้วเมื่อ ${thaiDateTime(up.announcedAt)}` : "ยังไม่มีบันทึกว่าประกาศลูกค้า — ห้ามอ้างว่าแจ้งไปแล้ว";
  const nowPart = currentMode === "daily"
    ? `ตอนนี้ยังใช้ฟรีรายวัน (วันละ ${freeQuota} ครั้ง) ได้${untilPhrase(up.effectiveAt)}`
    : `ตอนนี้ยังเป็น "${FREE_MODE_LABEL[currentMode]}" ${untilPhrase(up.effectiveAt)}`;
  const thenPart = up.target === "new_customer"
    ? `ตั้งแต่ ${when} จะไม่มีฟรีรายวัน ส่วนบัญชีใหม่ที่เข้าเกณฑ์ทดลองฟรีรวม 2 ครั้ง`
    : up.target === "none"
    ? `ตั้งแต่ ${when} จะไม่มีสิทธิ์ฟรีใด ๆ (ไม่มีฟรีรายวัน ไม่มีทดลองฟรี)`
    : `ตั้งแต่ ${when} จะกลับมามีฟรีรายวัน (วันละ ${freeQuota} ครั้ง)`;
  const afterRule = up.target === "daily"
    ? "ห้ามสัญญาจำนวนครั้งหรือสิทธิ์รายคนหลังจากนั้นนอกเหนือจากที่บอก"
    : up.target === "new_customer"
    ? "ห้ามสัญญาว่าหลังจากนั้นยังมีฟรีรายวัน · ห้ามรับปากว่าทุกคนจะเหลือฟรี 2 ครั้ง (บัญชีเก่าไม่ได้)"
    : "ห้ามสัญญาว่าหลังจากนั้นยังมีฟรีหรือทดลองฟรีใด ๆ";
  return `• ⚠️ กำหนดการเปลี่ยนนโยบาย (${announced}): ${nowPart} · ${thenPart} · แพ็กและโบนัสเดิมยังใช้ได้ตามเงื่อนไข ผลเก่ายังเปิดดูได้` +
    ` — ถ้าลูกค้าถามว่ายังฟรีไหม/ฟรีถึงเมื่อไหร่ ให้ตอบตามนี้ตรง ๆ ห้ามบอกว่าเปลี่ยนแล้วก่อนถึงเวลา · ${afterRule} · สิทธิ์ของคนนี้ยึดจากบรรทัดสิทธิ์ด้านบน`;
}
/** "ถึงสิ้นวันที่ 18 ต.ค." เมื่อเวลามีผลเป็นเที่ยงคืนไทย · ไม่งั้น "จนถึง <วัน เวลา>" */
function untilPhrase(effectiveIso) {
  const ms = Date.parse(String(effectiveIso || "")); if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const hhmm = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  if (hhmm === "00:00") {
    const prev = new Date(ms - 60_000);
    return `ถึงสิ้นวันที่ ${new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(prev)}`;
  }
  return `จนถึง ${thaiDateTime(effectiveIso)}`;
}
import { getValue, setLargeValueWithTtl } from "../../../redis/scanV2Redis.js";

const REJECT_REASON_THAI = {
  unclear: "ภาพยังไม่ชัดพอ มองวัตถุไม่เห็น",
  inconclusive: "ภาพยังไม่ชัดพอ อ่านไม่ออก",
  multiple: "ในภาพมีหลายชิ้นปนกัน",
  unsupported: "วัตถุไม่ใช่ประเภทที่รับดู",
};

// สถิติคะแนนรวมทั้งระบบ (กบ 4 ส.ค. — เคสลูกค้าถาม "ของคนอื่นแรงสุดเท่าไหร่"): ตัวเลขจริงจาก DB
// ตอบได้เฉพาะภาพรวม ห้ามเผยรายชิ้น/รายชื่อของลูกค้าคนอื่น · cache 6 ชม.
async function buildScoreStatsLine() {
  const cacheKey = "ener:score_stats_line:v1";
  try {
    const c = await getValue(cacheKey);
    if (c) return c;
  } catch { /* ignore */ }
  try {
    const { data, error } = await supabase.rpc("ener_score_stats");
    if (error || !data) return null;
    const j = typeof data === "string" ? JSON.parse(data) : data;
    const max = Number(j.max);
    if (!Number.isFinite(max)) return null;
    const line =
      `ข้อมูลประกอบภายใน (ตัวเลขจริง — ใช้ตอบเมื่อลูกค้าถามเทียบกับของคนอื่น/แรงสุดเท่าไหร่ ` +
      `บอกได้เฉพาะภาพรวม ⛔️ ห้ามเผยว่าชิ้นไหนของใคร ⛔️ ห้ามพูดคำว่า ระบบ หรืออ้างขอบเขต/จำนวนข้อมูลนี้กับลูกค้า): จากการอ่านทั้งหมด ${Number(j.total).toLocaleString()} ครั้ง ` +
      `แรงสุดที่เคยเจอคือ ${max}/10 (มี ${j.cntAtMax} ชิ้น จากลูกค้า ${j.ownersAtMax} คน) · ` +
      `ระดับ 8.5 ขึ้นไปเจอ ${j.cnt85} ครั้ง · ` +
      (Number(j.cnt89) > 0
        ? `เกรด S (8.9 ขึ้นไป) เจอแล้ว ${j.cnt89} ครั้ง`
        : `เกรด S (8.9 ขึ้นไป) ยังไม่เคยเจอเลย — ถ้าลูกค้ามีชิ้นที่ถึง จะเป็นชิ้นแรกของ`);
    try {
      await setLargeValueWithTtl(cacheKey, line, 21600);
    } catch { /* ignore */ }
    return line;
  } catch {
    return null;
  }
}

/**
 * @param {string} lineUserId
 * @returns {Promise<string|null>} Thai fact block for the prompt, or null on failure.
 */
export async function buildCustomerFactsContext(lineUserId, opts = {}) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;
  try {
    const now = opts.now instanceof Date ? opts.now : new Date(); // ฉีดได้เพื่อตรึงเวลาในเทสต์
    const [birthdate, userRow] = await Promise.all([
      getSavedBirthdate(uid).catch(() => null),
      supabase
        .from("app_users")
        .select("id,paid_until,paid_remaining_scans,free_scan_daily_offset,free_scan_offset_date")
        .eq("line_user_id", uid)
        .maybeSingle()
        .then((r) => r?.data || null)
        .catch(() => null),
    ]);

    const offer = loadActiveScanOffer(now);
    const freeQuota = Number(offer?.freeQuotaPerDay) || 2;

    const paidUntil = userRow?.paid_until || null;
    const paidRemaining = Number(userRow?.paid_remaining_scans) || 0;
    const paidActive = computePaidActive(paidUntil, paidRemaining, now);

    let freeLine;
    let adminResetLine = null;
    const snap = await readFreePolicySnapshot(supabase, uid, now, opts.now instanceof Date);
    const trial = snap.trial;
    const freeMode = snap.mode; // daily | new_customer | none — โหมดที่มีผล ณ ตอนนี้ (รวมกำหนดการที่ถึงเวลาแล้วแม้ยังไม่บันทึก)
    const pendingSchedule = snap.upcoming; // เฉพาะกำหนดการอนาคตจริง
    // วันที่ "ยกเลิกฟรีรายวันรอบล่าสุด" = เวลามีผลของกำหนดการที่พาเข้าโหมดนี้ (ไม่ใช่ cutoff) · ไม่มี = ไม่พูดวัน
    const changedPhrase = snap.changedAt && snap.changedTo === freeMode && snap.changedFrom === "daily" ? ` ยกเลิกฟรีรายวันแล้วตั้งแต่ ${thaiDateTime(snap.changedAt)}` : " ไม่มีฟรีรายวันแล้ว";
    // cutoff = เกณฑ์บัญชีใหม่เท่านั้น
    const cutoffPhrase = trial.eligible_since ? ` (บัญชีใหม่ = บัญชีที่เริ่มใช้ตั้งแต่ ${thaiDateTime(trial.eligible_since)})` : "";
    if (paidActive) {
      freeLine =
        `สิทธิ์แบบชำระเงินยังใช้งานอยู่ เหลือ ${paidRemaining} ครั้ง (ตัดสิทธิ์จ่ายก่อน โควต้าฟรีถูกกันไว้)` +
        ` — ลูกค้าจ่ายเงินและเปิดสิทธิ์เรียบร้อยแล้ว ⛔️ ห้ามทวงสลิป ห้ามพูดเรื่องโอน/QR เด็ดขาด แม้ประวัติแชทจะค้างเรื่องโอนอยู่ (เรื่องจ่ายจบไปแล้ว) — ลูกค้าทักสั้น ๆ เฉย ๆ ให้รับทราบและบอกว่าส่งรูปมาใช้สิทธิ์ได้เลย`;
    } else if (freeMode === "none") {
      const bonus = Number(userRow?.bonus_scans) || 0;
      freeLine =
        `นโยบายปัจจุบัน: ปิดสิทธิ์ฟรีทุกบัญชี — ไม่มีฟรีรายวัน ไม่มีทดลองฟรี; คนนี้: ${bonus > 0 ? `มีโบนัสจากการชวนเพื่อน ${bonus} ครั้ง (ยังสแกนได้ ห้ามบอกว่าหมดสิทธิ์)` : "ไม่มีสิทธิ์สแกนองค์ใหม่ ต้องเปิดค่าครูก่อน"}` +
        ` ⛔️ ห้ามพูดว่ามีฟรี/ทดลองฟรี/ฟรีวันละครั้ง/พรุ่งนี้มีฟรี/รอหลังเที่ยงคืน — ถ้าลูกค้าถามว่ายังฟรีไหม ให้ตอบตรง ๆ ว่าตอนนี้ไม่มีสิทธิ์ฟรีแล้ว` +
        ` · คลัง/รายงานเดิมของลูกค้าเปิดดูได้เสมอ ไม่ต้องซื้อแพ็ก (พิมพ์ ดูผลเก่า) ห้ามชวนซื้อเพื่อดูของเดิม`;
    } else if (freeMode === "new_customer") {
      const remaining = trial.eligible ? Math.max(0, 2 - trial.used) : 0;
      const bonus = Number(userRow?.bonus_scans) || 0;
      const who = trial.eligible
        ? `ลูกค้าใหม่ สิทธิ์ทดลองเหลือ ${remaining} จาก 2 ครั้ง`
        : "ลูกค้าเดิม (ไม่มีสิทธิ์ทดลอง) ต้องมีแพ็กหรือโบนัสจึงสแกนองค์ใหม่ได้";
      freeLine =
        `นโยบายปัจจุบัน:${changedPhrase} ฟรีเฉพาะบัญชีใหม่ที่เข้าเกณฑ์ ทดลองฟรีรวม 2 ครั้งต่อบัญชี ไม่เติมใหม่รายวัน${cutoffPhrase}; คนนี้: ${who}` +
        ` — ถ้าลูกค้าถามว่ายังฟรีไหม ให้ตอบตรง ๆ ว่า "ตอนนี้ไม่มีฟรีรายวันแล้วครับ บัญชีใหม่ที่เข้าเกณฑ์ทดลองฟรีรวม 2 ครั้ง แพ็กและโบนัสเดิมยังใช้ได้ตามเงื่อนไข และผลเก่ายังเปิดดูได้" · สิทธิ์ของคนนี้ยึดตามบรรทัดนี้เท่านั้น ห้ามรับปากว่าทุกคนยังเหลือฟรี 2 ครั้ง` +
        (bonus > 0 ? `; มีโบนัสจากการชวนเพื่อน ${bonus} ครั้ง (ยังสแกนได้ ห้ามบอกว่าหมดสิทธิ์)` : "") +
        ` ⛔️ ห้ามพูดว่า "ฟรีวันละครั้ง" "วันนี้ใช้ฟรีครบแล้ว" "พรุ่งนี้มีฟรี" "รอหลังเที่ยงคืน"` +
        ` · คลัง/รายงานเดิมของลูกค้าเปิดดูได้เสมอ ไม่ต้องซื้อแพ็ก (พิมพ์ ดูผลเก่า) ห้ามชวนซื้อเพื่อดูของเดิม`;
    } else {
      let freeUsed = 0;
      if (userRow?.id) {
        freeUsed = await countScanResultsTodayForAppUser(String(userRow.id), now).catch(() => 0);
      }
      const offsetDate = userRow?.free_scan_offset_date
        ? String(userRow.free_scan_offset_date).slice(0, 10)
        : null;
      const offsetN = Number(userRow?.free_scan_daily_offset) || 0;
      const resetAppliedToday =
        offsetDate && offsetDate === getLocalDateKey(now) && offsetN > 0;
      if (resetAppliedToday) {
        freeUsed = Math.max(0, freeUsed - offsetN);
      }
      const freeLeft = Math.max(0, freeQuota - freeUsed);
      freeLine = `สิทธิ์ฟรีวันนี้เหลือ ${freeLeft} จาก ${freeQuota} ครั้ง${paidRemaining > 0 ? "" : " (ไม่มีค่าครูค้างอยู่)"}`;
      // เหตุการณ์สด (เคส Nart 15 ก.ค.: แอดมินรีเซ็ตแล้ว AI ยังบอกให้รอพรุ่งนี้):
      // แอดมินเพิ่งรีเซ็ต/เพิ่มสิทธิ์ให้วันนี้ — ห้ามพูดสวนว่าสิทธิ์หมด
      if (resetAppliedToday && freeLeft > 0) {
        adminResetLine =
          `⚠️ เหตุการณ์สด: แอดมินเพิ่งเพิ่มสิทธิ์ฟรีให้ลูกค้าคนนี้วันนี้ (ตอนนี้เหลือ ${freeLeft} ครั้ง) — ` +
          `ห้ามบอกว่าสิทธิ์หมดหรือให้รอพรุ่งนี้ ให้ชวนส่งรูปมาใช้สิทธิ์ได้เลย`;
      }
    }

    // ดวงจากแอป Ener (LIFF) — คำอ่านชุดเดียวกับที่ลูกค้าเห็น ให้อาจารย์ตอบต่อยอดไม่ขัดกัน
    let liffReadingLines = null;
    try {
      const { buildLiffReadingFactsForChat } = await import("../../../routes/liff.routes.js");
      liffReadingLines = await buildLiffReadingFactsForChat(uid);
    } catch {
      liffReadingLines = null;
    }

    const scoreStatsLine = await buildScoreStatsLine();

    // ชุดจัดพลังวันนี้ (กบ 4 ส.ค.): ลูกค้าถามชุดที่ระบบจัดให้ อาจารย์ต้องตอบตรงกับรายงาน
    let synergyLines = null;
    try {
      const { buildSynergyFactsForChat } = await import(
        "../../../services/synergy/synergyReport.service.js"
      );
      synergyLines = await buildSynergyFactsForChat(uid);
    } catch {
      synergyLines = null;
    }

    // โน้ตเคสจากแอดมิน (เคสคุณชิต 15 ก.ค.: แอดมินลบผลผิด+เติมสิทธิ์ แต่บอทไม่รู้เรื่อง พูดคนละทาง):
    // แอดมินฝากเรื่องต่อบอทผ่าน redis `admin_case_note:{uid}` (TTL ตามเคส) — บอทต้องเล่าตรงกัน
    let adminCaseLine = null;
    try {
      const note = String((await getValue(`admin_case_note:${uid}`)) || "").trim();
      if (note) {
        adminCaseLine =
          `⚠️ เหตุการณ์สด (แอดมินฝากบอก): ${note} — ` +
          `ตอบให้ตรงกับเรื่องนี้ ห้ามพูดสวนหรือทำเหมือนไม่รู้เรื่อง`;
      }
    } catch {
      adminCaseLine = null;
    }

    // เหตุการณ์สด: ลูกค้าเพิ่งโดนปัดรูปกี่ครั้ง เพราะอะไร — อาจารย์ต้องรู้ก่อนตอบ
    // (บทเรียน 12 ก.ค.: ลูกค้าโดนปัด 8 รอบแต่อาจารย์คุยเหมือนไม่รู้เรื่อง)
    let rejectLine = null;
    try {
      const [streakRaw, lastReason] = await Promise.all([
        getValue(`scan_v2:reject_streak:${uid}`),
        getValue(`scan_v2:reject_last:${uid}`),
      ]);
      const streak = Number(streakRaw) || 0;
      if (streak >= 1) {
        const reasonThai = REJECT_REASON_THAI[String(lastReason || "")] || "อ่านภาพไม่ผ่าน";
        rejectLine =
          `⚠️ เหตุการณ์สด: รูปที่ลูกค้าส่งมาอ่านไม่ผ่านไปแล้ว ${streak} ครั้งติดใน 2 ชม.ล่าสุด ` +
          `(สาเหตุล่าสุด: ${reasonThai}) — ถ้าลูกค้าบ่นหรือถามว่าทำไมสแกนไม่ได้ ให้เห็นใจ ` +
          `ช่วยแนะวิธีถ่ายใหม่แบบใจเย็นและเจาะจง ห้ามตอบเหมือนไม่รู้ว่าเกิดอะไรขึ้น`;
      }
    } catch {
      rejectLine = null;
    }

    return [
      `• วันเกิดที่บันทึกไว้: ${birthdate ? `${birthdate} (มีแล้ว — ห้ามถามซ้ำ)` : "ยังไม่มี"}`,
      `• ${freeLine}`,
      freeMode === "none"
        ? `• กติกาสิทธิ์ฟรี: ปิดสิทธิ์ฟรีทุกบัญชีแล้ว${snap.changedAt && snap.changedTo === "none" ? ` ตั้งแต่ ${thaiDateTime(snap.changedAt)}` : ""} (ไม่มีฟรีรายวัน ไม่มีทดลองฟรี) สแกนองค์ใหม่ต้องมีค่าครูหรือโบนัส ห้ามพูดถึงฟรี/พรุ่งนี้`
        : freeMode === "new_customer"
        ? `• กติกาสิทธิ์ฟรี:${changedPhrase} ฟรีเฉพาะบัญชีใหม่ที่เข้าเกณฑ์${cutoffPhrase} รวม 2 ครั้งต่อบัญชี ไม่เติมใหม่รายวัน ห้ามพูดถึงฟรีรายวัน/พรุ่งนี้ ไม่รีเซ็ตรายวัน`
        : `• กติกาสิทธิ์ฟรี: วันละ ${freeQuota} ครั้ง รีเซ็ตหลังเที่ยงคืนเวลาไทย ใช้ไม่หมดไม่ทบไปวันถัดไป`,
      ...(pendingSchedule ? [buildUpcomingPolicyLine(pendingSchedule, freeMode, freeQuota)] : []),
      "• ค่าครู (ภาษาการเงิน — กบ 30 ก.ค.): เรียกการชำระเงินทุกแบบว่า ค่าครู เสมอ ห้ามใช้คำว่า ซื้อแพ็ก/แพ็กเกจ/สมัครสมาชิก · ห้ามอาจารย์เชียร์ขายหรือเลือกแทนลูกค้าเด็ดขาด — ลูกค้าอยากเปิดสิทธิ์ ให้บอกว่าบอกอาจารย์มาได้เลย เดี๋ยวมีตัวเลือกเด้งให้แตะเลือก (ห้ามสอนพิมพ์คำสั่ง) · ⛔️ ถ้าข้อความล่าสุดของลูกค้าเป็นการตอบคำถามที่อาจารย์ถามไป (เช่น บอกว่าพกเพื่ออะไร บอกชื่อพระ) ให้รับทราบเรื่องนั้น ห้ามสวนด้วยการพูดราคา/ชวนจ่ายเด็ดขาด (เคสจริง 8 ส.ค.: ลูกค้าตอบว่าใส่เสริมงาน แต่บอทตอบราคา 49 จนแอดมินต้องขอโทษ)",
      `• โปรตอนนี้ (ข้อเท็จจริง — ตอบได้เฉพาะเมื่อลูกค้าถามเรื่องโปร/แพ็ก/ราคาเอง ห้ามยกขึ้นมาเสนอก่อน): ${(offer?.packages || [])
        .filter((p) => p && p.active !== false)
        .sort((a, b) => a.priceThb - b.priceThb)
        .map((p) =>
          Number(p.scanCount) >= 999999
            ? `${p.priceThb} บาท สมาชิกรายเดือน อาจารย์ดูแลทั้งเดือน สแกนไม่จำกัด`
            : `${p.priceThb} บาท สแกน ${p.scanCount} ครั้ง`,
        )
        .join(", ") || "ยังไม่เปิดรับค่าครู"}${freeMode === "new_customer" ? " และบัญชีใหม่ทดลองฟรีรวม 2 ครั้ง (ไม่มีฟรีรายวัน)" : freeMode === "none" ? " (ไม่มีสิทธิ์ฟรีใด ๆ)" : ` และมีฟรีวันละ ${freeQuota} ครั้ง`}`,

      ...(adminCaseLine ? [`• ${adminCaseLine}`] : []),
      ...(adminResetLine ? [`• ${adminResetLine}`] : []),
      ...(rejectLine ? [`• ${rejectLine}`] : []),
      ...(liffReadingLines ? [`• ${liffReadingLines}`] : []),
      ...(scoreStatsLine ? [`• ${scoreStatsLine}`] : []),
      ...(synergyLines ? [synergyLines] : []),
    ].join("\n");
  } catch {
    return null;
  }
}

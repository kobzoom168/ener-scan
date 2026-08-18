/**
 * เลื่อน paywall เมื่อผลชิ้นก่อนหน้ายังไม่ยืนยันว่าถึงมือลูกค้า — pure resolver
 * (กบ 18 ส.ค. + Codex รอบ 3): invariant คือ "ลูกค้าต้องได้รับคุณค่าก่อนขาย"
 *
 * outcome 3 ทาง:
 *  - defer    = ผลกำลังมา รอส่งผลก่อนค่อยว่าเรื่องเงิน
 *  - recovery = ลูกค้ายังไม่เคยได้ผลเลย และรอบล่าสุดล้ม/ค้างผิดปกติ → แจ้งตรง ๆ
 *               เปิดทางส่งใหม่ ห้ามยัดราคา (ขายหลังรอ 30 นาทีแต่ไม่ได้ผล = พังเท่าเดิม)
 *  - paywall  = ขายได้ตามปกติ (ผลถึงมือแล้ว หรือลูกค้าเคยได้รับคุณค่าแล้ว)
 */

export const PAYWALL_DEFER_SAFETY_BOUND_MS = 30 * 60 * 1000;

const PENDING_STATUSES = new Set([
  "queued",
  "processing",
  "claimed",
  "completed",
  "delivery_queued",
]);

/**
 * @param {{
 *   inFlightActive: boolean,
 *   job: { status: string, ageMs: number } | null,
 *   dbError?: boolean,
 *   hasAnyDeliveredReport?: boolean,
 * }} p
 * @returns {{ decision: "defer" | "paywall" | "recovery", reason: string }}
 */
export function resolvePaywallDeferDecision({
  inFlightActive,
  job,
  dbError = false,
  hasAnyDeliveredReport = false,
}) {
  // in-flight gate = หลักฐานสดที่สุดว่างานกำลังทำ
  if (inFlightActive) return { decision: "defer", reason: "in_flight" };
  if (dbError || !job) {
    // ไม่มีหลักฐานอะไรเลย = fail-open ตามพฤติกรรมเดิม (ขายตามปกติ)
    return { decision: "paywall", reason: dbError ? "db_error_no_evidence" : "no_recent_job" };
  }
  const st = String(job.status || "");
  if (st === "delivered") return { decision: "paywall", reason: "delivered" };

  const ageMs = Number(job.ageMs);
  const ageValid = Number.isFinite(ageMs) && ageMs >= 0;

  if (PENDING_STATUSES.has(st)) {
    if (!ageValid) {
      // created_at เพี้ยน/parse ไม่ได้ — ห้าม defer ค้างไม่สิ้นสุด (Codex: NaN > bound = false)
      return hasAnyDeliveredReport
        ? { decision: "paywall", reason: "invalid_job_age" }
        : { decision: "recovery", reason: "invalid_job_age" };
    }
    if (ageMs > PAYWALL_DEFER_SAFETY_BOUND_MS) {
      // ค้างเกิน bound: ลูกค้าที่เคยได้คุณค่าแล้ว → ขายต่อได้ (failure-notify เป็น
      // เจ้าของการแจ้งงานติด) · ลูกค้าใหม่ที่ยังไม่เคยได้ผลเลย → ห้ามขาย ให้ recovery
      return hasAnyDeliveredReport
        ? { decision: "paywall", reason: "stale_pending_over_bound" }
        : { decision: "recovery", reason: "stale_pending_no_value" };
    }
    return { decision: "defer", reason: `pending_${st}` };
  }

  // failed/cancelled/สถานะอื่น: ไม่มีผลกำลังมา — ตัดสินจากว่าลูกค้าเคยได้คุณค่าหรือยัง
  return hasAnyDeliveredReport
    ? { decision: "paywall", reason: `not_pending_${st || "unknown"}` }
    : { decision: "recovery", reason: `no_value_${st || "unknown"}` };
}

/** copy defer: ไม่อ้างสถานะที่ไม่รู้จริง ไม่มีคำสัญญาเวลา ไม่มีเรื่องเงิน */
export const PAYWALL_DEFER_TEXT =
  "รับรูปชิ้นนี้ไว้แล้วครับ ขอส่งผลชิ้นก่อนหน้าให้เรียบร้อยก่อนนะครับ";

/**
 * copy recovery แยกตามเหตุ (Codex รอบ 4): failed = พูดได้ว่าอ่านไม่สำเร็จ ·
 * stale = ห้ามฟันธงว่าล้ม (อาจแค่ค้าง) · invalid = กลาง ๆ — ทุกแบบ: ไม่มีเงิน/ราคา
 * ไม่สัญญา handoff ลอย ๆ ("แอดมินรับเรื่องแล้ว" หนุนด้วย Telegram alert จริงใน webhook)
 */
export const PAYWALL_RECOVERY_TEXTS = Object.freeze({
  failed:
    "รับรูปชิ้นนี้ไว้แล้วครับ ยังไม่ต้องส่งซ้ำ\n\nชิ้นก่อนหน้าอ่านไม่สำเร็จ ยังไม่มีผลส่งถึงคุณ ระบบจึงยังไม่เปิดเรื่องค่าครูตอนนี้ครับ แอดมินรับเรื่องไว้แล้วครับ",
  stale:
    "รับรูปชิ้นนี้ไว้แล้วครับ ยังไม่ต้องส่งซ้ำ\n\nชิ้นก่อนหน้ายังไม่มีผลส่งถึงคุณ ระบบจึงยังไม่เปิดเรื่องค่าครูในตอนนี้ครับ แอดมินรับเรื่องไว้แล้วครับ",
  neutral:
    "รับรูปชิ้นนี้ไว้แล้วครับ ยังไม่ต้องส่งซ้ำ\n\nขอเช็คสถานะชิ้นก่อนหน้าให้ก่อนครับ ระบบยังไม่เปิดเรื่องค่าครูในตอนนี้ แอดมินรับเรื่องไว้แล้วครับ",
});

/** @param {string} reason */
export function selectRecoveryText(reason) {
  const r = String(reason || "");
  if (/^no_value_(failed|cancelled)$/.test(r)) return PAYWALL_RECOVERY_TEXTS.failed;
  if (r === "stale_pending_no_value") return PAYWALL_RECOVERY_TEXTS.stale;
  return PAYWALL_RECOVERY_TEXTS.neutral;
}

/**
 * เก็บหลักฐานสำหรับ resolver — ตรวจ {error} ของ supabase ตรง ๆ (Codex รอบ 4:
 * PostgrestClient คืน {data,error} ไม่ throw — catch เปล่าจับไม่ได้)
 * DI ครบเพื่อ behavior tests: client คืน error object โดยไม่ throw
 * @param {{
 *   supabase: { from: Function },
 *   userId: string,
 *   inFlightActive: boolean,
 *   nowMs?: number,
 * }} p
 */
export async function gatherPaywallDeferEvidence({ supabase, userId, inFlightActive, nowMs = Date.now() }) {
  let job = null;
  let dbError = false;
  try {
    const { data: j, error: jobError } = await supabase
      .from("scan_jobs")
      .select("status,created_at")
      .eq("line_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jobError) {
      dbError = true;
    } else if (j) {
      job = { status: String(j.status || ""), ageMs: nowMs - new Date(j.created_at).getTime() };
    }
  } catch {
    dbError = true;
  }

  // fail-open ตาม policy: อ่าน marker พลาด = ถือว่าเคยได้รับผลแล้ว (ใช้ policy ปกติ)
  let hasAnyDeliveredReport = true;
  let markerError = false;
  try {
    const { data: mk, error: mkError } = await supabase
      .from("line_conversation_messages")
      .select("id")
      .eq("line_user_id", userId)
      .eq("role", "bot")
      .filter("metadata_json->>replyType", "eq", "scan_result")
      .limit(1)
      .maybeSingle();
    if (mkError) {
      markerError = true;
      hasAnyDeliveredReport = true;
    } else {
      hasAnyDeliveredReport = Boolean(mk);
    }
  } catch {
    markerError = true;
    hasAnyDeliveredReport = true;
  }
  return { inFlightActive, job, dbError, hasAnyDeliveredReport, markerError };
}

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
  "รับรูปแล้ว รอผลชิ้นก่อนหน้า";

/**
 * copy recovery แยกตามเหตุ (Codex รอบ 5): failed = พูดได้ว่าอ่านไม่สำเร็จ ·
 * stale = ห้ามฟันธงว่าล้ม · invalid = กลาง ๆ — ทุกแบบ: ไม่มีคำเงินทุกชนิด (รวม "ค่าครู")
 * และคำว่า "แอดมินรับเรื่องไว้ตรวจแล้ว" ใส่ได้เฉพาะเมื่อ alert ถึง owner สำเร็จจริง
 */
export const PAYWALL_RECOVERY_TEXTS = Object.freeze({
  failed:
    "รับรูปแล้ว ไม่ต้องส่งซ้ำ\nชิ้นก่อนหน้าอ่านไม่สำเร็จ",
  stale:
    "รับรูปแล้ว ไม่ต้องส่งซ้ำ\nชิ้นก่อนหน้ายังไม่มีผล",
  neutral:
    "รับรูปแล้ว ไม่ต้องส่งซ้ำ\nกำลังเช็คสถานะชิ้นก่อนหน้า",
});

export const RECOVERY_OWNER_ASSIGNED_SUFFIX = " แอดมินรับเรื่องแล้ว";

/** @param {string} reason @param {{ ownerAssigned?: boolean }} [opts] */
export function selectRecoveryText(reason, { ownerAssigned = false } = {}) {
  const r = String(reason || "");
  let base = PAYWALL_RECOVERY_TEXTS.neutral;
  if (/^no_value_(failed|cancelled)$/.test(r)) base = PAYWALL_RECOVERY_TEXTS.failed;
  else if (r === "stale_pending_no_value") base = PAYWALL_RECOVERY_TEXTS.stale;
  return ownerAssigned ? base + RECOVERY_OWNER_ASSIGNED_SUFFIX : base;
}

/**
 * มอบ owner ให้เคส recovery แบบซื่อสัตย์ (Codex รอบ 5): await + ตรวจ {ok} จริง ·
 * ส่งไม่สำเร็จ = clear dedupe ให้ interaction ถัดไปลองใหม่ + ห้ามอ้างว่าแอดมินรับเรื่อง
 * @param {{ userId: string, reason: string, deps: {
 *   tryDedupeOnce: (k: string, ttl: number) => Promise<boolean>,
 *   clearDedupeKey: (k: string) => Promise<unknown>,
 *   sendTelegramText: (t: string) => Promise<{ ok: boolean, reason?: string }>,
 * } }} p
 * @returns {Promise<{ ownerAssigned: boolean }>}
 */
export async function assignRecoveryOwner({ userId, reason, deps }) {
  const key = `paywall_recovery_alert:${userId}`;
  let first = true;
  try {
    first = await deps.tryDedupeOnce(key, 3600);
  } catch {
    first = true;
  }
  if (!first) {
    // เคยแจ้งสำเร็จภายในชั่วโมงนี้แล้ว (คีย์อยู่ได้เฉพาะเมื่อส่งสำเร็จ) — owner มีอยู่แล้ว
    return { ownerAssigned: true };
  }
  let ok = false;
  let failReason = "unknown";
  try {
    const r = await deps.sendTelegramText(
      `[RECOVERY] ลูกค้ายังไม่เคยได้ผลสแกน (${reason}) uid:${String(userId).slice(0, 10)}… ระบบพักการขายไว้ — เข้าไปเช็คงานล่าสุด/คืนสิทธิ์ให้หน่อย`,
    );
    ok = r?.ok === true;
    if (!ok) failReason = String(r?.reason || "send_failed");
  } catch (e) {
    ok = false;
    failReason = String(e?.message || e).slice(0, 80);
  }
  if (ok) {
    console.log(
      JSON.stringify({ event: "PAYWALL_RECOVERY_OWNER_ASSIGNED", uidPrefix: String(userId).slice(0, 8), reason }),
    );
    return { ownerAssigned: true };
  }
  try {
    await deps.clearDedupeKey(key); // ให้รอบหน้าแจ้งใหม่ได้ — failure ครั้งแรกห้ามปิดการแจ้งทั้งชั่วโมง
  } catch { /* TTL เป็น safety net */ }
  console.error(
    JSON.stringify({
      event: "PAYWALL_RECOVERY_OWNER_DELIVERY_FAILED",
      uidPrefix: String(userId).slice(0, 8),
      reason,
      failReason,
    }),
  );
  return { ownerAssigned: false };
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

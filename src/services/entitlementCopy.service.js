/**
 * ข้อความเรื่อง "สิทธิ์สแกน" ชุดเดียวสำหรับทุกหน้า (กบ + Codex 26 ก.ย. 2026)
 *
 * ใจความที่ลูกค้าต้องเข้าใจเหมือนกันทุกหน้า:
 *   "ทดลองฟรี 2 ครั้งสำหรับลูกค้าใหม่ · เติมสิทธิ์เมื่อต้องการสแกนเพิ่ม · ของเดิมกลับมาดูได้เสมอ"
 *
 * กติกา
 *   - LINE และ LIFF ต้องเลือกข้อความจาก **สถานะสิทธิ์เดียวกัน** (ผล checkScanAccess) → resolveEntitlementState()
 *   - นโยบายจริงคือ access.freePolicy ("daily" | "new_customer") — ห้ามเดาจากภาพ/วันที่
 *   - โหมด new_customer ห้ามมี: ฟรีวันละ / วันนี้ใช้ฟรีครบ / พรุ่งนี้มีฟรี / รอหลังเที่ยงคืน
 *   - โหมด daily (Admin ปิด trial) ยังพูดเรื่องฟรีรายวันได้ตามเดิม
 *   - ห้ามชวนซื้อเพื่อปลดล็อกคลัง/รายงานเดิมของเจ้าของ (กติกาถาวรตั้งแต่ 23 ก.ย.)
 *   - ราคา/จำนวน/อายุแพ็ก มาจาก offer config เท่านั้น
 *   - ผู้ที่ยังมีสิทธิ์อื่น (แพ็ก/โบนัส) ต้องไม่ถูกบอกว่า "หมดสิทธิ์"
 */
// helper เล็ก ๆ ทำซ้ำที่นี่แทน import จาก webhookText.util (กัน circular import)
function formatOfferWindowThai(windowHours) {
  const h = Number(windowHours) || 0;
  if (h >= 48 && h % 24 === 0) return `${h / 24} วัน`;
  return `${h} ชม.`;
}
function isUnlimitedScanCount(scanCount) { return Number(scanCount) >= 999999; }

/** คำต้องห้ามในโหมดลูกค้าใหม่ (ใช้ทั้งใน test และ guard) */
export const FORBIDDEN_IN_TRIAL_MODE = [
  /ฟรีวันละ/, /วันละ\s*\d+\s*(ครั้ง|ชิ้น)/, /ฟรีวันนี้/, /วันนี้(ใช้|สิทธิ์)?.{0,12}ฟรี.{0,6}(ครบ|หมด)/,
  /พรุ่งนี้/, /หลังเที่ยงคืน/, /รีเซ็ต/, /ฟรีทุกวัน/,
];
/** ข้อความชวนซื้อเพื่อดูของเดิม — ห้ามทุกโหมด */
export const FORBIDDEN_EVERYWHERE = [/ค่าครูดูแลคลัง/, /(เปิด|ซื้อ|จ่าย).{0,10}เพื่อดู(คลัง|รายงาน|ประวัติ)/];

export const HISTORY_COMMAND_TEXT = "ดูผลเก่า"; // exact command ที่ระบบรู้จัก (exactUtilityCommand)

/**
 * นโยบายฟรีที่เปิดจริงตอนนี้ — อ่านจาก DB ผ่าน trial status (ไม่ใช่ cache ของ offer)
 * ล้ม → "unknown" = ใช้ข้อความกลาง ๆ ที่ไม่สัญญาเรื่องฟรีเลย (fail-closed ฝั่งคำพูด)
 * @returns {Promise<"daily"|"new_customer"|"unknown">}
 */
export async function resolveFreePolicy(deps = {}) {
  try {
    const get = deps.getNewCustomerTrialStatus
      ?? (await import("./newCustomerTrial.service.js")).getNewCustomerTrialStatus;
    const t = await get(null);
    return t?.enabled === true ? "new_customer" : "daily";
  } catch {
    return "unknown";
  }
}

/**
 * ผล checkScanAccess → สถานะเดียวที่ทุกหน้าใช้ร่วมกัน
 * @param {object|null} access
 * @param {{ now?: Date }} [opts]
 * @returns {{
 *   state: "unavailable"|"paid"|"bonus"|"trial_left"|"trial_exhausted"|"existing_no_rights"|"paid_expired"|"daily_left"|"daily_exhausted",
 *   policy: "daily"|"new_customer"|"unknown", allowed: boolean,
 *   paidLeft: number, paidUntil: string|null, paidUnlimited: boolean, bonusLeft: number, freeLeft: number, freeLimit: number,
 *   trialLimit: number, expiredPaidUntil: string|null,
 * }}
 */
export function resolveEntitlementState(access, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const n = (v) => Math.max(0, Number(v) || 0);
  const base = {
    state: "unavailable", policy: "unknown", allowed: false,
    paidLeft: 0, paidUntil: null, paidUnlimited: false, bonusLeft: 0, freeLeft: 0, freeLimit: 0,
    trialLimit: 2, expiredPaidUntil: null,
  };
  if (!access || typeof access !== "object" || typeof access.allowed !== "boolean" || access.accessUnavailable === true) {
    return base;
  }
  const policy = access.freePolicy === "new_customer" ? "new_customer" : "daily";
  const paidActive = access.reason === "paid" && access.allowed;
  const paidLeft = paidActive ? n(access.remaining) : 0;
  const paidUntilMs = Date.parse(String(access.paidUntil || ""));
  const paidUntilPast = Number.isFinite(paidUntilMs) && paidUntilMs <= now.getTime();
  const bonusLeft = n(access.bonusScansAvailable);
  const freeLeft = n(access.freeScansRemaining);
  const freeLimit = n(access.freeScansLimit);
  const out = {
    ...base, policy, allowed: access.allowed,
    paidLeft, paidUntil: paidActive ? access.paidUntil ?? null : null,
    paidUnlimited: paidActive && isUnlimitedScanCount(access.remaining),
    bonusLeft, freeLeft, freeLimit,
    expiredPaidUntil: !paidActive && paidUntilPast ? String(access.paidUntil) : null,
  };
  if (paidActive) return { ...out, state: "paid" };
  if (policy === "new_customer") {
    if (access.trialEligible === true && freeLeft > 0) return { ...out, state: "trial_left" };
    if (bonusLeft > 0) return { ...out, state: "bonus" };
    if (access.trialEligible === true) return { ...out, state: "trial_exhausted" };
    if (out.expiredPaidUntil) return { ...out, state: "paid_expired" };
    return { ...out, state: "existing_no_rights" };
  }
  if (freeLeft > 0) return { ...out, state: "daily_left" };
  if (bonusLeft > 0) return { ...out, state: "bonus" };
  return { ...out, state: "daily_exhausted" };
}

/** ชื่อแพ็กที่บอกสิ่งที่ซื้อตรง ๆ จาก config (ไม่ใช้ label การตลาดเช่น "ค่าครูดูแลคลังพลัง") */
export function packageDisplayName(p) {
  if (!p) return "แพ็กสแกน";
  if (isUnlimitedScanCount(p.scanCount)) return `สแกนไม่จำกัด ${formatOfferWindowThai(p.windowHours)}`;
  return `สแกน ${Number(p.scanCount) || 0} ครั้ง`;
}
/** "สแกน 4 ครั้ง — 49 บาท · ใช้ได้ 24 ชม." */
export function packageLine(p) {
  return `${packageDisplayName(p)} — ${Number(p.priceThb) || 0} บาท · ใช้ได้ ${formatOfferWindowThai(p.windowHours)}`;
}
/** ป้ายปุ่มเลือกแพ็ก (กดแล้วเป็นขั้นเลือกแพ็ก/รับ QR ยังไม่ใช่การชำระจริง) · ข้อความที่ส่งยังเป็น "จ่าย N" ตาม routing เดิม */
export function packageButton(p) {
  return { label: `เลือกแพ็ก ${Number(p.priceThb) || 0} บาท`, text: `จ่าย ${Number(p.priceThb) || 0}` };
}
export function activePackagesSorted(offer) {
  return (offer?.packages || []).filter((p) => p && p.active !== false).slice().sort((a, b) => a.priceThb - b.priceThb);
}

function thaiDateTime(iso) {
  const ms = Date.parse(String(iso || ""));
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const dd = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }).format(d);
  const hh = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${dd} ${hh} น.`;
}

/**
 * บรรทัดสถานะสิทธิ์ (ใช้ใน LIFF, คำตอบ "เหลือกี่ครั้ง", ท้ายผลสแกน)
 * @returns {{ headline: string, detail: string, breakdown: string[] }}
 */
export function buildEntitlementStatusLine(es) {
  const breakdown = [];
  if (es.paidLeft > 0 || es.paidUnlimited) breakdown.push(es.paidUnlimited ? "จากแพ็ก: ไม่จำกัด" : `จากแพ็ก ${es.paidLeft} ครั้ง`);
  if (es.freeLeft > 0) breakdown.push(`${es.policy === "new_customer" ? "ทดลอง" : "ฟรีวันนี้"} ${es.freeLeft} ครั้ง`);
  if (es.bonusLeft > 0) breakdown.push(`โบนัส ${es.bonusLeft} ครั้ง`);
  switch (es.state) {
    case "unavailable":
      return { headline: "ยังตรวจสอบสิทธิ์ไม่ได้", detail: "กรุณาลองใหม่อีกครั้ง", breakdown: [] };
    case "paid":
      return {
        headline: es.paidUnlimited ? "สิทธิ์จากแพ็ก: สแกนไม่จำกัด" : `สิทธิ์จากแพ็กคงเหลือ ${es.paidLeft} ครั้ง`,
        detail: es.paidUntil ? `ใช้ได้ถึง ${thaiDateTime(es.paidUntil)}` : "", breakdown,
      };
    case "bonus":
      return { headline: `สิทธิ์โบนัสคงเหลือ ${es.bonusLeft} ครั้ง`, detail: "โบนัสจากการชวนเพื่อน ใช้เมื่อไรก็ได้", breakdown };
    case "trial_left":
      return {
        headline: `สิทธิ์ทดลองฟรีคงเหลือ ${es.freeLeft} ครั้ง`,
        detail: `สำหรับลูกค้าใหม่ รวม ${es.trialLimit} ครั้งต่อบัญชี ไม่เติมใหม่รายวัน`, breakdown,
      };
    case "trial_exhausted":
      return { headline: `ใช้สิทธิ์ทดลองฟรีครบ ${es.trialLimit} ครั้งแล้ว`, detail: "เติมสิทธิ์เมื่อต้องการสแกนองค์ใหม่ รายงานเดิมยังเปิดดูได้", breakdown };
    case "existing_no_rights":
      return { headline: "ยังไม่มีสิทธิ์สำหรับสแกนองค์ใหม่", detail: "เติมสิทธิ์เพื่อสแกนองค์ใหม่ คลังและรายงานเดิมยังเปิดดูได้", breakdown };
    case "paid_expired":
      return { headline: "แพ็กสแกนหมดอายุแล้ว", detail: "เติมสิทธิ์เพื่อสแกนองค์ใหม่ได้ครับ รายงานเดิมยังเปิดดูได้", breakdown };
    case "daily_left":
      return { headline: `สิทธิ์ฟรีวันนี้คงเหลือ ${es.freeLeft} ครั้ง`, detail: es.freeLimit ? `ฟรีวันละ ${es.freeLimit} ครั้ง รีเซ็ตหลังเที่ยงคืน` : "", breakdown };
    case "daily_exhausted":
    default:
      return { headline: "วันนี้ใช้สิทธิ์ฟรีครบแล้ว", detail: "พรุ่งนี้หลังเที่ยงคืนมีฟรีให้อีก หรือเติมสิทธิ์เพื่อสแกนต่อวันนี้", breakdown };
  }
}

/**
 * ข้อความ paywall (เมื่อสแกนไม่ได้) — LINE Flex/text และ LIFF ใช้ชุดเดียวกัน
 * @param {ReturnType<typeof resolveEntitlementState>} es
 * @param {{ offer?: object }} [opts]
 * @returns {{ title: string, subtitle: string, textLines: string[], altText: string,
 *   ctaPrimaryLabel: string, ctaSecondary: { label: string, text: string }, packages: object[] }}
 */
export function buildPaywallCopy(es, opts = {}) {
  const packages = activePackagesSorted(opts.offer);
  const pkgLines = packages.map(packageLine);
  const ctaSecondary = { label: "ดูคลังของฉัน", text: HISTORY_COMMAND_TEXT };
  const ctaPrimaryLabel = "เลือกแพ็กสแกน";
  let title, subtitle;
  switch (es.state) {
    case "unavailable":
      title = "ยังตรวจสอบสิทธิ์ไม่ได้"; subtitle = "กรุณาลองใหม่อีกครั้ง"; break;
    case "trial_exhausted":
      title = `ใช้สิทธิ์ทดลองฟรีครบ ${es.trialLimit} ครั้งแล้วครับ`;
      subtitle = "หากต้องการสแกนองค์ใหม่ เลือกเติมสิทธิ์ด้านล่างได้เลย ส่วนรายงานที่เคยสแกนยังเปิดดูได้ตามเดิมครับ";
      break;
    case "paid_expired":
      title = "แพ็กสแกนหมดอายุแล้ว";
      subtitle = "เติมสิทธิ์เพื่อสแกนองค์ใหม่ได้ครับ คลังและรายงานเดิมของคุณยังเปิดดูได้โดยไม่ต้องซื้อแพ็ก";
      break;
    case "daily_exhausted":
      title = "วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ";
      subtitle = "เปิดพลังต่อได้เลยวันนี้ หรือพรุ่งนี้หลังเที่ยงคืนมีฟรีให้อีกครับ คลังและรายงานเดิมยังเปิดดูได้";
      break;
    case "existing_no_rights":
    default:
      title = "เติมสิทธิ์เพื่อสแกนองค์ใหม่";
      subtitle = "เลือกแพ็กสแกนด้านล่างได้เลยครับ คลังและรายงานเดิมของคุณยังเปิดดูได้โดยไม่ต้องซื้อแพ็ก";
  }
  const textLines = es.state === "unavailable"
    ? [title, subtitle]
    : [title, subtitle, "", ...pkgLines, "", `พร้อมเมื่อไหร่แตะปุ่มเลือกแพ็ก หรือพิมพ์ "${HISTORY_COMMAND_TEXT}" เพื่อดูคลังของคุณครับ`];
  const altText = `${title} ${packages.map((p) => `${p.priceThb} บาท`).join(" / ")}`.trim().slice(0, 400);
  return { title, subtitle, textLines, altText, ctaPrimaryLabel, ctaSecondary, packages };
}

/** ข้อความสั้นตอบลูกค้าที่บอกว่า "ไว้ก่อน/พรุ่งนี้" ระหว่าง paywall — ห้ามสัญญาฟรีพรุ่งนี้นอกโหมด daily */
export function buildSoftCloseCopy(policy) {
  if (policy === "daily") return "ได้เลยครับ พรุ่งนี้ค่อยส่งมาใหม่ได้เสมอครับ";
  return "ได้เลยครับ พร้อมเมื่อไหร่ค่อยเลือกแพ็กสแกนได้ตลอด รายงานเดิมยังเปิดดูได้เสมอครับ";
}

/** ประโยคชวนส่งรูปแรก (welcome / howto / landing) ตามนโยบายจริง */
export function buildFirstScanInviteLine(policy, { freeQuotaPerDay = 1, trialLimit = 2 } = {}) {
  if (policy === "daily") return `ฟรีวันละ ${Number(freeQuotaPerDay) || 1} ครั้ง`;
  if (policy === "new_customer") return `ลูกค้าใหม่ทดลองฟรี ${trialLimit} ครั้ง`;
  return "ทดลองอ่านพลังได้เลย";
}

/** ตรวจว่าข้อความชุดหนึ่งไม่ละเมิดกติกาโหมด (ใช้ใน tests และ guard log) */
export function findForbiddenPhrase(text, policy) {
  const t = String(text || "");
  const rules = policy === "new_customer" ? [...FORBIDDEN_IN_TRIAL_MODE, ...FORBIDDEN_EVERYWHERE] : FORBIDDEN_EVERYWHERE;
  for (const re of rules) if (re.test(t)) return re.source;
  return null;
}

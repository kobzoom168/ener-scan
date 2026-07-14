/**
 * Ener สายมู — LIFF app (Phase 1, staging-first).
 * v6 design: White & Gold, elderly-friendly large type.
 *
 * GET  /liff                    → single-page LIFF app (onboarding → home)
 * GET  /api/liff/profile        → { found, profile } (user from verified idToken)
 * POST /api/liff/profile        → upsert profile (registration) into liff_profiles
 * GET  /api/liff/daily          → deterministic "ดวงวันนี้" (same user+day = same result)
 *
 * Auth: every /api/liff/* call must carry `Authorization: Bearer <LINE idToken>`;
 * the server verifies it with LINE (oauth2/v2.1/verify) and uses the verified
 * `sub` as the userId — client-sent userId is never trusted.
 */
import express from "express";
import { supabase } from "../config/supabase.js";
import { saveBirthdate, getSavedBirthdate } from "../stores/userProfile.db.js";
import { listScanResultsV2PayloadRowsForLineUser } from "../stores/scanV2/scanResultsV2.db.js";
import { loadActiveScanOffer } from "../services/scanOffer.loader.js";
import { getPromptPayQrPublicUrl } from "../utils/promptpayQrPublicUrl.util.js";
import { ensureUserByLineUserId } from "../stores/users.db.js";
import {
  createPaymentPending,
  ensurePaymentRefForPaymentId,
  getLatestAwaitingPaymentForLineUserId,
  setPaymentSlipPendingVerify,
  updatePaymentSlipVerificationFields,
  markPaymentApprovedAndUnlock,
} from "../stores/payments.db.js";
import {
  setAwaitingPayment,
  clearPaymentState,
} from "../stores/manualPaymentAccess.store.js";
import { evaluateAwaitingPaymentSlipImage } from "../services/lineWebhook/slipImageValidation.service.js";
import { uploadSlipImageToStorage } from "../services/slipUpload.service.js";
import { runSlipAutoApprovalAfterGateAccept } from "../core/payments/slipCheck/slipAutoApprovalOrchestrator.service.js";
import { maybeNotifyAdminSlipPendingVerify } from "../services/adminPaymentSlipNotify.service.js";
import { pushText } from "../services/lineSequenceReply.service.js";
import { bustRegistrationCache } from "../services/registrationGate.service.js";
import { checkScanAccess } from "../services/paymentAccess.service.js";
import {
  getConversationStateByLineUserId,
  upsertConversationState,
} from "../stores/conversationState.db.js";
import { buildSlipPackageSwitchedApprovedText } from "../utils/webhookText.util.js";
import { getValue, setValueWithTtl } from "../redis/scanV2Redis.js";

export const liffRouter = express.Router();

/** LINE client for push messages (payment confirmations) — injected from app.js. */
let liffLineClient = null;
export function setLiffLineClient(client) {
  liffLineClient = client;
}

/* ---------------- LINE idToken verification ---------------- */

/** Verified-token cache: idToken → { userId, exp(sec) } (LINE verify is rate-limited). */
const LIFF_TOKEN_CACHE = new Map();

/** LIFF channel id = client_id for verify; derivable from LIFF_ID prefix ("2010xxxxxx-abcd"). */
function liffChannelId() {
  const explicit = String(process.env.LIFF_CHANNEL_ID || "").trim();
  if (explicit) return explicit;
  const m = /^(\d+)-/.exec(String(process.env.LIFF_ID || "").trim());
  return m ? m[1] : "";
}

/** @returns {Promise<string|null>} verified LINE userId, or null when invalid/expired. */
async function verifyLiffIdToken(idToken) {
  const tok = String(idToken || "").trim();
  if (!tok) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const cached = LIFF_TOKEN_CACHE.get(tok);
  if (cached) {
    if (cached.exp > nowSec + 30) return cached.userId;
    LIFF_TOKEN_CACHE.delete(tok);
    return null;
  }
  const clientId = liffChannelId();
  if (!clientId) return null;
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: tok, client_id: clientId }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.sub) return null;
  if (LIFF_TOKEN_CACHE.size > 500) {
    for (const [k, v] of LIFF_TOKEN_CACHE) {
      if (v.exp <= nowSec) LIFF_TOKEN_CACHE.delete(k);
    }
    if (LIFF_TOKEN_CACHE.size > 500) LIFF_TOKEN_CACHE.clear();
  }
  LIFF_TOKEN_CACHE.set(tok, { userId: j.sub, exp: Number(j.exp) || nowSec + 300 });
  return j.sub;
}

/** Auth gate: returns verified userId or replies 401 and returns null. */
async function requireLiffUser(req, res) {
  const h = String(req.headers.authorization || "");
  const idToken = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  let userId = null;
  try {
    userId = await verifyLiffIdToken(idToken);
  } catch (err) {
    console.error("[LIFF] idToken verify error:", err?.message);
  }
  if (!userId) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return userId;
}

/* ---- birthdate = ONE source of truth (users.birthdate, shared with the OA
   scan flow) so LIFF onboarding and สแกน never ask twice. LIFF keeps ISO
   (YYYY-MM-DD); the scan store keeps display DD/MM/YYYY. ---- */
function isoToDisplayBirthdate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function displayToIsoBirthdate(disp) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(disp || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
/** Resolve the user's birthdate as ISO, preferring the LIFF value, else the shared scan store. */
async function resolveBirthdateIso(userId, liffBirthdate) {
  if (liffBirthdate) return String(liffBirthdate);
  try {
    const disp = await getSavedBirthdate(userId);
    return displayToIsoBirthdate(disp);
  } catch {
    return "";
  }
}

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

// Daily encouragement keyed to the REAL trend vs yesterday (score is deterministic,
// so yesterday is reproducible). Positive life-mentor voice; no amulet metaphors.
const TREND_MESSAGES = {
  up_big: [
    "พลังวันนี้พุ่งขึ้นจากเมื่อวานแบบเห็นชัดเลย จังหวะดีแบบนี้เหมาะลงมือเรื่องสำคัญที่ตั้งใจไว้นะ",
    "ดวงกำลังขาขึ้นแรงมาก อะไรที่ลังเลอยู่ วันนี้กล้าตัดสินใจได้เลย อาจารย์เชียร์เต็มที่",
    "วันนี้ฟ้าเปิดกว่าเมื่อวานเยอะ ยิ้มรับสิ่งดี ๆ แล้วส่งต่อพลังบวกให้คนรอบตัวด้วยนะ",
    "พลังบวกไหลเข้ามาเต็มที่ ใช้วันนี้เริ่มสิ่งใหม่หรือสะสางเรื่องค้างคา จะได้ผลดีเป็นพิเศษ",
  ],
  up: [
    "ดวงขยับขึ้นจากเมื่อวานทีละนิด กำลังมาถูกทางแล้วนะ ทำต่อเนื่องไปเรื่อย ๆ",
    "วันนี้ดีกว่าเมื่อวานอีกนิดนึง ค่อย ๆ สะสมพลังบวกไป เดี๋ยวเรื่องดี ๆ ตามมาเอง",
    "พลังกำลังไต่ขึ้นเรื่อย ๆ ขยันต่ออีกวัน แล้วอย่าลืมชมตัวเองบ้างนะ",
    "แนวโน้มดีขึ้นกว่าเมื่อวานแล้ว ใครที่รอจังหวะเริ่มอะไร วันนี้เริ่มเบา ๆ ได้เลย",
  ],
  flat: [
    "พลังวันนี้นิ่งเท่าเมื่อวาน เหมาะกับการทำเรื่องเดิมให้ดีขึ้นอีกนิด ความสม่ำเสมอนี่แหละพลังที่แรงที่สุด",
    "วันนี้ดวงคงที่ ใจเย็น ๆ ทำทีละอย่าง ความนิ่งจะพาเราไปได้ไกลกว่าที่คิดนะ",
    "พลังทรงตัวจากเมื่อวาน ใช้วันนี้ดูแลตัวเองและคนใกล้ตัว เติมแรงไว้สำหรับพรุ่งนี้",
  ],
  down: [
    "วันนี้พลังแผ่วลงจากเมื่อวานนิดหน่อย ไม่เป็นไรเลยนะ ช้าลงอีกนิด ใจเย็นอีกหน่อย เดี๋ยวก็กลับมา",
    "ดวงพักตัวเบา ๆ วันนี้เหมาะกับงานที่ไม่เร่งรีบ ทำเท่าที่ไหว แล้วใจดีกับตัวเองด้วยนะ",
    "แผ่วลงนิดเดียวเอง ถือเป็นวันเก็บแรง ทำเรื่องง่าย ๆ ให้เสร็จ แล้วพรุ่งนี้ค่อยลุยต่อ",
    "วันนี้อย่าเพิ่งรีบตัดสินใจเรื่องใหญ่ พักใจ ฟังเสียงตัวเองเยอะ ๆ พลังจะค่อย ๆ ฟื้นกลับมาเอง",
  ],
  down_big: [
    "วันนี้ดวงขอพักหน่อยนะ ไม่ใช่วันแย่ แค่เป็นวันเติมพลัง ช้าลง หายใจลึก ๆ แล้วทำทีละเรื่อง",
    "พลังลดจากเมื่อวานพอสมควร อาจารย์แนะให้เลี่ยงเรื่องเสี่ยงไว้ก่อน แล้วดูแลใจตัวเองเป็นอันดับแรก",
    "วันแบบนี้มีไว้ให้เราได้พัก ทำสิ่งเล็ก ๆ ที่ทำให้ใจสบาย เดี๋ยวพรุ่งนี้เส้นกราฟจะกลับขึ้นมาเอง",
    "ดวงย่อตัวเพื่อสะสมแรง อย่าเพิ่งท้อนะ คนที่ผ่านวันเบา ๆ ได้อย่างใจเย็น คือคนที่ไปได้ไกลที่สุด",
  ],
};

function gradeFor(score) {
  if (score >= 90) return "ดีเยี่ยม";
  if (score >= 80) return "ดีมาก";
  if (score >= 70) return "ดี";
  if (score >= 62) return "ปานกลาง";
  return "ค่อยเป็นค่อยไป";
}

const LUCKY_COLORS = [
  { name: "สีทอง", hex: "#c9a35c" },
  { name: "สีแดง", hex: "#d64545" },
  { name: "สีชมพู", hex: "#e88ab8" },
  { name: "สีส้ม", hex: "#e8863c" },
  { name: "สีเหลือง", hex: "#e6c34a" },
  { name: "สีเขียว", hex: "#4c9e6b" },
  { name: "สีฟ้า", hex: "#58a6d6" },
  { name: "สีน้ำเงิน", hex: "#3f6bb5" },
  { name: "สีม่วง", hex: "#8a63b8" },
  { name: "สีขาว", hex: "#f4f1ea" },
];

/* ---------------- ตำราทักษาไทย (real Thai taksa system) ----------------
 * Wheel order (clockwise): อาทิตย์ จันทร์ อังคาร พุธ เสาร์ พฤหัสบดี ราหู ศุกร์.
 * From the birth day (บริวาร), counting clockwise gives:
 * บริวาร อายุ เดช ศรี มูละ อุตสาหะ มนตรี กาลกิณี.
 * Wednesday-night births (>=18:00 or night words) sit on ราหู.
 */
const TAKSA_CIRCLE = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "เสาร์", "พฤหัสบดี", "ราหู", "ศุกร์"];
const WEEKDAY_TO_CIRCLE = [0, 1, 2, 3, 5, 7, 4]; // JS Sun..Sat → wheel index
const TAKSA_STATUS_ORDER = ["บริวาร", "อายุ", "เดช", "ศรี", "มูละ", "อุตสาหะ", "มนตรี", "กาลกิณี"];
const TAKSA_SCORE_RANGE = {
  ศรี: [86, 95], เดช: [83, 93], มนตรี: [80, 90], บริวาร: [75, 85],
  อายุ: [73, 83], มูละ: [69, 79], อุตสาหะ: [62, 74], กาลกิณี: [55, 65],
};
const DAY_NUMBER = { อาทิตย์: 1, จันทร์: 2, อังคาร: 3, พุธ: 4, พฤหัสบดี: 5, ศุกร์: 6, เสาร์: 7, ราหู: 8 };
// สีมงคล/สีกาลกิณีประจำวัน (ตำราไทยพื้นบ้านที่คนคุ้นเคย), indexed by JS weekday
const DAY_COLORS = [
  { good: [["สีแดง", "#d64545"], ["สีส้ม", "#e8863c"]], ban: { name: "สีน้ำเงิน", hex: "#3f6bb5" } },
  { good: [["สีเหลือง", "#e6c34a"], ["สีขาวครีม", "#efe7d2"]], ban: { name: "สีแดง", hex: "#d64545" } },
  { good: [["สีชมพู", "#e88ab8"], ["สีม่วง", "#8a63b8"]], ban: { name: "สีขาว", hex: "#f4f1ea" } },
  { good: [["สีเขียว", "#4c9e6b"]], ban: { name: "สีชมพู", hex: "#e88ab8" } },
  { good: [["สีส้ม", "#e8863c"], ["สีเหลือง", "#e6c34a"]], ban: { name: "สีดำ", hex: "#3f3b35" } },
  { good: [["สีฟ้า", "#58a6d6"], ["สีน้ำเงิน", "#3f6bb5"]], ban: { name: "สีเทาเข้ม", hex: "#8b8b8b" } },
  { good: [["สีม่วง", "#8a63b8"], ["สีดำ", "#3f3b35"]], ban: { name: "สีเขียว", hex: "#4c9e6b" } },
];
const TAKSA_MESSAGES = {
  ศรี: [
    "วันนี้เป็นวัน 'ศรี' ของคุณ เสน่ห์และโชคเรื่องเงินทองเด่นเป็นพิเศษ จะเจรจาหรือขายอะไรก็ราบรื่น",
    "วัน 'ศรี' มาเยือน สิ่งดี ๆ กำลังไหลเข้ามา ยิ้มรับแล้วแบ่งความสดใสให้คนรอบตัวด้วยนะ",
  ],
  เดช: [
    "วันนี้เป็นวัน 'เดช' อำนาจบารมีมาเต็ม เหมาะคุยงานใหญ่ ตัดสินใจเรื่องสำคัญ คนจะรับฟังเรา",
    "วัน 'เดช' ของคุณ กล้าคิดกล้านำได้เลย วันนี้พูดอะไรมีน้ำหนักเป็นพิเศษ",
  ],
  มนตรี: [
    "วัน 'มนตรี' ผู้ใหญ่เมตตา มีคนคอยหนุนอยู่ ติดขัดอะไรลองเปิดปากขอคำปรึกษา จะมีคนช่วยเปิดทาง",
    "วันนี้ดาวผู้อุปถัมภ์เด่น ใครที่รอคำตอบจากผู้ใหญ่หรือหัวหน้า มีเกณฑ์ได้ข่าวดีนะ",
  ],
  บริวาร: [
    "วัน 'บริวาร' คนรอบตัวคือพลังของคุณ งานทีม ครอบครัว เพื่อนฝูง ราบรื่นเป็นพิเศษ ชวนกันทำสิ่งดี ๆ เลย",
    "วันนี้เหมาะดูแลคนใกล้ตัว ให้เวลาครอบครัวสักหน่อย พลังใจจะเต็มทั้งเราและเขา",
  ],
  อายุ: [
    "วัน 'อายุ' พลังชีวิตกำลังฟื้นตัว ดูแลสุขภาพกายใจ กินดี นอนพอ ทำอะไรแบบพอดี ๆ จะยั่งยืนที่สุด",
    "วันนี้ร่างกายและใจขอความใส่ใจหน่อยนะ เดินเล่น ยืดเส้น พักสายตา แค่นี้ดวงก็เสริมแล้ว",
  ],
  มูละ: [
    "วัน 'มูละ' ฐานทรัพย์เดิมหนุนอยู่ เหมาะจัดระเบียบการเงิน ของเก่าหรือคนเก่า ๆ อาจให้คุณอย่างคาดไม่ถึง",
    "วันนี้เหมาะกลับไปสานต่อของเดิมที่เคยวางไว้ รากที่เราปลูกไว้กำลังส่งผลนะ",
  ],
  อุตสาหะ: [
    "วัน 'อุตสาหะ' ยิ่งขยันยิ่งได้ วันนี้ความพยายามไม่หลอกใคร ลงแรงตรงไหน ผลงอกตรงนั้น",
    "วันนี้อาจต้องออกแรงมากกว่าปกตินิดนึง แต่ทุกหยดเหงื่อคุ้มแน่นอน ค่อย ๆ ไป อาจารย์เป็นกำลังใจให้",
  ],
  กาลกิณี: [
    "วันนี้ตรงกับ 'กาลกิณี' ของคุณ ไม่ต้องกังวลนะ แค่เพลาเรื่องเสี่ยง ใจเย็นขึ้นอีกนิด แล้วหาโอกาสทำสิ่งดี ๆ สักอย่าง พลังจะกลับมาเป็นของเรา",
    "วันแบบนี้ตำราให้เลี่ยงการตัดสินใจใหญ่และคำพูดร้อน ๆ ทำเรื่องเบา ๆ ช่วยเหลือใครสักคน ดวงจะพลิกกลับมาสวยเอง",
  ],
};

/** Wheel index of the birth day, or null when birthdate is unusable. */
function birthCircleIndex(birthdate, birthTime) {
  const dt = new Date(String(birthdate || "") + "T00:00:00Z");
  if (Number.isNaN(dt.getTime())) return null;
  const wd = dt.getUTCDay();
  let idx = WEEKDAY_TO_CIRCLE[wd];
  if (wd === 3) {
    const t = String(birthTime || "");
    const hm = /^(\d{1,2})/.exec(t);
    const hour = hm ? Number(hm[1]) : NaN;
    const isNight = (Number.isFinite(hour) && (hour >= 18 || hour < 6)) || /ค่ำ|ดึก|กลางคืน/.test(t);
    if (isNight) idx = 6; // ราหู
  }
  return idx;
}

function dailyScoreFor(userId, dayKey) {
  const seed = String(userId || "guest").trim() + "|" + dayKey;
  return 55 + (fnv1a32(seed + "|score") % 41); // 55..95 (unchanged formula)
}

/**
 * Daily reading. With a birth (taksa) — REAL ตำราทักษาไทย: today's wheel position
 * vs the birth day drives score band + message; colors follow the Thai day-color
 * table; lucky numbers = planet numbers of birth day + today. Without a birth —
 * the previous stable-hash behavior with trend messages.
 */
function buildDaily(userId, now = Date.now(), birth = null) {
  const day = bangkokDateKey(now);
  const seed = String(userId || "guest").trim() + "|" + day;
  const wdToday = new Date(now + 7 * 3600 * 1000).getUTCDay();
  const bIdx = birth ? birthCircleIndex(birth.birthdate, birth.birthTime) : null;

  let score, message, taksa = null, basis = "stable_random";
  if (bIdx != null) {
    basis = "taksa";
    const todayCircle = WEEKDAY_TO_CIRCLE[wdToday];
    const status = TAKSA_STATUS_ORDER[(todayCircle - bIdx + 8) % 8];
    const [lo, hi] = TAKSA_SCORE_RANGE[status];
    score = lo + (fnv1a32(seed + "|taksa") % (hi - lo + 1));
    const pool = TAKSA_MESSAGES[status];
    message = pool[fnv1a32(seed + "|msg") % pool.length];
    taksa = {
      status,
      todayDay: TAKSA_CIRCLE[todayCircle],
      birthDay: TAKSA_CIRCLE[bIdx],
    };
  } else {
    score = dailyScoreFor(userId, day);
    const yesterdayScore = dailyScoreFor(userId, bangkokDateKey(now - 86400000));
    const d = score - yesterdayScore;
    const band = d >= 8 ? "up_big" : d >= 1 ? "up" : d === 0 ? "flat" : d <= -8 ? "down_big" : "down";
    const pool = TREND_MESSAGES[band];
    message = pool[fnv1a32(seed + "|msg") % pool.length];
  }

  // lucky numbers: taksa = planet numbers (birth day + today); else stable hash
  let luckyNum, luckyNum2;
  if (bIdx != null) {
    luckyNum = DAY_NUMBER[TAKSA_CIRCLE[bIdx]];
    luckyNum2 = DAY_NUMBER[TAKSA_CIRCLE[WEEKDAY_TO_CIRCLE[wdToday]]];
    if (luckyNum2 === luckyNum) luckyNum2 = DAY_NUMBER[TAKSA_CIRCLE[(bIdx + 3) % 8]]; // เลขวันตำแหน่ง 'ศรี'
  } else {
    luckyNum = fnv1a32(seed + "|num") % 10;
    luckyNum2 = fnv1a32(seed + "|num2") % 10;
    if (luckyNum2 === luckyNum) luckyNum2 = (luckyNum2 + 3) % 10;
  }

  // colors: Thai day-color table (good pick varies per user, ban fixed per day)
  const dc = DAY_COLORS[wdToday];
  const pick = dc.good[fnv1a32(seed + "|color") % dc.good.length];
  const luckyColor = { name: pick[0], hex: pick[1] };
  const banColor = dc.ban;

  return {
    day, score, grade: gradeFor(score), message, basis, taksa,
    luckyNum, luckyNums: [luckyNum, luckyNum2], luckyColor, banColor,
  };
}

liffRouter.get("/api/liff/daily", async (req, res) => {
  const userId = await requireLiffUser(req, res);
  if (!userId) return;
  const now = Date.now();
  // Pull birthdate so the reading follows ตำราทักษา; degrade gracefully without it.
  let birth = null;
  if (userId) {
    try {
      const { data } = await supabase
        .from("liff_profiles")
        .select("birthdate,birth_time")
        .eq("line_user_id", userId)
        .maybeSingle();
      if (data?.birthdate) birth = { birthdate: data.birthdate, birthTime: data.birth_time };
    } catch (_) {
      birth = null;
    }
    // Fall back to the shared scan store so a birthdate entered via สแกน also
    // powers the daily reading (one dataset).
    if (!birth) {
      const iso = await resolveBirthdateIso(userId, null);
      if (iso) birth = { birthdate: iso, birthTime: null };
    }
  }
  // 7-day trend ending today (deterministic, so past days are reproducible)
  const history = [];
  for (let k = 6; k >= 0; k--) {
    const d = buildDaily(userId, now - k * 86400000, birth);
    history.push({ day: d.day, score: d.score });
  }
  res.json({ ok: true, ...buildDaily(userId, now, birth), history, needsBirthdate: !birth });
});

/* ---------------- monthly reading (deterministic per user per month) ---------------- */

const TH_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// Ener tarot deck (Thai-flavored majors): name / emoji / keyword / meaning fragment.
const TAROT_DECK = [
  { n: "ดวงอาทิตย์", e: "☀️", k: "ความสำเร็จ", m: "พลังความสำเร็จและความสดใสกำลังส่องทางให้" },
  { n: "ดวงจันทร์", e: "🌙", k: "สัญชาตญาณ", m: "ให้เชื่อเสียงข้างในตัวเองมากขึ้น มันกำลังบอกทางที่ใช่" },
  { n: "ดวงดาว", e: "⭐", k: "ความหวัง", m: "ความหวังใหม่กำลังก่อตัว อย่าเพิ่งถอดใจ" },
  { n: "นักปราชญ์", e: "🧙", k: "ผู้ชี้ทาง", m: "จะมีผู้ใหญ่หรือผู้รู้เข้ามาช่วยชี้ทางในจังหวะสำคัญ" },
  { n: "จักรพรรดิ", e: "👑", k: "ความมั่นคง", m: "การงานและฐานะกำลังตั้งหลักได้มั่นคงขึ้น" },
  { n: "คู่รัก", e: "💞", k: "ความสัมพันธ์", m: "ความสัมพันธ์รอบตัวกำลังส่งพลังบวกเข้ามาหนุน" },
  { n: "รถศึก", e: "🏇", k: "เดินหน้า", m: "ถึงเวลาเดินหน้าอย่างมีเป้าหมาย อย่าลังเล" },
  { n: "ตราชู", e: "⚖️", k: "ความสมดุล", m: "เรื่องที่คาราคาซังกำลังคลี่คลายอย่างเป็นธรรม" },
  { n: "กงล้อโชคชะตา", e: "🎡", k: "จังหวะชีวิต", m: "จังหวะชีวิตกำลังหมุนเข้าสู่รอบที่ดีขึ้น" },
  { n: "ราชสีห์", e: "🦁", k: "พลังใจ", m: "พลังใจแข็งแรงพอจะตัดสินใจเรื่องที่เลื่อนมานาน" },
  { n: "ฤๅษี", e: "🏮", k: "การทบทวน", m: "เหมาะกับการพักทบทวนใจตัวเองก่อนก้าวใหญ่" },
  { n: "นกพิราบขาว", e: "🕊️", k: "ความพอดี", m: "ค่อยเป็นค่อยไปจะได้ผลดีกว่าเร่งรีบ" },
  { n: "แม่โพสพ", e: "🌾", k: "ความอุดม", m: "รายรับและความอุดมสมบูรณ์กำลังงอกเงยทีละน้อย" },
  { n: "โลกทั้งใบ", e: "🌏", k: "ความสมบูรณ์", m: "สิ่งที่ลงแรงมานานใกล้ครบวงจรสมบูรณ์แล้ว" },
  { n: "แสงเทียน", e: "🕯️", k: "ทางสว่าง", m: "ทางออกที่เคยมองไม่เห็นกำลังค่อย ๆ สว่างขึ้น" },
  { n: "ดอกบัว", e: "🪷", k: "ใจสงบ", m: "ใจที่สงบจะดึงสิ่งดี ๆ เข้ามาหาเอง" },
];

const READING_ADVICE = [
  "ก่อนนอนลองนิ่งกับตัวเองสัก 5 นาที สวดมนต์หรือขอบคุณสิ่งดี ๆ ของวันนี้ตามแบบที่คุณศรัทธา ใจที่นิ่งจะทำให้ตัดสินใจแม่นขึ้น",
  "เดือนนี้หาเวลาไปที่ที่ใจคุณสงบสักครั้ง วัด ศาลเจ้า โบสถ์ หรือธรรมชาติก็ได้ พลังใจจะกลับมาเต็ม",
  "ใส่ใจคนใกล้ตัวอีกนิด พูดดี ๆ กับเขาสักประโยค แรงหนุนสำคัญของเดือนนี้มาจากคนข้าง ๆ นี่แหละ",
  "เก็บออมเล็ก ๆ ทุกวัน แล้วแบ่งส่วนหนึ่งไปช่วยคนที่ลำบากกว่า วินัยบวกน้ำใจคือเครื่องรางชั้นดีที่สุด",
  "พักผ่อนให้พอ กินให้ดี สุขภาพดีคือฐานของดวงทุกด้าน ดูแลตัวเองก็คือการเสริมดวงแล้ว",
  "ทำสิ่งดี ๆ เล็ก ๆ ตามกำลัง จะทำบุญ บริจาค หรือช่วยใครสักคนก็ได้ ความดีที่ทำเองส่งผลไวที่สุด",
  "จัดบ้านให้โปร่ง ของที่ไม่ใช้แล้วส่งต่อให้คนที่ต้องการ ได้ทั้งพื้นที่ ได้ทั้งบุญ พลังใหม่จะเข้ามาเอง",
  "กล้าปฏิเสธสิ่งที่เกินกำลัง เดือนนี้การใจดีกับตัวเองไม่ใช่ความเห็นแก่ตัวนะ",
];

const ZODIAC_BOUNDS = [
  { d: 19, a: "มังกร", b: "กุมภ์" }, { d: 18, a: "กุมภ์", b: "มีน" },
  { d: 20, a: "มีน", b: "เมษ" }, { d: 19, a: "เมษ", b: "พฤษภ" },
  { d: 20, a: "พฤษภ", b: "เมถุน" }, { d: 20, a: "เมถุน", b: "กรกฎ" },
  { d: 22, a: "กรกฎ", b: "สิงห์" }, { d: 22, a: "สิงห์", b: "กันย์" },
  { d: 22, a: "กันย์", b: "ตุลย์" }, { d: 22, a: "ตุลย์", b: "พิจิก" },
  { d: 21, a: "พิจิก", b: "ธนู" }, { d: 21, a: "ธนู", b: "มังกร" },
];
const ELEMENT_BY_ZODIAC = {
  เมษ: "ไฟ", สิงห์: "ไฟ", ธนู: "ไฟ",
  พฤษภ: "ดิน", กันย์: "ดิน", มังกร: "ดิน",
  เมถุน: "ลม", ตุลย์: "ลม", กุมภ์: "ลม",
  กรกฎ: "น้ำ", พิจิก: "น้ำ", มีน: "น้ำ",
};
const ANIMAL_YEARS = ["ชวด (หนู)", "ฉลู (วัว)", "ขาล (เสือ)", "เถาะ (กระต่าย)", "มะโรง (งูใหญ่)", "มะเส็ง (งูเล็ก)", "มะเมีย (ม้า)", "มะแม (แพะ)", "วอก (ลิง)", "ระกา (ไก่)", "จอ (สุนัข)", "กุน (หมู)"];

function thaiAstroFromBirthdate(birthdate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthdate || ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!(y > 1900 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  const zb = ZODIAC_BOUNDS[mo - 1];
  const zodiac = d <= zb.d ? zb.a : zb.b;
  const animal = ANIMAL_YEARS[(((y - 2008) % 12) + 12) % 12];
  const nowBkk = new Date(Date.now() + 7 * 3600 * 1000);
  let age = nowBkk.getUTCFullYear() - y;
  if (nowBkk.getUTCMonth() + 1 < mo || (nowBkk.getUTCMonth() + 1 === mo && nowBkk.getUTCDate() < d)) {
    age -= 1;
  }
  return {
    zodiac: "ราศี" + zodiac,
    element: "ธาตุ" + (ELEMENT_BY_ZODIAC[zodiac] || "ดิน"),
    animal,
    age,
    birthdateLabel: d + " " + TH_MONTHS_FULL[mo - 1] + " " + (y + 543),
  };
}

const READING_AXES = ["การงาน", "การเงิน", "ความรัก", "สุขภาพ", "โชคลาภ"];

function readingGrade(score) {
  if (score >= 85) return "ดวงดีมาก";
  if (score >= 75) return "ดวงดี";
  if (score >= 65) return "กำลังไต่ระดับ";
  return "ค่อย ๆ ฟื้นตัว";
}

function buildMonthlyReading(userId, birthdate) {
  const monthKey = bangkokDateKey().slice(0, 7); // YYYY-MM (BKK)
  const seed =
    String(userId || "guest").trim() + "|" + monthKey + "|" + String(birthdate || "");

  const picked = [];
  let i = 0;
  while (picked.length < 3 && i < 48) {
    const idx = fnv1a32(seed + "|card" + i) % TAROT_DECK.length;
    if (!picked.includes(idx)) picked.push(idx);
    i += 1;
  }
  const positions = ["อดีต", "ตอนนี้", "ข้างหน้า"];
  const cards = picked.map((idx, j) => ({
    pos: positions[j],
    n: TAROT_DECK[idx].n,
    e: TAROT_DECK[idx].e,
    k: TAROT_DECK[idx].k,
  }));

  const axes = {};
  for (const ax of READING_AXES) {
    axes[ax] = 62 + (fnv1a32(seed + "|ax|" + ax) % 32); // 62..93
  }
  const overall = Math.round(
    Object.values(axes).reduce((s, v) => s + v, 0) / READING_AXES.length,
  );
  const bestAxis = READING_AXES.reduce((a, b) => (axes[a] >= axes[b] ? a : b));

  const c = picked.map((idx) => TAROT_DECK[idx]);
  const reading =
    "ช่วงที่ผ่านมา " + c[0].m + " มาถึงช่วงนี้ " + c[1].m +
    " และก้าวต่อไป " + c[2].m +
    " เดือนนี้ด้านที่เด่นที่สุดของคุณคือ" + bestAxis;
  const advice = READING_ADVICE[fnv1a32(seed + "|adv") % READING_ADVICE.length];

  const lucky = [
    fnv1a32(seed + "|l1") % 10,
    fnv1a32(seed + "|l2") % 10,
    fnv1a32(seed + "|l3") % 10,
  ];
  const luckyPair = 10 + (fnv1a32(seed + "|lp") % 90);

  const [yy, mm] = monthKey.split("-").map(Number);
  return {
    month: monthKey,
    monthLabel: TH_MONTHS_FULL[mm - 1] + " " + (yy + 543),
    cards,
    overall,
    grade: readingGrade(overall),
    axes,
    bestAxis,
    reading,
    advice,
    lucky,
    luckyPair,
  };
}

/**
 * สรุปดวงจากแอป Ener ของลูกค้าคนนี้ (ชุดเดียวกับที่เห็นใน LIFF — deterministic ต่อคน/วัน/เดือน)
 * ให้สมองแชทใช้ตอบต่อยอดแบบไม่ขัดกัน (กบ 12 ก.ค.: ยึด LIFF เป็นหลัก)
 * @returns {Promise<string|null>} บรรทัด facts หรือ null เมื่อไม่มีวันเกิด
 */
export async function buildLiffReadingFactsForChat(lineUserId) {
  try {
    const uid = String(lineUserId || "").trim();
    if (!uid) return null;
    let birth = null;
    try {
      const { data } = await supabase
        .from("liff_profiles")
        .select("birthdate,birth_time")
        .eq("line_user_id", uid)
        .maybeSingle();
      if (data?.birthdate) birth = { birthdate: data.birthdate, birthTime: data.birth_time };
    } catch {}
    if (!birth) {
      const iso = await resolveBirthdateIso(uid, null);
      if (iso) birth = { birthdate: iso, birthTime: null };
    }
    const daily = buildDaily(uid, Date.now(), birth);
    const monthly = buildMonthlyReading(uid, birth?.birthdate || "");
    const cardsTxt = monthly.cards.map((c) => `${c.pos}: ${c.n} (${c.k})`).join(", ");
    return [
      `ดวงจากแอป Ener ของลูกค้าคนนี้ (ลูกค้าเห็นชุดเดียวกันในแอป — ยึดตามนี้):`,
      `  วันนี้: คะแนน ${daily.score}/100 เลขนำโชค ${daily.luckyNums.join(" ")} สีมงคล ${daily.luckyColor?.name || "-"} สีเลี่ยง ${daily.banColor?.[0] || daily.banColor?.name || "-"} — ${daily.message}`,
      `  เดือนนี้ (${monthly.monthLabel}): คะแนนรวม ${monthly.overall}/100 ด้านเด่น ${monthly.bestAxis} ไพ่ ${cardsTxt}`,
      `  คำอ่านเดือนนี้: ${monthly.reading}`,
      `  เคล็ดเสริมดวง: ${monthly.advice}`,
      `  เลขนำโชคเดือนนี้: ${monthly.lucky.join(" ")} และ ${monthly.luckyPair}`,
    ].join("\n");
  } catch {
    return null;
  }
}

liffRouter.get("/api/liff/reading", async (req, res) => {
  const userId = await requireLiffUser(req, res);
  if (!userId) return;
  try {
    const { data, error } = await supabase
      .from("liff_profiles")
      .select("nickname,birthdate")
      .eq("line_user_id", userId)
      .maybeSingle();
    if (error) throw error;
    // birthdate = one shared dataset: prefer LIFF, else the OA scan store.
    const bdIso = await resolveBirthdateIso(userId, data?.birthdate || null);
    if (!data && !bdIso) return res.json({ ok: true, needsProfile: true });
    if (!bdIso) return res.json({ ok: true, needsBirthdate: true });
    const astro = thaiAstroFromBirthdate(bdIso);
    const reading = buildMonthlyReading(userId, bdIso);
    res.json({ ok: true, nickname: data?.nickname || "", astro, ...reading });
  } catch (e) {
    console.error(JSON.stringify({ event: "LIFF_READING_ERROR", message: String(e?.message || e).slice(0, 200) }));
    res.status(500).json({ ok: false, error: "reading_error" });
  }
});

/* ---------------- scan stats (home hero card) ---------------- */

/** Short axis chip label: "โชคลาภและการเปิดทาง" → "โชคลาภ". */
function shortAxisLabel(label) {
  return String(label || "").split("และ")[0].trim();
}

/**
 * Aggregate the user's whole scan library (all lanes: amulet / bracelet /
 * moldavite): count, best /10 energy score, strongest + weakest axis.
 */
function aggregateScanAxes(rows) {
  let scanned = 0;
  let topScore = null;
  const axisMax = new Map(); // label → best score seen (0-100)
  for (const r of rows || []) {
    const p = r?.report_payload_json;
    if (!p || typeof p !== "object") continue;
    const lane = p.amuletV1 || p.crystalBraceletV1 || p.moldaviteV1;
    if (!lane) continue;
    scanned++;
    const es = Number(p.summary?.energyScore);
    if (Number.isFinite(es) && (topScore == null || es > topScore)) topScore = es;
    const cats = lane.powerCategories || lane.axes || null;
    if (cats && typeof cats === "object") {
      for (const k of Object.keys(cats)) {
        const s = Number(cats[k]?.score);
        const label = shortAxisLabel(cats[k]?.labelThai || k);
        if (!Number.isFinite(s) || !label) continue;
        const prev = axisMax.get(label);
        if (prev == null || s > prev) axisMax.set(label, s);
      }
    }
  }
  let bestAxis = null, weakAxis = null;
  for (const [label, s] of axisMax) {
    if (!bestAxis || s > bestAxis.score) bestAxis = { label, score: s };
    if (!weakAxis || s < weakAxis.score) weakAxis = { label, score: s };
  }
  return { scanned, topScore, bestAxis, weakAxis };
}

/** สิทธิ์เหลือรวม: แพ็กจ่ายเงิน (ถ้ายังไม่หมดอายุ) + ฟรีที่เหลือของวันนี้. */
async function getRemainingScans(userId) {
  try {
    const { data } = await supabase
      .from("app_users")
      .select("id,paid_remaining_scans,paid_until,free_scan_daily_offset,free_scan_offset_date")
      .eq("line_user_id", userId)
      .maybeSingle();
    if (!data) return { total: 0, freeLeft: 0, paidLeft: 0 };
    const now = new Date();
    const paidOk = data.paid_until && new Date(data.paid_until).getTime() > now.getTime();
    const paidLeft = paidOk ? Math.max(0, Number(data.paid_remaining_scans) || 0) : 0;

    // ฟรีรายวัน: quota - จำนวนสแกนวันนี้ (บวก offset ที่ admin ชดเชย) — ตอนแพ็ก
    // จ่ายเงิน active โควต้าฟรีถูกกันไว้ ไม่โดนนับ
    const { loadActiveScanOffer } = await import("../services/scanOffer.loader.js");
    const { countScanResultsTodayForAppUser, getLocalDateKey } = await import(
      "../stores/paymentAccess.db.js"
    );
    const freeQuota = Number(loadActiveScanOffer(now)?.freeQuotaPerDay) || 2;
    let freeLeft = freeQuota;
    if (!paidOk) {
      let used = await countScanResultsTodayForAppUser(String(data.id), now).catch(() => 0);
      const offsetDate = data.free_scan_offset_date
        ? String(data.free_scan_offset_date).slice(0, 10)
        : null;
      const offsetN = Number(data.free_scan_daily_offset) || 0;
      if (offsetDate && offsetDate === getLocalDateKey(now) && offsetN > 0) {
        used = Math.max(0, used - offsetN);
      }
      freeLeft = Math.max(0, freeQuota - used);
    }
    return { total: paidLeft + freeLeft, freeLeft, paidLeft };
  } catch {
    return { total: 0, freeLeft: 0, paidLeft: 0 };
  }
}

liffRouter.get("/api/liff/stats", async (req, res) => {
  const userId = await requireLiffUser(req, res);
  if (!userId) return;
  try {
    const [rows, remaining] = await Promise.all([
      listScanResultsV2PayloadRowsForLineUser(userId, 150),
      getRemainingScans(userId),
    ]);
    const agg = aggregateScanAxes(rows);
    res.json({
      ok: true,
      scanned: agg.scanned,
      remaining: remaining.total,
      remainingFree: remaining.freeLeft,
      remainingPaid: remaining.paidLeft,
      topScore: agg.topScore,
      bestAxis: agg.bestAxis ? agg.bestAxis.label : null,
    });
  } catch (e) {
    console.error(JSON.stringify({ event: "LIFF_STATS_ERROR", message: String(e?.message || e).slice(0, 200) }));
    res.status(500).json({ ok: false, error: "stats_error" });
  }
});

/* ---------------- ชิ้นไหนหนุนดวงวันนี้ (Daily Pick) ---------------- */

/** ของตั้งบูชา (พกไม่ได้): ดูจากหมวดที่เก็บใน payload + คำในชื่อ — ของเก่าไม่รู้ = null */
function pickPortability(objectType, name) {
  const t = (String(objectType || "") + " " + String(name || "")).trim();
  if (/บูชา|รูปปั้น|รูปหล่อ|เทวรูป|องค์เทพ|กุมาร|ฤๅษี|ฤาษี|ครุฑ|เวสสุวรรณ|พิฆเนศ/.test(t)) return "altar";
  if (/พระเครื่อง|เครื่องราง|ตะกรุด|คริสตัล|หิน|กำไล/.test(t)) return "carry";
  return null; // ของเก่าที่ยังไม่มีหมวด — ใช้คำกลาง
}

/** ดึงชิ้นงานจากคลังสแกน (dedupe ชิ้นซ้ำ เอารายการล่าสุด) */
function extractPickPieces(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const p = r?.report_payload_json;
    if (!p || typeof p !== "object") continue;
    const laneObj = p.amuletV1 || p.crystalBraceletV1 || p.moldaviteV1;
    if (!laneObj) continue;
    const isCrystal = Boolean(p.crystalBraceletV1 || p.moldaviteV1);
    const laneLabel = p.amuletV1 ? "พระ/เทวรูป/เครื่องราง" : p.crystalBraceletV1 ? "กำไล/หิน" : "มอลดาไวท์";
    const es = Number(p.summary?.energyScore);
    const compat = Number(p.summary?.compatibilityPercent);
    const cats = laneObj.powerCategories || laneObj.axes || {};
    let peak = null;
    for (const k of Object.keys(cats)) {
      const sc = Number(cats[k]?.score);
      const label = shortAxisLabel(cats[k]?.labelThai || k);
      if (Number.isFinite(sc) && label && (!peak || sc > peak.score)) peak = { label, score: sc };
    }
    const name =
      String(laneObj.flexSurface?.heroNamingLine || p.flexSurface?.heroNamingLine || "").trim() ||
      laneLabel;
    const key = name + "|" + (Number.isFinite(es) ? Math.round(es * 10) : "x") + "|" + (peak ? peak.label : "-");
    if (seen.has(key)) continue;
    seen.add(key);
    // กำไล/หิน = พกได้แน่นอน; สายพระใช้หมวดที่เก็บไว้ + คำในชื่อ
    const portability = isCrystal ? "carry" : pickPortability(p.object?.objectType, name);
    // รูปจริงของชิ้นจากตอนสแกน — เจ้าของเห็นรูปก็รู้ทันทีว่าชิ้นไหน ไม่ต้องระบุว่าเป็นพระอะไร
    const imgRaw = String(p.object?.objectImageUrl || "").trim();
    out.push({
      name,
      img: /^https:\/\//i.test(imgRaw) ? imgRaw : null,
      energyScore: Number.isFinite(es) ? es : null,
      compatPct: Number.isFinite(compat) ? compat : null,
      peakLabel: peak ? peak.label : null,
      portability,
    });
  }
  return out;
}

const PICK_ACTION_HINT = {
  carry: "พกติดตัวได้เลย",
  altar: "ชิ้นนี้เป็นของบูชา ตั้งจิตหรือไหว้ที่บ้านก่อนออกเดินทาง",
  unknown: "พกติดตัว หรืออาราธนาก่อนออกจากบ้านก็ได้",
};

// พูลประโยคเหตุผล — หมุนตาม (วัน, ชิ้น) ไม่ให้เห็นประโยคซ้ำในสัปดาห์เดียว (กบ: template ซ้ำ = ดูเป็นเครื่อง)
const PICK_REASON_ALIGNED = [
  (star, ax) => `วันนี้${star}หนุนด้าน${ax} ชิ้นนี้พลังเด่นตรงจังหวะพอดี`,
  (star, ax) => `${star}เปิดทางเรื่อง${ax}วันนี้ ชิ้นนี้รับพลังช่วงนี้ได้เต็มที่`,
  (star, ax) => `จังหวะ${ax}กำลังเด่นตาม${star} ชิ้นนี้คือตัวรับพลังของวันนี้`,
  (star, ax) => `${star}ส่งแรงด้าน${ax}มาทั้งวัน ชิ้นนี้พลังตรงสายพอดี`,
  (star, ax) => `วันนี้เรื่อง${ax}มีลุ้นเป็นพิเศษ ชิ้นนี้เสริมตรงจุดเลย`,
  (star, ax) => `${star}คุมวันนี้และถูกโฉลกกับด้าน${ax} ชิ้นนี้เลยขึ้นแท่น`,
];
const PICK_REASON_PLAIN = [
  (ax) => `พลังเด่นด้าน${ax} ช่วยประคองจังหวะวันนี้ได้ดี`,
  (ax) => `ด้าน${ax}ของชิ้นนี้ช่วยให้วันนี้ราบรื่นขึ้น`,
  (ax) => `ชิ้นนี้ถนัดเรื่อง${ax} เข้ากับโจทย์ของวันนี้`,
  (ax) => `เสริม${ax}ไว้ทั้งวัน เดินเรื่องไหนก็ลื่นขึ้น`,
  (ax) => `พลัง${ax}ของชิ้นนี้เข้ากับโทนของวันพอดี`,
];
const PICK_REASON_GENERIC = [
  "พลังโดยรวมเข้ากับจังหวะวันนี้",
  "คลื่นพลังของชิ้นนี้นิ่ง เข้ากับวันนี้",
  "โทนพลังกลมกล่อม พาวันนี้ไปได้เรื่อย ๆ",
];

/** จัดอันดับ — deterministic ต่อวัน (เปิดซ้ำผลไม่เปลี่ยน); wd = วันในสัปดาห์ของ dayKey นั้น */
function rankPickPieces(pieces, dayKey, wd) {
  const todayCircle = WEEKDAY_TO_CIRCLE[wd];
  const guide = MATCH_GUIDE[todayCircle] || MATCH_GUIDE[0];
  const dayStar = String(guide.star || "").split(" ")[0] || "ดาววันนี้";
  const dayPowers = (guide.recs || []).map((rc) => shortAxisLabel(rc[0]));
  const ranked = pieces.map((pc) => {
    const aligned = pc.peakLabel && dayPowers.includes(pc.peakLabel);
    const raw =
      (pc.compatPct != null ? pc.compatPct : 68) * 0.45 +
      (pc.energyScore != null ? pc.energyScore : 6) * 10 * 0.3 +
      (aligned ? 22 : 0) +
      (fnv1a32(dayKey + "|pick|" + pc.name + "|" + (pc.peakLabel || "")) % 9);
    const suit = Math.max(55, Math.min(97, Math.round(raw)));
    const rsnSeed = fnv1a32(dayKey + "|rsn|" + pc.name + "|" + (pc.peakLabel || ""));
    const base = aligned
      ? PICK_REASON_ALIGNED[rsnSeed % PICK_REASON_ALIGNED.length](dayStar, pc.peakLabel)
      : pc.peakLabel
        ? PICK_REASON_PLAIN[rsnSeed % PICK_REASON_PLAIN.length](pc.peakLabel)
        : PICK_REASON_GENERIC[rsnSeed % PICK_REASON_GENERIC.length];
    const hint = PICK_ACTION_HINT[pc.portability || "unknown"];
    return { ...pc, suit, aligned, reason: base + " " + hint };
  });
  ranked.sort((a, b) => b.suit - a.suit);
  return { ranked, dayStar };
}

/** คีย์เทียบชิ้นข้ามวัน (ชื่อ+ด้านเด่น — ชุดเดียวกับ dedupe) */
function pickPieceKey(pc) {
  return pc.name + "|" + (pc.peakLabel || "-");
}

liffRouter.get("/api/liff/daily-pick", async (req, res) => {
  const userId = await requireLiffUser(req, res);
  if (!userId) return;
  try {
    const rows = await listScanResultsV2PayloadRowsForLineUser(userId, 100);
    const pieces = extractPickPieces(rows);
    if (!pieces.length) return res.json({ ok: true, empty: true });

    const nowBkk = new Date(Date.now() + 7 * 3600 * 1000);
    const dayKey = bangkokDateKey();
    const { ranked, dayStar } = rankPickPieces(pieces, dayKey, nowBkk.getUTCDay());

    // ป้าย "ขึ้นจากเมื่อวาน": จัดอันดับของเมื่อวานด้วยสูตรเดิม (deterministic ไม่ต้องเก็บ state)
    const yBkk = new Date(nowBkk.getTime() - 86400000);
    const yKey = yBkk.toISOString().slice(0, 10);
    const { ranked: rankedY } = rankPickPieces(pieces, yKey, yBkk.getUTCDay());
    const posY = new Map(rankedY.map((pc, i) => [pickPieceKey(pc), i]));
    ranked.forEach((pc, i) => {
      const prev = posY.get(pickPieceKey(pc));
      pc.moved = prev == null ? "same" : prev > i ? "up" : prev < i ? "down" : "same";
    });

    // streak เปิดต่อเนื่อง (redis, พลาดได้ไม่พัง)
    let streak = 1;
    try {
      const raw = await getValue(`liff:pickstreak:${userId}`);
      const [lastKey, nRaw] = String(raw || "").split("|");
      const n = Number(nRaw) || 0;
      if (lastKey === dayKey) streak = Math.max(1, n);
      else if (lastKey === yKey) streak = n + 1;
      await setValueWithTtl(`liff:pickstreak:${userId}`, `${dayKey}|${streak}`, 3 * 24 * 3600);
    } catch {}

    // สมาชิกรายเดือน (ไม่จำกัด) = เทียบทั้งตู้ / อื่น ๆ = เห็นเฉพาะชิ้นล่าสุด
    let isMember = false;
    try {
      const { data: u } = await supabase
        .from("app_users")
        .select("paid_until,paid_remaining_scans")
        .eq("line_user_id", userId)
        .maybeSingle();
      isMember = Boolean(
        u?.paid_until &&
          new Date(u.paid_until).getTime() > Date.now() &&
          Number(u.paid_remaining_scans) >= 900000,
      );
    } catch {}

    if (isMember) {
      return res.json({ ok: true, member: true, dayStar, streak, total: ranked.length, items: ranked.slice(0, 3) });
    }
    const latestName = pieces[0]?.name;
    const latestRanked = ranked.find((x) => x.name === latestName) || ranked[0];
    return res.json({
      ok: true,
      member: false,
      dayStar,
      streak,
      total: ranked.length,
      items: [latestRanked],
      lockedCount: Math.max(0, ranked.length - 1),
    });
  } catch (e) {
    console.error(JSON.stringify({ event: "LIFF_DAILY_PICK_ERROR", message: String(e?.message || e).slice(0, 200) }));
    res.status(500).json({ ok: false, error: "daily_pick_error" });
  }
});

/* ---------------- หาเครื่องรางที่เข้ากับดวง (ตำราทักษา) ---------------- */

/** Wheel position label for humans; ราหู = คนเกิดพุธกลางคืน. */
function circleDayLabel(idx) {
  return idx === 6 ? "พุธกลางคืน" : TAKSA_CIRCLE[idx];
}

/** Inverse of WEEKDAY_TO_CIRCLE (wheel idx → JS weekday); ราหู(6) has none. */
const CIRCLE_TO_WEEKDAY = [0, 1, 2, 3, 6, 4, -1, 5];

/** Per-birth-star guide: พระประจำวัน + สายเครื่องราง + หินมงคล (สีตามวัน). */
const MATCH_GUIDE = [
  { buddha: "พระปางถวายเนตร", star: "ดาวอาทิตย์ ดาวแห่งผู้นำและเกียรติยศ ใจถึง รับผิดชอบสูง",
    recs: [["บารมีและอำนาจนำ", "หนุนความเป็นผู้นำที่มีอยู่ให้คนยอมรับ เหมาะคนคุมงาน คุมทีม"], ["คุ้มครองป้องกัน", "คนเด่นย่อมมีทั้งคนรักและคนอิจฉา มีของคุ้มกันไว้ เดินหน้าได้สบายใจ"]],
    stones: [["การ์เนต", "#9e3039"], ["คาร์เนเลียน", "#d0663a"], ["ซันสโตน", "#e8955c"]] },
  { buddha: "พระปางห้ามญาติ", star: "ดาวจันทร์ ดาวแห่งเสน่ห์และจิตใจ ละเอียดอ่อน คนเมตตา",
    recs: [["เมตตามหานิยม", "เสริมเสน่ห์ที่มีติดตัวให้แรงขึ้น เจรจา ค้าขาย ขอความช่วยเหลือ ลื่นไหล"], ["หนุนดวง", "ใจที่อ่อนโยนบางทีก็ไหวตามคนอื่นง่าย ของหนุนดวงช่วยให้ใจนิ่ง มีหลักยึด"]],
    stones: [["มูนสโตน", "#e8e3d8"], ["ซิทริน", "#e6c34a"], ["ไข่มุก", "#f1ece2"]] },
  { buddha: "พระปางไสยาสน์", star: "ดาวอังคาร ดาวนักสู้ กล้าลุย ไม่ถอยง่าย ๆ",
    recs: [["คุ้มครองป้องกัน", "สายลุยต้องมีเกราะ ของคุ้มครองคือคู่กายคนเกิดวันอังคารตามตำรา"], ["บารมีและอำนาจนำ", "แปลงความกล้าเป็นบารมี ให้คนเกรงใจแบบนับถือ ไม่ใช่แค่เกรงกลัว"]],
    stones: [["โรสควอตซ์", "#e8a8bf"], ["อเมทิสต์", "#8a63b8"], ["โรโดไนต์", "#c66a80"]] },
  { buddha: "พระปางอุ้มบาตร", star: "ดาวพุธ ดาวแห่งการเจรจาและค้าขาย หัวไว ปรับตัวเก่ง",
    recs: [["โชคลาภและการเปิดทาง", "คนพุธจังหวะดีอยู่แล้ว ของเปิดทางช่วยให้โอกาสวิ่งเข้าถี่ขึ้น"], ["เมตตามหานิยม", "เสริมปากเสียงที่เป็นทุนเดิม พูดอะไรคนอยากฟัง ค้าขายยิ่งขึ้น"]],
    stones: [["หยก", "#4c9e6b"], ["กรีนอะเวนจูรีน", "#6db98a"], ["เพอริดอท", "#a8c862"]] },
  { buddha: "พระปางนาคปรก", star: "ดาวเสาร์ ดาวแห่งความอดทนและความหนักแน่น ยิ่งนาน ยิ่งแกร่ง",
    recs: [["คุ้มครองป้องกัน", "นาคปรกคุ้มคนเกิดวันเสาร์โดยตรงตามตำรา กันเรื่องหนักให้ผ่านเบา"], ["หนุนดวง", "ช่วงไหนรู้สึกฝืด ของหนุนดวงช่วยพยุงจังหวะให้เดินต่อได้ไม่สะดุด"]],
    stones: [["อเมทิสต์", "#8a63b8"], ["ออนิกซ์", "#42403c"], ["ออบซิเดียน", "#35333a"]] },
  { buddha: "พระปางสมาธิ", star: "ดาวพฤหัสบดี ดาวครู ปัญญาดี มีหลักคิด คนชอบขอคำปรึกษา",
    recs: [["บารมีและอำนาจนำ", "สายครูบาอาจารย์เข้าทางที่สุด เสริมความน่าเชื่อถือให้คำพูดมีน้ำหนัก"], ["หนุนดวง", "ของสายครูช่วยเปิดปัญญา ตัดสินใจเรื่องใหญ่ได้คมขึ้น"]],
    stones: [["ซิทริน", "#e6c34a"], ["ไทเกอร์อาย", "#b07a3c"], ["แอมเบอร์", "#d89440"]] },
  { buddha: "พระปางป่าเลไลยก์", star: "ดาวราหู ดาวแห่งการพลิกผัน ชีวิตมีจังหวะหักมุม แต่พลิกเป็นโอกาสได้เสมอ",
    recs: [["หนุนดวง", "คนราหูตำราให้เน้นของหนุนดวงแก้ดวงเป็นหลัก ให้จังหวะพลิกไปทางบวก"], ["คุ้มครองป้องกัน", "ช่วงดวงแกว่ง มีของคุ้มไว้ก่อน อุ่นใจกว่า"]],
    stones: [["สโมกกี้ควอตซ์", "#7a6a58"], ["ลาบราดอไรต์", "#5b7a86"], ["ออบซิเดียน", "#35333a"]] },
  { buddha: "พระปางรำพึง", star: "ดาวศุกร์ ดาวแห่งโชคทรัพย์และศิลปะ มีรสนิยม เจ้าเสน่ห์เงียบ ๆ",
    recs: [["โชคลาภและการเปิดทาง", "ดาวศุกร์คือดาวการเงิน ของสายโชคลาภยิ่งเสริมทางทรัพย์ให้ไหลลื่น"], ["เมตตามหานิยม", "บุคลิกละมุนอยู่แล้ว เติมเมตตาอีกนิด ใครเจอก็เอ็นดู"]],
    stones: [["อความารีน", "#7ec4d8"], ["ลาพิสลาซูลี", "#3f6bb5"], ["บลูเลซอาเกต", "#a8cede"]] },
];

/** ราหู has no JS weekday — its own color row (ตำราพุธกลางคืน). */
const RAHU_COLORS = { good: [["สีม่วงเข้ม", "#5b4a86"], ["สีเทาควัน", "#8b8b95"]], ban: { name: "สีเหลืองทอง", hex: "#e6c34a" } };

liffRouter.get("/api/liff/match", async (req, res) => {
  const userId = await requireLiffUser(req, res);
  if (!userId) return;
  try {
    let birthdate = null, birthTime = null;
    try {
      const { data } = await supabase
        .from("liff_profiles")
        .select("birthdate,birth_time")
        .eq("line_user_id", userId)
        .maybeSingle();
      birthdate = data?.birthdate || null;
      birthTime = data?.birth_time || null;
    } catch {}
    const bdIso = await resolveBirthdateIso(userId, birthdate);
    const bIdx = bdIso ? birthCircleIndex(bdIso, birthTime) : null;
    if (bIdx == null) return res.json({ ok: true, needsBirthdate: true });

    const g = MATCH_GUIDE[bIdx];
    const wd = CIRCLE_TO_WEEKDAY[bIdx];
    const colors = wd >= 0 ? DAY_COLORS[wd] : RAHU_COLORS;
    // ตำแหน่งทักษาจากวันเกิด: เดช +2, ศรี +3, มนตรี +6, กาลกิณี +7 รอบวง
    const days = {
      det: circleDayLabel((bIdx + 2) % 8),
      sri: circleDayLabel((bIdx + 3) % 8),
      montri: circleDayLabel((bIdx + 6) % 8),
      kala: circleDayLabel((bIdx + 7) % 8),
    };

    let fromScans = null;
    try {
      const rows = await listScanResultsV2PayloadRowsForLineUser(userId, 150);
      const agg = aggregateScanAxes(rows);
      if (agg.scanned > 0 && agg.bestAxis) {
        fromScans = {
          scanned: agg.scanned,
          have: agg.bestAxis.label,
          boost: agg.weakAxis && agg.weakAxis.label !== agg.bestAxis.label ? agg.weakAxis.label : null,
        };
      }
    } catch {}

    res.json({
      ok: true,
      birthDay: circleDayLabel(bIdx),
      buddha: g.buddha,
      star: g.star,
      recs: g.recs.map(([t, d]) => ({ t, d })),
      stones: g.stones.map(([n, hex]) => ({ n, hex })),
      goodColors: colors.good.map(([name, hex]) => ({ name, hex })),
      banColor: colors.ban,
      days,
      luckyNum: DAY_NUMBER[TAKSA_CIRCLE[bIdx]],
      fromScans,
    });
  } catch (e) {
    console.error(JSON.stringify({ event: "LIFF_MATCH_ERROR", message: String(e?.message || e).slice(0, 200) }));
    res.status(500).json({ ok: false, error: "match_error" });
  }
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
  const userId = await requireLiffUser(req, res);
  if (!userId) return;
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
  const userId = await requireLiffUser(req, res);
  if (!userId) return;
  const b = req.body || {};

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
    // Mirror birthdate into the shared scan store (users.birthdate) so the OA
    // สแกน flow reuses it and never asks again. Best-effort — never fail the save.
    if (row.birthdate) {
      const disp = isoToDisplayBirthdate(row.birthdate);
      if (disp) {
        try {
          await saveBirthdate(userId, disp, { rawBirthdateInput: "liff_onboarding" });
        } catch (mErr) {
          console.error(JSON.stringify({ event: "LIFF_BIRTHDATE_MIRROR_FAIL", message: String(mErr?.message || mErr).slice(0, 160) }));
        }
      }
    }
    console.log(JSON.stringify({ event: "LIFF_PROFILE_SAVED", lineUserIdPrefix: userId.slice(0, 8), isNew: !existing }));
    // Registration Gate: สถานะเปลี่ยนแล้ว — ล้าง cache ทันที (กันบอทตอบ "ยังไม่ลง" ทั้งที่ลงแล้ว)
    try {
      bustRegistrationCache(userId);
    } catch {}
    // ลงทะเบียนใหม่ครบ (ชื่อ+วันเกิด) → บอกในแชทเลยว่าเริ่มใช้ได้ ไม่ต้องเดา
    if (!existing && row.nickname && row.birthdate && row.phone && liffLineClient) {
      pushText(
        liffLineClient,
        userId,
        `ลงทะเบียนเรียบร้อยครับ คุณ${row.nickname}\nส่งรูปพระ เครื่องราง หิน หรือกำไล มาได้เลย เดี๋ยวอาจารย์อ่านให้`,
      ).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(JSON.stringify({ event: "LIFF_PROFILE_SAVE_ERROR", message: String(e?.message || e).slice(0, 200) }));
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

/* ---------------- payment (เติมสิทธิ์สแกน) ----------------
 * Same pipeline as the chat slip flow: createPaymentPending → EasySlip
 * auto-approval orchestrator → unlock; only the transport (HTTP upload
 * instead of a chat image) differs. LINE push keeps the chat in sync. */

const LIFF_SLIP_MAX_BYTES = 8 * 1024 * 1024;

function packageForApi(p) {
  return {
    key: p.key,
    priceThb: p.priceThb,
    scanCount: p.scanCount,
    windowHours: p.windowHours,
    label: p.label,
  };
}

liffRouter.get("/api/liff/pay/info", async (req, res) => {
  const userId = await requireLiffUser(req, res);
  if (!userId) return;
  try {
    const offer = loadActiveScanOffer();
    const packages = (offer.packages || []).filter((p) => p.active);
    const [payment, access] = await Promise.all([
      getLatestAwaitingPaymentForLineUserId(userId).catch(() => null),
      checkScanAccess({ userId }).catch(() => null),
    ]);
    res.json({
      ok: true,
      packages: packages.map(packageForApi),
      defaultPackageKey: offer.defaultPackageKey,
      qrUrl: getPromptPayQrPublicUrl() || null,
      payment: payment
        ? {
            status: String(payment.status || ""),
            paymentRef: payment.payment_ref || null,
            amount: payment.expected_amount ?? payment.amount ?? null,
            packageCode: payment.package_code || null,
          }
        : null,
      access: access
        ? {
            allowed: Boolean(access.allowed),
            paidRemainingScans: access.paidRemainingScans ?? null,
          }
        : null,
    });
  } catch (e) {
    console.error(JSON.stringify({ event: "LIFF_PAY_INFO_ERROR", message: String(e?.message || e).slice(0, 200) }));
    res.status(500).json({ ok: false, error: "pay_info_error" });
  }
});

liffRouter.post("/api/liff/pay/create", express.json(), async (req, res) => {
  const userId = await requireLiffUser(req, res);
  if (!userId) return;
  try {
    const offer = loadActiveScanOffer();
    const packages = (offer.packages || []).filter((p) => p.active);
    const wantKey = String(req.body?.packageKey || "").trim();
    const pkg =
      packages.find((p) => p.key === wantKey) ||
      packages.find((p) => p.key === offer.defaultPackageKey) ||
      packages[0];
    if (!pkg) return res.status(409).json({ ok: false, error: "no_active_package" });

    // Reuse an open payment for the same package instead of piling up rows
    // (the chat flow may already have one going).
    const existing = await getLatestAwaitingPaymentForLineUserId(userId).catch(() => null);
    if (existing?.id && String(existing.status || "") === "pending_verify") {
      return res.json({ ok: true, result: "pending_verify", paymentRef: existing.payment_ref || null });
    }
    let paymentId = null;
    let paymentRef = null;
    if (
      existing?.id &&
      String(existing.status || "") === "awaiting_payment" &&
      Number(existing.expected_amount ?? existing.amount) === Number(pkg.priceThb)
    ) {
      paymentId = existing.id;
      paymentRef = existing.payment_ref || (await ensurePaymentRefForPaymentId(existing.id).catch(() => null));
    } else {
      const appUser = await ensureUserByLineUserId(userId);
      const created = await createPaymentPending({
        appUserId: appUser.id,
        amount: pkg.priceThb,
        currency: process.env.PAYMENT_UNLOCK_CURRENCY || "THB",
        packageCode: pkg.key,
        packageName: pkg.label,
        expectedAmount: pkg.priceThb,
        unlockHours: pkg.windowHours,
      });
      paymentId = created?.paymentId ?? null;
      paymentRef = created?.paymentRef ?? null;
    }
    if (!paymentId) return res.status(500).json({ ok: false, error: "payment_create_failed" });
    setAwaitingPayment(userId);
    console.log(JSON.stringify({
      event: "LIFF_PAYMENT_CREATED",
      lineUserIdPrefix: userId.slice(0, 8),
      paymentId,
      packageKey: pkg.key,
    }));
    res.json({
      ok: true,
      result: "created",
      paymentId,
      paymentRef,
      amount: pkg.priceThb,
      packageLabel: pkg.label,
      qrUrl: getPromptPayQrPublicUrl() || null,
    });
  } catch (e) {
    console.error(JSON.stringify({ event: "LIFF_PAY_CREATE_ERROR", message: String(e?.message || e).slice(0, 200) }));
    res.status(500).json({ ok: false, error: "pay_create_error" });
  }
});

liffRouter.post(
  "/api/liff/pay/slip",
  express.json({ limit: "12mb" }),
  async (req, res) => {
    const userId = await requireLiffUser(req, res);
    if (!userId) return;
    try {
      const b64 = String(req.body?.imageBase64 || "").replace(/^data:image\/\w+;base64,/, "");
      if (!b64) return res.status(400).json({ ok: false, error: "missing_image" });
      const imageBuffer = Buffer.from(b64, "base64");
      if (imageBuffer.length < 5 * 1024 || imageBuffer.length > LIFF_SLIP_MAX_BYTES) {
        return res.status(400).json({ ok: false, error: "bad_image_size" });
      }

      const payment = await getLatestAwaitingPaymentForLineUserId(userId).catch(() => null);
      if (!payment?.id) return res.status(409).json({ ok: false, error: "no_payment" });
      const paymentId = payment.id;
      const slipMessageId = `liff_${Date.now()}`;

      const slipVal = await evaluateAwaitingPaymentSlipImage({
        imageBuffer,
        userId,
        paymentId,
        messageId: slipMessageId,
        flowState: "awaiting_payment",
      });
      if (!slipVal.proceed) return res.json({ ok: true, result: "not_slip" });

      const slipUrl = await uploadSlipImageToStorage({
        buffer: imageBuffer,
        lineUserId: userId,
        paymentId,
        slipMessageId,
      });
      await setPaymentSlipPendingVerify({ paymentId, slipUrl, slipMessageId });

      const approvalFlow = await runSlipAutoApprovalAfterGateAccept({
        userId,
        paymentId,
        imageBuffer,
        payment: { ...(payment || {}), id: paymentId, status: "pending_verify" },
        updatePaymentFields: updatePaymentSlipVerificationFields,
      });

      if (approvalFlow.mode === "auto_approved") {
        const rowAfter = await getLatestAwaitingPaymentForLineUserId(userId).catch(() => null);
        if (String(rowAfter?.status || "").trim().toLowerCase() !== "paid") {
          await markPaymentApprovedAndUnlock({ paymentId, approvedBy: "slip_auto_liff" });
        }
        // Keep chat-side conversation state in sync (same as the webhook path).
        try {
          const appUser = await ensureUserByLineUserId(userId);
          const existingCs = await getConversationStateByLineUserId(userId).catch(() => null);
          if (appUser?.id) {
            await upsertConversationState({
              line_user_id: userId,
              app_user_id: String(appUser.id),
              flow_state: existingCs?.flow_state ?? null,
              payment_state: "paid_active_scan_ready",
              pending_upload_id: existingCs?.pending_upload_id ?? null,
              selected_package_key: existingCs?.selected_package_key ?? null,
              birthdate_change_state: existingCs?.birthdate_change_state ?? null,
              reply_token_spent: Boolean(existingCs?.reply_token_spent),
              pending_approved_intro_compensation:
                existingCs?.pending_approved_intro_compensation ?? null,
              last_inbound_at: existingCs?.last_inbound_at ?? null,
              updated_at: new Date().toISOString(),
            });
          }
        } catch (csErr) {
          console.error(JSON.stringify({
            event: "LIFF_SLIP_APPROVE_CS_SYNC_FAILED",
            paymentId,
            message: String(csErr?.message || csErr).slice(0, 160),
          }));
        }
        clearPaymentState(userId);
        if (liffLineClient) {
          const swPkg = approvalFlow.switchedPackage || null;
          pushText(
            liffLineClient,
            userId,
            swPkg
              ? buildSlipPackageSwitchedApprovedText(swPkg)
              : "✅ ตรวจสลิปเรียบร้อยครับ อาจารย์เปิดสิทธิ์สแกนให้แล้ว\n✨ ส่งรูปพระ เครื่องราง หิน หรือกำไล เข้ามาได้เลยครับ",
          ).catch(() => {});
        }
        console.log(JSON.stringify({ event: "LIFF_SLIP_AUTO_APPROVED", paymentId }));
        return res.json({ ok: true, result: "approved" });
      }

      clearPaymentState(userId);
      let payRef = null;
      try {
        payRef = payment.payment_ref || (await ensurePaymentRefForPaymentId(paymentId));
      } catch { payRef = null; }
      if (liffLineClient) {
        maybeNotifyAdminSlipPendingVerify({
          client: liffLineClient,
          lineUserId: userId,
          paymentId,
          paymentRef: payRef,
          packageKey: payment?.package_code || undefined,
          slipUrl,
          reasons: approvalFlow?.reasons || [],
        }).catch(() => {});
        pushText(
          liffLineClient,
          userId,
          "🙏 รับสลิปแล้วครับ กำลังตรวจกับธนาคารอยู่\n⏳ เสร็จเมื่อไหร่อาจารย์จะรีบเปิดสิทธิ์แล้วแจ้งในแชตทันทีครับ",
        ).catch(() => {});
      }
      console.log(JSON.stringify({ event: "LIFF_SLIP_PENDING_VERIFY", paymentId }));
      return res.json({ ok: true, result: "pending" });
    } catch (e) {
      console.error(JSON.stringify({ event: "LIFF_PAY_SLIP_ERROR", message: String(e?.message || e).slice(0, 200) }));
      res.status(500).json({ ok: false, error: "pay_slip_error" });
    }
  },
);

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
<title>Ener</title>
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>
  :root{
    --bg:#faf8f3; --card:#ffffff; --card2:#fdf9f0; --card3:#faf4e6;
    --hero-a:#fffdf7; --hero-b:#faf3e3; --line:#efe8d9; --line-gold:#e2d3b0;
    --gold:#c9a35c; --gold-deep:#a5813a; --gold-hi:#e3c98f;
    --btn-a:#e3c98f; --btn-b:#c9a35c; --btn-c:#b08a40;
    --ink:#37332b; --sub:#8b8577; --faint:#b8b1a0;
    --shadow:0 12px 32px -18px rgba(165,129,58,.28);
  }
  /* ---- โทนสีเลือกได้ (บันทึกใน localStorage เครื่องลูกค้า) ---- */
  html[data-lt="plum"]{
    --bg:#f8f2ee; --card:#ffffff; --card2:#fbf2ec; --card3:#f6e9e0;
    --hero-a:#fdf7f2; --hero-b:#f7ebe2; --line:#eee0d6; --line-gold:#dfc3ad;
    --gold:#b98a4a; --gold-deep:#8c4a50; --gold-hi:#e0bc8a;
    --btn-a:#a05a62; --btn-b:#7c3a44; --btn-c:#5e2830;
    --ink:#3b2b2b; --sub:#8d7370; --faint:#b8a49e;
    --shadow:0 12px 32px -18px rgba(124,58,68,.28);
  }
  html[data-lt="blue"]{
    --bg:#f2f6f9; --card:#ffffff; --card2:#f3f8fb; --card3:#e8f0f5;
    --hero-a:#f8fbfd; --hero-b:#eaf2f7; --line:#e2eaef; --line-gold:#c6d7e1;
    --gold:#5b87a3; --gold-deep:#1f4a66; --gold-hi:#a9c4d4;
    --btn-a:#6f9cb8; --btn-b:#3f6b8a; --btn-c:#24506e;
    --ink:#20313c; --sub:#647a89; --faint:#9db0bc;
    --shadow:0 12px 32px -18px rgba(31,74,102,.26);
  }
  html[data-lt="dark"]{
    --bg:#121214; --card:#1c1c1f; --card2:#232327; --card3:#2b2b30;
    --hero-a:#26262b; --hero-b:#1e1e22; --line:#323238; --line-gold:#45454c;
    --gold:#9a9aa2; --gold-deep:#e6e6ea; --gold-hi:#55555c;
    --btn-a:#f0f0f2; --btn-b:#d5d5da; --btn-c:#b4b4bb;
    --ink:#ececef; --sub:#a5a5ae; --faint:#6f6f78;
    --shadow:0 12px 32px -18px rgba(0,0,0,.65);
  }
  html[data-lt="white"]{
    --bg:#ffffff; --card:#ffffff; --card2:#fafafa; --card3:#f3f3f3;
    --hero-a:#fcfcfc; --hero-b:#f4f4f4; --line:#ececec; --line-gold:#dddddd;
    --gold:#6b6b6b; --gold-deep:#1c1917; --gold-hi:#cfcfcf;
    --btn-a:#4a4a4a; --btn-b:#2d2d2d; --btn-c:#141414;
    --ink:#1c1917; --sub:#6e6e6e; --faint:#a8a8a8;
    --shadow:0 12px 30px -18px rgba(0,0,0,.14);
  }
  html[data-lt="dark"] .stgo, html[data-lt="dark"] .readbtn, html[data-lt="dark"] .goldbtn{color:#141416}
  html[data-lt="dark"] .stgo svg, html[data-lt="dark"] .readbtn svg{stroke:#141416!important}
  /* sparkline follows the theme */
  #sp-line{stroke:var(--gold)}
  #sp-dot{fill:var(--gold-deep)}
  #sp-dot-prev{stroke:var(--gold);fill:var(--card)}
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
  button{font:inherit;border:none;cursor:pointer;color:inherit;-webkit-appearance:none;appearance:none}

  .apphead{display:flex;align-items:center;justify-content:space-between}
  .lg{font-size:1.9rem;color:var(--gold-deep);letter-spacing:.05em}
  .mywrap{display:flex;align-items:center;gap:8px}
  .mybtn{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:9px 16px;font-size:.86rem;color:var(--gold-deep);font-weight:700}

  .greet small{color:var(--sub);font-size:.95rem}
  .greet .nm{font-weight:800;font-size:1.55rem;line-height:1.3}
  .greet .ds{color:var(--sub);font-size:.92rem;margin-top:2px}

  .score{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:20px;box-shadow:var(--shadow);position:relative;overflow:hidden}
  .score::before{content:"";position:absolute;right:-40px;top:-60px;width:200px;height:200px;border-radius:50%;
    background:radial-gradient(closest-side, color-mix(in srgb, var(--gold) 16%, transparent), transparent 70%)}
  /* WOW layer: breathing glow + drifting sparkles + shimmer sweep */
  .score .fx{position:absolute;color:var(--gold);pointer-events:none;opacity:.55;font-size:13px}
  .score .f1{right:26px;top:20px;font-size:17px}
  .score .f2{right:64px;top:52px;font-size:10px}
  .score .f3{right:38px;top:84px}
  .score .f4{left:20px;bottom:66px;font-size:9px;opacity:.35}
  @media (prefers-reduced-motion:no-preference){
    .score::before{animation:breathe 3.8s ease-in-out infinite}
    @keyframes breathe{0%,100%{transform:scale(1);opacity:.75}50%{transform:scale(1.18);opacity:1}}
    .score .fx{animation:twinkle 2.6s ease-in-out infinite}
    .score .f2{animation-delay:.7s}
    .score .f3{animation-delay:1.3s}
    .score .f4{animation-delay:1.9s}
    @keyframes twinkle{0%,100%{opacity:.15;transform:scale(.7) rotate(0deg)}50%{opacity:.9;transform:scale(1.15) rotate(24deg)}}
    .score::after{content:"";position:absolute;top:0;bottom:0;left:-70%;width:45%;pointer-events:none;
      background:linear-gradient(100deg,transparent,rgba(233,207,147,.16) 50%,transparent);
      animation:sweep 4.6s ease-in-out infinite}
    @keyframes sweep{0%,55%{left:-70%}85%,100%{left:130%}}
    .score .num{transition:none}
  }
  .score .k{font-size:1.02rem;font-weight:800}
  .score .k small{display:block;font-weight:500;color:var(--faint);font-size:.82rem;margin-top:2px}
  /* Daily Pick: ชิ้นเด่นประจำวัน */
  .pk-hero{position:relative;margin-top:10px;border:1.5px solid var(--line-gold);border-radius:18px;padding:14px;display:flex;gap:14px;align-items:center;background:linear-gradient(135deg,rgba(233,207,147,.12),rgba(233,207,147,.02))}
  .pk-hero .pk-img{width:104px;height:104px;border-radius:14px;object-fit:cover;flex:0 0 auto;border:1px solid var(--line-gold);background:rgba(160,140,90,.12)}
  .pk-tag{display:inline-block;font-size:.72rem;font-weight:800;color:var(--gold-deep);border:1px solid var(--line-gold);border-radius:999px;padding:2px 10px;margin-bottom:5px}
  .pk-up{display:inline-block;font-size:.7rem;font-weight:800;color:#2e7d4f;background:rgba(46,125,79,.1);border-radius:999px;padding:2px 9px;margin-left:6px;vertical-align:1px}
  .pk-name{font-weight:800;font-size:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pk-suit{font-size:2.5rem;line-height:1.1;color:var(--gold-deep);font-weight:500}
  .pk-suitl{font-size:.74rem;font-weight:700;color:var(--faint)}
  .pk-row{display:flex;gap:10px;align-items:center;border:1px solid rgba(160,140,90,.25);border-radius:12px;padding:8px 10px}
  .pk-row img{width:44px;height:44px;border-radius:10px;object-fit:cover;flex:0 0 auto;background:rgba(160,140,90,.12)}
  .pk-row .pk-rn{min-width:0;flex:1}
  .pk-row .pk-rn b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.92rem}
  .pk-row .pk-rn span{font-size:.78rem;color:var(--faint)}
  .score .mid{display:flex;align-items:flex-end;gap:8px;margin-top:4px}
  .score .num{font-size:4rem;line-height:1.05;color:var(--gold-deep);font-weight:500}
  .score .per{font-size:1.05rem;color:var(--faint);padding-bottom:8px}
  .sparkbox{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px;padding-bottom:4px;position:relative;z-index:1}
  .sparkbox svg{width:126px;height:46px;display:block}
  .sparkbox .gline{display:flex;align-items:center;gap:7px}
  .sparkbox b{color:var(--gold-deep);font-size:1rem;font-weight:800}
  .delta{font-size:.72rem;font-weight:800;border-radius:99px;padding:2.5px 9px;white-space:nowrap}
  .delta.up{background:#e6f4ea;color:#2e8b57}
  .delta.down{background:#f9efe9;color:#b06a45}
  .delta.flat{background:#f3efe4;color:var(--sub)}
  .sparkcap{font-size:.62rem;color:var(--faint)}
  .score .ft{font-size:.98rem;color:var(--sub);margin-top:8px;line-height:1.65}
  .score .luckies{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .score .lucky{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line-gold);
    background:var(--card3);border-radius:999px;padding:7px 14px;font-size:.9rem;color:var(--gold-deep);font-weight:700}
  .score .cdot{width:15px;height:15px;border-radius:99px;display:inline-block;background:#ccc;
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.12)}
  .score .lucky.ban{background:#f5f2ea;border-color:#e2ddcf;color:var(--sub)}

  .sect{font-size:1.08rem;font-weight:800;margin-top:2px}
  .rows{display:flex;flex-direction:column;gap:12px}
  .row{background:linear-gradient(165deg,var(--card),var(--card2));border:1px solid var(--line-gold);border-radius:20px;
    padding:15px 13px;display:flex;align-items:center;gap:14px;text-align:left;width:100%;position:relative;overflow:hidden;
    box-shadow:0 14px 30px -16px color-mix(in srgb, var(--btn-c) 38%, transparent);transition:transform .12s ease}
  .row:active{transform:scale(.985)}
  .row::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3.5px;border-radius:0 4px 4px 0;
    background:linear-gradient(180deg,var(--gold-hi),var(--gold))}
  /* bespoke Ener medallions (gold line-icons) instead of stock emoji */
  .med{width:62px;height:58px;border-radius:17px;flex:0 0 auto;display:grid;place-items:center;position:relative;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.55), 0 8px 18px -8px color-mix(in srgb, var(--gold) 45%, transparent)}
  .med svg{width:30px;height:30px;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  /* per-service colors (mockup v6): peach / gold / lavender */
  .med1{background:linear-gradient(150deg,var(--card3),var(--gold-hi))}
  .med1 svg{stroke:var(--gold-deep)}
  .med1 svg [fill]{fill:var(--gold-deep)}
  .med2{background:linear-gradient(150deg,var(--gold-hi),var(--gold))}
  .med2 svg{stroke:var(--gold-deep)}
  .med2 svg [fill]{fill:var(--gold-deep)}
  .med3{background:linear-gradient(150deg,#eae4f8,#c3b5e4)}
  .med3 svg{stroke:#65559f}
  .med3 svg [fill]{fill:#65559f}
  .med4{background:linear-gradient(150deg,#e4eef4,#aecbdd)}
  .med4 svg{stroke:#3f6b8a}
  .med4 svg [fill]{fill:#3f6b8a}
  .row .rt{font-weight:800;font-size:1.13rem;color:var(--ink)}
  .freechip{font-style:normal;font-size:.62rem;font-weight:800;color:#3e7d55;background:#e4f2e9;border:1px solid #bcdcc8;
    border-radius:99px;padding:2px 8px;vertical-align:2px;margin-left:4px}
  /* บริการที่ยังไม่เปิด: โชว์ในเมนูแต่กดไม่ได้ */
  .soonchip{font-style:normal;font-size:.62rem;font-weight:800;color:var(--sub);background:var(--card3);border:1px solid var(--line);
    border-radius:99px;padding:2px 8px;vertical-align:2px;margin-left:4px;white-space:nowrap}
  .row.soon{opacity:.6;pointer-events:none;box-shadow:none}
  .row.soon:active{transform:none}
  .row.soon .med{filter:grayscale(.55)}
  /* ---- scan-first hero card ---- */
  .stat{background:var(--card);border:1px solid var(--line-gold);border-radius:22px;padding:18px 18px 16px;box-shadow:var(--shadow);position:relative;overflow:hidden}
  .stat .k{font-size:.86rem;color:var(--sub);font-weight:700}
  .stgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}
  .stc{background:linear-gradient(165deg,var(--card2),var(--card3));border:1px solid var(--line-gold);border-radius:15px;padding:9px 12px 8px}
  .stc small{display:block;font-size:.7rem;color:var(--sub);font-weight:600}
  .stv{display:flex;align-items:baseline;gap:4px;margin-top:1px}
  .stc b{font-size:1.65rem;font-weight:800;color:var(--gold-deep);line-height:1.15}
  .stc b.staxis{font-size:1.12rem;color:var(--ink);line-height:1.3}
  .stc i{font-style:normal;font-size:.72rem;color:var(--faint);font-weight:600}
  .stsub{display:block;font-size:.64rem;color:var(--faint);font-weight:600;margin-top:1px}
  /* การ์ดชวนสแกนองค์แรก (ลูกค้าใหม่ที่ยังไม่มีสถิติ) */
  .firstscan{background:linear-gradient(165deg,var(--card2),var(--card3));border:1px dashed var(--gold);border-radius:15px;
    padding:16px 15px;margin-top:11px;text-align:center}
  .firstscan .fst{font-size:1.22rem;font-weight:800;color:var(--ink)}
  .firstscan .fst em{font-style:normal;color:var(--gold-deep)}
  .firstscan p{margin:6px 0 0;font-size:.82rem;color:var(--sub);line-height:1.55}
  .firstscan p b{color:var(--gold-deep)}
  .stbtns{display:flex;gap:9px;margin-top:13px}
  .stgo{flex:1.6;display:flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(165deg,var(--btn-a),var(--btn-b) 60%,var(--btn-c));
    color:#fff;font-weight:800;font-size:1.08rem;border:none;border-radius:15px;padding:13px 10px;box-shadow:0 8px 18px -8px color-mix(in srgb, var(--btn-c) 55%, transparent)}
  .sttop{flex:1;background:var(--card);border:1.5px solid var(--line-gold);color:var(--gold-deep);font-weight:800;font-size:1rem;border-radius:15px;padding:13px 8px}
  /* ---- daily strip (collapsed ดวงวันนี้) ---- */
  .dstrip{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;
    background:linear-gradient(165deg,var(--card),var(--card2));border:1px solid var(--line-gold);border-radius:17px;padding:12px 15px;box-shadow:var(--shadow)}
  .dstrip .dsl{display:flex;align-items:baseline;gap:6px;min-width:0}
  .dstrip .dsk{font-size:.84rem;color:var(--sub);font-weight:700;flex:0 0 auto}
  .dstrip b{font-size:1.5rem;font-weight:800;color:var(--gold-deep)}
  .dstrip .dsper{font-size:.72rem;color:var(--faint);font-weight:600}
  .dstrip .dsr{display:flex;align-items:center;gap:8px;font-size:.82rem;color:var(--sub);font-weight:600;flex:0 0 auto}
  .dstrip .dsn b{font-size:.95rem;color:var(--ink)}
  .dstrip .cdot{width:11px;height:11px}
  .dschev{color:var(--faint);font-size:.8rem;transition:transform .25s}
  .dstrip.open .dschev{transform:rotate(180deg)}
  /* ---- match by destiny page ---- */
  .mtcard{background:var(--card);border:1px solid var(--line);border-radius:19px;padding:15px 16px;box-shadow:var(--shadow);position:relative;overflow:hidden}
  .mthero{border-color:var(--line-gold);background:linear-gradient(170deg,var(--hero-a),var(--hero-b))}
  .mtkick{display:block;font-size:.78rem;color:var(--sub);font-weight:600}
  .mtkick b{color:var(--gold-deep)}
  .mtbuddha{font-size:1.5rem;font-weight:800;color:var(--ink);margin-top:5px}
  .mtstar{font-size:.9rem;color:var(--sub);line-height:1.65;margin:7px 0 2px}
  .mtrec{background:linear-gradient(165deg,var(--card),var(--card2));border:1px solid var(--line-gold);border-radius:17px;padding:13px 15px}
  .mtrec .t{font-weight:800;font-size:1.05rem;color:var(--gold-deep)}
  .mtrec .d{font-size:.88rem;color:var(--sub);line-height:1.6;margin-top:3px}
  .mtstones{display:flex;flex-wrap:wrap;gap:8px}
  .mtstone{display:inline-flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--line-gold);border-radius:99px;
    padding:8px 14px;font-size:.9rem;font-weight:700;color:var(--ink)}
  .mtstone i{width:13px;height:13px;border-radius:50%;border:1px solid rgba(0,0,0,.12)}
  .mtcolors{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
  .mtcolor{display:inline-flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--line);border-radius:99px;padding:7px 13px;font-size:.86rem;font-weight:700}
  .mtcolor i{width:12px;height:12px;border-radius:50%;border:1px solid rgba(0,0,0,.12)}
  .mtban{margin-top:9px;font-size:.84rem;color:var(--sub);display:flex;align-items:center;gap:6px}
  .mtban .cdot{width:11px;height:11px}
  .mtdays{display:grid;grid-template-columns:1fr;gap:7px;margin-top:8px;font-size:.9rem;color:var(--sub)}
  .mtdays b{color:var(--ink)}
  .mtdays .mtkala b{color:#b0642f}
  .mtfs{border-color:var(--line-gold);background:linear-gradient(170deg,var(--hero-a),var(--hero-b));font-size:.92rem;color:var(--ink);line-height:1.7}
  .mtfs b{color:var(--gold-deep)}
  /* ---- theme picker ---- */
  .iconbtn{width:42px;height:42px;padding:0;display:grid;place-items:center;border-radius:50%}
  .iconbtn svg{width:21px;height:21px;stroke:var(--gold-deep);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;color:var(--gold-deep)}
  .throw{display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:var(--card);
    border:1.5px solid var(--line);border-radius:18px;padding:14px 16px;box-shadow:var(--shadow)}
  .throw.on{border-color:var(--gold-deep)}
  .thsw{display:flex;flex:0 0 auto}
  .thsw i{width:26px;height:26px;border-radius:50%;border:2px solid var(--card);margin-left:-9px}
  .thsw i:first-child{margin-left:0}
  .throw .tn{font-weight:800;font-size:1.08rem;color:var(--ink)}
  .throw .td{font-size:.84rem;color:var(--sub);margin-top:1px}
  .throw .tchk{margin-left:auto;flex:0 0 auto;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;
    background:var(--card3);color:transparent;font-size:.82rem;font-weight:800}
  .throw.on .tchk{background:var(--gold-deep);color:var(--card)}
  .thchip{font-size:.62rem;font-weight:800;color:#3e7d55;background:#e4f2e9;border:1px solid #bcdcc8;border-radius:99px;padding:2px 8px;margin-left:7px;vertical-align:2px}
  html[data-lt="dark"] .thchip{background:#233527;border-color:#3a5a42;color:#8fd0a5}
  .thprev{display:flex;gap:18px;margin-top:10px}
  .thpc{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:.72rem;color:var(--sub);font-weight:600}
  .thpc i{width:38px;height:38px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
  .row .en{display:block;font-size:.6rem;color:var(--gold-deep);letter-spacing:.12em;font-weight:700;margin-top:1px}
  .row .rd{font-size:.88rem;color:var(--sub);margin-top:2px;line-height:1.5}
  /* bottom nav (mockup v6) */
  .sharebtn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:var(--card);
    border:1.5px solid var(--line-gold);color:var(--gold-deep);font-weight:800;font-size:1rem;border-radius:15px;padding:12px 10px}
  .homenav{margin-top:auto;background:var(--card);border:1px solid var(--line);border-radius:20px;display:flex;justify-content:space-around;
    padding:10px 6px;box-shadow:var(--shadow);position:sticky;bottom:10px}
  .homenav .n{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:.68rem;color:var(--faint);width:64px;font-weight:600;background:none}
  .homenav .n svg{width:21px;height:21px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  .homenav .n.on{color:var(--gold-deep)}
  .homenav .n.on::after{content:"";width:16px;height:2.5px;border-radius:2px;background:var(--gold);margin-top:1px}
  .row .chev{margin-left:auto;flex:0 0 auto;width:32px;height:32px;border-radius:999px;display:grid;place-items:center;
    background:var(--card3);border:1px solid var(--line-gold);color:var(--gold-deep);font-size:1.05rem;font-weight:700}

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
  .bigin{width:100%;background:var(--card);border:1.5px solid var(--line-gold);border-radius:18px;padding:17px 18px;
    font-size:1.25rem;font-weight:700;color:var(--ink);outline:none;font-family:inherit}
  .bigin:focus{border-color:var(--gold);box-shadow:0 0 0 4px color-mix(in srgb, var(--gold) 15%, transparent)}
  .fielderr{border-color:#c0564a !important;box-shadow:0 0 0 4px rgba(192,86,74,.14) !important}
  .pills{display:flex;flex-wrap:wrap;gap:11px;margin-top:14px;justify-content:center}
  .pill{background:var(--card);border:1.5px solid var(--line);border-radius:999px;padding:14px 22px;font-size:1.05rem;font-weight:700;
    color:var(--sub);display:inline-flex;align-items:center;gap:9px}
  .pill svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
  .pill.on{border-color:var(--gold);color:var(--gold-deep);background:var(--card3);font-weight:800;
    box-shadow:0 8px 18px -10px color-mix(in srgb, var(--gold) 55%, transparent)}
  .pill .tick{display:none;width:19px;height:19px;border-radius:99px;background:var(--gold);color:#fff;font-size:.7rem;
    place-items:center;margin-left:2px}
  .pill.on .tick{display:grid}
  .obfoot{margin-top:auto;display:flex;flex-direction:column;gap:11px;padding-top:18px}
  .goldbtn{width:100%;background:linear-gradient(165deg,var(--btn-a),var(--btn-b) 60%,var(--btn-c));color:#fff;font-weight:800;
    text-align:center;padding:17px;border-radius:18px;font-size:1.2rem;box-shadow:0 14px 30px -12px rgba(176,138,64,.55)}
  .goldbtn:disabled{opacity:.5}
  .backbtn{width:100%;background:transparent;color:var(--faint);font-size:.98rem;font-weight:600;padding:6px;text-align:center}

  /* date selects (custom Thai picker) */
  .row3{display:grid;grid-template-columns:1fr 1.3fr 1.2fr;gap:9px}
  select.bigin{-webkit-appearance:none;appearance:none;background:var(--card);padding-right:34px;
    text-align:center;text-align-last:center;background-image:none}
  .selwrap{position:relative}
  .selwrap::after{content:"";position:absolute;right:15px;top:50%;width:9px;height:9px;pointer-events:none;
    border-right:2px solid var(--gold-deep);border-bottom:2px solid var(--gold-deep);transform:translateY(-70%) rotate(45deg)}
  select.bigin:focus{border-color:var(--gold);box-shadow:0 0 0 4px color-mix(in srgb, var(--gold) 15%, transparent)}

  /* premium loading emblem */
  .center{display:grid;place-items:center;min-height:80dvh;text-align:center}
  .load-wrap{display:flex;flex-direction:column;align-items:center}
  .emblem{width:138px;height:138px;display:block}
  .wordmark{font-size:2.6rem;color:var(--gold-deep);letter-spacing:.16em;margin-top:16px;line-height:1;padding-left:.16em}
  /* NOTE: no letter-spacing on Thai text — iOS detaches combining vowels (ู) from
     their consonant. Spacing is done with real spaces between whole clusters. */
  .wordmark-sub{font-size:.86rem;color:var(--gold);margin-top:9px;font-weight:600}
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
    .tcard{animation:rise .55s ease-out both}
    .tcard:nth-child(2){animation-delay:.15s}
    .tcard:nth-child(3){animation-delay:.3s}
    @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  }

  /* ---- monthly reading view ---- */
  .rd-top{display:flex;align-items:center;gap:10px}
  .rd-back{width:40px;height:40px;border-radius:999px;background:var(--card);border:1px solid var(--line);display:grid;place-items:center;
    font-size:1.15rem;color:var(--gold-deep);flex:0 0 auto}
  .rd-title{font-size:1.15rem;font-weight:800}
  .rd-title small{display:block;font-weight:600;color:var(--gold-deep);font-size:.82rem;margin-top:1px}
  .repcard{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:16px;box-shadow:var(--shadow)}
  .tarotrow{display:flex;gap:12px;justify-content:center;padding:6px 0 2px}
  .tcard{width:88px;border-radius:16px;padding:13px 6px 11px;text-align:center;background:linear-gradient(170deg,#fdfaf2,#f7efdd);
    border:1px solid var(--line-gold)}
  .tcard.mid{border:1.5px solid var(--gold);box-shadow:0 8px 24px -10px color-mix(in srgb, var(--gold) 45%, transparent);transform:translateY(-6px)}
  .tcard .te{font-size:30px;line-height:1.2}
  .tcard .tn{font-size:.78rem;font-weight:800;color:var(--ink);margin-top:5px;line-height:1.3}
  .tcard .tk{font-size:.64rem;color:var(--gold-deep);font-weight:700;margin-top:2px}
  .tcard .tp{display:inline-block;font-size:.6rem;color:var(--sub);border:1px solid var(--line);border-radius:99px;
    padding:2px 9px;margin-top:7px;background:var(--card)}
  .rd-score{display:flex;align-items:center;gap:12px;margin-top:6px}
  .rd-score .num{font-size:3rem;line-height:1.05;color:var(--gold-deep);font-weight:500}
  .rd-score .per{font-size:.9rem;color:var(--faint)}
  .rd-score .gd{margin-left:auto;text-align:right}
  .rd-score .gd b{display:block;color:var(--gold-deep);font-size:1.15rem}
  .rd-score .gd small{color:var(--faint);font-size:.76rem}
  .radwrap{position:relative;width:230px;height:180px;margin:8px auto 0}
  .radwrap svg{width:230px;height:180px;display:block}
  .rlab{position:absolute;font-size:.7rem;color:var(--sub);white-space:nowrap}
  .rlab b{color:var(--gold-deep)}
  .sgrid{display:grid;grid-template-columns:1fr 1fr 1fr;margin-top:4px}
  .sg{padding:9px 2px 10px;border-top:1px solid var(--line)}
  .sg:nth-child(-n+3){border-top:none}
  .sg small{display:block;font-size:.7rem;color:var(--faint)}
  .sg .v{font-size:.92rem;font-weight:700;margin-top:2px}
  .rd-read p{margin:.55em 0 0;font-size:1rem;line-height:1.8;color:var(--ink)}
  .rd-read .rk{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line-gold);border-radius:999px;
    padding:5px 13px;font-size:.68rem;font-weight:700;color:var(--gold-deep);letter-spacing:.12em}
  .rd-adv{background:var(--card3);border:1px solid var(--line-gold);border-radius:16px;padding:12px 14px;font-size:.95rem;
    line-height:1.7;color:var(--ink);margin-top:11px}
  .rd-adv b{color:var(--gold-deep)}
  .luckyrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .luckyrow .lt{font-size:.95rem;font-weight:800}
  .ln{width:42px;height:42px;border-radius:999px;border:1.5px solid var(--gold);display:grid;place-items:center;
    color:var(--gold-deep);font-weight:700;font-size:1.15rem;background:var(--card)}
  .ln.wide{width:auto;padding:0 15px}
  .readbtn{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:13px;background:linear-gradient(165deg,var(--btn-a),var(--btn-b) 60%,var(--btn-c));
    color:#fff;font-weight:800;text-align:center;padding:14px;border-radius:16px;font-size:1.05rem;width:100%;
    box-shadow:0 12px 26px -10px rgba(176,138,64,.5)}
  .needbd{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px;text-align:center;box-shadow:var(--shadow)}
  .needbd .big{font-size:2.2rem}
  .needbd .t{font-weight:800;font-size:1.1rem;margin-top:8px}
  .needbd p{color:var(--sub);font-size:.92rem;line-height:1.65;margin:.5em 0 0}
  /* ---- เติมสิทธิ์สแกน (pay) ---- */
  .pkg{display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:var(--card);
    border:1.6px solid var(--line);border-radius:16px;padding:14px 15px;box-shadow:var(--shadow);cursor:pointer;transition:border-color .18s}
  .pkg.on{border-color:var(--gold);background:linear-gradient(160deg,var(--hero-a),var(--hero-b))}
  .pkg .pk-price{font-size:1.5rem;font-weight:800;color:var(--gold-deep);min-width:74px}
  .pkg .pk-price small{font-size:.8rem;font-weight:700;color:var(--sub)}
  .pkg .pk-d{flex:1;display:flex;flex-direction:column;gap:2px}
  .pkg .pk-t{font-weight:800;font-size:.98rem}
  .pkg .pk-s{font-size:.8rem;color:var(--sub)}
  .pkg .pk-r{width:22px;height:22px;border-radius:50%;border:2px solid var(--line-gold);flex:none;position:relative}
  .pkg.on .pk-r{border-color:var(--gold)}
  .pkg.on .pk-r:after{content:"";position:absolute;inset:4px;border-radius:50%;background:var(--gold)}
  .payqr{display:flex;flex-direction:column;align-items:center;gap:9px;padding:18px 14px}
  .payqr img{width:min(230px,64vw);border-radius:14px;border:1px solid var(--line)}
  .payref{font-size:.82rem;color:var(--sub)}
  .payamt{font-size:1.35rem;font-weight:800;color:var(--gold-deep)}
  .slipdrop{display:flex;flex-direction:column;align-items:center;gap:8px;border:1.8px dashed var(--line-gold);
    border-radius:16px;padding:20px 14px;background:#fffdf8;cursor:pointer;text-align:center}
  .slipdrop img{max-width:min(200px,56vw);border-radius:12px}
  .slipdrop .sd-t{font-weight:800;font-size:.95rem}
  .slipdrop .sd-s{font-size:.8rem;color:var(--sub)}
  .payst{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:26px 14px}
  .payst .big{font-size:2.6rem}
  .payst .t{font-weight:800;font-size:1.05rem}
  .payst p{font-size:.88rem;color:var(--sub);line-height:1.75;margin:0}
  .paychip{display:inline-flex;align-items:center;gap:6px;font-size:.78rem;font-weight:700;color:var(--gold-deep);
    background:var(--card3);border:1px solid var(--line-gold);border-radius:999px;padding:4px 12px}
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
      <div class="loaddots"><i></i><i></i><i></i></div>
      <p class="ld" id="loadmsg" style="display:none"></p>
    </div>
  </div>

  <!-- onboarding -->
  <div id="v-ob" class="hidden" style="display:flex;flex-direction:column;flex:1">
    <div class="obt"><div class="t">มาทำความรู้จักกันก่อนนะ</div><small>อาจารย์ขอถามทีละข้อ ง่าย ๆ แป๊บเดียวเสร็จ</small></div>
    <div class="dots"><span class="dot" id="d0"></span><span class="dot" id="d1"></span><span class="dot" id="d2"></span><span class="dot" id="d3"></span></div>

    <div id="st0">
      <div class="q">ให้อาจารย์เรียกคุณ<br>ว่าอะไรดี</div>
      <div class="bigfield"><label>ชื่อเล่น</label><input class="bigin" id="f-nick" placeholder="เช่น กบ" maxlength="40"/></div>
    </div>

    <div id="st1" class="hidden">
      <div class="q">เกิดวันไหน<br>บอกอาจารย์หน่อย</div>
      <div class="why">อาจารย์จะได้ผูกดวงให้ตรงตัวคุณที่สุด ข้อมูลนี้เก็บเป็นความลับนะ</div>
      <div class="bigfield"><label>วันเกิด</label>
        <div class="row3">
          <span class="selwrap"><select class="bigin" id="f-day"></select></span>
          <span class="selwrap"><select class="bigin" id="f-mon"></select></span>
          <span class="selwrap"><select class="bigin" id="f-year"></select></span>
        </div>
      </div>
      <div class="bigfield"><label>เวลาที่เกิด (ถ้าทราบ)</label>
        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:9px">
          <span class="selwrap"><select class="bigin" id="f-bth"></select></span>
          <span class="selwrap"><select class="bigin" id="f-btm"></select></span>
        </div>
      </div>
    </div>

    <div id="st2" class="hidden">
      <div class="q">เพศของคุณ</div>
      <div class="why">เพื่อให้คำแนะนำของอาจารย์ตรงทางยิ่งขึ้น</div>
      <div class="pills" id="g-sex">
        <button class="pill" data-v="หญิง">หญิง</button>
        <button class="pill" data-v="ชาย">ชาย</button>
        <button class="pill" data-v="ไม่ระบุ">ไม่ระบุ</button>
      </div>
    </div>

    <div id="st3" class="hidden">
      <div class="q">อยากให้อาจารย์<br>ช่วยเรื่องไหนบ้าง</div>
      <div class="why">เลือกได้หลายข้อเลยนะ</div>
      <div class="pills" id="g-int">
        <button class="pill" data-v="ดูดวง"><svg viewBox="0 0 24 24"><circle cx="12" cy="10.5" r="6"/><path d="M8.5 18.5h7M10 21h4"/><path d="M12 7.6l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z" fill="currentColor" stroke="none"/></svg>ดูดวง<span class="tick">✓</span></button>
        <button class="pill" data-v="สแกนพระ"><svg viewBox="0 0 24 24"><path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><path d="M12 8.2c-1.9 0-3 1.5-3 3.3 0 2 1.5 3.3 3 4.8 1.5-1.5 3-2.8 3-4.8 0-1.8-1.1-3.3-3-3.3z"/></svg>สแกนพระ<span class="tick">✓</span></button>
        <button class="pill" data-v="ฮวงจุ้ย"><svg viewBox="0 0 24 24"><path d="M4 11l8-6 8 6M6 10.2V19h12v-8.8"/><path d="M12 12v4.5M9.8 14.2h4.4"/></svg>ฮวงจุ้ย<span class="tick">✓</span></button>
        <button class="pill" data-v="เครื่องราง"><svg viewBox="0 0 24 24"><path d="M12 3v3.5"/><path d="M12 6.5l4 3.5-1.5 6.5h-5L8 10z"/><path d="M12 10.2l1.6 1.4-.6 2.6h-2l-.6-2.6z" fill="currentColor" stroke="none" opacity=".55"/></svg>เครื่องราง<span class="tick">✓</span></button>
      </div>
      <div class="why" style="margin-top:18px">แล้วมาเจออาจารย์จากช่องทางไหนนะ เลือกได้หลายอันเลย</div>
      <div class="pills" id="g-ch">
        <button class="pill" data-v="Facebook">Facebook<span class="tick">✓</span></button>
        <button class="pill" data-v="TikTok">TikTok<span class="tick">✓</span></button>
        <button class="pill" data-v="เพื่อนแนะนำ">เพื่อนแนะนำ<span class="tick">✓</span></button>
        <button class="pill" data-v="อื่นๆ">อื่น ๆ<span class="tick">✓</span></button>
      </div>
      <input class="bigin hidden" id="f-ch-other" placeholder="เล่าหน่อยว่าเจออาจารย์จากไหน" maxlength="80" style="margin-top:10px"/>
      <div class="bigfield"><label>เบอร์โทร</label><input class="bigin" id="f-ph" type="tel" placeholder="เบอร์มือถือ 10 หลัก" maxlength="20"/></div>
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
      <span class="mywrap">
        <button class="mybtn" id="btn-edit">ข้อมูลของฉัน</button>
      </span>
    </div>
    <div class="greet">
      <small id="h-when">สวัสดี</small>
      <div class="nm" id="h-name">คุณ...</div>
      <div class="ds">อาจารย์อยู่ตรงนี้ เป็นพลังบวกให้คุณทุกวัน</div>
    </div>

    <!-- scan-first hero: คลังพลังของคุณ -->
    <div class="stat">
      <div class="k">คลังพลังของคุณ</div>
      <div class="stgrid" id="stgrid">
        <div class="stc"><small>สแกนแล้ว</small><span class="stv"><b class="serif" id="st-count">–</b><i>ชิ้น</i></span></div>
        <div class="stc"><small>สิทธิ์เหลือ</small><span class="stv"><b class="serif" id="st-left">–</b><i>ครั้ง</i></span><small class="stsub hidden" id="st-left-sub"></small></div>
        <div class="stc"><small>คะแนนสูงสุด</small><span class="stv"><b class="serif" id="st-top">–</b><i>/10</i></span></div>
        <div class="stc"><small>พลังเด่นสุด</small><span class="stv"><b class="staxis" id="st-axis">–</b></span></div>
      </div>
      <!-- ลูกค้าใหม่ (สแกน 0 ชิ้น): แทนตารางขีด ๆ ด้วยการ์ดชวนสแกนองค์แรก -->
      <div class="firstscan hidden" id="st-first">
        <div class="fst serif">สแกนชิ้นแรกของคุณ <em>ฟรี</em></div>
        <p>ส่งรูปพระ เครื่องราง หรือกำไลหินมา<br>อาจารย์อ่านพลังให้ทันที วันนี้มีสิทธิ์ฟรี <b id="st-first-free">2</b> ครั้ง</p>
      </div>
      <div class="stbtns">
        <button class="stgo" id="btn-scan"><svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#fff;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M4 8.5V6a2 2 0 0 1 2-2h2.5"/><path d="M15.5 4H18a2 2 0 0 1 2 2v2.5"/><path d="M20 15.5V18a2 2 0 0 1-2 2h-2.5"/><path d="M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><circle cx="12" cy="12" r="3.2"/></svg>สแกนเลย</button>
        <button class="sttop" id="btn-topup">＋ เติมสิทธิ์</button>
      </div>
    </div>

    <!-- ชิ้นไหนหนุนดวงวันนี้ (Daily Pick): ชิ้นเด่นใบใหญ่มีรูปจริง + รองเป็นแถวเล็ก -->
    <div class="score hidden" id="pickcard">
      <div class="k">ชิ้นไหนหนุนดวงวันนี้ <small id="pk-day"></small></div>
      <div class="pk-hero hidden" id="pk-hero"></div>
      <div class="ft hidden" id="pk-reason" style="margin-top:8px"></div>
      <div id="pk-list" style="display:flex;flex-direction:column;gap:8px;margin-top:10px"></div>
      <div class="ft hidden" id="pk-lock" style="margin-top:10px"></div>
      <button class="sttop hidden" id="pk-upgrade" style="margin-top:10px;width:100%">ให้อาจารย์เทียบทุกชิ้น ทุกวัน</button>
    </div>

    <!-- ดวงวันนี้: แถบย่อ กดเพื่อกางการ์ดเต็ม -->
    <button class="dstrip" id="dstrip" aria-expanded="false">
      <span class="dsl"><span class="dsk">ดวงวันนี้</span><b class="serif" id="ds-num">–</b><span class="dsper">/100</span><span class="delta hidden" id="ds-delta"></span></span>
      <span class="dsr"><span class="dsn">✦ <b id="ds-lucky">–</b></span><i class="cdot" id="ds-cdot"></i><span id="ds-color">–</span><span class="dschev" id="ds-chev">▾</span></span>
    </button>

    <div class="score hidden" id="scorecard">
      <div class="k">ดวงวันนี้ของคุณ<small id="s-date"></small></div>
      <div class="mid">
        <span class="num serif" id="s-num">–</span><span class="per serif">/100</span>
        <span class="sparkbox">
          <svg viewBox="0 0 126 46" aria-hidden="true">
            <path id="sp-area" d="" fill="rgba(201,163,92,.13)" stroke="none"/>
            <path id="sp-line" d="" fill="none" stroke="#c9a35c" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
            <circle id="sp-dot-prev" r="2.3" fill="#fff" stroke="#c9a35c" stroke-width="1.4" cx="-9" cy="-9"/>
            <circle id="sp-dot" r="2.8" fill="#a5813a" cx="-9" cy="-9"/>
          </svg>
          <span class="gline"><b id="s-grade"></b><span class="delta hidden" id="s-delta"></span></span>
          <span class="sparkcap">ดวง 7 วันล่าสุดของคุณ</span>
        </span>
      </div>
      <div class="ft" id="s-msg"></div>
      <span class="luckies">
        <span class="lucky">✦ เลขเด่นวันนี้ <b id="s-lucky" style="font-size:1.15rem">–</b></span>
        <span class="lucky"><i class="cdot" id="s-cdot"></i> สีนำโชค <b id="s-color">–</b></span>
        <span class="lucky ban hidden" id="s-banwrap"><i class="cdot" id="s-bdot"></i> เลี่ยง <b id="s-ban">–</b></span>
      </span>
      <button class="readbtn" id="btn-reading">
        <svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:#fff;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round">
          <rect x="8.5" y="4.5" width="8" height="12.5" rx="1.6"/>
          <path d="M6.2 6.8l-2.4 1 4.6 10.8 1.9-.8" opacity=".75"/>
          <path d="M17.8 6.8l2.4 1-4.6 10.8-1.9-.8" opacity=".75"/>
          <path d="M12.5 8.6l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="#fff" stroke="none"/>
        </svg>
        เปิดดวงประจำเดือน
      </button>
      <span class="fx f1">✦</span><span class="fx f2">✦</span><span class="fx f3">✦</span><span class="fx f4">✦</span>
    </div>

    <div class="sect">วันนี้ให้อาจารย์ช่วยเรื่องไหนดี</div>
    <div class="rows">
      <button class="row" id="row-monthly"><span class="med med4"><svg viewBox="0 0 24 24"><rect x="8.5" y="4.5" width="8" height="12.5" rx="1.6"/><path d="M6.2 6.8l-2.4 1 4.6 10.8 1.9-.8" opacity=".75"/><path d="M17.8 6.8l2.4 1-4.6 10.8-1.9-.8" opacity=".75"/><path d="M12.5 8.6l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="#a5813a" stroke="none"/></svg></span><span><span class="rt">ดูดวงรายเดือน <em class="freechip">ฟรี</em></span><span class="en">MONTHLY READING</span><span class="rd">ไพ่สามใบ พร้อมกราฟห้าด้านของเดือนนี้</span></span><span class="chev">›</span></button>
      <div class="row soon"><span class="med med1"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="1" fill="#a5813a" stroke="none"/><path d="M12 1.8v2.7M12 19.5v2.7M1.8 12h2.7M19.5 12h2.7"/></svg></span><span><span class="rt">หาเครื่องรางที่เข้ากับดวง <em class="soonchip">เร็ว ๆ นี้</em></span><span class="en">MATCH BY DESTINY</span><span class="rd">ดูตามวันเกิด สายไหนเสริมดวงคุณ</span></span></div>
      <div class="row soon"><span class="med med2"><svg viewBox="0 0 24 24"><path d="M4 11l8-6 8 6"/><path d="M6 10.2V19h12v-8.8"/><path d="M12 12.3v4.4M9.9 14.5h4.2"/><path d="M12 12.3l1.5 2.2-1.5-.6-1.5.6z" fill="#a5813a" stroke="none"/></svg></span><span><span class="rt">ฮวงจุ้ยจากรูป <em class="soonchip">เร็ว ๆ นี้</em></span><span class="en">FENG SHUI</span><span class="rd">ถ่ายรูปห้อง อาจารย์ดูพลังบ้านให้</span></span></div>
    </div>
    <p class="note">กดบริการแล้วกลับไปคุยกับอาจารย์ในแชตได้เลย</p>

    <div class="homenav">
      <button class="n on"><svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/></svg>หน้าหลัก</button>
      <button class="n" id="nav-read"><svg viewBox="0 0 24 24"><path d="M12 3l2.2 5.4L20 9l-4.4 3.8L17 19l-5-3.2L7 19l1.4-6.2L4 9l5.8-.6z"/></svg>ดวงเดือน</button>
      <button class="n" id="nav-theme"><svg viewBox="0 0 24 24"><path d="M12 3.5c-4.8 0-8.5 3.4-8.5 7.9 0 4.4 3.6 7.6 7.6 7.6.9 0 1.5-.6 1.5-1.4 0-.4-.2-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.7-1.4 1.5-1.4h1.8c2.9 0 5.4-2.1 5.4-5 0-3.5-3.7-5.7-8.5-5.7z"/><circle cx="7.8" cy="10.2" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none"/><circle cx="16.2" cy="10.2" r="1" fill="currentColor" stroke="none"/></svg>โทนสี</button>
      <button class="n" id="nav-me"><svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>ข้อมูลฉัน</button>
    </div>
  </div>

  <!-- เลือกโทนสี -->
  <div id="v-me" class="hidden" style="display:flex;flex-direction:column;gap:13px">
    <div class="q" style="margin-bottom:2px">ข้อมูลของฉัน</div>
    <div class="card" id="me-card" style="display:flex;flex-direction:column;gap:10px"></div>
    <div class="why" style="text-align:center;line-height:1.7">
      ต้องการแก้ไขข้อมูล พิมพ์บอกอาจารย์ในแชทได้เลย<br/>เช่น "ขอเปลี่ยนวันเกิด" · "เปลี่ยนชื่อ กบ" · "เปลี่ยนเบอร์ 0812345678"
    </div>
  </div>

  <div id="v-theme" class="hidden" style="display:flex;flex-direction:column;gap:13px">
    <div class="rd-top">
      <button class="rd-back" id="th-back">‹</button>
      <span class="rd-title serif">แต่งแอปให้ถูกใจคุณ</span>
    </div>
    <div class="mtcard mthero">
      <small class="mtkick">PERSONALIZE</small>
      <div class="mtbuddha serif" style="font-size:1.3rem">เลือกโทนสีที่คุณสบายตา</div>
      <p class="mtstar">ธีมจะถูกบันทึกไว้ในเครื่องคุณเอง เปิดมาครั้งหน้าก็เป็นโทนนี้เลย</p>
    </div>
    <div id="th-list" style="display:flex;flex-direction:column;gap:11px"></div>
    <div class="mtcard">
      <small class="mtkick">ตัวอย่างสีของโทนนี้</small>
      <div class="thprev">
        <span class="thpc"><i style="background:var(--gold)"></i>ทอง</span>
        <span class="thpc"><i style="background:var(--gold-deep)"></i>เข้ม</span>
        <span class="thpc"><i style="background:var(--ink)"></i>หลัก</span>
        <span class="thpc"><i style="background:var(--bg);border:1px solid var(--line)"></i>พื้น</span>
      </div>
    </div>
  </div>

  <!-- หาเครื่องรางที่เข้ากับดวง -->
  <div id="v-match" class="hidden" style="display:flex;flex-direction:column;gap:13px">
    <div class="rd-top">
      <button class="rd-back" id="mt-back">‹</button>
      <span class="rd-title serif">เครื่องรางที่เข้ากับดวง</span>
    </div>
    <div id="mt-needbd" class="hidden">
      <div class="mtcard" style="text-align:center">
        <p style="margin:4px 0 12px">อาจารย์ขอวันเกิดก่อนนะ จะได้เทียบตำราให้ตรงดวงคุณจริง ๆ</p>
        <button class="readbtn" id="mt-fill" style="margin:0 auto">กรอกวันเกิด</button>
      </div>
    </div>
    <div id="mt-body" class="hidden" style="display:flex;flex-direction:column;gap:13px">
      <div class="mtcard mthero">
        <small class="mtkick">คนเกิดวัน<b id="mt-day">–</b> · เลขประจำวัน <b id="mt-num">–</b></small>
        <div class="mtbuddha serif" id="mt-buddha">–</div>
        <p class="mtstar" id="mt-star"></p>
      </div>
      <div class="sect">สายที่เสริมดวงคุณตามตำรา</div>
      <div id="mt-recs" style="display:flex;flex-direction:column;gap:10px"></div>
      <div class="sect">หินที่ถูกโฉลกกับวันเกิด</div>
      <div class="mtstones" id="mt-stones"></div>
      <div class="mtcard">
        <small class="mtkick">สีถูกโฉลก</small>
        <div class="mtcolors" id="mt-good"></div>
        <div class="mtban">เลี่ยง <i class="cdot" id="mt-bandot"></i><b id="mt-ban">–</b></div>
      </div>
      <div class="mtcard">
        <small class="mtkick">จังหวะวันตามทักษาของคุณ</small>
        <div class="mtdays">
          <span>เริ่มงานใหญ่ วัน<b id="mt-det">–</b></span>
          <span>เรื่องเงินเสน่ห์ วัน<b id="mt-sri">–</b></span>
          <span>ขอความช่วยเหลือ วัน<b id="mt-mon">–</b></span>
          <span class="mtkala">เพลาเรื่องเสี่ยง วัน<b id="mt-kala">–</b></span>
        </div>
      </div>
      <div class="mtcard mtfs hidden" id="mt-fs"></div>
      <button class="readbtn" id="mt-scan">
        <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#fff;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M4 8.5V6a2 2 0 0 1 2-2h2.5"/><path d="M15.5 4H18a2 2 0 0 1 2 2v2.5"/><path d="M20 15.5V18a2 2 0 0 1-2 2h-2.5"/><path d="M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><circle cx="12" cy="12" r="3.2"/></svg>
        สแกนเช็คชิ้นที่คุณมี
      </button>
      <button class="sharebtn" id="mt-share">
        <svg viewBox="0 0 24 24" style="width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><circle cx="6" cy="12" r="2.6"/><circle cx="17.5" cy="5.5" r="2.6"/><circle cx="17.5" cy="18.5" r="2.6"/><path d="M8.4 10.8l6.8-4M8.4 13.2l6.8 4"/></svg>
        แชร์การ์ดดวงนี้ให้เพื่อน
      </button>
      <p class="note">คำแนะนำอิงตำราทักษาไทยและความเชื่อวันเกิด ใช้เป็นแนวทางประกอบวิจารณญาณนะครับ</p>
    </div>
  </div>

  <!-- monthly reading -->
  <div id="v-read" class="hidden" style="display:flex;flex-direction:column;gap:13px">
    <div class="rd-top">
      <button class="rd-back" id="rd-back">‹</button>
      <div class="rd-title">ดวงประจำเดือน<small id="rd-month"></small></div>
    </div>

    <div id="rd-needbd" class="needbd hidden">
      <div class="big">🗓️</div>
      <div class="t">ยังไม่มีวันเกิดของคุณ</div>
      <p>บอกวันเกิดให้อาจารย์หน่อย<br>จะได้ผูกดวงและเปิดไพ่ประจำเดือนให้ได้</p>
      <button class="readbtn" id="rd-fill" style="margin-top:16px">กรอกข้อมูล</button>
    </div>

    <div id="rd-body" class="hidden" style="display:flex;flex-direction:column;gap:13px">
      <div class="repcard">
        <div class="tarotrow" id="rd-cards"></div>
      </div>

      <div class="repcard">
        <div class="rd-score">
          <span class="num serif" id="rd-num">–</span><span class="per serif">/100</span>
          <span class="gd"><b id="rd-grade"></b><small>ภาพรวมพลังเดือนนี้</small></span>
        </div>
        <div class="radwrap">
          <svg viewBox="0 0 140 124">
            <polygon points="70,16 113.7,47.8 97,99.2 43,99.2 26.3,47.8" fill="none" stroke="#eee6d4" stroke-width="1"/>
            <polygon points="70,31.6 98.9,52.6 87.9,86.6 52.1,86.6 41.1,52.6" fill="none" stroke="#f2ecdd" stroke-width="1"/>
            <polygon points="70,46.8 84.5,57.3 78.9,74.3 61.1,74.3 55.5,57.3" fill="none" stroke="#f5f0e4" stroke-width="1"/>
            <polygon id="rd-poly" points="" fill="rgba(201,163,92,.20)" stroke="#c9a35c" stroke-width="1.6"/>
            <circle class="rd-dot" r="2.6" fill="#a5813a"/><circle class="rd-dot" r="2.6" fill="#a5813a"/>
            <circle class="rd-dot" r="2.6" fill="#a5813a"/><circle class="rd-dot" r="2.6" fill="#a5813a"/>
            <circle class="rd-dot" r="2.6" fill="#a5813a"/>
          </svg>
          <span class="rlab" id="rl0" style="left:50%;top:-4px;transform:translateX(-50%)"></span>
          <span class="rlab" id="rl1" style="right:-6px;top:52px"></span>
          <span class="rlab" id="rl2" style="right:14px;bottom:-4px"></span>
          <span class="rlab" id="rl3" style="left:14px;bottom:-4px"></span>
          <span class="rlab" id="rl4" style="left:-6px;top:52px"></span>
        </div>
      </div>

      <div class="repcard">
        <div style="font-size:.95rem;font-weight:800;margin-bottom:2px">สรุปดวงชะตา</div>
        <div class="sgrid">
          <div class="sg"><small>วันเกิด</small><div class="v" id="sm-bd">–</div></div>
          <div class="sg"><small>ราศี</small><div class="v" id="sm-zd">–</div></div>
          <div class="sg"><small>ธาตุ</small><div class="v" id="sm-el">–</div></div>
          <div class="sg"><small>นักษัตร</small><div class="v" id="sm-an">–</div></div>
          <div class="sg"><small>อายุ</small><div class="v" id="sm-ag">–</div></div>
          <div class="sg"><small>ด้านที่เด่น</small><div class="v" id="sm-bx" style="color:var(--gold-deep)">–</div></div>
        </div>
      </div>

      <div class="repcard rd-read">
        <span class="rk">🧠 คำอ่านจากอาจารย์</span>
        <p id="rd-text"></p>
        <div class="rd-adv"><b>เคล็ดเสริมดวง:</b> <span id="rd-adv"></span></div>
      </div>

      <div class="repcard luckyrow">
        <span class="lt">เลขนำโชค</span>
        <span class="ln serif" id="lk0">–</span>
        <span class="ln serif" id="lk1">–</span>
        <span class="ln serif" id="lk2">–</span>
        <span class="ln serif wide" id="lk3">–</span>
      </div>

      <button class="readbtn" id="rd-ask">💬 ถามอาจารย์ต่อจากดวงนี้</button>
      <p class="note">อาจารย์เปิดไพ่ให้เดือนละชุด ต้นเดือนหน้ามาเปิดชุดใหม่กันนะ ระหว่างนี้หมั่นคิดดี ทำดี พลังดีจะอยู่กับคุณ</p>
    </div>
  </div>

  <!-- เติมสิทธิ์สแกน -->
  <div id="v-pay" class="hidden" style="display:flex;flex-direction:column;gap:13px">
    <div class="rd-top">
      <button class="rd-back" id="pay-back">‹</button>
      <div class="rd-title">เติมสิทธิ์สแกน<small>เลือกแพ็ก โอน แนบสลิป จบเลย</small></div>
    </div>

    <!-- step 1: pick package -->
    <div id="pay-pick" style="display:flex;flex-direction:column;gap:11px">
      <span class="paychip hidden" id="pay-remain" style="align-self:flex-start"></span>
      <div id="pay-pkgs" style="display:flex;flex-direction:column;gap:10px"></div>
      <button class="readbtn" id="pay-go">💳 สร้างรายการโอน</button>
      <p class="note">โอนผ่านพร้อมเพย์ แล้วแนบสลิปในหน้านี้ ตรวจกับธนาคารให้ทันที</p>
    </div>

    <!-- step 2: QR + slip -->
    <div id="pay-qr" class="hidden" style="display:flex;flex-direction:column;gap:11px">
      <div class="repcard payqr">
        <div class="payamt" id="pay-amt"></div>
        <img id="pay-qrimg" alt="PromptPay QR" />
        <div class="payref" id="pay-ref"></div>
        <div class="payref">สแกน QR โอนตามยอดด้านบน แล้วแนบสลิปด้านล่างได้เลย</div>
      </div>
      <label class="slipdrop" id="pay-drop">
        <input type="file" id="pay-file" accept="image/*" style="display:none" />
        <img id="pay-prev" class="hidden" alt="" />
        <span class="sd-t" id="pay-dt">📎 แตะเพื่อแนบสลิปโอนเงิน</span>
        <span class="sd-s">ถ่ายหรือเลือกรูปสลิปจากเครื่องได้เลย</span>
      </label>
      <button class="readbtn hidden" id="pay-send">✅ ส่งสลิปให้ตรวจ</button>
      <p class="note" id="pay-hint">ตรวจสลิปกับธนาคารอัตโนมัติ ส่วนใหญ่ไม่เกินครึ่งนาที</p>
    </div>

    <!-- step 3: result -->
    <div id="pay-done" class="hidden repcard payst">
      <div class="big" id="pd-ic">✅</div>
      <div class="t" id="pd-t"></div>
      <p id="pd-p"></p>
      <button class="readbtn" id="pd-chat" style="margin-top:6px">💬 กลับไปที่แชต</button>
    </div>
  </div>

</div>

<script>
(function(){
  var LIFF_ID = ${JSON.stringify(liffId)};
  var state = { userId:"", displayName:"", step:0, sex:"", interest:"", channel:"" };
  function $(id){ return document.getElementById(id); }
  function show(id){ ["v-load","v-ob","v-home","v-read","v-pay","v-match","v-theme","v-me"].forEach(function(v){ $(v).classList.add("hidden"); }); $(id).classList.remove("hidden"); window.scrollTo(0,0); }

  /* ---- โทนสี: เก็บใน localStorage เครื่องลูกค้า ---- */
  var THEMES = [
    { k:"cream", n:"ครีมทอง", d:"อบอุ่น นุ่มนวล อ่านง่าย", sw:["#c9a35c","#a5813a","#faf8f3"] },
    { k:"plum",  n:"พลัมทอง", d:"ขลัง หรูหรา คลาสสิก",   sw:["#7c3a44","#b98a4a","#f8f2ee"] },
    { k:"blue",  n:"ฟ้าเงิน",  d:"สงบ สะอาด โมเดิร์น",    sw:["#1f4a66","#6f9cb8","#f2f6f9"] },
    { k:"dark",  n:"โทนดำ",   d:"มืดล้วน สบายตากลางคืน", sw:["#121214","#d5d5da","#323238"] },
    { k:"white", n:"โทนขาว",  d:"สะอาด เรียบ มินิมอล",    sw:["#1c1917","#9a9a9a","#ffffff"] }
  ];
  function currentTheme(){
    try { return localStorage.getItem("enerLiffTheme") || "cream"; } catch(e){ return "cream"; }
  }
  function applyTheme(k){
    if(k === "cream"){ document.documentElement.removeAttribute("data-lt"); }
    else { document.documentElement.setAttribute("data-lt", k); }
    try { localStorage.setItem("enerLiffTheme", k); } catch(e){}
  }
  function renderThemes(){
    var cur = currentTheme();
    var list = $("th-list"); list.innerHTML = "";
    THEMES.forEach(function(t){
      var btn = document.createElement("button");
      btn.className = "throw" + (t.k === cur ? " on" : "");
      btn.innerHTML =
        '<span class="thsw"><i style="background:' + t.sw[0] + '"></i><i style="background:' + t.sw[1] + '"></i><i style="background:' + t.sw[2] + '"></i></span>' +
        '<span><span class="tn">' + t.n + (t.k === cur ? '<em class="thchip" style="font-style:normal">กำลังใช้</em>' : '') + '</span><span class="td" style="display:block">' + t.d + '</span></span>' +
        '<span class="tchk">✓</span>';
      btn.addEventListener("click", function(){ applyTheme(t.k); renderThemes(); });
      list.appendChild(btn);
    });
  }
  applyTheme(currentTheme());
  function showLoadMsg(t){ var lm=$("loadmsg"); if(lm){ lm.style.display="block"; lm.textContent=t; } }
  function pad2(x){ x=String(x); return x.length<2 ? "0"+x : x; }

  /* ---- Thai date/time picker (no native OS locale dependence) ---- */
  var TH_MONTHS=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  function addOpt(sel,val,txt,placeholder){ var o=document.createElement("option"); o.value=val; o.textContent=txt;
    if(placeholder){ o.disabled=true; o.selected=true; } sel.appendChild(o); }
  function fillDates(){
    var d=$("f-day"), m=$("f-mon"), y=$("f-year"), th=$("f-bth"), tm=$("f-btm");
    if(!d||d.options.length) return;
    addOpt(d,"","วัน",true); for(var i=1;i<=31;i++) addOpt(d,i,String(i));
    addOpt(m,"","เดือน",true); for(var j=0;j<12;j++) addOpt(m,j+1,TH_MONTHS[j]);
    addOpt(y,"","ปีเกิด",true);
    var nowBE=(new Date(Date.now()+7*3600*1000)).getUTCFullYear()+543;
    for(var b=nowBE;b>=nowBE-95;b--) addOpt(y,b,"พ.ศ. "+b);
    /* เวลาเกิดละเอียดถึงนาที — ตอนนี้ใช้แยกพุธกลางวัน/กลางคืน (ราหู) และเก็บไว้ผูกดวงละเอียดในอนาคต */
    addOpt(th,"","ไม่ทราบเวลา",true);
    for(var h=0;h<24;h++) addOpt(th, pad2(h), pad2(h)+" น.");
    addOpt(tm,"","นาที",true);
    for(var mi=0;mi<60;mi++) addOpt(tm, pad2(mi), ": "+pad2(mi));
  }
  function buildBirthTime(){
    var h=$("f-bth").value;
    if(!h) return "";
    return h + ":" + ($("f-btm").value || "00");
  }
  /* ช่องทางที่เจอ: multi + อื่น ๆ แนบข้อความที่ลูกค้าพิมพ์เอง */
  function buildChannel(){
    var c = state.channel || "";
    var o = $("f-ch-other").value.trim();
    if(o && c.indexOf("อื่นๆ") !== -1) c = c.replace("อื่นๆ", "อื่นๆ: " + o);
    return c;
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
  /* multi-select: toggle pills, store as comma-joined list */
  function wireGroupMulti(gid, key){
    var g = $(gid);
    g.addEventListener("click", function(e){
      var b = e.target.closest(".pill"); if(!b) return;
      b.classList.toggle("on");
      var vals = [];
      Array.prototype.forEach.call(g.querySelectorAll(".pill.on"), function(p){ vals.push(p.getAttribute("data-v")); });
      state[key] = vals.join(",");
    });
  }
  wireGroup("g-sex","sex"); wireGroupMulti("g-int","interest"); wireGroupMulti("g-ch","channel");
  /* เลือก อื่น ๆ → เปิดช่องพิมพ์เล่าเอง */
  $("g-ch").addEventListener("click", function(){
    $("f-ch-other").classList.toggle("hidden", state.channel.indexOf("อื่นๆ") === -1);
  });

  /* ---- onboarding stepper ---- */
  function renderStep(){
    for(var i=0;i<4;i++){ $("st"+i).classList.toggle("hidden", i!==state.step); $("d"+i).classList.toggle("on", i<=state.step); }
    $("ob-back").classList.toggle("hidden", state.step===0);
    $("ob-next").textContent = state.step===3 ? "เสร็จแล้ว" : "ต่อไป";
  }
  $("ob-back").addEventListener("click", function(){ if(state.step>0){ state.step--; renderStep(); } });
  $("ob-next").addEventListener("click", function(){
    if(state.step===0 && !$("f-nick").value.trim()){ $("f-nick").focus(); return; }
    if(state.step===1){
      if(!$("f-day").value){ $("f-day").focus(); return; }
      if(!$("f-mon").value){ $("f-mon").focus(); return; }
      if(!$("f-year").value){ $("f-year").focus(); return; }
    }
    /* เพศบังคับเลือก (เลือก ไม่ระบุ ก็ได้) — เว้นแค่เวลาเกิดที่ไม่บังคับ */
    if(state.step===2 && !state.sex){
      var gs = $("g-sex");
      gs.style.outline = "2px solid #d9534f"; gs.style.borderRadius = "14px";
      setTimeout(function(){ gs.style.outline = ""; }, 1600);
      return;
    }
    if(state.step<3){ state.step++; renderStep(); return; }
    /* เบอร์โทรบังคับ (ตัวเลข 9-10 หลัก) ก่อนเปิดดวง */
    var ph = $("f-ph").value.replace(/[^0-9]/g, "");
    if(ph.length < 9 || ph.length > 10){
      $("f-ph").classList.add("fielderr");
      $("f-ph").focus();
      return;
    }
    $("f-ph").classList.remove("fielderr");
    saveProfile();
  });

  function buildBirthdate(){
    var dd=$("f-day").value, mm=$("f-mon").value, yy=$("f-year").value;
    if(!(dd&&mm&&yy)) return "";
    return (parseInt(yy,10)-543) + "-" + pad2(mm) + "-" + pad2(dd); // BE -> CE, YYYY-MM-DD
  }

  /* All API calls carry the LINE idToken; the server verifies it and derives
     the userId itself. On 401 (token expired) → one re-login round trip. */
  function api(path, opts){
    opts = opts || {};
    var h = opts.headers || {};
    try { h["Authorization"] = "Bearer " + (liff.getIDToken() || ""); } catch(e){}
    opts.headers = h;
    return fetch(path, opts).then(function(r){
      if(r.status === 401 && !sessionStorage.getItem("liffReauth")){
        sessionStorage.setItem("liffReauth", "1");
        liff.login();
        return new Promise(function(){});
      }
      return r;
    });
  }

  function saveProfile(){
    var btn = $("ob-next"); btn.disabled = true; btn.textContent = "อาจารย์กำลังจดไว้...";
    api("/api/liff/profile", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        displayName: state.displayName,
        nickname: $("f-nick").value.trim(), birthdate: buildBirthdate(), birth_time: buildBirthTime(),
        gender: state.sex, interest: state.interest, channel: buildChannel(), phone: $("f-ph").value.trim()
      })
    }).then(function(r){ return r.json(); }).then(function(j){
      btn.disabled=false;
      if(j && j.ok){ enterHome($("f-nick").value.trim()); } else { btn.textContent="ลองอีกครั้ง"; }
    }).catch(function(){ btn.disabled=false; btn.textContent="ลองอีกครั้ง"; });
  }

  /* ---- home ---- */
  function greetWord(){
    var h = (new Date(Date.now() + 7*3600*1000)).getUTCHours();
    if(h>=1&&h<5) return "สวัสดีตอนตี " + h;
    if(h<12) return "สวัสดีตอนเช้า";
    if(h<17) return "สวัสดีตอนบ่าย";
    if(h<21) return "สวัสดีตอนเย็น";
    return "สวัสดีตอนดึก";
  }
  function thDate(){
    var d = new Date(Date.now() + 7*3600*1000);
    var m = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
    return d.getUTCDate() + " " + m[d.getUTCMonth()] + " " + (d.getUTCFullYear()+543);
  }
  /* WOW: count the score up 0 → n on entry (skipped when reduced-motion) */
  function countUp(el, target){
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduce){ el.textContent = target; return; }
    var t0 = null, dur = 1100;
    function step(ts){
      if(!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  /* 7-day trend sparkline (smoothed quadratic curve, like the v6 mockup) */
  function renderSpark(history){
    if(!history || history.length < 2) return;
    var W=126, H=46, padX=6, top=7, bottom=40;
    var n = history.length;
    var pts = history.map(function(h, i){
      var x = padX + i * ((W - padX*2) / (n - 1));
      var y = bottom - ((h.score - 55) / 40) * (bottom - top);
      return [Number(x.toFixed(1)), Number(Math.max(top, Math.min(bottom, y)).toFixed(1))];
    });
    var d = "M" + pts[0][0] + " " + pts[0][1];
    for(var i=1;i<n;i++){
      var mx = ((pts[i-1][0]+pts[i][0])/2).toFixed(1);
      var my = ((pts[i-1][1]+pts[i][1])/2).toFixed(1);
      d += " Q" + pts[i-1][0] + " " + pts[i-1][1] + " " + mx + " " + my;
    }
    d += " T" + pts[n-1][0] + " " + pts[n-1][1];
    $("sp-line").setAttribute("d", d);
    $("sp-area").setAttribute("d", d + " L" + pts[n-1][0] + " " + H + " L" + pts[0][0] + " " + H + " Z");
    $("sp-dot").setAttribute("cx", pts[n-1][0]);
    $("sp-dot").setAttribute("cy", pts[n-1][1]);
    if(n >= 2){
      $("sp-dot-prev").setAttribute("cx", pts[n-2][0]);
      $("sp-dot-prev").setAttribute("cy", pts[n-2][1]);
    }
  }
  /* explicit vs-yesterday chip: ▲ ขึ้น / ▼ ลง / เท่าเดิม */
  function renderDelta(history){
    var el = $("s-delta");
    if(!el || !history || history.length < 2){ return; }
    var today = history[history.length-1].score;
    var yesterday = history[history.length-2].score;
    var d = today - yesterday;
    el.classList.remove("hidden","up","down","flat");
    if(d > 0){ el.classList.add("up"); el.textContent = "▲ +" + d + " จากเมื่อวาน"; }
    else if(d < 0){ el.classList.add("down"); el.textContent = "▼ " + d + " จากเมื่อวาน"; }
    else { el.classList.add("flat"); el.textContent = "เท่าเมื่อวาน"; }
  }
  /* scan-first hero: คลังพลังของคุณ */
  function loadStats(){
    api("/api/liff/stats")
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(!j || !j.ok) return;
        countUp($("st-count"), j.scanned || 0);
        $("st-left").textContent = j.remaining != null ? j.remaining : 0;
        $("st-top").textContent = j.topScore != null ? j.topScore : "–";
        $("st-axis").textContent = j.bestAxis || "–";
        /* บรรทัดจิ๋วแยกฟรี/แพ็ก ใต้ตัวเลขรวม (โปร่งใสว่าสิทธิ์มาจากไหน) */
        var sub = $("st-left-sub");
        if(sub){
          if(j.remainingPaid > 0){
            sub.textContent = "ฟรี " + (j.remainingFree || 0) + " · แพ็ก " + j.remainingPaid;
            sub.classList.remove("hidden");
          } else {
            sub.classList.add("hidden");
          }
        }
        /* ลูกค้าใหม่ยังไม่เคยสแกน: ตารางขีด ๆ ดูจืด → สลับเป็นการ์ดชวนสแกนองค์แรก */
        var first = $("st-first"), grid = $("stgrid");
        if(first && grid){
          var fresh = !(j.scanned > 0);
          first.classList.toggle("hidden", !fresh);
          grid.classList.toggle("hidden", fresh);
          if(fresh) $("st-first-free").textContent = j.remainingFree != null ? j.remainingFree : 2;
        }
      }).catch(function(){});
  }
  function pkCountUp(el, target){
    var t0 = null, dur = 900;
    function step(ts){
      if(!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      k = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * k);
      if(k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function loadDailyPick(){
    api("/api/liff/daily-pick").then(function(r){ return r.json(); }).then(function(j){
      if(!j || !j.ok || j.empty) return;
      var items = j.items || [];
      if(!items.length) return;
      $("pickcard").classList.remove("hidden");
      var dayBits = [];
      if (j.dayStar) dayBits.push("อิงพลัง" + j.dayStar);
      if (j.streak >= 2) dayBits.push("เปิดต่อเนื่อง " + j.streak + " วัน");
      $("pk-day").textContent = dayBits.join(" · ");

      var hero = items[0];
      var hbox = $("pk-hero");
      hbox.innerHTML =
        (hero.img ? '<img class="pk-img" src="' + hero.img + '" alt="" onerror="this.remove()">' : '') +
        '<div style="min-width:0;flex:1">' +
          '<span class="pk-tag">' + (j.member ? "อาจารย์เลือกให้วันนี้" : "ชิ้นล่าสุดของคุณ") + '</span>' +
          (hero.moved === "up" ? '<span class="pk-up">ขึ้นจากเมื่อวาน</span>' : '') +
          '<div class="pk-name">' + hero.name + '</div>' +
          '<div><b class="serif pk-suit" id="pk-suit-n">0</b><span class="pk-suitl"> เหมาะกับวันนี้ %</span></div>' +
        '</div>';
      hbox.classList.remove("hidden");
      var rs = $("pk-reason");
      rs.textContent = hero.reason || "";
      rs.classList.toggle("hidden", !hero.reason);
      pkCountUp($("pk-suit-n"), hero.suit);

      var list = $("pk-list"); list.innerHTML = "";
      items.slice(1).forEach(function(it){
        var row = document.createElement("div");
        row.className = "pk-row";
        row.innerHTML =
          (it.img ? '<img src="' + it.img + '" alt="" onerror="this.remove()">' : '') +
          '<div class="pk-rn"><b>' + it.name + '</b>' +
          '<span>' + (it.peakLabel ? "พลังเด่นด้าน" + it.peakLabel : "พลังโดยรวมเข้ากับวันนี้") + '</span></div>' +
          '<b class="serif" style="flex:0 0 auto;font-size:1.1rem;color:var(--gold-deep)">' + it.suit + '</b>';
        list.appendChild(row);
      });

      if(!j.member && j.lockedCount > 0){
        var lk = $("pk-lock");
        lk.textContent = "ในคลังคุณมีอีก " + j.lockedCount + " ชิ้น สมาชิกรายเดือนให้อาจารย์เทียบทั้งหมดแล้วเลือกให้ทุกเช้า";
        lk.classList.remove("hidden");
        var up = $("pk-upgrade"); up.classList.remove("hidden");
        // ปุ่มขายสมาชิกรายเดือน → เปิดหน้าจ่ายโดยติ๊ก 299 มาให้เลย (กบ 14 ก.ค.)
        up.onclick = function(){ openPay(true); };
      }
    }).catch(function(){});
  }

  function enterHome(nickname){
    $("h-when").textContent = greetWord();
    $("h-name").textContent = "คุณ" + (nickname || state.displayName || "");
    $("s-date").textContent = thDate();
    loadStats();
    loadDailyPick();
    api("/api/liff/daily")
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(!j || !j.ok) return;
        countUp($("s-num"), j.score);
        $("s-grade").textContent = j.grade;
        $("s-msg").textContent = j.message;
        $("s-lucky").textContent = j.luckyNums ? j.luckyNums.join(" และ ") : j.luckyNum;
        /* ดวงวันนี้: fill the collapsed strip too */
        $("ds-num").textContent = j.score;
        $("ds-lucky").textContent = j.luckyNums ? j.luckyNums.join(" ") : j.luckyNum;
        if(j.luckyColor){
          $("ds-color").textContent = j.luckyColor.name.replace("สี","");
          $("ds-cdot").style.background = j.luckyColor.hex;
        }
        if(j.history && j.history.length > 1){
          var dd = j.score - j.history[j.history.length-2].score;
          var dsd = $("ds-delta");
          dsd.classList.remove("hidden","up","down","flat");
          if(dd > 0){ dsd.classList.add("up"); dsd.textContent = "▲+" + dd; }
          else if(dd < 0){ dsd.classList.add("down"); dsd.textContent = "▼" + dd; }
          else { dsd.classList.add("flat"); dsd.textContent = "="; }
        }
        if(j.luckyColor){
          $("s-color").textContent = j.luckyColor.name.replace("สี","");
          $("s-cdot").style.background = j.luckyColor.hex;
        }
        if(j.banColor){
          $("s-ban").textContent = j.banColor.name.replace("สี","");
          $("s-bdot").style.background = j.banColor.hex;
          $("s-banwrap").classList.remove("hidden");
        }
        var cap = document.querySelector(".sparkcap");
        if(cap){
          cap.textContent = j.basis === "taksa"
            ? "ดวง 7 วัน · ตามตำราทักษาไทย"
            : "กรอกวันเกิดใน ข้อมูลของฉัน เพื่อดวงตามตำรา";
        }
        renderSpark(j.history);
        renderDelta(j.history);
      }).catch(function(){});
    show("v-home");
  }
  function renderMe(){
    var el = $("me-card");
    el.innerHTML = '<div class="why">กำลังโหลด...</div>';
    api("/api/liff/profile").then(function(r){ return r.json(); }).then(function(j){
      var p = (j && j.profile) || {};
      function row(k, v){ return '<div style="display:flex;justify-content:space-between;gap:12px"><span class="why">' + k + '</span><b>' + (v || "-") + '</b></div>'; }
      var bd = "-";
      if (p.birthdate) {
        var m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(String(p.birthdate));
        if (m) bd = Number(m[3]) + "/" + Number(m[2]) + "/" + (Number(m[1]) + 543);
      }
      el.innerHTML =
        row("ชื่อเล่น", p.nickname) +
        row("วันเกิด", bd) +
        row("เวลาเกิด", p.birth_time || "ไม่ระบุ") +
        row("เพศ", p.gender) +
        row("เบอร์โทร", p.phone) +
        row("เรื่องที่สนใจ", p.interest);
    }).catch(function(){ el.innerHTML = '<div class="why">โหลดไม่สำเร็จ ลองใหม่อีกครั้ง</div>'; });
  }
  $("btn-edit").addEventListener("click", function(){ renderMe(); show("v-me"); });

  /* ---- monthly reading ---- */
  var READ_AXES = ["การงาน","การเงิน","ความรัก","สุขภาพ","โชคลาภ"];
  function radarPt(i, v){
    var ang = -Math.PI/2 + i*2*Math.PI/5;
    var r = 46*Math.max(0,Math.min(100,v))/100;
    return [(70 + r*Math.cos(ang)).toFixed(1), (62 + r*Math.sin(ang)).toFixed(1)];
  }
  function renderReading(j){
    $("rd-month").textContent = j.monthLabel || "";
    var wrap = $("rd-cards"); wrap.innerHTML = "";
    (j.cards || []).forEach(function(c, i){
      var el = document.createElement("div");
      el.className = "tcard" + (i===1 ? " mid" : "");
      el.innerHTML = '<div class="te">' + c.e + '</div><div class="tn">' + c.n +
        '</div><div class="tk">' + c.k + '</div><span class="tp">' + c.pos + '</span>';
      wrap.appendChild(el);
    });
    $("rd-num").textContent = j.overall;
    $("rd-grade").textContent = j.grade;
    var pts = [], dots = document.querySelectorAll(".rd-dot");
    READ_AXES.forEach(function(ax, i){
      var v = (j.axes && j.axes[ax]) || 0;
      var p = radarPt(i, v);
      pts.push(p[0] + "," + p[1]);
      if(dots[i]){ dots[i].setAttribute("cx", p[0]); dots[i].setAttribute("cy", p[1]); }
      var lab = $("rl" + i);
      if(lab) lab.innerHTML = ax + " <b>" + v + "</b>";
    });
    var poly = $("rd-poly"); if(poly) poly.setAttribute("points", pts.join(" "));
    if(j.astro){
      $("sm-bd").textContent = j.astro.birthdateLabel || "–";
      $("sm-zd").textContent = j.astro.zodiac || "–";
      $("sm-el").textContent = j.astro.element || "–";
      $("sm-an").textContent = j.astro.animal || "–";
      $("sm-ag").textContent = j.astro.age != null ? j.astro.age + " ปี" : "–";
    }
    $("sm-bx").textContent = j.bestAxis || "–";
    $("rd-text").textContent = j.reading || "";
    $("rd-adv").textContent = j.advice || "";
    var lk = j.lucky || [];
    $("lk0").textContent = lk[0] != null ? lk[0] : "–";
    $("lk1").textContent = lk[1] != null ? lk[1] : "–";
    $("lk2").textContent = lk[2] != null ? lk[2] : "–";
    $("lk3").textContent = j.luckyPair != null ? j.luckyPair : "–";
  }
  function openReading(){
    var btn = $("btn-reading");
    if(btn){ btn.disabled = true; btn.textContent = "กำลังเปิดไพ่..."; }
    api("/api/liff/reading")
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(btn){ btn.disabled = false; btn.textContent = "🔮 เปิดดวงประจำเดือน"; }
        if(!j || !j.ok){ alert("เปิดดวงไม่สำเร็จ ลองใหม่อีกครั้งครับ"); return; }
        if(j.needsProfile || j.needsBirthdate){
          $("rd-needbd").classList.remove("hidden");
          $("rd-body").classList.add("hidden");
          $("rd-month").textContent = "";
          show("v-read");
          return;
        }
        $("rd-needbd").classList.add("hidden");
        $("rd-body").classList.remove("hidden");
        renderReading(j);
        show("v-read");
      })
      .catch(function(){
        if(btn){ btn.disabled = false; btn.textContent = "🔮 เปิดดวงประจำเดือน"; }
        alert("เปิดดวงไม่สำเร็จ ลองใหม่อีกครั้งครับ");
      });
  }
  $("btn-reading").addEventListener("click", openReading);
  $("nav-read").addEventListener("click", openReading);
  $("nav-me").addEventListener("click", function(){ renderMe(); show("v-me"); });
  $("nav-theme").addEventListener("click", function(){ renderThemes(); show("v-theme"); });
  $("rd-back").addEventListener("click", function(){ show("v-home"); });
  $("rd-fill").addEventListener("click", function(){ state.step=0; renderStep(); show("v-ob"); });
  $("rd-ask").addEventListener("click", function(){
    try{
      liff.sendMessages([{ type:"text", text:"ถามอาจารย์เรื่องดวงเดือนนี้" }])
        .then(function(){ liff.closeWindow(); })
        .catch(function(){ alert("กลับไปที่แชต แล้วพิมพ์ถามอาจารย์ได้เลยครับ"); liff.closeWindow(); });
    }catch(e){ alert("กลับไปที่แชต แล้วพิมพ์ถามอาจารย์ได้เลยครับ"); }
  });

  /* service rows / buttons → send message into the chat then close */
  function sendSay(say){
    try{
      liff.sendMessages([{ type:"text", text: say }])
        .then(function(){ liff.closeWindow(); })
        .catch(function(){ alert("กลับไปที่แชต แล้วพิมพ์คำว่า " + say + " ได้เลยครับ"); liff.closeWindow(); });
    }catch(e){ alert("กลับไปที่แชต แล้วพิมพ์คำว่า " + say + " ได้เลยครับ"); }
  }
  Array.prototype.forEach.call(document.querySelectorAll(".row[data-say]"), function(btn){
    btn.addEventListener("click", function(){ sendSay(btn.getAttribute("data-say")); });
  });
  /* สแกนเลย = ปิด LIFF กลับแชทเงียบ ๆ (กบ: ไม่ต้องยิงข้อความให้บอทตอบ ลูกค้าแนบรูปเองเลย) */
  function closeToChat(){ try { liff.closeWindow(); } catch(e) { window.close(); } }
  $("btn-scan").addEventListener("click", closeToChat);
  $("mt-scan").addEventListener("click", closeToChat);
  $("row-monthly").addEventListener("click", openReading);

  /* ดวงวันนี้ strip ↔ full card */
  $("dstrip").addEventListener("click", function(){
    var card = $("scorecard");
    var open = card.classList.toggle("hidden") === false;
    this.classList.toggle("open", open);
    this.setAttribute("aria-expanded", open ? "true" : "false");
  });

  /* ---- หาเครื่องรางที่เข้ากับดวง ---- */
  var lastMatch = null;
  function renderMatch(j){
    lastMatch = j;
    $("mt-day").textContent = j.birthDay || "–";
    $("mt-num").textContent = j.luckyNum != null ? j.luckyNum : "–";
    $("mt-buddha").textContent = j.buddha || "–";
    $("mt-star").textContent = j.star || "";
    var recs = $("mt-recs"); recs.innerHTML = "";
    (j.recs || []).forEach(function(rc){
      var el = document.createElement("div");
      el.className = "mtrec";
      el.innerHTML = '<div class="t">' + rc.t + '</div><div class="d">' + rc.d + '</div>';
      recs.appendChild(el);
    });
    var st = $("mt-stones"); st.innerHTML = "";
    (j.stones || []).forEach(function(s){
      var el = document.createElement("span");
      el.className = "mtstone";
      el.innerHTML = '<i style="background:' + s.hex + '"></i>' + s.n;
      st.appendChild(el);
    });
    var gc = $("mt-good"); gc.innerHTML = "";
    (j.goodColors || []).forEach(function(c){
      var el = document.createElement("span");
      el.className = "mtcolor";
      el.innerHTML = '<i style="background:' + c.hex + '"></i>' + c.name.replace("สี","");
      gc.appendChild(el);
    });
    if(j.banColor){
      $("mt-ban").textContent = j.banColor.name.replace("สี","");
      $("mt-bandot").style.background = j.banColor.hex;
    }
    if(j.days){
      $("mt-det").textContent = j.days.det || "–";
      $("mt-sri").textContent = j.days.sri || "–";
      $("mt-mon").textContent = j.days.montri || "–";
      $("mt-kala").textContent = j.days.kala || "–";
    }
    var fs = $("mt-fs");
    if(j.fromScans && j.fromScans.have){
      var t = "จากคลังที่คุณสแกนมา " + j.fromScans.scanned + " ชิ้น พลังที่เด่นอยู่แล้วคือ <b>" + j.fromScans.have + "</b>";
      if(j.fromScans.boost){ t += " ถ้าอยากให้ดวงกลมขึ้น ลองมองหาชิ้นที่เสริมด้าน <b>" + j.fromScans.boost + "</b> เพิ่มดูนะ"; }
      fs.innerHTML = t;
      fs.classList.remove("hidden");
    } else {
      fs.classList.add("hidden");
    }
  }
  function openMatch(){
    api("/api/liff/match")
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(!j || !j.ok){ alert("เปิดไม่สำเร็จ ลองใหม่อีกครั้งครับ"); return; }
        if(j.needsBirthdate){
          $("mt-needbd").classList.remove("hidden");
          $("mt-body").classList.add("hidden");
        } else {
          $("mt-needbd").classList.add("hidden");
          $("mt-body").classList.remove("hidden");
          renderMatch(j);
        }
        show("v-match");
      })
      .catch(function(){ alert("เปิดไม่สำเร็จ ลองใหม่อีกครั้งครับ"); });
  }
  /* row-match ถูกพักเป็น "เร็ว ๆ นี้" — openMatch ยังอยู่ พร้อมต่อกลับเมื่อเปิดบริการ */
  void openMatch;
  /* แชร์การ์ดดวงให้เพื่อน (viral loop): flex card ผ่าน shareTargetPicker */
  function buildShareFlex(j){
    var liffUrl = "https://liff.line.me/" + (liff.id || "");
    var recTitle = (j.recs && j.recs[0] && j.recs[0].t) || "";
    var stones = (j.stones || []).map(function(s){ return s.n; }).slice(0,3).join(" · ");
    var colors = (j.goodColors || []).map(function(c){ return c.name.replace("สี",""); }).slice(0,3).join(" · ");
    var body = [
      { type:"text", text:"เครื่องรางที่เข้ากับดวง", size:"xs", color:"#a5813a", weight:"bold" },
      { type:"text", text:"คนเกิดวัน" + (j.birthDay || "–"), size:"xl", weight:"bold", color:"#2c2418", margin:"sm" },
      { type:"text", text: j.buddha || "", size:"sm", color:"#6b5d45", wrap:true, margin:"xs" },
      { type:"separator", margin:"lg", color:"#eee2c8" }
    ];
    if(recTitle) body.push({ type:"text", text:"สายเสริมดวง  " + recTitle, size:"sm", color:"#2c2418", wrap:true, margin:"lg" });
    if(stones) body.push({ type:"text", text:"หินถูกโฉลก  " + stones, size:"sm", color:"#2c2418", wrap:true, margin:"sm" });
    if(colors) body.push({ type:"text", text:"สีนำโชค  " + colors, size:"sm", color:"#2c2418", wrap:true, margin:"sm" });
    return {
      type:"flex",
      altText:"ดวงคนเกิดวัน" + (j.birthDay || "") + " เครื่องรางสายไหนเสริมดวง มาดูของคุณบ้าง",
      contents:{
        type:"bubble",
        body:{ type:"box", layout:"vertical", backgroundColor:"#fdf9f0", paddingAll:"20px", contents: body },
        footer:{ type:"box", layout:"vertical", backgroundColor:"#fdf9f0", paddingAll:"14px", contents:[
          { type:"button", style:"primary", color:"#a5813a", height:"sm",
            action:{ type:"uri", label:"เปิดดูดวงของฉันบ้าง", uri: liffUrl } },
          { type:"text", text:"Ener อ่านพลังพระ เครื่องราง หินมงคล", size:"xxs", color:"#a89a7e", align:"center", margin:"sm" }
        ]}
      }
    };
  }
  $("mt-share").addEventListener("click", function(){
    if(!lastMatch) return;
    var msg = buildShareFlex(lastMatch);
    if(liff.isApiAvailable && liff.isApiAvailable("shareTargetPicker")){
      liff.shareTargetPicker([msg]).catch(function(){});
    } else {
      alert("เปิดจากในแอป LINE แล้วกดแชร์อีกครั้งครับ");
    }
  });
  $("mt-back").addEventListener("click", function(){ show("v-home"); });
  $("mt-fill").addEventListener("click", function(){ state.step=0; renderStep(); show("v-ob"); });
  $("th-back").addEventListener("click", function(){ show("v-home"); });

  /* ---- เติมสิทธิ์สแกน ---- */
  var pay = { pkgs: [], selected: "", qrUrl: "", slipB64: "" };

  function payRenderPkgs(){
    var wrap = $("pay-pkgs"); wrap.innerHTML = "";
    pay.pkgs.forEach(function(p){
      var b = document.createElement("button");
      b.className = "pkg" + (p.key === pay.selected ? " on" : "");
      var unlimited = p.scanCount >= 999999;
      var countTxt = unlimited ? "สแกนไม่จำกัด" : "สแกน " + p.scanCount + " ครั้ง";
      var winTxt = (p.windowHours >= 48 && p.windowHours % 24 === 0)
        ? (unlimited ? "สมาชิกรายเดือน · อาจารย์ดูแลตลอด " : "ใช้ได้ ") + (p.windowHours / 24) + " วัน"
        : "ใช้ได้ภายใน " + p.windowHours + " ชั่วโมง";
      b.innerHTML = '<span class="pk-price">' + p.priceThb + '<small> บาท</small></span>' +
        '<span class="pk-d"><span class="pk-t">' + countTxt + '</span>' +
        '<span class="pk-s">' + winTxt + '</span></span>' +
        '<span class="pk-r"></span>';
      b.addEventListener("click", function(){ pay.selected = p.key; payRenderPkgs(); });
      wrap.appendChild(b);
    });
  }

  function openPay(preferUnlimited){
    show("v-pay");
    $("pay-pick").classList.remove("hidden");
    $("pay-qr").classList.add("hidden");
    $("pay-done").classList.add("hidden");
    api("/api/liff/pay/info").then(function(r){ return r.json(); }).then(function(j){
      if(!j || !j.ok) return;
      pay.pkgs = j.packages || [];
      pay.selected = j.defaultPackageKey || (pay.pkgs[0] && pay.pkgs[0].key) || "";
      if(preferUnlimited === true){
        var mo = pay.pkgs.filter(function(p){ return p.scanCount >= 999999; })[0];
        if(mo) pay.selected = mo.key;
      }
      pay.qrUrl = j.qrUrl || "";
      payRenderPkgs();
      var rem = $("pay-remain");
      if(j.access && j.access.paidRemainingScans > 0){
        rem.textContent = j.access.paidRemainingScans >= 900000
          ? "✦ ตอนนี้ใช้แพ็กไม่จำกัดอยู่"
          : "✦ ตอนนี้เหลือสิทธิ์สแกน " + j.access.paidRemainingScans + " ครั้ง";
        rem.classList.remove("hidden");
      } else { rem.classList.add("hidden"); }
      if(j.payment && j.payment.status === "pending_verify"){
        payShowDone("⏳", "สลิปกำลังตรวจอยู่", "รายการก่อนหน้ากำลังตรวจ เดี๋ยวอาจารย์แจ้งผลในแชตครับ");
      }
    }).catch(function(){});
  }

  function payShowQr(j){
    $("pay-pick").classList.add("hidden");
    $("pay-done").classList.add("hidden");
    $("pay-qr").classList.remove("hidden");
    $("pay-amt").textContent = j.amount + " บาท";
    if(j.qrUrl){ $("pay-qrimg").src = j.qrUrl; }
    $("pay-ref").textContent = j.paymentRef ? "รหัสรายการ " + j.paymentRef : "";
    pay.slipB64 = "";
    $("pay-prev").classList.add("hidden");
    $("pay-send").classList.add("hidden");
    $("pay-dt").textContent = "📎 แตะเพื่อแนบสลิปโอนเงิน";
  }

  function payShowDone(ic, t, p){
    $("pay-pick").classList.add("hidden");
    $("pay-qr").classList.add("hidden");
    $("pay-done").classList.remove("hidden");
    $("pd-ic").textContent = ic; $("pd-t").textContent = t; $("pd-p").textContent = p;
  }

  $("pay-go").addEventListener("click", function(){
    var btn = $("pay-go"); btn.disabled = true; btn.textContent = "กำลังสร้างรายการ...";
    api("/api/liff/pay/create", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ packageKey: pay.selected }) })
      .then(function(r){ return r.json(); })
      .then(function(j){
        btn.disabled = false; btn.textContent = "💳 สร้างรายการโอน";
        if(!j || !j.ok){ alert("สร้างรายการไม่สำเร็จ ลองใหม่อีกครั้งครับ"); return; }
        if(j.result === "pending_verify"){
          payShowDone("⏳", "สลิปกำลังตรวจอยู่", "รายการก่อนหน้ากำลังตรวจ เดี๋ยวอาจารย์แจ้งผลในแชตครับ");
          return;
        }
        payShowQr(j);
      })
      .catch(function(){ btn.disabled = false; btn.textContent = "💳 สร้างรายการโอน"; alert("สร้างรายการไม่สำเร็จ ลองใหม่อีกครั้งครับ"); });
  });

  /* slip: downscale big photos client-side so upload stays snappy */
  function fileToJpegB64(file, cb){
    var fr = new FileReader();
    fr.onload = function(){
      var img = new Image();
      img.onload = function(){
        var max = 1600, w = img.width, h = img.height;
        if(Math.max(w,h) > max){ var k = max/Math.max(w,h); w = Math.round(w*k); h = Math.round(h*k); }
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(c.toDataURL("image/jpeg", .88));
      };
      img.onerror = function(){ cb(""); };
      img.src = fr.result;
    };
    fr.onerror = function(){ cb(""); };
    fr.readAsDataURL(file);
  }

  $("pay-file").addEventListener("change", function(){
    var f = this.files && this.files[0];
    if(!f) return;
    fileToJpegB64(f, function(b64){
      if(!b64){ alert("อ่านรูปไม่สำเร็จ ลองรูปอื่นดูครับ"); return; }
      pay.slipB64 = b64;
      var pv = $("pay-prev"); pv.src = b64; pv.classList.remove("hidden");
      $("pay-dt").textContent = "แตะอีกครั้งถ้าอยากเปลี่ยนรูป";
      $("pay-send").classList.remove("hidden");
    });
  });

  $("pay-send").addEventListener("click", function(){
    if(!pay.slipB64) return;
    var btn = $("pay-send"); btn.disabled = true; btn.textContent = "🔍 กำลังตรวจสลิป...";
    api("/api/liff/pay/slip", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ imageBase64: pay.slipB64 }) })
      .then(function(r){ return r.json(); })
      .then(function(j){
        btn.disabled = false; btn.textContent = "✅ ส่งสลิปให้ตรวจ";
        if(!j || !j.ok){ alert("ส่งสลิปไม่สำเร็จ ลองใหม่อีกครั้งครับ"); return; }
        if(j.result === "approved"){
          payShowDone("🎉", "เปิดสิทธิ์สแกนแล้ว", "ตรวจสลิปผ่านเรียบร้อย กลับไปที่แชตแล้วส่งรูปพระ เครื่องราง หิน หรือกำไล ได้เลยครับ");
        } else if(j.result === "pending"){
          payShowDone("⏳", "รับสลิปแล้ว กำลังตรวจ", "กำลังตรวจกับธนาคาร เสร็จแล้วอาจารย์จะแจ้งในแชตทันทีครับ");
        } else {
          alert("รูปนี้ยังไม่เหมือนสลิปโอนเงิน ลองแนบสลิปที่เห็นยอดและเวลาโอนชัด ๆ ครับ");
        }
      })
      .catch(function(){ btn.disabled = false; btn.textContent = "✅ ส่งสลิปให้ตรวจ"; alert("ส่งสลิปไม่สำเร็จ ลองใหม่อีกครั้งครับ"); });
  });

  $("btn-topup").addEventListener("click", openPay);
  $("pay-back").addEventListener("click", function(){ show("v-home"); });
  $("pd-chat").addEventListener("click", function(){
    try{ liff.closeWindow(); }catch(e){ show("v-home"); }
  });

  /* ---- boot ---- */
  function boot(){
    fillDates();
    if(!LIFF_ID){ showLoadMsg("หน้านี้พร้อมแล้ว (รอผูก LIFF ID)"); return; }
    liff.init({ liffId: LIFF_ID }).then(function(){
      if(!liff.isLoggedIn()){ liff.login(); return; }
      return liff.getProfile().then(function(p){
        state.userId = p.userId; state.displayName = p.displayName || "";
        try { sessionStorage.removeItem("liffReauth"); } catch(e){}
        return api("/api/liff/profile").then(function(r){ return r.json(); });
      }).then(function(j){
        if(j && j.found && j.profile && j.profile.nickname){
          enterHome(j.profile.nickname);
          // ลิงก์จากแชท liff.line.me/{id}?view=pay → เข้าหน้าเลือกแพ็กจ่ายทันที
          var qs = new URLSearchParams(location.search);
          var st = qs.get("liff.state") || "";
          if (qs.get("view") === "pay" || st.indexOf("view=pay") !== -1) { openPay(); }
        }
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

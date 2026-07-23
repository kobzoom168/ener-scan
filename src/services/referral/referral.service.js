/**
 * ระบบชวนเพื่อน (กบเคาะ 23 ก.ค. 2026)
 *
 * flow: ลูกค้าพิมพ์ "ชวนเพื่อน" (หรือกดปุ่มใน paywall) → ได้การ์ดโค้ดส่วนตัว +
 * ข้อความชวนสำเร็จรูปไว้ forward → เพื่อน add OA แล้วพิมพ์โค้ด → เพื่อนได้ฟรี +1
 * ทันที + คนชวนได้ +1 ทันที (push แจ้ง)
 *
 * กันโกง: เพื่อนต้องไม่เคยสแกนเลย · 1 บัญชีรับได้ครั้งเดียวตลอดชีพ (unique) ·
 * ใช้โค้ดตัวเองไม่ได้ · คนชวนได้เดือนละไม่เกิน REFERRAL_MONTHLY_CAP (default 5)
 *
 * สิทธิ์ +1 = app_users.bonus_scans (เส้นทางฟรีล้วน — ไม่แตะ paid_until/payments
 * → hasRecentPaidAccess ไม่ขยับ เซ็นเซอร์ 3 วันคงกติกาเดิม)
 */
import { supabase } from "../../config/supabase.js";
import { ensureUserByLineUserId } from "../../stores/users.db.js";
import { getUserScanCount } from "../../stores/paymentAccess.db.js";

const OA_LINK = "https://lin.ee/6YZeFZ1";
// ตัด 0 O 1 I L กันอ่านสับสน
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_BODY_LEN = 4;

export const MONTHLY_CAP = (() => {
  const n = Number(process.env.REFERRAL_MONTHLY_CAP);
  return Number.isFinite(n) && n > 0 && n <= 100 ? Math.floor(n) : 5;
})();

export function referralEnabled() {
  return String(process.env.REFERRAL_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

/** ข้อความที่เข้าข่ายเป็นโค้ดชวนเพื่อน → คืนโค้ด normalized หรือ null */
export function parseReferralCodeText(text) {
  const m = String(text || "")
    .trim()
    .match(/^ener[\s-]?([a-z0-9]{4,8})$/i);
  if (!m) return null;
  return `ENER-${m[1].toUpperCase()}`;
}

function genCodeBody() {
  let out = "";
  for (let i = 0; i < CODE_BODY_LEN; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** โค้ดส่วนตัว (คงที่ต่อคน) — สร้างครั้งแรกเมื่อขอ */
export async function getOrCreateReferralCode(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;
  const { data: existing, error: selErr } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("line_user_id", uid)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing?.code) return String(existing.code);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `ENER-${genCodeBody()}`;
    const { error } = await supabase
      .from("referral_codes")
      .insert({ code, line_user_id: uid });
    if (!error) return code;
    if (/duplicate|unique/i.test(String(error.message || ""))) {
      // ชนที่ code → สุ่มใหม่ · ชนที่ line_user_id (แข่งกันสร้าง) → อ่านของเดิม
      const { data: again } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("line_user_id", uid)
        .maybeSingle();
      if (again?.code) return String(again.code);
      continue;
    }
    throw error;
  }
  return null;
}

function bangkokMonthStartUtcIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  // "YYYY-MM" → เที่ยงคืนไทยวันที่ 1
  return new Date(`${parts}-01T00:00:00+07:00`).toISOString();
}

export async function countReferrerRedemptionsThisMonth(referrerLineUserId, now = new Date()) {
  const { count, error } = await supabase
    .from("referral_redemptions")
    .select("*", { count: "exact", head: true })
    .eq("referrer_line_user_id", String(referrerLineUserId || "").trim())
    .gte("created_at", bangkokMonthStartUtcIso(now));
  if (error) throw error;
  return Number(count) || 0;
}

/** +1 bonus (read-then-write พร้อม guard — ปริมาณต่ำ ยอมรับ retry) */
async function bumpBonusScans(lineUserId) {
  const uid = String(lineUserId || "").trim();
  await ensureUserByLineUserId(uid).catch(() => {});
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: row, error: selErr } = await supabase
      .from("app_users")
      .select("id, bonus_scans")
      .eq("line_user_id", uid)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row?.id) return false;
    const before = Number(row.bonus_scans) || 0;
    const { data: upd, error: updErr } = await supabase
      .from("app_users")
      .update({ bonus_scans: before + 1 })
      .eq("id", row.id)
      .eq("bonus_scans", before)
      .select("id")
      .maybeSingle();
    if (updErr) throw updErr;
    if (upd?.id) return true;
  }
  return false;
}

/**
 * เพื่อนใหม่พิมพ์โค้ด — ตรวจ 4 ด่านแล้วให้สิทธิ์ทั้งคู่
 * @returns {Promise<{ok: true, referrerLineUserId: string} | {ok: false, reason: string}>}
 */
export async function redeemReferralCode({ friendLineUserId, code }) {
  const uid = String(friendLineUserId || "").trim();
  const normalized = String(code || "").trim().toUpperCase();
  if (!uid || !normalized) return { ok: false, reason: "bad_input" };

  const { data: codeRow, error: codeErr } = await supabase
    .from("referral_codes")
    .select("code, line_user_id")
    .eq("code", normalized)
    .maybeSingle();
  if (codeErr) throw codeErr;
  if (!codeRow) return { ok: false, reason: "not_found" };
  const referrer = String(codeRow.line_user_id);
  if (referrer === uid) return { ok: false, reason: "self" };

  const scanCount = await getUserScanCount(uid).catch(() => null);
  if (scanCount == null) return { ok: false, reason: "error" };
  if (scanCount > 0) return { ok: false, reason: "not_new" };

  const used = await countReferrerRedemptionsThisMonth(referrer);
  if (used >= MONTHLY_CAP) return { ok: false, reason: "cap_reached" };

  const { error: insErr } = await supabase.from("referral_redemptions").insert({
    code: normalized,
    referrer_line_user_id: referrer,
    friend_line_user_id: uid,
  });
  if (insErr) {
    if (/duplicate|unique/i.test(String(insErr.message || ""))) {
      return { ok: false, reason: "already_redeemed" };
    }
    throw insErr;
  }

  const friendOk = await bumpBonusScans(uid).catch(() => false);
  const referrerOk = await bumpBonusScans(referrer).catch(() => false);
  console.log(
    JSON.stringify({
      event: "REFERRAL_REDEEMED",
      code: normalized,
      referrerPrefix: referrer.slice(0, 10),
      friendPrefix: uid.slice(0, 10),
      friendBonusOk: friendOk,
      referrerBonusOk: referrerOk,
    }),
  );
  return { ok: true, referrerLineUserId: referrer };
}

/* ────────────────────── ข้อความ/การ์ดฝั่งคนชวน ────────────────────── */

/** ก้อนที่ลูกค้ากด forward ให้เพื่อน (text ธรรมดา — การ์ด Flex ของ OA ส่งต่อไม่ได้) */
export function buildInviteForwardText(code) {
  return [
    "ลองตัวนี้ดู อาจารย์อ่านพลังพระเครื่องจากรูปถ่าย ผมลองแล้วแม่นอยู่",
    `กดลิงก์นี้แล้วพิมพ์โค้ด ${code} ได้สแกนฟรีเลย`,
    OA_LINK,
  ].join("\n");
}

const GOLD = "#a5813a";
const BG = "#fffdf6";

/** การ์ดของลูกค้าเอง: โค้ด + กติกา + สิทธิ์คงเหลือเดือนนี้ */
export function buildInviteCardFlex(code, remainingThisMonth) {
  return {
    type: "flex",
    altText: `โค้ดชวนเพื่อนของคุณ: ${code}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: BG,
        paddingAll: "18px",
        contents: [
          { type: "text", text: "ชวนเพื่อน ได้สแกนฟรี", weight: "bold", size: "lg", color: "#222222" },
          {
            type: "text",
            text: "เพื่อนใหม่ได้สแกนฟรี 1 ครั้ง คุณก็ได้เพิ่ม 1 ครั้ง",
            size: "sm",
            color: "#555555",
            wrap: true,
            margin: "sm",
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            paddingAll: "14px",
            cornerRadius: "12px",
            borderColor: GOLD,
            borderWidth: "2px",
            contents: [
              { type: "text", text: "โค้ดของคุณ", size: "xs", color: "#888888", align: "center" },
              {
                type: "text",
                text: code,
                weight: "bold",
                size: "xxl",
                color: GOLD,
                align: "center",
                margin: "sm",
              },
            ],
          },
          {
            type: "text",
            text: "วิธีใช้: ส่งข้อความด้านล่างต่อให้เพื่อน พอเพื่อนแอดไลน์แล้วพิมพ์โค้ดนี้ สิทธิ์เข้าทั้งคู่ทันทีครับ",
            size: "sm",
            color: "#555555",
            wrap: true,
            margin: "lg",
          },
          {
            type: "text",
            text: `เดือนนี้ชวนได้อีก ${remainingThisMonth} สิทธิ์ (สำหรับเพื่อนที่ยังไม่เคยสแกน)`,
            size: "xs",
            color: "#999999",
            wrap: true,
            margin: "md",
          },
        ],
      },
      styles: { body: { backgroundColor: BG } },
    },
  };
}

/* ────────────────────── ข้อความตอบผลฝั่งเพื่อน ────────────────────── */

export const REDEEM_REPLY_TEXTS = {
  ok: "รับสิทธิ์จากเพื่อนเรียบร้อยครับ ได้สแกนฟรีเพิ่ม 1 ครั้ง ส่งรูปพระหรือเครื่องรางที่อยากรู้พลังมาได้เลยครับ",
  not_found: "โค้ดนี้อาจารย์หาไม่เจอครับ ลองเช็คตัวสะกดจากเพื่อนอีกทีนะครับ",
  self: "โค้ดนี้เป็นของคุณเองครับ ส่งต่อให้เพื่อนที่ยังไม่เคยสแกนใช้ได้เลย",
  not_new: "สิทธิ์นี้สำหรับเพื่อนใหม่ที่ยังไม่เคยสแกนครับ ของคุณใช้สิทธิ์ฟรีรายวันหรือแพ็กเกจได้ตามปกติเลยครับ",
  already_redeemed: "บัญชีนี้เคยรับสิทธิ์ชวนเพื่อนไปแล้วครับ รับได้ครั้งเดียวครับ",
  cap_reached: "โค้ดนี้ใช้สิทธิ์ชวนครบรอบเดือนนี้แล้วครับ เดือนหน้าใช้ได้อีกรอบครับ",
  error: "ตอนนี้ระบบรับโค้ดขัดข้องชั่วคราวครับ อีกสักครู่ลองพิมพ์โค้ดมาใหม่นะครับ",
  bad_input: "โค้ดนี้อาจารย์หาไม่เจอครับ ลองเช็คตัวสะกดจากเพื่อนอีกทีนะครับ",
};

export function buildReferrerNotifyText() {
  return "เพื่อนของคุณเข้ามารับสิทธิ์จากโค้ดชวนแล้วครับ อาจารย์เพิ่มสิทธิ์สแกนฟรีให้คุณ 1 ครั้ง ขอบคุณที่ช่วยบอกต่อครับ";
}

/**
 * LINE text handling for share-to-earn referral:
 *  - user pastes a referral code (anywhere in the message) → redeem
 *  - user asks for their own invite code → show code + share message + credits
 *
 * Pure-ish: returns { handled, text } so the webhook owns the actual reply send.
 * Callers must gate on env.ENABLE_REFERRAL.
 */

import { ensureUserByLineUserId } from "../../stores/users.db.js";
import { getReferralStateForAppUser } from "../../stores/referral.db.js";
import {
  ensureReferralForLineUser,
  redeemReferralCode,
} from "../referral.service.js";
import { extractReferralCodeFromText } from "../../utils/referralCode.util.js";

/** Keywords that mean "give me my invite code / let me invite friends". */
const GET_CODE_KEYWORDS = [
  "โค้ดเชิญ",
  "โค้ดเชิญเพื่อน",
  "รหัสเชิญ",
  "โค้ดของฉัน",
  "โค้ดแนะนำ",
  "ชวนเพื่อน",
  "แชร์โค้ด",
  "ขอโค้ด",
  "รับโค้ด",
  "โค้ดชวนเพื่อน",
  "invite",
  "referral",
  "refer",
];

/**
 * @param {string} code
 * @param {number} credits
 * @returns {string}
 */
export function buildMyCodeReply(code, credits) {
  const lines = [
    "ชวนเพื่อนมาลองสแกนกับอาจารย์ได้เลยครับ 🙏",
    "",
    `โค้ดเชิญของคุณคือ  ${code}`,
    "",
    "บอกเพื่อนให้พิมพ์โค้ดนี้ส่งเข้ามาในแชต พอเพื่อนสแกนครั้งแรกเสร็จ",
    "ทั้งคุณและเพื่อนจะได้สแกนโบนัสเพิ่มทันทีครับ",
  ];
  if (Number(credits) > 0) {
    lines.push("", `ตอนนี้คุณมีสแกนโบนัสสะสม ${Number(credits)} ครั้งครับ`);
  }
  return lines.join("\n");
}

/**
 * @param {{ ok: boolean, reason: string }} res
 * @returns {string}
 */
export function buildRedeemReply(res) {
  if (res.ok) {
    return [
      "รับโค้ดเชิญเรียบร้อยครับ 🙏",
      "พอสแกนองค์แรกเสร็จ อาจารย์จะเติมสแกนโบนัสให้ทันที",
      "ส่งรูปพระหรือเครื่องรางเข้ามาได้เลยครับ",
    ].join("\n");
  }
  switch (res.reason) {
    case "already_referred":
      return "คุณเคยใช้โค้ดเชิญไปแล้วนะครับ โค้ดเชิญใช้ได้ครั้งเดียวต่อคน 🙏";
    case "self":
      return "โค้ดนี้เป็นของคุณเองนะครับ ส่งให้เพื่อนใช้แทนได้เลย 😄";
    case "not_found":
      return "ไม่พบโค้ดเชิญนี้ในระบบครับ ลองเช็กตัวอักษรอีกทีนะครับ";
    default:
      return "โค้ดเชิญยังไม่ถูกต้องครับ รูปแบบจะเป็น EN-XXXXXX ลองส่งมาใหม่นะครับ";
  }
}

/**
 * @param {{ userId: string, text: string }} p
 * @returns {Promise<{ handled: boolean, text?: string }>}
 */
export async function tryHandleReferralText({ userId, text }) {
  const lineUserId = String(userId || "").trim();
  const raw = String(text || "").trim();
  if (!lineUserId || !raw) return { handled: false };

  // 1) Redeem if the message contains a referral code.
  const code = extractReferralCodeFromText(raw);
  if (code) {
    const appUser = await ensureUserByLineUserId(lineUserId);
    const res = await redeemReferralCode({
      refereeAppUserId: String(appUser.id),
      rawCode: code,
    });
    return { handled: true, text: buildRedeemReply(res) };
  }

  // 2) "Give me my invite code" intent.
  const lower = raw.toLowerCase();
  const wantsCode = GET_CODE_KEYWORDS.some(
    (k) => raw.includes(k) || lower.includes(k.toLowerCase()),
  );
  if (wantsCode) {
    const { appUserId, code: myCode } =
      await ensureReferralForLineUser(lineUserId);
    if (!myCode) {
      return {
        handled: true,
        text: "ขออภัยครับ ตอนนี้ออกโค้ดเชิญให้ไม่ได้ ลองใหม่อีกครั้งนะครับ",
      };
    }
    let credits = 0;
    try {
      const state = await getReferralStateForAppUser(appUserId);
      credits = state?.bonusScanCredits ?? 0;
    } catch {
      /* non-fatal */
    }
    return { handled: true, text: buildMyCodeReply(myCode, credits) };
  }

  return { handled: false };
}

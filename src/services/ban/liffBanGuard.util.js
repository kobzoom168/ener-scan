/**
 * Ban gate ฝั่ง LIFF (Codex P0-4): endpoint ที่ mutate หรือเผา AI (slip vision/
 * objectCheck/OCR/payment mutation) ต้องเช็คแบนหลัง auth — คนแบนได้ 403 generic
 * ไม่เฉลยเหตุผล · เช็คพัง = fail-open (isBanned จัดการ timeout/alert เอง)
 */

/**
 * @param {string} userId
 * @param {{ status: Function }} res express response
 * @param {string} source
 * @param {{ isBanned?: Function }} [deps]
 * @returns {Promise<boolean>} true = ถูกบล็อก (ตอบ res แล้ว caller ต้อง return)
 */
export async function rejectIfBannedLiff(userId, res, source, deps = {}) {
  try {
    const check = deps.isBanned || (await import("./bannedUsers.repo.js")).isBanned;
    if (await check(userId)) {
      console.log(
        JSON.stringify({
          event: "LIFF_REQUEST_SUPPRESSED_BANNED",
          uidPrefix: String(userId).slice(0, 8),
          source: String(source || "unknown"),
        }),
      );
      res.status(403).json({ ok: false, error: "unavailable" });
      return true;
    }
  } catch { /* fail-open */ }
  return false;
}

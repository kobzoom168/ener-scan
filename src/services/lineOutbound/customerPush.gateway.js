/**
 * Gateway กลางสำหรับ push ถึงลูกค้า (Codex P0-5): เช็คแบน ณ เวลาส่งจริง —
 * direct push ทุกเส้น (registration success/synergy/precheck/upgrade/YouTube/
 * objectInfoGate/multi-image ฯลฯ) ต้องผ่านตัวนี้ · push ถึงแอดมิน exempt ชัดเจน
 * (smartRejection/maintenanceDlqAlert ส่งหา ADMIN_LINE_USER_ID เท่านั้น)
 * เช็คแบนพลาด = fail-open ส่งตามปกติ (isBanned จัดการ timeout/alert เองแล้ว)
 */

/**
 * เช็คก่อนส่ง — สำหรับ call site ที่ยิง LINE push API ตรง (raw fetch)
 * @param {string} lineUserId
 * @param {{ source?: string, isBanned?: Function }} [opts]
 * @returns {Promise<{ allowed: boolean, suppressedBanned?: boolean }>}
 */
export async function allowCustomerPush(lineUserId, opts = {}) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return { allowed: false };
  try {
    const check = opts.isBanned || (await import("../ban/bannedUsers.repo.js")).isBanned;
    if (await check(uid)) {
      console.log(
        JSON.stringify({
          event: "CUSTOMER_PUSH_SUPPRESSED_BANNED",
          uidPrefix: uid.slice(0, 8),
          source: String(opts.source || "unknown"),
        }),
      );
      return { allowed: false, suppressedBanned: true };
    }
  } catch { /* fail-open */ }
  return { allowed: true };
}

/**
 * push ผ่าน LINE SDK client — เส้นหลักสำหรับ site ที่มี client อยู่แล้ว
 * @param {{ pushMessage: (to: string, msgs: any) => Promise<any> }} client
 * @param {string} lineUserId
 * @param {object | object[]} messages
 * @param {{ source?: string, isBanned?: Function }} [opts]
 * @returns {Promise<{ sent: boolean, suppressedBanned?: boolean }>}
 */
export async function pushToCustomer(client, lineUserId, messages, opts = {}) {
  const gate = await allowCustomerPush(lineUserId, opts);
  if (!gate.allowed) return { sent: false, suppressedBanned: gate.suppressedBanned };
  await client.pushMessage(String(lineUserId).trim(), messages);
  return { sent: true };
}

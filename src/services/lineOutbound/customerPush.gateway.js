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
  // Pre-send hard tone (Codex Blocker 1/2): direct push ก็ต้องผ่าน contract ก่อน
  // transport · typed exemption ระบุชัดเท่านั้น (เช่น scan report body)
  const { enforceHardToneBeforeSend, collectFlexTexts, TONE_EXEMPT_SURFACES } = await import(
    "../../core/conversation/hardTone.util.js"
  );
  /** typed source→kind (Codex P0-5): unknown = reply fail-closed · bundle เฉพาะ payment/list */
  const toneKindForPushSource = (src) => {
    const t = String(src || "");
    if (/payment|qr|slip|paywall|quota_offer|myscans|history|synergy_intro|daily_pick/i.test(t)) return "bundle";
    if (/report|scan_result|registration|welcome|howto|onboarding|object_info|purpose/i.test(t)) return "step";
    return "reply";
  };
  const exempt = opts.toneExemptSurface && TONE_EXEMPT_SURFACES[opts.toneExemptSurface];
  if (!exempt) {
    const list = Array.isArray(messages) ? messages : [messages];
    const texts = [];
    for (const m of list) {
      if (typeof m === "string") texts.push(m);
      else if (m?.type === "text" && typeof m.text === "string") texts.push(m.text);
      else if (m?.type === "flex") texts.push(...collectFlexTexts(m));
    }
    const bad = texts
      .map((t) => enforceHardToneBeforeSend(t, { surface: "customer_push", replyType: opts.source || null, kind: opts.toneKind || toneKindForPushSource(opts.source) }))
      .filter((r) => !r.ok);
    if (bad.length) {
      return {
        sent: false,
        suppressed: true,
        reason: "hard_tone_rejected",
        toneViolations: [...new Set(bad.flatMap((r) => r.violations))],
      };
    }
  }
  await client.pushMessage(String(lineUserId).trim(), messages);
  return { sent: true };
}

/**
 * Customer-visible REPLY boundary (Codex P0-2): เส้น reply ตรงที่ไม่ผ่าน
 * nonScanReply.gateway ต้องมาที่นี่ — ตรวจ hard tone ก่อน transport เสมอ
 * @returns {Promise<{ sent: boolean, reason?: string, toneViolations?: string[] }>}
 */
export async function replyToCustomer(client, replyToken, messages, opts = {}) {
  const { enforceHardToneBeforeSend, collectFlexTexts, TONE_EXEMPT_SURFACES } = await import(
    "../../core/conversation/hardTone.util.js"
  );
  const exempt = opts.toneExemptSurface && TONE_EXEMPT_SURFACES[opts.toneExemptSurface];
  if (!exempt) {
    const list = Array.isArray(messages) ? messages : [messages];
    const texts = [];
    for (const m of list) {
      if (typeof m === "string") texts.push(m);
      else if (m?.type === "text" && typeof m.text === "string") texts.push(m.text);
      else if (m && typeof m === "object") texts.push(...collectFlexTexts(m));
    }
    const kind = opts.toneKind || "step";
    const bad = texts
      .map((t) => enforceHardToneBeforeSend(t, { surface: opts.surface || "customer_reply", replyType: opts.replyType || null, kind }))
      .filter((r) => !r.ok);
    if (bad.length) {
      return { sent: false, reason: "hard_tone_rejected", toneViolations: [...new Set(bad.flatMap((r) => r.violations))] };
    }
  }
  await client.replyMessage(replyToken, messages);
  return { sent: true };
}

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
  const { resolveExemption: resolveEx } = await import("../../core/conversation/hardTone.util.js");
  const exPush = opts.toneExemptSurface
    ? resolveEx({ surface: opts.toneExemptSurface, messages, adminContext: opts.adminContext === true, callerId: opts.callerId })
    : { allowed: false };
  if (opts.toneExemptSurface && !exPush.allowed) {
    return { sent: false, reason: "hard_tone_rejected", exemptionRejected: exPush.reason };
  }
  if (!exPush.allowed) {
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
  const { enforceHardToneBeforeSend, collectFlexTexts, resolveExemption } = await import(
    "../../core/conversation/hardTone.util.js"
  );
  const ex = opts.toneExemptSurface
    ? resolveExemption({ surface: opts.toneExemptSurface, messages, adminContext: opts.adminContext === true, callerId: opts.callerId })
    : { allowed: false };
  if (opts.toneExemptSurface && !ex.allowed) {
    return { sent: false, reason: "hard_tone_rejected", exemptionRejected: ex.reason };
  }
  if (!ex.allowed) {
    const list = Array.isArray(messages) ? messages : [messages];
    const texts = [];
    for (const m of list) {
      if (typeof m === "string") texts.push(m);
      else if (m?.type === "text" && typeof m.text === "string") texts.push(m.text);
      else if (m && typeof m === "object") texts.push(...collectFlexTexts(m));
    }
    const kind = opts.toneKind || "reply"; // fail-closed: step/bundle ต้องระบุ typed
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

/**
 * RAW LINE push boundary (Codex P0-2): เส้นที่ยิง HTTP ตรงไป LINE ต้องมาที่นี่ —
 * ban check → hard-tone payload validation → transport เดียว
 * ห้ามมี fetch ไป api.line.me นอกโมดูลนี้
 * @returns {Promise<{ sent: boolean, reason?: string, toneViolations?: string[], suppressedBanned?: boolean }>}
 */
export async function pushRawToCustomer(lineUserId, messages, opts = {}) {
  const uid = String(lineUserId || "").trim();
  const token = String(process.env.CHANNEL_ACCESS_TOKEN || "").trim();
  if (!uid || !token) return { sent: false, reason: "not_configured" };
  const gate = await allowCustomerPush(uid, opts);
  if (!gate.allowed) return { sent: false, suppressedBanned: gate.suppressedBanned === true, reason: "gate_blocked" };

  const { enforceHardToneBeforeSend, collectFlexTexts, resolveExemption } = await import(
    "../../core/conversation/hardTone.util.js"
  );
  const exRaw = opts.toneExemptSurface
    ? resolveExemption({ surface: opts.toneExemptSurface, messages, adminContext: opts.adminContext === true, callerId: opts.callerId })
    : { allowed: false };
  if (opts.toneExemptSurface && !exRaw.allowed) {
    return { sent: false, reason: "hard_tone_rejected", exemptionRejected: exRaw.reason };
  }
  const list = Array.isArray(messages) ? messages : [messages];
  if (!exRaw.allowed) {
    const texts = [];
    for (const m of list) {
      if (typeof m === "string") texts.push(m);
      else if (m?.type === "text" && typeof m.text === "string") texts.push(m.text);
      else if (m && typeof m === "object") texts.push(...collectFlexTexts(m));
    }
    const kind = opts.toneKind || toneKindForPushSourceExported(opts.source);
    const bad = texts
      .map((t) => enforceHardToneBeforeSend(t, { surface: opts.source || "raw_push", replyType: opts.source || null, kind }))
      .filter((r) => !r.ok);
    if (bad.length) {
      return { sent: false, reason: "hard_tone_rejected", toneViolations: [...new Set(bad.flatMap((r) => r.violations))] };
    }
  }
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: uid, messages: list }),
    signal: AbortSignal.timeout(Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 15000),
  });
  return { sent: res.ok, reason: res.ok ? undefined : `http_${res.status}` };
}

/** typed source→kind (export ให้ raw boundary ใช้ร่วม) */
export function toneKindForPushSourceExported(source) {
  const t = String(source || "");
  if (/payment|qr|slip|paywall|quota_offer|myscans|history|synergy_intro|daily_pick/i.test(t)) return "bundle";
  if (/report|scan_result|registration|welcome|howto|onboarding|object_info|purpose/i.test(t)) return "step";
  return "reply";
}

/**
 * ADMIN reply boundary (Codex P0-2): เส้นเดียวที่ใช้ admin exemption ได้ —
 * caller ต้องมาจาก admin router ที่ยืนยัน identity แล้วเท่านั้น
 */
export async function replyToAdmin(client, replyToken, messages, opts = {}) {
  if (opts.verifiedAdmin !== true) {
    return { sent: false, reason: "admin_context_required" };
  }
  await client.replyMessage(replyToken, messages); /* tone-exempt: admin_command */
  return { sent: true };
}

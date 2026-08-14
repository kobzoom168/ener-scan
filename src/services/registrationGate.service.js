/**
 * Registration Gate (กบ 12 ก.ค.): ลูกค้าใหม่ต้องลงทะเบียนผ่าน LIFF (ชื่อเล่น + วันเกิด)
 * ก่อนคุยกับ AI / ส่งรูปสแกน — บังคับทุกคนที่ยังไม่ลงทะเบียน (กบเคาะรอบสอง: ไม่เว้นลูกค้าเดิม)
 *
 * หลักกันพังทั้งหมด fail-open:
 *  - เช็คพลาด (DB/Redis สะดุด) = ปล่อยผ่าน — ห้ามล็อกลูกค้าเพราะระบบเราเอง
 *  - ไม่มี LIFF_ID = ไม่บล็อกเด็ดขาด (ไม่มีที่ให้ลงทะเบียน)
 *  - โดนบล็อกครบ 3 ครั้งแล้วยังไม่ลง = ถอยให้ ใช้ flow ถามวันเกิดในแชทแบบเดิม
 *  - เปิด/ปิดสดได้จาก /admin/promo (app_settings key "registration_gate")
 */
import { supabase } from "../config/supabase.js";
import { getAppSetting } from "../stores/appSettings.db.js";
import { incrementCounterWithTtl, clearDedupeKey } from "../redis/scanV2Redis.js";

export const REGISTRATION_GATE_DEFAULTS = Object.freeze({
  enabled: false,
  sinceIso: null,
  // เสียงแอดมิน (งานข้อมูล/ระบบ — ไม่ใช่อาจารย์) ตาม persona + Codex 14 ส.ค.
  text: "ก่อนส่งรูป ขอข้อมูลผูกผลอ่านกับเจ้าของสักครู่ครับ ใช้เวลาไม่ถึงนาที เสร็จแล้วส่งรูปชิ้นแรกได้ฟรีเลยครับ",
});

/** โดนบล็อกเกินเท่านี้ = ถอยให้ใช้ flow เดิม (กัน LIFF ล่มแล้วลูกค้าติดคอขวด) */
const GATE_MAX_BLOCKS = 3;

/** @returns {Promise<{enabled: boolean, sinceIso: string|null, text: string}>} */
export async function getRegistrationGateConfig() {
  try {
    const raw = await getAppSetting("registration_gate");
    const o = raw && typeof raw === "object" ? raw : {};
    return {
      enabled: o.enabled === true,
      sinceIso: o.sinceIso ? String(o.sinceIso) : null,
      text: String(o.text || "").trim() || REGISTRATION_GATE_DEFAULTS.text,
    };
  } catch {
    return { ...REGISTRATION_GATE_DEFAULTS };
  }
}

/* cache สถานะลงทะเบียน (กบ: ลงแล้วรอบถัดไปไม่ต้องเช็คอีก):
   - "ลงแล้ว" = จำถาวรในหน่วยความจำ — สถานะนี้ไม่มีวันถอยกลับ เช็ค DB แค่ครั้งแรกครั้งเดียว
   - "ยังไม่ลง" = จำแค่ 60 วิ — ลงเสร็จใน LIFF ปุ๊บ ระบบรู้เร็ว (LIFF save ก็ bust ให้ทันทีด้วย) */
const regCache = new Map();
const REG_NEGATIVE_CACHE_MS = 60_000;

export function bustRegistrationCache(lineUserId) {
  regCache.delete(String(lineUserId || "").trim());
}

/** ลงทะเบียนครบ = liff_profiles มีชื่อเล่น + วันเกิด + เบอร์โทร (กบ: บังคับเบอร์ด้วย) */
export async function isRegistrationComplete(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return true; // ข้อมูลแปลก = ปล่อยผ่าน
  const hit = regCache.get(uid);
  if (hit) {
    if (hit.ok) return true; // ถาวร
    if (Date.now() - hit.at < REG_NEGATIVE_CACHE_MS) return false;
  }
  const { data, error } = await supabase
    .from("liff_profiles")
    .select("nickname,birthdate,phone")
    .eq("line_user_id", uid)
    .maybeSingle();
  if (error) throw error;
  // SSOT ตัวเดียว (Codex รอบ 2) — LIFF/chat fallback ใช้ตัวเดียวกัน
  const { isRegistrationDataComplete } = await import(
    "./welcome/registrationOnboarding.logic.js"
  );
  const ok = isRegistrationDataComplete(data || {});
  regCache.set(uid, { ok, at: Date.now() });
  return ok;
}


/**
 * ตัดสินว่า "ต้องบล็อกให้ไปลงทะเบียนไหม" — เรียกจาก webhook ก่อนถึง AI/สแกน
 * @returns {Promise<{block: boolean, reason: string, attempt?: number}>}
 */
export async function shouldBlockForRegistration(lineUserId) {
  try {
    const cfg = await getRegistrationGateConfig();
    if (!cfg.enabled) return { block: false, reason: "disabled" };
    if (!String(process.env.LIFF_ID || "").trim()) return { block: false, reason: "no_liff" };

    if (await isRegistrationComplete(lineUserId)) {
      // ลงครบแล้ว — ล้างตัวนับ (เผื่อเคยโดนบล็อกมาก่อน)
      clearDedupeKey(`scan_v2:reggate_hits:${lineUserId}`).catch(() => {});
      return { block: false, reason: "registered" };
    }

    // กบ 12 ก.ค. (รอบสอง): บังคับทุกคน — ไม่มีข้อยกเว้นลูกค้าเดิมแล้ว

    // กบเคาะ 14 ส.ค. (รอบสาม): เลิก fail-open ตามจำนวนครั้ง — ข้อมูลลูกค้าใหม่คือ
    // requirement · ลูกค้าที่ LIFF เปิดไม่ได้ใช้ chat fallback (ปุ่มบนการ์ด/พิมพ์บอก)
    // แทนการปล่อยผ่านเงียบ ๆ · ระบบเราพัง (catch ล่าง) ยัง fail-open เหมือนเดิม
    const attempt = await incrementCounterWithTtl(
      `scan_v2:reggate_hits:${lineUserId}`,
      86400,
    );
    if (attempt > GATE_MAX_BLOCKS) {
      console.log(
        JSON.stringify({
          event: "REG_GATE_MANY_BLOCKS",
          lineUserIdPrefix: String(lineUserId).slice(0, 8),
          attempt,
        }),
      );
    }
    return { block: true, reason: "unregistered", attempt };
  } catch (e) {
    // fail-open เสมอ — ระบบเราพัง ห้ามลงโทษลูกค้า
    console.warn(
      JSON.stringify({
        event: "REG_GATE_CHECK_ERROR_FAIL_OPEN",
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return { block: false, reason: "check_error" };
  }
}

const REG_PROMPT_VARIANTS = [
  null, // index 0 unused — attempt เริ่มที่ 1
  null, // attempt 1 ใช้ข้อความจาก config
  "ลงทะเบียนแปปเดียวครับ กดปุ่มด้านล่างได้เลย เสร็จแล้วส่งรูปมาได้ทันที",
  "เหลือแค่ลงทะเบียนครับ กดลิงก์แล้วกรอกชื่อ วันเกิด เบอร์ติดต่อ อาจารย์จะได้อ่านให้ตรงดวง",
];

/**
 * การ์ดลงทะเบียน Flex "แบบ B พื้นขาว + โลโก้จริง" (กบเคาะ 16 ก.ค.): โลโก้ตราเพชรทอง
 * ตัวเดียวกับหน้า login LIFF (/brand/ener-reg-logo.png) — การ์ดกับหน้าลงทะเบียนดูเป็นชุดเดียวกัน
 * ไม่มี URL เปล่าโผล่ให้เห็นเลย (ลูกค้าบางคนกลัวลิงก์ นึกว่ามิจฉาชีพ)
 * greet ใช้ข้อความจาก /admin/promo (cfg.text) — กบแก้สดได้เหมือนเดิม
 * @param {string} greetText
 * @param {string} liffId
 */
export function buildRegistrationFlexMessage(greetText, liffId) {
  const liffUrl = `https://liff.line.me/${liffId}`;
  const base = String(process.env.APP_BASE_URL || "https://scan.my-ener.uk").trim().replace(/\/$/, "");
  const check = (label) => ({
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: "✓", flex: 0, size: "sm", weight: "bold", color: "#A5813A" },
      { type: "text", text: label, size: "xs", color: "#6B5D40", wrap: true },
    ],
  });
  return {
    type: "flex",
    altText: "ลงทะเบียนกับอาจารย์ Ener ฟรี ไม่ถึงนาที",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "0px",
        backgroundColor: "#FFFFFF",
        contents: [
          {
            type: "box",
            layout: "vertical",
            paddingAll: "20px",
            spacing: "sm",
            contents: [
              {
                type: "image",
                url: `${base}/brand/ener-reg-logo.png`,
                size: "lg",
                aspectRatio: "10:7",
                aspectMode: "fit",
              },
              {
                type: "text",
                text: "อาจารย์อ่านพลังพระเครื่อง กำไลหิน",
                size: "xs",
                color: "#9A8A66",
                align: "center",
              },
              {
                type: "text",
                text: greetText,
                size: "sm",
                color: "#3D3426",
                wrap: true,
                align: "center",
                margin: "lg",
              },
              {
                type: "box",
                layout: "vertical",
                spacing: "xs",
                margin: "lg",
                contents: [
                  check("เปิดในแอป LINE นี้เลย ไม่เด้งออกไปไหน"),
                  check("ไม่ต้องติดตั้งแอป ไม่มีค่าใช้จ่าย"),
                ],
              },
              {
                type: "button",
                style: "primary",
                color: "#C9A227",
                height: "md",
                margin: "lg",
                action: { type: "uri", label: "กรอกข้อมูลเพื่อเริ่มอ่านพลัง", uri: liffUrl },
              },
              {
                // chat fallback (Codex 14 ส.ค.): ลูกค้าเลือกเองได้ตั้งแต่แรก ไม่ต้องรอติด 3 ครั้ง
                type: "button",
                style: "link",
                height: "sm",
                action: {
                  type: "message",
                  label: "ให้แอดมินช่วยกรอกในแชท",
                  text: "ให้แอดมินช่วยกรอกในแชท",
                },
              },
              {
                // ตรงการใช้งานจริง ไม่มีคำรับรองเด็ดขาด (Codex 14 ส.ค.)
                type: "text",
                text: "ใช้ชื่อและวันเกิดเพื่อผูกผลอ่านกับเจ้าของ เบอร์โทรใช้ติดต่อเรื่องสิทธิ์และบริการเท่านั้น",
                size: "xxs",
                color: "#9A8A66",
                align: "center",
                wrap: true,
                margin: "md",
              },
            ],
          },
        ],
      },
    },
  };
}

/**
 * ข้อความ + ปุ่มเปิด LIFF (สำนวนสลับตามครั้งที่โดน — ห้ามวน ห้ามเงียบ)
 * flexMessage = การ์ดแบบ B (ตัวหลัก); text/quickReply เก็บไว้เป็นทางหนีเมื่อส่ง flex ไม่ได้
 * @returns {{ text: string, quickReply: object, flexMessage: object } | null} null = สร้างไม่ได้ (ไม่มี LIFF)
 */
export async function buildRegistrationPrompt(attempt = 1) {
  const liffId = String(process.env.LIFF_ID || "").trim();
  if (!liffId) return null;
  const cfg = await getRegistrationGateConfig();
  const text =
    (attempt >= 2 && REG_PROMPT_VARIANTS[Math.min(attempt, 3)]) || cfg.text;
  return {
    text: `${text}\nhttps://liff.line.me/${liffId}`,
    quickReply: {
      items: [
        {
          type: "action",
          action: { type: "uri", label: "ลงทะเบียน", uri: `https://liff.line.me/${liffId}` },
        },
      ],
    },
    flexMessage: buildRegistrationFlexMessage(text, liffId),
  };
}

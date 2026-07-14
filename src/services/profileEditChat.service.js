/**
 * แก้ข้อมูลลงทะเบียนผ่านแชท OA (กบ 12 ก.ค.): LIFF ดูได้อย่างเดียว — แก้ต้องพิมพ์ในแชท
 * วันเกิดมี flow เดิมอยู่แล้ว (birthdateChangeFlow) — ที่นี่เพิ่ม ชื่อเล่น / เบอร์ / เพศ
 * Deterministic ล้วน: จับคำสั่ง เปลี่ยน/แก้ + ฟิลด์ (+ ค่าใหม่ในประโยคเดียว) ไม่ผ่าน LLM
 */
import { supabase } from "../config/supabase.js";
import { bustRegistrationCache } from "./registrationGate.service.js";

/**
 * @param {string} text
 * @returns {{ field: "nickname"|"phone"|"gender", value: string|null } | null}
 *   value = null → รู้ว่าจะแก้อะไรแต่ยังไม่ได้ให้ค่าใหม่ (ผู้เรียกตอบวิธีพิมพ์)
 */
export function parseProfileEditCommand(text) {
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (!/^(เปลี่ยน|แก้|แก้ไข|ขอเปลี่ยน|ขอแก้)/.test(t)) return null;

  // เบอร์: "เปลี่ยนเบอร์ 0812345678" / "แก้เบอร์โทรเป็น 08-1234-5678"
  let m = /(?:เบอร์(?:โทร|มือถือ)?)(?:\s*เป็น)?\s*([0-9\s-]{9,15})?\s*$/.exec(t);
  if (/เบอร์/.test(t)) {
    const digits = String(m?.[1] || "").replace(/[^0-9]/g, "");
    return { field: "phone", value: digits.length >= 9 && digits.length <= 10 ? digits : null };
  }

  // เพศ: "เปลี่ยนเพศเป็นหญิง"
  if (/เพศ/.test(t)) {
    const g = /(หญิง|ชาย|ไม่ระบุ)\s*$/.exec(t);
    return { field: "gender", value: g ? g[1] : null };
  }

  // ชื่อเล่น: "เปลี่ยนชื่อเป็น กบ" / "แก้ชื่อเล่น กบ" (กันชนกับ เปลี่ยนวันเกิด — ไม่มีคำว่า ชื่อ)
  if (/ชื่อ/.test(t)) {
    m = /ชื่อ(?:เล่น)?(?:\s*เป็น)?\s+(.{1,40})$/.exec(t);
    const v = m ? m[1].trim() : "";
    return { field: "nickname", value: v && !/^เป็น$/.test(v) ? v.slice(0, 40) : null };
  }

  return null;
}

const FIELD_LABEL = { nickname: "ชื่อเล่น", phone: "เบอร์โทร", gender: "เพศ" };

// กบ 14 ก.ค.: เลิกสอนลูกค้าพิมพ์คำสั่ง — บอกจะแก้อะไรแล้วอาจารย์ถามกลับเอง
const FIELD_ASK = {
  nickname: "ได้ครับ อยากให้อาจารย์เรียกว่าอะไรดีครับ",
  phone: "ได้ครับ เบอร์ใหม่เบอร์อะไรครับ บอกมาได้เลย",
  gender: "ได้ครับ สะดวกแบบไหน แตะเลือกด้านล่างได้เลยครับ",
};

/** ปุ่มเลือกเพศ — แนบกับคำถามตอนขอแก้เพศ */
export const GENDER_QUICK_REPLY = {
  items: ["หญิง", "ชาย", "ไม่ระบุ"].map((g) => ({
    type: "action",
    action: { type: "message", label: g, text: g },
  })),
};

/** รอค่าใหม่หลังถามกลับ — จำในเครื่อง 10 นาที (แบบเดียวกับ fengShui armed mode) */
const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingEditByUser = new Map(); // uid → { field, until }

function getPendingField(uid) {
  const row = pendingEditByUser.get(uid);
  if (!row) return null;
  if (Date.now() > row.until) {
    pendingEditByUser.delete(uid);
    return null;
  }
  return row.field;
}

function setPendingField(uid, field) {
  pendingEditByUser.set(uid, { field, until: Date.now() + PENDING_TTL_MS });
}

export function clearPendingProfileEdit(lineUserId) {
  pendingEditByUser.delete(String(lineUserId || "").trim());
}

async function applyProfileEdit(uid, field, value) {
  const { data: existing, error: selErr } = await supabase
    .from("liff_profiles")
    .select("line_user_id")
    .eq("line_user_id", uid)
    .maybeSingle();
  if (selErr) throw selErr;
  const patch = { [field]: value, updated_at: new Date().toISOString() };
  if (existing) {
    const { error } = await supabase.from("liff_profiles").update(patch).eq("line_user_id", uid);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("liff_profiles")
      .insert({ line_user_id: uid, ...patch });
    if (error) throw error;
  }
  bustRegistrationCache(uid);
  console.log(
    JSON.stringify({
      event: "PROFILE_EDIT_VIA_CHAT",
      lineUserIdPrefix: uid.slice(0, 8),
      field,
    }),
  );
  return `เรียบร้อยครับ อาจารย์แก้${FIELD_LABEL[field]}ให้เป็น ${value} แล้ว`;
}

const GENDER_VALUE_MAP = {
  หญิง: "หญิง",
  ผู้หญิง: "หญิง",
  ชาย: "ชาย",
  ผู้ชาย: "ชาย",
  ไม่ระบุ: "ไม่ระบุ",
};

/**
 * ค่าใหม่ที่ลูกค้าตอบกลับหลังอาจารย์ถาม (state รอจาก handleProfileEditCommand)
 * คืน null = ไม่มี pending หรือคำตอบไม่เข้าเค้า (ปล่อยไหลไป routing ปกติ ไม่ขวางแชท)
 * @returns {Promise<string|null>} ข้อความยืนยัน
 */
export async function handlePendingProfileEditValue(lineUserId, text) {
  const uid = String(lineUserId || "").trim();
  const field = getPendingField(uid);
  if (!field) return null;
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (!t || t.length > 40) return null;

  // เปลี่ยนใจ — เลิกแก้
  if (/^(ยกเลิก|ไม่เปลี่ยน|ไม่แก้|ไม่เอา)(แล้ว)?$/.test(t)) {
    pendingEditByUser.delete(uid);
    return "ได้ครับ ไม่เปลี่ยนนะครับ";
  }

  let value = null;
  if (field === "phone") {
    const digits = t.replace(/[^0-9]/g, "");
    if (/[ก-ฮ]/.test(t) && !/เบอร์/.test(t)) return null;
    if (digits.length >= 9 && digits.length <= 10) value = digits;
    else if (digits.length > 0) {
      return "ขอเป็นเบอร์ 9 ถึง 10 หลักครับ บอกมาอีกทีได้เลย";
    } else return null;
  } else if (field === "gender") {
    value = GENDER_VALUE_MAP[t] || null;
    if (!value) return null;
  } else if (field === "nickname") {
    // กันคำสั่ง/ประโยคยาวถูกเก็บเป็นชื่อ: เอาเฉพาะคำสั้น ไม่ใช่ตัวเลขล้วน ไม่ใช่คำสั่งที่ระบบรู้จัก
    if (/^\d+$/.test(t)) return null;
    if (/^(จ่าย|ซื้อ|สมัคร|โอน|ประวัติ|ขอ|ดู|เปลี่ยน|แก้|สแกน|เมนู|ช่วย|สวัสดี|หวัดดี)/.test(t)) return null;
    if (t.split(" ").length > 2) return null;
    value = t.slice(0, 40);
  }
  if (!value) return null;

  pendingEditByUser.delete(uid);
  try {
    return await applyProfileEdit(uid, field, value);
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "PROFILE_EDIT_VIA_CHAT_ERROR",
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return "ตอนนี้แก้ข้อมูลไม่สำเร็จครับ อีกสักครู่บอกมาใหม่อีกทีนะครับ";
  }
}

/**
 * คำสั่งแก้ข้อมูล — คืน { text, quickReply } (หรือ null = ไม่ใช่คำสั่งแก้ข้อมูล)
 * บอกครบในประโยคเดียว ("เปลี่ยนชื่อ กบ") = แก้เลย; บอกแค่หัวข้อ = ถามกลับ + จำไว้รอคำตอบ
 * @returns {Promise<{ text: string, quickReply: object|null }|null>}
 */
export async function handleProfileEditCommand(lineUserId, text) {
  const cmd = parseProfileEditCommand(text);
  if (!cmd) return null;
  const uid = String(lineUserId || "").trim();
  if (!cmd.value) {
    setPendingField(uid, cmd.field);
    return {
      text: FIELD_ASK[cmd.field],
      quickReply: cmd.field === "gender" ? GENDER_QUICK_REPLY : null,
    };
  }
  try {
    return { text: await applyProfileEdit(uid, cmd.field, cmd.value), quickReply: null };
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "PROFILE_EDIT_VIA_CHAT_ERROR",
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return {
      text: "ตอนนี้แก้ข้อมูลไม่สำเร็จครับ อีกสักครู่บอกมาใหม่อีกทีนะครับ",
      quickReply: null,
    };
  }
}

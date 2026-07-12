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
const FIELD_HOWTO = {
  nickname: 'พิมพ์ เปลี่ยนชื่อ ตามด้วยชื่อใหม่ได้เลยครับ เช่น "เปลี่ยนชื่อ กบ"',
  phone: 'พิมพ์ เปลี่ยนเบอร์ ตามด้วยเบอร์ใหม่ได้เลยครับ เช่น "เปลี่ยนเบอร์ 0812345678"',
  gender: 'พิมพ์ เปลี่ยนเพศ ตามด้วย หญิง ชาย หรือ ไม่ระบุ ครับ เช่น "เปลี่ยนเพศเป็นหญิง"',
};

/**
 * อัปเดตฟิลด์ใน liff_profiles — คืนข้อความตอบลูกค้า (หรือ null = ไม่ใช่คำสั่งแก้ข้อมูล)
 * @returns {Promise<string|null>}
 */
export async function handleProfileEditCommand(lineUserId, text) {
  const cmd = parseProfileEditCommand(text);
  if (!cmd) return null;
  if (!cmd.value) return FIELD_HOWTO[cmd.field];
  try {
    const uid = String(lineUserId || "").trim();
    const { data: existing, error: selErr } = await supabase
      .from("liff_profiles")
      .select("line_user_id")
      .eq("line_user_id", uid)
      .maybeSingle();
    if (selErr) throw selErr;
    const patch = { [cmd.field]: cmd.value, updated_at: new Date().toISOString() };
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
        field: cmd.field,
      }),
    );
    return `เรียบร้อยครับ อาจารย์แก้${FIELD_LABEL[cmd.field]}ให้เป็น ${cmd.value} แล้ว`;
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "PROFILE_EDIT_VIA_CHAT_ERROR",
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return "ตอนนี้แก้ข้อมูลไม่สำเร็จครับ อีกสักครู่ลองพิมพ์มาใหม่อีกที";
  }
}

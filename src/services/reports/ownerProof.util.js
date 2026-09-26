/**
 * พิสูจน์ว่า "ผู้ชมคือเจ้าของ" สำหรับการเปิดดูคลังย้อนหลัง (แบบ A — กบ 23 ก.ย. 2026)
 *
 * ปัญหาเดิม: `/r/:publicToken` ถูกออกแบบมาให้ **แชร์ได้** (การ์ด/OG/เพจ) แต่หน้ารายงานและ
 * หน้าคลังกลับดึง "ทั้งคลัง" ของเจ้าของออกมาแสดง โดยไม่มีจุดใดเทียบว่าผู้ชมคือเจ้าของ
 * → ใครถือลิงก์ที่แชร์ต่อ ก็เห็นคลังทั้งตู้ของเจ้าของ
 *
 * กติกาใหม่: **ลิงก์รายงานอย่างเดียวห้ามดูทั้งคลัง** แม้เจ้าของจะมีแพ็กอยู่ก็ตาม
 * เปิดคลังได้สองทางเท่านั้น
 *   1) LIFF — ยืนยันด้วย LINE idToken (เป็นข้อมูลของผู้ยืนยันเองอยู่แล้ว)
 *   2) owner token ของหน้า "ผลสแกนของฉัน" (`user_page_tokens.purpose='myscans'`, เพิกถอนได้)
 *      โดยต้องตรงกับเจ้าของรายงานที่กำลังเปิดด้วย
 *
 * ⚠️ แก้คำตามที่ Codex ทัก: cookie ไม่อยู่ใน URL ก็จริง **แต่ `/myscans/:token` เองยังเป็น
 * "ลิงก์กุญแจส่วนตัว"** — ใครได้ URL นั้นไปก็เปิดคลังได้ จึงต้องกันการรั่วทุกทาง:
 *   - แอป log เฉพาะ prefix ของ token (`tokenPrefixForLog`) ไม่เคย log ตัวเต็ม
 *   - หน้า `/myscans/:token` ตั้ง `Referrer-Policy: no-referrer` กัน token ติดไปกับ Referer
 *   - **ค้าง (งาน ops)**: nginx access log ยังบันทึก path เต็ม → ต้องปิดบัง/ปิด log เส้นนี้
 *
 * owner token เป็นกุญแจเข้าคลัง จึง **ไม่ถูกใส่ในลิงก์แชร์ / OG / log ของแอป**:
 * เมื่อเจ้าของเปิด `/myscans/:token` (ลิงก์ส่วนตัวที่ส่งให้ในแชท) ระบบออก cookie httpOnly
 * ผูกกับ uid ให้แทน — cookie ไม่โผล่ใน URL และ JS ฝั่งหน้าเว็บอ่านไม่ได้
 */
import crypto from "node:crypto";

export const OWNER_COOKIE = "ener_owner";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  const s = String(process.env.SESSION_SECRET || "").trim();
  // dev/test เท่านั้น — production บังคับมี SESSION_SECRET อยู่แล้ว (ดู app.js)
  return s || "ener-scan-dev-owner-proof-insecure";
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** @param {string} lineUserId @returns {string} ค่า cookie (uid + ลายเซ็น + วันหมดอายุ) */
export function buildOwnerCookieValue(lineUserId, expiresAtMs = Date.now() + MAX_AGE_MS) {
  const uid = String(lineUserId || "").trim();
  if (!uid) throw new Error("ownerProof_missing_lineUserId");
  const body = `${Buffer.from(uid, "utf8").toString("base64url")}.${expiresAtMs}`;
  return `${body}.${sign(body)}`;
}

/** @returns {string|null} uid ที่ลายเซ็นถูกต้องและยังไม่หมดอายุ */
export function readOwnerCookieValue(raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  const i = v.lastIndexOf(".");
  if (i <= 0) return null;
  const body = v.slice(0, i);
  const sig = v.slice(i + 1);
  const expected = sign(body);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [uidB64, expRaw] = body.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  try {
    const uid = Buffer.from(String(uidB64), "base64url").toString("utf8").trim();
    return uid || null;
  } catch {
    return null;
  }
}

/** ออก cookie ให้เจ้าของเมื่อเขาเปิดลิงก์ส่วนตัวของตัวเอง (ไม่ใส่ token ใน URL/log) */
export function issueOwnerCookie(res, lineUserId) {
  try {
    res.cookie(OWNER_COOKIE, buildOwnerCookieValue(lineUserId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: MAX_AGE_MS,
      path: "/",
    });
  } catch {
    /* ออก cookie ไม่ได้ = เปิดคลังไม่ได้ แต่หน้ารายงานยังใช้งานได้ตามปกติ */
  }
}

/** อ่าน cookie จาก header เอง — โปรเจกต์นี้ไม่ได้ใช้ cookie-parser (ไม่เพิ่ม dependency) */
export function readCookieFromHeader(headerValue, name) {
  const raw = String(headerValue || "");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return part.slice(i + 1).trim(); }
  }
  return null;
}

/** uid ของผู้ชมที่พิสูจน์ได้ (null = พิสูจน์ไม่ได้) */
export function viewerOwnerUid(req) {
  const fromParser = req?.cookies?.[OWNER_COOKIE];
  return readOwnerCookieValue(fromParser ?? readCookieFromHeader(req?.headers?.cookie, OWNER_COOKIE));
}

/**
 * ผู้ชมคือเจ้าของรายงานนี้หรือไม่ — ใช้ตัดสินว่าจะแสดง "ทั้งคลัง" ได้ไหม
 * เทียบ uid ตรงตัว: ถือ owner token ของคนอื่นก็เปิดคลังของรายงานนี้ไม่ได้
 * @param {*} req @param {string|null|undefined} ownerLineUserId เจ้าของรายงาน
 */
export function isOwnerViewing(req, ownerLineUserId) {
  const owner = String(ownerLineUserId || "").trim();
  if (!owner) return false;
  const viewer = viewerOwnerUid(req);
  if (!viewer) return false;
  const a = Buffer.from(viewer, "utf8");
  const b = Buffer.from(owner, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * ลิงก์ให้เจ้าของ "ยืนยันผ่าน LINE" จากหน้ารายงาน (Codex 26 ก.ย. 2026)
 * เปิด LIFF (LINE ยืนยันตัวตน) → POST /api/liff/owner-session ออก cookie เจ้าของ → กลับมาที่ returnPath
 * ห้ามเชื่อ uid จาก query · ห้ามถือ public report token เป็น owner proof — ตัวยืนยันคือ LINE idToken เท่านั้น
 * @param {string} returnPath path ในโดเมนนี้ เช่น /r/<token>/library
 */
export function ownerVerifyUrl(returnPath) {
  const id = String(process.env.LIFF_ID || "").trim();
  const ret = String(returnPath || "/").trim();
  const safeRet = /^\/(r|myscans)\/[A-Za-z0-9._%-]+(\/[a-z-]+)?$/.test(ret) ? ret : "/";
  if (!id) return "https://lin.ee/6YZeFZ1";
  return `https://liff.line.me/${id}?view=owner&return=${encodeURIComponent(safeRet)}`;
}
export function isSafeOwnerReturnPath(p) {
  return /^\/(r|myscans)\/[A-Za-z0-9._%-]+(\/[a-z-]+)?$/.test(String(p || ""));
}

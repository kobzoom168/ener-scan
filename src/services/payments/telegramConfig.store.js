/**
 * ที่เก็บ config Telegram อนุมัติสลิป (sql/066) — เข้ารหัสที่แอป · เรียก RPC ด้วย role จำกัด `telegram_config_admin`
 *
 * env ที่ ops ตั้ง (ไม่ใช่กบ):
 *   TELEGRAM_CONFIG_KEY    = 64 hex (32 ไบต์) สำหรับ AES-256-GCM — ไม่ใช้ SESSION_SECRET ร่วม
 *   TELEGRAM_CONFIG_DB_KEY = JWT ของ role telegram_config_admin (เซ็นด้วย PGRST_JWT_SECRET) — web_anon เรียก RPC เหล่านี้ไม่ได้
 * ไม่มีค่าใดค่าหนึ่ง = store "ไม่พร้อม" (หน้า Admin แจ้ง ops · runtime ถือว่าปิด)
 * ไม่ log/คืน plaintext token หรือ secret ออกนอกโมดูลนี้ ยกเว้น resolve สำหรับ runtime
 */
import crypto from "node:crypto";
import { PostgrestClient } from "@supabase/postgrest-js";

const HEX64 = /^[0-9a-f]{64}$/i;
export const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
export const CHAT_ID_RE = /^-?\d{3,20}$/;
export const TG_USER_ID_RE = /^\d{3,20}$/;

export function configStoreReadiness(envSrc = process.env) {
  const key = String(envSrc.TELEGRAM_CONFIG_KEY || "").trim();
  const dbKey = String(envSrc.TELEGRAM_CONFIG_DB_KEY || "").trim();
  const missing = [];
  if (!HEX64.test(key)) missing.push("TELEGRAM_CONFIG_KEY");
  if (!dbKey || dbKey.split(".").length !== 3) missing.push("TELEGRAM_CONFIG_DB_KEY");
  return { ready: missing.length === 0, missing };
}

function keyBuf(envSrc = process.env) {
  const key = String(envSrc.TELEGRAM_CONFIG_KEY || "").trim();
  if (!HEX64.test(key)) throw new Error("telegram_config_key_missing");
  return Buffer.from(key, "hex");
}

/** AES-256-GCM → "v1:<iv>:<tag>:<data>" (base64url) */
export function encryptSecret(plain, envSrc = process.env) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyBuf(envSrc), iv);
  const data = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return `v1:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${data.toString("base64url")}`;
}
export function decryptSecret(enc, envSrc = process.env) {
  const [v, iv, tag, data] = String(enc || "").split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("telegram_config_ciphertext_malformed");
  const d = crypto.createDecipheriv("aes-256-gcm", keyBuf(envSrc), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

let clientCache = null;
/** client เฉพาะ role จำกัด — ไม่ใช้ client anon ของแอป */
export function configDbClient(envSrc = process.env) {
  const url = String(envSrc.LOCAL_POSTGREST_URL || "").trim();
  const dbKey = String(envSrc.TELEGRAM_CONFIG_DB_KEY || "").trim();
  if (!url || !dbKey) throw new Error("telegram_config_db_key_missing");
  if (clientCache && clientCache.url === url && clientCache.key === dbKey) return clientCache.client;
  const client = new PostgrestClient(url, { headers: { apikey: dbKey, Authorization: `Bearer ${dbKey}` } });
  clientCache = { url, key: dbKey, client };
  return client;
}

async function rpc(name, args, deps) {
  const client = deps.client ?? configDbClient(deps.env);
  const { data, error } = await client.rpc(name, args);
  if (error) { const e = new Error(`telegram_config_rpc_failed:${name}:${String(error.code || error.message || "").slice(0, 60)}`); e.cause = error; throw e; }
  return data;
}

/** สถานะสำหรับหน้า Admin — ไม่มี ciphertext/plaintext */
export async function getPublicStatus(deps = {}) { return rpc("telegram_settings_get_public", {}, deps); }

/**
 * บันทึกจากหน้า Admin — token ว่าง = คงเดิม · webhook secret สร้างฝั่งเซิร์ฟเวอร์ครั้งแรก (ไม่ให้กรอก) · คืนสถานะสาธารณะ
 * @param {{ chatId:string, approvers:{label:string,tgUserId:string}[], token?:string|null, actor:string }} p
 */
export async function saveSettings(p, deps = {}) {
  const envSrc = deps.env ?? process.env;
  const chatId = String(p.chatId || "").trim();
  if (!CHAT_ID_RE.test(chatId)) throw new Error("invalid_chat_id");
  const approvers = (p.approvers || []).map((a) => ({ label: String(a.label || "").trim().slice(0, 40), tg_user_id: String(a.tgUserId || "").trim() })).filter((a) => a.tg_user_id);
  if (!approvers.length) throw new Error("approvers_required");
  for (const a of approvers) if (!TG_USER_ID_RE.test(a.tg_user_id)) throw new Error("invalid_approver_id");
  if (new Set(approvers.map((a) => a.tg_user_id)).size !== approvers.length) throw new Error("duplicate_approver_id");
  const token = p.token == null ? "" : String(p.token).trim();
  if (token && !TOKEN_RE.test(token)) throw new Error("invalid_bot_token");
  const current = await getPublicStatus(deps);
  const firstSave = !current?.token_set;
  if (firstSave && !token) throw new Error("token_required_on_first_save");
  const tokenEnc = token ? encryptSecret(token, envSrc) : null;
  // webhook secret: สร้างครั้งแรกเท่านั้น (เปลี่ยน = งานแยกตอนตั้ง webhook ใหม่)
  const secretEnc = firstSave ? encryptSecret(crypto.randomBytes(32).toString("hex"), envSrc) : null;
  return rpc("telegram_settings_save", { p_chat_id: chatId, p_approvers: approvers, p_token_enc: tokenEnc, p_secret_enc: secretEnc, p_actor: String(p.actor || "admin").slice(0, 80) }, deps);
}

export async function setEnabled(enabled, actor, deps = {}) {
  return rpc("telegram_settings_set_enabled", { p_enabled: Boolean(enabled), p_actor: String(actor || "admin").slice(0, 80) }, deps);
}

/**
 * config สำหรับ runtime จาก DB (decrypt ที่นี่) — คืน null เมื่อปิด/ไม่ครบ · โยน error เมื่ออ่านไม่ได้ (ผู้เรียกต้องปฏิเสธ ไม่ใช้ค่าเก่า)
 * ไม่มี cache: ทุก callback อ่านสด (ถอนผู้อนุมัติ/ปิดใช้งานมีผลทันที)
 */
export async function loadRuntimeConfigFromDb(deps = {}) {
  const envSrc = deps.env ?? process.env;
  const s = await rpc("telegram_settings_get_secrets", {}, deps);
  if (!s || s.enabled !== true) return null;
  if (!s.bot_token_enc || !s.webhook_secret_enc || !s.chat_id) return null;
  const approvers = new Set((Array.isArray(s.approvers) ? s.approvers : []).map((a) => String(a?.tg_user_id || "").trim()).filter((id) => TG_USER_ID_RE.test(id)));
  if (approvers.size === 0) return null;
  return { token: decryptSecret(s.bot_token_enc, envSrc), chatId: String(s.chat_id), approvers, webhookSecret: decryptSecret(s.webhook_secret_enc, envSrc), source: "db" };
}

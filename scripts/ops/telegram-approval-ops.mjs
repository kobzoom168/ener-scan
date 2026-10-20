// Ops สำหรับ Telegram อนุมัติสลิป (config จาก DB, sql/066) — รันในคอนเทนเนอร์ของ env นั้น (มี TELEGRAM_CONFIG_KEY/TELEGRAM_CONFIG_DB_KEY) · **ไม่พิมพ์ token/secret**
//  ใช้: docker run --rm --env-file /root/ener-scan-<env>/.env --network <net> -v <ops>/scripts/ops/telegram-approval-ops.mjs:/app/ops-tg.mjs:ro <image> node /app/ops-tg.mjs <cmd> [args]
//  cmd: status · bot-info · webhook-info · enable <actor> · disable <actor> · set-webhook <https-url> · delete-webhook · verify-endpoint <https-url>
//  กติกา: enable/set-webhook ต้องมีอนุมัติแยก · set-webhook ใช้ secret จาก DB (ถอดรหัสในโปรเซส) allowed_updates=callback_query drop_pending_updates=true
import crypto from "node:crypto";
const [cmd, arg1] = process.argv.slice(2);
const out = (o) => console.log(JSON.stringify(o));
const store = await import("./src/services/payments/telegramConfig.store.js");
const env = process.env;
const readiness = store.configStoreReadiness(env);
if (!readiness.ready) { out({ event: "TG_OPS_NOT_READY", missing: readiness.missing }); process.exit(2); }
const api = async (token, method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  return { ok: Boolean(j?.ok), status: r.status, result: j?.result ?? null, desc: j?.description ?? null };
};
const secrets = async () => {
  const s = await store.getPublicStatus({ env });
  const cfg = await store.loadRuntimeConfigFromDb({ env }).catch((e) => ({ error: String(e?.message || e).slice(0, 80) }));
  return { status: s, cfg };
};
const pub = (s) => ({ configured: s?.configured, token_set: s?.token_set, enabled: s?.enabled, chat_id: s?.chat_id ?? null, approvers: (s?.approvers || []).map((a) => ({ label: a.label, tg_user_id: a.tg_user_id })), token_set_at: s?.token_set_at, webhook_set_at: s?.webhook_set_at, enabled_changed_at: s?.enabled_changed_at, updated_by: s?.updated_by });
if (cmd === "status") { const s = await store.getPublicStatus({ env }); out({ event: "TG_STATUS", ...pub(s) }); process.exit(0); }
// คำสั่งที่ต้องใช้ token: อ่านจาก DB เมื่อ enabled หรือจาก secrets RPC โดยตรง (ก่อน enable ก็ต้อง verify bot ได้)
const rawSecrets = async () => {
  const client = store.configDbClient(env);
  const { data, error } = await client.rpc("telegram_settings_get_secrets", {});
  if (error) throw new Error("secrets_rpc_failed");
  if (!data?.bot_token_enc) throw new Error("token_not_set");
  return { token: store.decryptSecret(data.bot_token_enc, env), secret: data.webhook_secret_enc ? store.decryptSecret(data.webhook_secret_enc, env) : null, chatId: data.chat_id, enabled: data.enabled };
};
if (cmd === "bot-info") { const { token } = await rawSecrets(); const r = await api(token, "getMe"); out({ event: "TG_BOT_INFO", ok: r.ok, id: r.result?.id ?? null, username: r.result?.username ?? null, is_bot: r.result?.is_bot ?? null, desc: r.ok ? null : r.desc }); process.exit(r.ok ? 0 : 3); }
if (cmd === "webhook-info") { const { token } = await rawSecrets(); const r = await api(token, "getWebhookInfo"); out({ event: "TG_WEBHOOK_INFO", ok: r.ok, url: r.result?.url ?? null, pending: r.result?.pending_update_count ?? null, last_error: r.result?.last_error_message ?? null, last_error_date: r.result?.last_error_date ?? null, allowed: r.result?.allowed_updates ?? null, has_secret: typeof r.result === "object" ? undefined : undefined }); process.exit(r.ok ? 0 : 3); }
if (cmd === "enable" || cmd === "disable") { const actor = String(arg1 || "ops").slice(0, 80); const s = await store.setEnabled(cmd === "enable", actor, { env }); out({ event: cmd === "enable" ? "TG_ENABLED" : "TG_DISABLED", actor, ...pub(s) }); process.exit(0); }
if (cmd === "set-webhook") {
  const url = String(arg1 || ""); if (!/^https:\/\/[a-z0-9.-]+\/telegram\/webhook$/.test(url)) { out({ event: "TG_OPS_BAD_URL" }); process.exit(2); }
  const { token, secret } = await rawSecrets(); if (!secret) { out({ event: "TG_OPS_NO_SECRET" }); process.exit(2); }
  const r = await api(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["callback_query"], drop_pending_updates: true });
  const info = await api(token, "getWebhookInfo");
  if (r.ok) { try { const client = store.configDbClient(env); await client.rpc("telegram_settings_mark_webhook_set", {}).catch(() => null); } catch { /* ไม่มี RPC นี้ = ข้าม (บันทึกใน runbook แทน) */ } }
  out({ event: "TG_SET_WEBHOOK", setOk: r.ok, desc: r.desc, url: info.result?.url ?? null, pending: info.result?.pending_update_count ?? null, lastError: info.result?.last_error_message ?? null, allowed: info.result?.allowed_updates ?? null }); process.exit(r.ok ? 0 : 3);
}
if (cmd === "delete-webhook") { const { token } = await rawSecrets(); const r = await api(token, "deleteWebhook", { drop_pending_updates: true }); const info = await api(token, "getWebhookInfo"); out({ event: "TG_DELETE_WEBHOOK", deleteOk: r.ok, webhookUrlNow: info.result?.url ?? null, pending: info.result?.pending_update_count ?? null }); process.exit(r.ok ? 0 : 3); }
if (cmd === "verify-endpoint") {
  // ยิง POST ไปที่ endpoint ของเราเอง: ไม่มี secret → คาด 401 เมื่อเปิด (404 เมื่อปิด) · secret ผิด → 401 · ไม่ส่ง secret จริงออกไปทาง log
  const url = String(arg1 || ""); const hit = async (headers) => { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}", signal: AbortSignal.timeout(10000) }); return r.status; };
  out({ event: "TG_VERIFY_ENDPOINT", url, no_secret: await hit({}), wrong_secret: await hit({ "x-telegram-bot-api-secret-token": crypto.randomBytes(16).toString("hex") }) }); process.exit(0);
}
console.error("usage: status | bot-info | webhook-info | enable <actor> | disable <actor> | set-webhook <url> | delete-webhook | verify-endpoint <url>"); process.exit(2);

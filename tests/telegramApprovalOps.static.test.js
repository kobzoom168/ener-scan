// สคริปต์ ops Telegram approval: ห้ามพิมพ์ token/secret · ใช้ store (DB authority) · set-webhook ล็อก allowed_updates=callback_query + drop pending · URL ต้องเป็น /telegram/webhook https
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync("scripts/ops/telegram-approval-ops.mjs", "utf8");
test("telegram-approval-ops: ไม่มี log ของ token/secret · ใช้ store · set-webhook ปลอดภัย", () => {
  assert.match(src, /telegramConfig\.store\.js/);
  assert.match(src, /allowed_updates: \["callback_query"\], drop_pending_updates: true/);
  assert.match(src, /\/\^https:\\\/\\\/\[a-z0-9\.-\]\+\\\/telegram\\\/webhook\$\//);
  // ทุก out({...}) ต้องไม่มี key token/secret
  for (const m of src.matchAll(/out\(\{([^}]*)\}\)/g)) assert.doesNotMatch(m[1], /\btoken\b|\bsecret\b(?!_token:)/, m[1]);
  assert.doesNotMatch(src, /console\.log\(.*(token|secret)\b.*\)/, "ห้าม console.log ค่าลับ");
  assert.match(src, /getMe/); assert.match(src, /getWebhookInfo/); assert.match(src, /deleteWebhook/);
  assert.match(src, /configStoreReadiness/);
});

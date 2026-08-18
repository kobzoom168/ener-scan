/**
 * Codex P0-5: direct push ทุกเส้นต้องเช็คแบน ณ send-time
 * - unit: banned → transport = 0 call · not banned → ส่งปกติ · เช็คพัง → fail-open
 * - inventory: source-scan ทุกไฟล์ใน src ที่ยิง push ต้องผ่าน gateway
 *   หรืออยู่ใน allowlist ที่มีเหตุผลกำกับ (admin-only / in-turn fallback)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { allowCustomerPush, pushToCustomer } from "../src/services/lineOutbound/customerPush.gateway.js";

const bannedCheck = (v) => async () => v;

test("banned → pushToCustomer ไม่แตะ transport เลย (transport=0)", async () => {
  let calls = 0;
  const client = { pushMessage: async () => { calls += 1; } };
  const r = await pushToCustomer(client, "U" + "a".repeat(32), { type: "text", text: "x" }, {
    source: "test", isBanned: bannedCheck(true),
  });
  assert.equal(r.sent, false);
  assert.equal(r.suppressedBanned, true);
  assert.equal(calls, 0);
});

test("ไม่แบน → ส่งปกติ 1 ครั้ง", async () => {
  let calls = 0;
  const client = { pushMessage: async () => { calls += 1; } };
  const r = await pushToCustomer(client, "U" + "b".repeat(32), [{ type: "text", text: "x" }], {
    source: "test", isBanned: bannedCheck(false),
  });
  assert.equal(r.sent, true);
  assert.equal(calls, 1);
});

test("เช็คแบน throw → fail-open ส่งตามปกติ", async () => {
  let calls = 0;
  const client = { pushMessage: async () => { calls += 1; } };
  const r = await pushToCustomer(client, "U" + "c".repeat(32), { type: "text", text: "x" }, {
    source: "test", isBanned: async () => { throw new Error("redis down"); },
  });
  assert.equal(r.sent, true);
  assert.equal(calls, 1);
});

test("uid ว่าง → ไม่ส่ง ไม่เช็ค", async () => {
  let calls = 0;
  const client = { pushMessage: async () => { calls += 1; } };
  const r = await pushToCustomer(client, "", { type: "text", text: "x" }, { isBanned: bannedCheck(false) });
  assert.equal(r.sent, false);
  assert.equal(calls, 0);
});

test("allowCustomerPush: banned → not allowed + suppressedBanned", async () => {
  const r = await allowCustomerPush("U" + "d".repeat(32), { isBanned: bannedCheck(true) });
  assert.equal(r.allowed, false);
  assert.equal(r.suppressedBanned, true);
  const r2 = await allowCustomerPush("U" + "d".repeat(32), { isBanned: bannedCheck(false) });
  assert.equal(r2.allowed, true);
});

/* ---------------- inventory source-scan ---------------- */

// ไฟล์ที่มี push แต่ยกเว้นได้ — ต้องมีเหตุผลชัดเจนต่อไฟล์ (Codex: exempt แบบ explicit)
const EXEMPT = new Map([
  // ส่งหา ADMIN_LINE_USER_ID เท่านั้น
  ["src/services/scanV2/smartRejection.service.js", "admin-only"],
  ["src/services/maintenanceDlqAlert.service.js", "admin-only"],
  ["src/services/monitor/customerAlerts.service.js", "admin-only (LINE alert สั้นถึงแอดมิน)"],
  // gateway เอง
  ["src/services/lineOutbound/customerPush.gateway.js", "gateway"],
  // reply-first gateway: ทำงานเฉพาะใน event turn ซึ่งผ่าน pre-dispatch ban gate แล้ว
  ["src/services/lineWebhook/nonScanReply.gateway.js", "in-turn (pre-dispatch gate ครอบ)"],
  // delivery หลักมี ban gate ของตัวเองใน deliverOutbound (P0-1)
  ["src/services/scanV2/deliverOutbound.service.js", "own ban gate (suppressed_banned)"],
  // transport ชั้นล่าง — ไม่ใช่จุดตัดสินใจ
  ["src/utils/lineClientTransport.util.js", "transport layer"],
  // push fallback ของ reply ใน turn เดียวกับ event (ผ่าน pre-dispatch gate แล้ว) + referral ผ่าน gateway แล้ว
  ["src/routes/lineWebhook.js", "in-turn fallback (pre-dispatch gate ครอบ) + referral ใช้ gateway"],
]);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".js")) acc.push(p);
  }
  return acc;
}

test("inventory: ทุกไฟล์ที่ push ต้องใช้ gateway หรืออยู่ใน allowlist พร้อมเหตุผล", () => {
  const offenders = [];
  for (const f of walk("src")) {
    const rel = f.split(path.sep).join("/");
    const s = fs.readFileSync(f, "utf8");
    const hasPush = /\.pushMessage\(|v2\/bot\/message\/push/.test(s);
    if (!hasPush) continue;
    if (EXEMPT.has(rel)) continue;
    if (s.includes("customerPush.gateway.js")) continue;
    offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `push site ไม่ผ่าน gateway และไม่มีเหตุผลยกเว้น: ${offenders.join(", ")}`);
});

test("inventory: ไฟล์ที่ route ผ่าน gateway แล้วต้องไม่เหลือ raw push นอก gateway call", () => {
  // ไฟล์ที่แก้แล้ว: raw fetch ต้องมี allowCustomerPush นำหน้าเสมอ (เช็คหยาบ: มี import gateway)
  for (const rel of [
    "src/services/welcome/registrationSuccess.service.js",
    "src/services/objectInfoGate/objectInfoGate.service.js",
    "src/services/precheck/precheck.service.js",
    "src/services/lineWebhook/multiImageRejectionReply.service.js",
    "src/services/synergy/synergyIntro.service.js",
    "src/services/fbShowcase/scanYoutubeShort.service.js",
    "src/services/upgradeCredit.service.js",
  ]) {
    const s = fs.readFileSync(rel, "utf8");
    assert.ok(s.includes("customerPush.gateway.js"), `${rel} ไม่ได้ import gateway`);
  }
});

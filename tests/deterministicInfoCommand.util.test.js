/**
 * Codex รอบ 4: "วิธีใช้/วิธีใช้งาน/สแกนพลังงาน" = AI=0 ทุก state — พิสูจน์ด้วย
 * CHAT_TURN_AI_CHAIN จริง (ไม่ใช่ source-window อย่างเดียว) + router อยู่ก่อน semantic
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  matchDeterministicInfoCommand,
  handleDeterministicInfoCommand,
} from "../src/services/lineWebhook/deterministicInfoCommand.util.js";
import { runWithTurnContext, emitTurnAiChain } from "../src/core/telemetry/turnAiChain.js";

function captureEmit(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (l) => { lines.push(String(l)); };
  try { fn(); } finally { console.log = orig; }
  return lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

test("match: exact เท่านั้น — ประโยคยาว/คำอื่นไม่โดน", () => {
  assert.equal(matchDeterministicInfoCommand("วิธีใช้"), "usage_help");
  assert.equal(matchDeterministicInfoCommand(" วิธีใช้งาน "), "usage_help");
  assert.equal(matchDeterministicInfoCommand("สแกนพลังงาน"), "scan_energy");
  assert.equal(matchDeterministicInfoCommand("วิธีใช้พระเครื่องยังไง"), null);
  assert.equal(matchDeterministicInfoCommand("อยากรู้วิธีใช้"), null);
  assert.equal(matchDeterministicInfoCommand("สแกนพลังงานให้หน่อยได้ไหมครับ"), null);
});

test("ทุก active state: aiCallCount=0 จริงตาม CHAT_TURN_AI_CHAIN (usage_help + scan_energy)", async () => {
  const STATES = ["idle", "pending_verify", "paywall_selecting_package", "awaiting_slip", "waiting_birthdate", "soft_verify"];
  for (const state of STATES) {
    for (const kind of ["usage_help", "scan_energy"]) {
      const sent = [];
      await runWithTurnContext({ messageId: `m-${state}-${kind}`, kind: "text", state }, async () => {
        const done = await handleDeterministicInfoCommand({
          kind,
          client: {},
          userId: "U" + "a".repeat(32),
          replyToken: "rt",
          deps: {
            sendNonScanReply: async (p) => { sent.push(p); },
            getSavedBirthdate: async () => (state === "waiting_birthdate" ? null : "21/07/2530"),
            payPickLine: "หากหมดสิทธิ์ฟรี: เลือกค่าครูจากเมนู",
          },
        });
        assert.equal(done, true);
        const out = captureEmit(() => emitTurnAiChain());
        const e = out.find((o) => o.event === "CHAT_TURN_AI_CHAIN");
        assert.equal(e.aiCallCount, 0, `${state}/${kind} ต้อง AI=0`);
        assert.equal(e.pendingAiCount, 0);
      });
      assert.equal(sent.length, 1, `${state}/${kind} ต้องตอบ deterministic 1 ข้อความ`);
    }
  }
});

test("scan_energy: ข้อความตามมี/ไม่มีวันเกิด · usage_help มี payPick line", async () => {
  const sent = [];
  await handleDeterministicInfoCommand({
    kind: "scan_energy", client: {}, userId: "U1", replyToken: "rt",
    deps: { sendNonScanReply: async (p) => { sent.push(p); }, getSavedBirthdate: async () => null },
  });
  assert.match(sent[0].text, /ยังไม่มีวันเกิดที่บันทึกไว้/);
  await handleDeterministicInfoCommand({
    kind: "usage_help", client: {}, userId: "U1", replyToken: "rt",
    deps: { sendNonScanReply: async (p) => { sent.push(p); }, payPickLine: "หากหมดสิทธิ์ฟรี: ทดสอบ" },
  });
  assert.match(sent[1].text, /วิธีใช้งาน Ener Scan/);
  assert.match(sent[1].text, /หากหมดสิทธิ์ฟรี/);
});

test("webhook wiring: info router อยู่หลัง exact-utility, ก่อน profile-edit/semantic (source-order)", () => {
  const s = fs.readFileSync("src/routes/lineWebhook.js", "utf8");
  const util = s.indexOf("runExactUtilityCommandTerminal({");
  const info = s.indexOf("matchDeterministicInfoCommand(text)");
  const profileEdit = s.indexOf("handlePendingProfileEditValue(userId, text)");
  assert.ok(util > 0 && info > util, "info router ต้องอยู่หลัง exact utility");
  assert.ok(profileEdit > info, "info router ต้องมาก่อน profile-edit/semantic ทั้งหมด");
});

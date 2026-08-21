/**
 * ชุด A — legacy-output rejection (Codex B4): พิสูจน์เพียงว่า "ข้อความเก่า" ถูก boundary ปัจจุบันบล็อก (transport=0)
 * ไม่ได้พิสูจน์ว่าระบบตอบใหม่ถูก — ส่วนนั้นอยู่ใน tests/replayRoutes.test.js (ชุด B)
 *
 * - fixture: tests/fixtures/replay/*.jsonl (สร้างจาก scripts/replay/build-replay-fixture.mjs)
 * - ทุกแถวยิงผ่าน customerPush.gateway.pushToCustomer ด้วย fake LINE client (transport นับจริง)
 * - แถวที่เป็น LLM flow ยิงผ่าน enforceLlmCustomerOutput ด้วย fake model ที่คืนข้อความเก่า
 *   → ต้องได้ fallback และ aiCalls ≤ งบต่อเทิร์น
 * - ตัวเลข fixed/stillFailing/alreadyFixed/falsePositive "สร้างจาก runner" แล้วเทียบ expected.json
 *   fixture หาย / ตัวเลขต่าง = gate fail
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "fixtures/replay");

function fakeClient() {
  const calls = { reply: 0, push: 0 };
  return { calls, replyMessage: async () => { calls.reply += 1; }, pushMessage: async () => { calls.push += 1; } };
}

const expectedFiles = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".expected.json")) : [];

test("replay fixtures มีอยู่จริง (fixture หาย = gate fail)", () => {
  assert.ok(expectedFiles.length >= 1, "ไม่พบ *.expected.json ใน tests/fixtures/replay");
  for (const ef of expectedFiles) {
    const exp = JSON.parse(readFileSync(path.join(DIR, ef), "utf8"));
    assert.ok(existsSync(path.join(DIR, exp.fixture)), `fixture ${exp.fixture} หาย`);
  }
});

for (const ef of expectedFiles) {
  const exp = JSON.parse(readFileSync(path.join(DIR, ef), "utf8"));
  const rows = readFileSync(path.join(DIR, exp.fixture), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

  test(`replay ${exp.fixture}: sanitized (ไม่มี LINE id / URL token / เลขยาว)`, () => {
    for (const r of rows) {
      const blob = `${r.inbound}\n${r.outbound}`;
      assert.doesNotMatch(blob, /U[0-9a-f]{32}/, `${r.id} มี LINE id`);
      assert.doesNotMatch(blob, /https?:\/\//, `${r.id} มี URL ดิบ`);
      assert.doesNotMatch(blob, /\d{6,}/, `${r.id} มีเลขยาว`);
    }
  });

  test(`replay ${exp.fixture}: ทุกแถวผ่าน production boundary → สรุปต้องตรง expected`, async () => {
    const gw = await import("../src/services/lineOutbound/customerPush.gateway.js");
    const { enforceLlmCustomerOutput } = await import("../src/core/conversation/llmOutputContract.util.js");
    const tally = { legacyBlocked: 0, legacyStillSendable: 0, legacyCleanSendable: 0, legacyFalsePositive: 0 };
    const failures = [];
    const convs = new Set();
    for (const r of rows) {
      convs.add(r.conversationHash);
      const c = fakeClient();
      const res = await gw.pushToCustomer(c, "U" + "0".repeat(32), [{ type: "text", text: r.outbound }], {
        source: r.replyType, toneKind: r.expected.toneKind, isBanned: async () => false,
      });
      const transport = c.calls.reply + c.calls.push;
      const blocked = res.sent !== true && transport === 0;
      const violated = r.classification === "violated_old_policy";
      if (violated && blocked) tally.legacyBlocked++;
      else if (violated && !blocked) { tally.legacyStillSendable++; failures.push(`${r.id} ยังส่งได้: ${r.outbound.slice(0, 60)}`); }
      else if (!violated && !blocked) tally.legacyCleanSendable++;
      else { tally.legacyFalsePositive++; failures.push(`${r.id} false positive: ${r.outbound.slice(0, 60)} → ${res.toneViolations}`); }
      assert.equal(transport, r.expected.transport, `${r.id} transport ${transport} ≠ expected ${r.expected.transport}`);

      // LLM flow: model คืนข้อความเก่า → contract ต้องไม่ปล่อย และไม่เกินงบ
      if (r.expected.aiCalls === "<=2") {
        const budget = { attempted: 0, max: exp.maxAiCallsPerTurn };
        const g = await enforceLlmCustomerOutput(
          { callSite: "replay", userText: r.inbound, turnBudget: budget, evidence: {} },
          { generate: async () => r.outbound, log: () => {} },
        );
        assert.notEqual(g.text, r.outbound, `${r.id} contract ปล่อยข้อความเก่า`);
        assert.ok(budget.attempted <= exp.maxAiCallsPerTurn, `${r.id} aiCalls ${budget.attempted} > ${exp.maxAiCallsPerTurn}`);
      }
    }
    assert.equal(rows.length, exp.rows, "จำนวนแถว fixture ต่างจาก expected");
    assert.equal(convs.size, exp.conversations, "จำนวนบทสนทนาต่างจาก expected");
    assert.deepEqual(tally, { legacyBlocked: exp.legacyBlocked, legacyStillSendable: exp.legacyStillSendable, legacyCleanSendable: exp.legacyCleanSendable, legacyFalsePositive: exp.legacyFalsePositive },
      `สรุปจาก runner ≠ expected\n${failures.slice(0, 10).join("\n")}`);
  });
}

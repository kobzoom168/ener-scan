import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runSemanticCatcher } from "../src/core/conversation/semanticCatcher/semanticCatcher.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runCase(activeState, text) {
  return await runSemanticCatcher({
    userId: `U_${activeState}_${Date.now()}`,
    activeState,
    text,
    runModel: async () =>
      JSON.stringify({
        intent: "unknown",
        confidence: 0.2,
        safe_to_consume: false,
        state_guess: activeState,
        extracted: {
          birthdate_candidate: null,
          package_candidate_text: null,
          status_phrase: null,
        },
        reason_short: "stub_unknown",
      }),
  });
}

test("waiting_birthdate semantic mapping", async () => {
  const a = await runCase("waiting_birthdate", "เกิด 14/10/2519 ครับ");
  assert.equal(a.intent, "provide_birthdate");
  assert.equal(a.safe_to_consume, true);
  assert.equal(a.extracted.birthdate_candidate, "14/10/2519");

  const b = await runCase("waiting_birthdate", "ผมเกิดวันที่ 14-10-2519");
  assert.equal(b.intent, "provide_birthdate");
  assert.equal(b.safe_to_consume, true);

  const c = await runCase("waiting_birthdate", "14102519 ครับ");
  assert.equal(c.intent, "provide_birthdate");
  assert.equal(c.safe_to_consume, true);

  const d = await runCase(
    "waiting_birthdate",
    "ของผม 14/10/2519 ของแฟน 12/03/2522",
  );
  assert.equal(d.safe_to_consume, false);
  assert.equal(d.reason_short, "multiple_birthdate_candidates");

  const e = await runCase("waiting_birthdate", "ผมโอนแล้วนะ");
  assert.equal(e.safe_to_consume, false);

  const f = await runCase("waiting_birthdate", "โอเคครับ");
  assert.equal(f.intent, "generic_ack");
});

test("birthdate_change_waiting_date mapping", async () => {
  const a = await runCase(
    "birthdate_change_waiting_date",
    "เปลี่ยนเป็น 19/08/2528 ครับ",
  );
  assert.equal(a.intent, "provide_birthdate");
  assert.equal(a.safe_to_consume, true);

  const b = await runCase("birthdate_change_waiting_date", "19/08/2528");
  assert.equal(b.intent, "provide_birthdate");
  assert.equal(b.safe_to_consume, true);

  const c = await runCase("birthdate_change_waiting_date", "19/13/2528");
  assert.equal(c.intent, "provide_birthdate");
  assert.equal(c.safe_to_consume, true);

  const d = await runCase(
    "birthdate_change_waiting_date",
    "สองวันเกิดคือ 19/08/2528 กับ 20/08/2528",
  );
  assert.equal(d.safe_to_consume, false);
});

test("paywall_offer_single mapping", async () => {
  const a = await runCase("paywall_offer_single", "49 บาทใช่ไหม");
  assert.equal(a.intent, "package_ack");
  assert.equal(a.safe_to_consume, true);

  const a2 = await runCase("paywall_offer_single", "49 บาทได้อะไรบ้าง");
  assert.equal(a2.intent, "explain_offer_value");
  assert.equal(a2.safe_to_consume, true);

  const a3 = await runCase("paywall_offer_single", "แอปใช้งานยังไง");
  assert.equal(a3.intent, "explain_how_scan_works");
  assert.equal(a3.safe_to_consume, true);

  const b = await runCase("paywall_offer_single", "โอเคเอาเลย");
  assert.equal(b.intent, "pay_intent");
  assert.equal(b.safe_to_consume, true);

  const c = await runCase("paywall_offer_single", "พรุ่งนี้ค่อยมา");
  assert.equal(c.intent, "wait_tomorrow");
  assert.equal(c.safe_to_consume, true);

  const d = await runCase("paywall_offer_single", "อือ");
  assert.equal(d.intent, "generic_ack");
  assert.equal(d.safe_to_consume, true);

  const e = await runCase("paywall_offer_single", "ข้อความไม่เกี่ยวข้อง");
  assert.equal(e.safe_to_consume, false);
});

test("awaiting_slip mapping", async () => {
  const a = await runCase("awaiting_slip", "โอนแล้วนะ");
  assert.equal(a.intent, "slip_claim_without_image");
  assert.equal(a.safe_to_consume, true);

  const b = await runCase("awaiting_slip", "ขอ qr อีกที");
  assert.equal(b.intent, "resend_qr");
  assert.equal(b.safe_to_consume, true);

  const c = await runCase("awaiting_slip", "ตอนนี้ถึงไหนแล้ว");
  assert.equal(c.intent, "status_check");
  assert.equal(c.safe_to_consume, true);

  const d = await runCase("awaiting_slip", "โอเคครับ");
  assert.equal(d.intent, "generic_ack");
  assert.equal(d.safe_to_consume, true);

  const e = await runCase("awaiting_slip", "ต้องทำยังไงต่อ");
  assert.equal(e.intent, "explain_next_step");
  assert.equal(e.safe_to_consume, true);
});

test("pending_verify mapping", async () => {
  const a = await runCase("pending_verify", "ถึงไหนแล้วครับ");
  assert.equal(a.intent, "status_check");
  assert.equal(a.safe_to_consume, true);

  const b = await runCase("pending_verify", "โอเคครับ");
  assert.equal(b.intent, "generic_ack");
  assert.equal(b.safe_to_consume, true);

  const c = await runCase("pending_verify", "จ่ายเงิน");
  assert.equal(c.intent, "pay_intent");
  assert.equal(c.safe_to_consume, true);

  const d = await runCase("pending_verify", "เรื่องอื่น");
  assert.equal(d.intent, "off_topic_recoverable");
  assert.equal(d.safe_to_consume, true);
});

test("lineWebhook integrates semantic catcher and telemetry events", () => {
  const src = readFileSync(
    join(__dirname, "../src/routes/lineWebhook.js"),
    "utf8",
  );
  assert.ok(src.includes("SEMANTIC_CATCHER_REQUESTED"));
  assert.ok(src.includes("SEMANTIC_CATCHER_PARSED"));
  assert.ok(src.includes("SEMANTIC_CATCHER_CONSUMED"));
  assert.ok(src.includes("SEMANTIC_CATCHER_REJECTED"));
  assert.ok(src.includes("SEMANTIC_CATCHER_FALLBACK"));
  assert.ok(src.includes("activeState: \"waiting_birthdate\""));
  assert.ok(src.includes("activeState: \"birthdate_change_waiting_date\""));
  assert.ok(src.includes("activeState: \"paywall_offer_single\""));
  assert.ok(src.includes("activeState: \"awaiting_slip\""));
  assert.ok(src.includes("activeState: \"pending_verify\""));
});


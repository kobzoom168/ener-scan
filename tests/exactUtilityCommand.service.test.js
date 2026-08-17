/**
 * Contract ของคำสั่งเป๊ะจากปุ่ม/เมนู (Codex 14 ส.ค. — เคสจริง 13 ส.ค. ชวนเพื่อนวนลูป):
 * match แล้วต้อง terminal เสมอ — สำเร็จได้ของ / พัง-ปิดได้ข้อความขัดข้อง deterministic
 * ครั้งเดียว / ห้าม fall through เข้า LLM (คืน true ทุกกรณีที่ match)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchExactUtilityCommand,
  buildUtilityUnavailableText,
  runExactUtilityCommandTerminal,
} from "../src/services/utilityCommands/exactUtilityCommand.service.js";

test("matcher: exact เท่านั้น — ชวนเพื่อน/ปุ่ม paywall/จัดชุดทุก alias · ข้อความทั่วไปไม่ match", () => {
  assert.equal(matchExactUtilityCommand("ชวนเพื่อน"), "referral");
  assert.equal(matchExactUtilityCommand(" ชวนเพื่อน "), "referral");
  assert.equal(matchExactUtilityCommand("ชวนเพื่อน ได้สแกนฟรี"), "referral");
  assert.equal(matchExactUtilityCommand("จัดชุด"), "synergy");
  assert.equal(matchExactUtilityCommand("ชุดวันนี้"), "synergy");
  assert.equal(matchExactUtilityCommand("ชุดพลัง"), "synergy");
  assert.equal(matchExactUtilityCommand("จัดชุดพลัง"), "synergy");
  assert.equal(matchExactUtilityCommand("ประวัติ"), "history");
  assert.equal(matchExactUtilityCommand("ดูผลเก่า"), "history");
  assert.equal(matchExactUtilityCommand("ขอดูประวัติหน่อย"), null); // ประโยคยาว = flow เดิม
  assert.equal(matchExactUtilityCommand("อยากชวนเพื่อนทำยังไง"), null);
  assert.equal(matchExactUtilityCommand("จัดชุดให้หน่อยครับ"), null);
  assert.equal(matchExactUtilityCommand(""), null);
});

test("สำเร็จ: handler ตอบเอง → terminal, ไม่ส่ง unavailable", async () => {
  let handlerCalls = 0;
  let unavailableCalls = 0;
  const consumed = await runExactUtilityCommandTerminal({
    text: "ชวนเพื่อน",
    handlers: {
      referral: async () => {
        handlerCalls += 1;
        return true;
      },
      synergy: async () => true,
    },
    sendUnavailable: async () => {
      unavailableCalls += 1;
    },
  });
  assert.equal(consumed, true);
  assert.equal(handlerCalls, 1);
  assert.equal(unavailableCalls, 0);
});

test("feature ปิด/คืน false: ส่ง unavailable ครั้งเดียว แล้วยัง terminal (ห้ามเข้า LLM)", async () => {
  const sent = [];
  const consumed = await runExactUtilityCommandTerminal({
    text: "ชวนเพื่อน",
    handlers: { referral: async () => false, synergy: async () => true },
    sendUnavailable: async (kind) => {
      sent.push(kind);
    },
  });
  assert.equal(consumed, true);
  assert.deepEqual(sent, ["referral"]);
});

test("handler โยน error: ยัง terminal + unavailable ครั้งเดียว", async () => {
  const sent = [];
  const consumed = await runExactUtilityCommandTerminal({
    text: "จัดชุด",
    handlers: {
      referral: async () => true,
      synergy: async () => {
        throw new Error("db down");
      },
    },
    sendUnavailable: async (kind) => {
      sent.push(kind);
    },
  });
  assert.equal(consumed, true);
  assert.deepEqual(sent, ["synergy"]);
});

test("delivery honesty: reply ล้ม → push fallback หนึ่งครั้ง แล้วยัง terminal", async () => {
  const calls = [];
  const consumed = await runExactUtilityCommandTerminal({
    text: "ชวนเพื่อน",
    handlers: { referral: async () => false, synergy: async () => true },
    sendUnavailable: async () => {
      calls.push("reply");
      throw new Error("reply token used");
    },
    pushUnavailable: async () => {
      calls.push("push");
      return true;
    },
    onDeliveryFailure: async () => {
      calls.push("alert");
    },
  });
  assert.equal(consumed, true);
  assert.deepEqual(calls, ["reply", "push"]); // push สำเร็จ = ไม่ alert
});

test("delivery honesty: reply คืน false (ไม่ถึงมือ) ก็ต้องลอง push ไม่ใช่เชื่อว่าส่งแล้ว", async () => {
  const calls = [];
  const consumed = await runExactUtilityCommandTerminal({
    text: "ชวนเพื่อน",
    handlers: { referral: async () => false, synergy: async () => true },
    sendUnavailable: async () => {
      calls.push("reply");
      return false;
    },
    pushUnavailable: async () => {
      calls.push("push");
      return true;
    },
  });
  assert.equal(consumed, true);
  assert.deepEqual(calls, ["reply", "push"]);
});

test("delivery honesty: reply+push ล้มทั้งคู่ → onDeliveryFailure (alert) และยัง terminal", async () => {
  const calls = [];
  const consumed = await runExactUtilityCommandTerminal({
    text: "จัดชุด",
    handlers: { referral: async () => true, synergy: async () => false },
    sendUnavailable: async () => {
      calls.push("reply");
      return false;
    },
    pushUnavailable: async () => {
      calls.push("push");
      throw new Error("push quota");
    },
    onDeliveryFailure: async (kind) => {
      calls.push(`alert:${kind}`);
    },
  });
  assert.equal(consumed, true);
  assert.deepEqual(calls, ["reply", "push", "alert:synergy"]);
});

test("delivery honesty: reply สำเร็จ → ไม่แตะ push/alert", async () => {
  const calls = [];
  await runExactUtilityCommandTerminal({
    text: "ชวนเพื่อน",
    handlers: { referral: async () => false, synergy: async () => true },
    sendUnavailable: async () => {
      calls.push("reply");
      return true;
    },
    pushUnavailable: async () => {
      calls.push("push");
      return true;
    },
    onDeliveryFailure: async () => {
      calls.push("alert");
    },
  });
  assert.deepEqual(calls, ["reply"]);
});

test("ไม่ match: คืน false ไม่แตะ handler/unavailable (ปล่อยไหลตาม routing ปกติ)", async () => {
  let touched = 0;
  const consumed = await runExactUtilityCommandTerminal({
    text: "สวัสดีครับ",
    handlers: {
      referral: async () => {
        touched += 1;
        return true;
      },
      synergy: async () => {
        touched += 1;
        return true;
      },
    },
    sendUnavailable: async () => {
      touched += 1;
    },
  });
  assert.equal(consumed, false);
  assert.equal(touched, 0);
});

test("ข้อความขัดข้อง: เสียงแอดมิน ไม่มีอีโมจิ ระบุชื่อเมนูตรง", () => {
  const referralText = buildUtilityUnavailableText("referral");
  const synergyText = buildUtilityUnavailableText("synergy");
  assert.match(referralText, /ชวนเพื่อน/);
  assert.match(synergyText, /จัดชุด/);
  assert.match(referralText, /ผม/);
  assert.doesNotMatch(referralText, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

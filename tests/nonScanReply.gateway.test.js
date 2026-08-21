import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sendNonScanReply,
  sendNonScanReplyWithOptionalConvSurface,
} from "../src/services/nonScanReply.gateway.js";
import { isLineStickerPlaceholderText } from "../src/handlers/stickerMessage.handler.js";

function mockClient() {
  const payloads = [];
  return {
    payloads,
    replyMessage: async (_token, msg) => {
      payloads.push(msg);
    },
  };
}

test("sendNonScanReply: retries alternate on exact duplicate", async () => {
  const c = mockClient();
  const uid = `u_alt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const r1 = await sendNonScanReply({
    client: c,
    userId: uid,
    replyToken: "t1",
    replyType: "dup_test",
    semanticKey: "dup_test",
    text: "same line",
    alternateTexts: ["alternate line"],
  });
  const r2 = await sendNonScanReply({
    client: c,
    userId: uid,
    replyToken: "t2",
    replyType: "dup_test",
    semanticKey: "dup_test",
    text: "same line",
    alternateTexts: ["alternate line"],
  });
  assert.equal(r1.suppressed, false);
  assert.equal(r2.suppressed, false);
  assert.equal(r2.retryCount, 2);
  assert.equal(c.payloads.length, 2);
  assert.equal(c.payloads[1].text, "alternate line");
});

test("sendNonScanReply: suppresses when no alternate escapes duplicate", async () => {
  const c = mockClient();
  const uid = `u_sup_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await sendNonScanReply({
    client: c,
    userId: uid,
    replyToken: "a",
    replyType: "s",
    text: "only",
    alternateTexts: [],
  });
  const r = await sendNonScanReply({
    client: c,
    userId: uid,
    replyToken: "b",
    replyType: "s",
    text: "only",
    alternateTexts: [],
  });
  assert.equal(r.suppressed, true);
  assert.equal(c.payloads.length, 1);
});

test("sendNonScanReply: SCAN_OFFER_REPLY_BUILT on send when scanOfferMeta set", async () => {
  const c = mockClient();
  const uid = `u_so_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const logs = [];
  const orig = console.log;
  console.log = (...args) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    await sendNonScanReply({
      client: c,
      userId: uid,
      replyToken: "tok_so",
      replyType: "offer_intro",
      semanticKey: "scan_offer:test:v1",
      text: "primary offer text",
      alternateTexts: ["alt a"],
      scanOfferMeta: {
        replyType: "offer_intro",
        semanticKey: "scan_offer:test:v1",
        alternateCount: 1,
        offerConfigVersion: "1",
        variantIndex: 0,
      },
    });
  } finally {
    console.log = orig;
  }
  assert.ok(logs.some((l) => l.includes('"event":"SCAN_OFFER_REPLY_BUILT"')));
  assert.equal(c.payloads.length, 1);
});

test("sendNonScanReplyWithOptionalConvSurface: skips LLM when CONV_AI off, sends baseline", async () => {
  const c = mockClient();
  const uid = `u_conv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const r = await sendNonScanReplyWithOptionalConvSurface({
    client: c,
    userId: uid,
    replyToken: "tconv",
    replyType: "single_offer_paywall_hesitation",
    semanticKey: "single_offer_paywall_hesitation",
    text: "baseline thai",
    alternateTexts: [],
    convSurface: {
      userId: uid,
      legacyReplyType: "single_offer_paywall_hesitation",
      lastUserText: "hello",
      deterministicPrimary: "baseline thai",
      tierString: "full",
      paymentTruth: { priceThb: 49, paymentStatusVerbal: "none" },
    },
  });
  assert.equal(r.sent, true);
  assert.equal(r.usedAi, false);
  assert.equal(c.payloads[0]?.text, "baseline thai");
});

test("sendNonScanReply: semantic duplicate blocks same normalized text within window", async () => {
  const c = mockClient();
  const uid = `u_sem_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await sendNonScanReply({
    client: c,
    userId: uid,
    replyToken: "a",
    replyType: "sem",
    semanticKey: "sem_key",
    text: "Hello   World",
    alternateTexts: [],
  });
  const r = await sendNonScanReply({
    client: c,
    userId: uid,
    replyToken: "b",
    replyType: "sem",
    semanticKey: "sem_key",
    text: "hello world",
    alternateTexts: ["escape semantic"],
  });
  assert.equal(r.suppressed, false);
  assert.equal(r.retryCount, 2);
  assert.equal(c.payloads[1].text, "escape semantic");
});

test("isLineStickerPlaceholderText: LINE-style placeholders", () => {
  assert.equal(isLineStickerPlaceholderText("(content Cony)"), true);
  assert.equal(isLineStickerPlaceholderText("(unwell Moon)"), true);
  assert.equal(isLineStickerPlaceholderText("(wailing Moon)"), true);
  assert.equal(isLineStickerPlaceholderText("(pleading Moon)"), true);
  assert.equal(isLineStickerPlaceholderText("hello"), false);
  assert.equal(isLineStickerPlaceholderText("(note)"), false);
  assert.equal(isLineStickerPlaceholderText("(Content Cony)"), false);
});

test("sequence + push success-path พร้อม speakerRoleOverride: ไม่ throw, sent จริง (regression ReferenceError 12 ส.ค.)", async () => {
  process.env.HUMAN_REPLY_DELAY_MS_MAX = "0";
  const { sendNonScanSequenceReply, sendNonScanPushMessage } = await import(
    "../src/services/nonScanReply.gateway.js"
  );
  const mk = () => {
    const payloads = [];
    return {
      payloads,
      replyMessage: async (_t, msg) => { payloads.push(msg); },
      pushMessage: async (_to, msg) => { payloads.push(msg); },
    };
  };
  const c1 = mk();
  const uid1 = `u_seq_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const seqRes = await sendNonScanSequenceReply({
    client: c1,
    userId: uid1,
    replyToken: "tok-seq",
    replyType: "seq_test",
    semanticKey: "seq_test",
    messages: ["บรรทัดหนึ่ง", "บรรทัดสอง"],
    speakerRoleOverride: "admin",
  });
  assert.equal(seqRes.sent, true);
  assert.ok(c1.payloads.length >= 1);

  const c2 = mk();
  const uid2 = `u_push_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const pushRes = await sendNonScanPushMessage({
    client: c2,
    userId: uid2,
    replyType: "push_test",
    semanticKey: "push_test",
    text: "ข้อความ push ทดสอบ",
    speakerRoleOverride: "ajarn",
  });
  assert.equal(pushRes.sent, true);
  assert.ok(c2.payloads.length >= 1);
});

/* ---------------- P0-1 (Codex raw log 19-20 ส.ค.): messageId-aware dedupe ---------------- */

test("P0-1: คำถามใหม่ (messageId ใหม่) ได้ copy เดิม → ต้องตอบ ไม่ใช่เงียบ · redelivery messageId เดิมเท่านั้นที่ suppress", async () => {
  const c = mockClient();
  const uid = `u_rank_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const redirectCopy = "อันดับอยู่ในรายงานหลัก";
  // rank1 → ตอบ
  const r1 = await sendNonScanReply({
    client: c, userId: uid, replyToken: "t1",
    replyType: "ranking_query_redirect", semanticKey: "ranking_query_redirect:r1",
    inboundMessageId: "msg-001", text: redirectCopy, alternateTexts: [],
  });
  assert.equal(r1.sent, true);
  // rank2 — messageId ใหม่ + copy generate ออกมาเหมือนเดิมเป๊ะ → ต้องตอบ
  const r2 = await sendNonScanReply({
    client: c, userId: uid, replyToken: "t2",
    replyType: "ranking_query_redirect", semanticKey: "ranking_query_redirect:r2",
    inboundMessageId: "msg-002", text: redirectCopy, alternateTexts: [],
  });
  assert.equal(r2.sent, true, "messageId ใหม่ห้ามเงียบเพียงเพราะ generated copy เหมือนเดิม");
  assert.equal(c.payloads.length, 2);
  // redelivery ของ messageId เดิม (LINE ยิงซ้ำ) → suppress
  const r3 = await sendNonScanReply({
    client: c, userId: uid, replyToken: "t3",
    replyType: "ranking_query_redirect", semanticKey: "ranking_query_redirect:r2",
    inboundMessageId: "msg-002", text: redirectCopy, alternateTexts: [],
  });
  assert.equal(r3.suppressed, true, "redelivery messageId เดิม = duplicate จริง ต้อง suppress");
  assert.equal(c.payloads.length, 2);
});

test("P0-1: caller เก่าไม่ส่ง messageId → พฤติกรรม dedupe เดิมคงอยู่ (ไม่ regress)", async () => {
  const c = mockClient();
  const uid = `u_legacy_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await sendNonScanReply({ client: c, userId: uid, replyToken: "a", replyType: "x", text: "same", alternateTexts: [] });
  const r = await sendNonScanReply({ client: c, userId: uid, replyToken: "b", replyType: "x", text: "same", alternateTexts: [] });
  assert.equal(r.suppressed, true, "ไม่มี messageId ทั้งคู่ = เทียบข้อความแบบเดิม");
});

test("P0-1: extractRequestedRank — เลข/คำไทย/ไม่ระบุ", async () => {
  const { extractRequestedRank, isRankingQuery } = await import("../src/services/lineWebhook/rankingQueryGate.util.js");
  assert.equal(extractRequestedRank("อันดับ 2 คือชิ้นไหน"), 2);
  assert.equal(extractRequestedRank("ท็อป 3 มีอะไรบ้าง"), 3);
  assert.equal(extractRequestedRank("อันดับสอง"), 2);
  assert.equal(extractRequestedRank("ชิ้นไหนแรงสุด"), null);
  assert.equal(isRankingQuery("อันดับ 2 คือชิ้นไหน"), true);
});

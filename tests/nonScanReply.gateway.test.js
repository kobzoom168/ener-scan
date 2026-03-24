import { test } from "node:test";
import assert from "node:assert/strict";
import { sendNonScanReply } from "../src/services/nonScanReply.gateway.js";
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

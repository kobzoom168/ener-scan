import { test } from "node:test";
import assert from "node:assert/strict";
import { detectReplyLanguage } from "../src/core/conversation/geminiFront/geminiConsultPrompt.js";

test("detectReplyLanguage: เคส James — yes สั้น ๆ กับ history อังกฤษ = en", () => {
  const hist = [
    { role: "user", text: "i thought u are helping me see if its suits me or not?" },
    { role: "bot", text: "ครับ กำลังดูให้อยู่" },
    { role: "user", text: "how is it?" },
  ];
  assert.equal(detectReplyLanguage("yes", hist), "en");
  assert.equal(detectReplyLanguage("ok", hist), "en");
});

test("detectReplyLanguage: ไทยชัด/อังกฤษชัด/สั้นกับ history ไทย", () => {
  assert.equal(detectReplyLanguage("ขอโชคลาภหน่อยครับ", []), "th");
  assert.equal(detectReplyLanguage("can you help me see this amulet", []), "en");
  const thaiHist = [{ role: "user", text: "สวัสดีครับ" }];
  assert.equal(detectReplyLanguage("ok", thaiHist), "th");
  assert.equal(detectReplyLanguage("", []), "th");
});

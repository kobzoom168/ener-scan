import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectThaiStrings,
  replaceStringsDeep,
  applyEnglishStaticLabels,
  injectLangToggle,
} from "../src/services/reports/reportEnglish.service.js";

test("collectThaiStrings: เก็บเฉพาะ string ไทย ข้าม url/id/token", () => {
  const p = {
    object: { objectImageUrl: "https://x/รูป.jpg", objectLabel: "วัตถุจากการสแกน" },
    summary: { summaryLine: "พลังเด่นด้านเมตตา", energyScore: 7.4 },
    publicToken: "rpt_ไทยห้ามเก็บ",
    sections: { whatItGives: ["เสริมโชคลาภ", "just english"] },
  };
  const got = collectThaiStrings(p);
  assert.ok(got.includes("วัตถุจากการสแกน"));
  assert.ok(got.includes("พลังเด่นด้านเมตตา"));
  assert.ok(got.includes("เสริมโชคลาภ"));
  assert.ok(!got.includes("rpt_ไทยห้ามเก็บ"));
  assert.ok(!got.includes("https://x/รูป.jpg"));
  assert.ok(!got.includes("just english"));
});

test("replaceStringsDeep: แทนตาม map ไม่แตะ key ต้องห้าม ไม่แตะของเดิม", () => {
  const p = { summary: { summaryLine: "ก" }, object: { objectImageUrl: "ก" } };
  const out = replaceStringsDeep(p, { "ก": "A" });
  assert.equal(out.summary.summaryLine, "A");
  assert.equal(out.object.objectImageUrl, "ก");
  assert.equal(p.summary.summaryLine, "ก");
});

test("applyEnglishStaticLabels: ป้าย + วันที่ พ.ศ. → ค.ศ.", () => {
  const html = "<div>คะแนนพลัง</div><span>18 ก.ค. 2569</span><b>เข้ากับคุณ</b>";
  const out = applyEnglishStaticLabels(html);
  assert.ok(out.includes("Power score"));
  assert.ok(out.includes("18 Jul 2026"));
  assert.ok(out.includes("Match with you"));
});

test("injectLangToggle: ปุ่ม EN บนหน้าไทย / ปุ่มไทยบนหน้า EN", () => {
  const th = injectLangToggle("<body>x</body>", false);
  assert.ok(th.includes('?lang=en') && th.includes(">EN<"));
  const en = injectLangToggle("<body>x</body>", true);
  assert.ok(en.includes('href="?"') && en.includes(">ไทย<"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScanSummaryFirstFlex } from "../src/services/flex/flex.summaryFirst.js";

const SAMPLE_TEXT = `คะแนนพลัง: 8.2/10
พลังหลัก: ป้องกัน
ความเข้ากัน: 78%
บทสรุปภาพรวม
ชิ้นนี้ให้ความมั่นใจแบบนิ่ง
เหตุผลที่เข้ากับเจ้าของ
โยงกับจังหวะที่ต้องการความนิ่ง
บทบาทของชิ้นนี้
ปิดท้ายด้วยความอบอุ่น`;

test("buildScanSummaryFirstFlex: single bubble with hero + one report CTA", () => {
  const flex = buildScanSummaryFirstFlex(SAMPLE_TEXT, {
    reportUrl: "https://example.com/r/abc123",
    reportPayload: {
      reportId: "rid",
      publicToken: "tok",
      scanId: "s",
      userId: "u",
      birthdateUsed: null,
      generatedAt: new Date().toISOString(),
      reportVersion: "1.0.0",
      object: {
        objectImageUrl: "https://cdn.example.com/x.jpg",
        objectLabel: "พระเครื่อง",
        objectType: "",
      },
      summary: {
        energyScore: 8.2,
        energyLevelLabel: "สูง",
        mainEnergyLabel: "ป้องกัน",
        compatibilityPercent: 78,
        summaryLine: "สรุปสั้นจาก payload",
      },
      sections: {
        whatItGives: [],
        messagePoints: [],
        ownerMatchReason: [],
        roleDescription: "",
        bestUseCases: [],
        weakMoments: [],
        guidanceTips: [],
        careNotes: [],
        miniRitual: [],
      },
      trust: { trustNote: "n", rendererVersion: "html-1.0.0" },
      actions: {},
    },
  });
  assert.equal(flex.type, "flex");
  assert.equal(flex.contents.type, "bubble");
  assert.equal(flex.contents.hero?.type, "image");
  assert.equal(flex.contents.hero?.url, "https://cdn.example.com/x.jpg");
  const bodyStr = JSON.stringify(flex.contents.body);
  assert.match(bodyStr, /ระดับพลัง/);
  assert.match(bodyStr, /พลังหลัก/);
  assert.match(bodyStr, /เข้ากับคุณ/);
  assert.match(bodyStr, /ระดับเด่นของชิ้นนี้/);
  assert.match(bodyStr, /★/);
  assert.doesNotMatch(bodyStr, /"text":""/);
  const footer = flex.contents.footer;
  assert.ok(footer);
  const primaryBtn = footer.contents.find(
    (c) => c.type === "button" && c.action?.label === "ดูรายงานฉบับเต็ม",
  );
  assert.ok(primaryBtn);
  assert.equal(primaryBtn.action.uri, "https://example.com/r/abc123");
  assert.equal(footer.contents.filter((c) => c.type === "button").length, 1);
});

test("buildScanSummaryFirstFlex: appendReportBubble flag ignored (single-bubble design)", () => {
  const flex = buildScanSummaryFirstFlex(SAMPLE_TEXT, {
    reportUrl: "https://example.com/r/abc123",
    appendReportBubble: true,
  });
  assert.equal(flex.contents.type, "bubble");
});

test("buildScanSummaryFirstFlex: no reportUrl → fallback copy, no primary CTA", () => {
  const flex = buildScanSummaryFirstFlex(SAMPLE_TEXT, {
    reportUrl: null,
    reportPayload: {
      reportId: "r",
      publicToken: "t",
      scanId: "s",
      userId: "u",
      birthdateUsed: null,
      generatedAt: new Date().toISOString(),
      reportVersion: "1.0.0",
      object: { objectLabel: "วัตถุ", objectType: "" },
      summary: {
        energyScore: 8,
        energyLevelLabel: "สูง",
        mainEnergyLabel: "ป้องกัน",
        compatibilityPercent: 70,
        summaryLine: "สรุป",
      },
      sections: {
        whatItGives: [],
        messagePoints: [],
        ownerMatchReason: [],
        roleDescription: "",
        bestUseCases: [],
        weakMoments: [],
        guidanceTips: [],
        careNotes: [],
        miniRitual: [],
      },
      trust: { trustNote: "", rendererVersion: "0" },
      actions: {},
    },
  });
  assert.equal(flex.contents.type, "bubble");
  const bodyText = JSON.stringify(flex.contents.body);
  assert.match(bodyText, /ลิงก์รายงานยังไม่พร้อม/);
  assert.equal(flex.contents.footer, undefined);
});

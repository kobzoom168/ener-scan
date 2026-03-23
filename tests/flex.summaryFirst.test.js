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

test("buildScanSummaryFirstFlex: carousel with report URL (footer button)", () => {
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
  assert.equal(flex.contents.type, "carousel");
  assert.equal(flex.contents.contents.length, 1);
  assert.ok(flex.contents.contents[0].footer);
});

test("buildScanSummaryFirstFlex: append report bubble when flag", () => {
  const flex = buildScanSummaryFirstFlex(SAMPLE_TEXT, {
    reportUrl: "https://example.com/r/abc123",
    appendReportBubble: true,
  });
  assert.equal(flex.contents.contents.length, 2);
  assert.equal(flex.contents.contents[1].body.contents[1].text, "รายงานฉบับเต็ม");
});

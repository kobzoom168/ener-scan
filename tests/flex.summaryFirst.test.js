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

test("buildScanSummaryFirstFlex: always two carousel pages; page2 has full-report CTA", () => {
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
  assert.equal(flex.contents.contents.length, 2);
  assert.equal(
    flex.contents.contents[0].body.contents[1].contents[0].text,
    "สรุปพลังชิ้นนี้",
  );
  const page2Footer = flex.contents.contents[1].footer;
  assert.ok(page2Footer);
  const primaryBtn = page2Footer.contents.find(
    (c) => c.type === "button" && c.action?.label === "ดูรายงานฉบับเต็ม",
  );
  assert.ok(primaryBtn);
  assert.equal(primaryBtn.action.uri, "https://example.com/r/abc123");
});

test("buildScanSummaryFirstFlex: appendReportBubble flag ignored (two-page design)", () => {
  const flex = buildScanSummaryFirstFlex(SAMPLE_TEXT, {
    reportUrl: "https://example.com/r/abc123",
    appendReportBubble: true,
  });
  assert.equal(flex.contents.contents.length, 2);
  assert.equal(flex.contents.contents[1].body.contents[1].text, "อ่านต่อบนเว็บ");
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
  assert.equal(flex.contents.contents.length, 2);
  const page2 = flex.contents.contents[1];
  const bodyText = JSON.stringify(page2.body);
  assert.match(bodyText, /ลิงก์รายงานยังไม่พร้อม/);
  const footer = page2.footer;
  if (footer) {
    const hasPrimary = footer.contents.some(
      (c) =>
        c.type === "button" && c.action?.label === "ดูรายงานฉบับเต็ม",
    );
    assert.equal(hasPrimary, false);
  }
});

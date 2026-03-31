import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScanSummaryFirstFlex } from "../src/services/flex/flex.summaryFirst.js";

const SAMPLE_TEXT = `ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener

ระดับพลัง: 8.2 / 10
พลังหลัก: ป้องกัน
พลังเสริม: พลังสมดุล
ความสอดคล้องกับเจ้าของ: 78%

ลักษณะพลัง
• บุคลิก: โดดเด่นด้าน คุ้มกัน (สอดคล้องกับแกนพลังของชิ้นนี้)

• คุ้มกัน: ★★★★☆ — 4/5 ดาว
• สมดุล: ★★★☆☆ — 3/5 ดาว
• อำนาจ: ★★★☆☆ — 3/5 ดาว
• เมตตา: ★★☆☆☆ — 2/5 ดาว
• ดึงดูด: ★★☆☆☆ — 2/5 ดาว

ภาพรวม
ชิ้นนี้ให้ความมั่นใจแบบนิ่ง

เหตุผลที่เข้ากับเจ้าของ
โยงกับจังหวะที่ต้องการความนิ่ง

ชิ้นนี้หนุนเรื่อง
• ตั้งเจตนาก่อนใช้ในวันสำคัญ
• พักเรื่องกดดันตอนกลางคืน

ปิดท้าย
ส่งรูปต่อได้`;

function collectTextNodes(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.type === "text" && typeof node.text === "string") {
    out.push(node.text);
  }
  if (Array.isArray(node.contents)) {
    for (const c of node.contents) collectTextNodes(c, out);
  }
  return out;
}

function collectButtons(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.type === "button") out.push(node);
  if (Array.isArray(node.contents)) {
    for (const c of node.contents) collectButtons(c, out);
  }
  if (node.body) collectButtons(node.body, out);
  if (node.footer) collectButtons(node.footer, out);
  return out;
}

test("buildScanSummaryFirstFlex: single bubble with hero + one report CTA", () => {
  const flex = buildScanSummaryFirstFlex(SAMPLE_TEXT, {
    birthdate: "19/08/1985",
    reportUrl: "https://example.com/r/abc123",
    reportPayload: {
      reportId: "rid",
      publicToken: "tok",
      scanId: "s",
      userId: "u",
      birthdateUsed: "19/08/1985",
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
        birthdayLabel: "วันจันทร์ 19 ส.ค. 2528",
        compatibilityReason: "วันจันทร์รับพลังคุ้มกันได้ดี ชิ้นนี้ตรงจุดมาก",
        secondaryEnergyLabel: "พลังสมดุล",
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
  assert.equal(flex.contents.hero?.aspectRatio, "20:13");
  const bodyStr = JSON.stringify(flex.contents.body);
  assert.match(bodyStr, /ระดับพลัง/);
  assert.match(bodyStr, /พลังหลัก/);
  assert.doesNotMatch(bodyStr, /พลังหลัก · พลังเสริม/);
  assert.match(bodyStr, /เข้ากับคุณ/);
  assert.doesNotMatch(bodyStr, /เข้ากับคุณยังไง/);
  assert.match(bodyStr, /คุ้มกัน/);
  assert.match(bodyStr, /★/);
  assert.match(bodyStr, /#D4AF37/);
  assert.match(bodyStr, /#000000/);
  assert.match(bodyStr, /#111111/);
  assert.doesNotMatch(bodyStr, /"text":""/);
  assert.equal(flex.contents.footer, undefined);
  const buttons = collectButtons(flex.contents.body);
  const primaryBtn = buttons.find(
    (c) => c.type === "button" && c.action?.label === "เปิดรายงานฉบับเต็ม",
  );
  assert.ok(primaryBtn);
  assert.equal(primaryBtn.action.uri, "https://example.com/r/abc123");
  assert.equal(buttons.filter((c) => c.type === "button").length, 1);
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

test("buildScanSummaryFirstFlex: star rows use objectEnergy.stars not parsed dimension lines", () => {
  const textHighStars = SAMPLE_TEXT.replace(
    "คุ้มกัน: ★★★★☆ — 4/5 ดาว",
    "คุ้มกัน: ★★★★★ — 5/5 ดาว",
  );
  const flex = buildScanSummaryFirstFlex(textHighStars, {
    reportUrl: "https://example.com/r/abc123",
    reportPayload: {
      reportId: "rid",
      publicToken: "tok",
      scanId: "s",
      userId: "u",
      birthdateUsed: null,
      generatedAt: new Date().toISOString(),
      reportVersion: "1.2.0",
      object: { objectLabel: "x", objectType: "" },
      summary: {
        energyScore: 8.2,
        mainEnergyLabel: "ป้องกัน",
        compatibilityPercent: 78,
        summaryLine: "สรุป",
      },
      objectEnergy: {
        formulaVersion: "object_energy_v1",
        profile: {},
        stars: {
          balance: 1,
          protection: 1,
          authority: 1,
          compassion: 1,
          attraction: 1,
        },
        mainEnergyResolved: { key: "protection", labelThai: "คุ้มกัน" },
        confidence: 0.5,
        inputs: {},
        explain: [],
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
  const bodyStr = JSON.stringify(flex.contents.body);
  assert.match(bodyStr, /★☆☆☆☆/);
  assert.doesNotMatch(bodyStr, /★★★★★/);
});

test("buildScanSummaryFirstFlex: compatibility row uses reportPayload not parsed scan text", () => {
  const textHighCompat = SAMPLE_TEXT.replace(
    "ความสอดคล้องกับเจ้าของ: 78%",
    "ความสอดคล้องกับเจ้าของ: 99%",
  );
  const flex = buildScanSummaryFirstFlex(textHighCompat, {
    reportUrl: "https://example.com/r/abc123",
    reportPayload: {
      reportId: "rid",
      publicToken: "tok",
      scanId: "s",
      userId: "u",
      birthdateUsed: "1985-08-19",
      generatedAt: new Date().toISOString(),
      reportVersion: "1.0.0",
      object: { objectLabel: "x", objectType: "" },
      summary: {
        energyScore: 8.2,
        mainEnergyLabel: "ป้องกัน",
        compatibilityPercent: 81,
        compatibilityBand: "เข้ากันดี",
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
      trust: { trustNote: "n", rendererVersion: "html-1.0.0" },
      actions: {},
    },
  });
  const bodyStr = JSON.stringify(flex.contents.body);
  assert.match(bodyStr, /81%/);
  assert.match(bodyStr, /เข้ากันดี/);
  assert.doesNotMatch(bodyStr, /99%/);
});

test("buildScanSummaryFirstFlex: guardrails for summary-card structure", () => {
  const flex = buildScanSummaryFirstFlex(SAMPLE_TEXT, {
    reportUrl: "https://example.com/r/abc123",
    reportPayload: {
      reportId: "rid2",
      publicToken: "tok2",
      scanId: "s2",
      userId: "u2",
      birthdateUsed: null,
      generatedAt: new Date().toISOString(),
      reportVersion: "1.0.0",
      object: { objectLabel: "", objectType: "" },
      summary: {
        energyScore: 7.2,
        mainEnergyLabel: "อำนาจ",
        compatibilityPercent: 78,
        wordingFamily: "unknown_family",
        clarityLevel: "uncertain",
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

  const body = flex.contents.body;
  const allTexts = collectTextNodes(body);
  assert.ok(
    allTexts.some((t) => t === "พลังหลัก"),
    "energy badge section label",
  );

  const chevronTips = allTexts.filter((t) => t.startsWith("› "));
  assert.equal(chevronTips.length, 2, "must have exactly two › tip lines");

  const buttons = collectButtons(flex.contents.body);
  assert.equal(buttons.length, 1, "must have exactly one CTA");
  assert.equal(flex.contents.footer, undefined);

  const bodyStr = JSON.stringify(body);
  assert.doesNotMatch(bodyStr, /เหตุผลที่เข้ากับเจ้าของ/);
  assert.doesNotMatch(bodyStr, /ชิ้นนี้หนุนเรื่อง/);
  assert.doesNotMatch(bodyStr, /เหมาะใช้เมื่อ/);
  assert.doesNotMatch(bodyStr, /ช่วยเรื่องความมั่นคง/);
});

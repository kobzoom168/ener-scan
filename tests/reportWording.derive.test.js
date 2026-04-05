import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveReportWordingFromParsed } from "../src/services/reports/reportWording.derive.js";
import { ENERGY_TYPES } from "../src/services/flex/scanCopy.config.js";
import { buildReportPayloadFromScan } from "../src/services/reports/reportPayload.builder.js";
import { normalizeReportPayloadForRender } from "../src/utils/reports/reportPayloadNormalize.util.js";
import { renderMobileReportHtml } from "../src/templates/reports/mobileReport.template.js";

test("deriveReportWordingFromParsed: crystal protection uses stone-flavored hero + flex category", () => {
  const parsed = {
    mainEnergy: "พลังปกป้องและความมั่นคง",
    overview: "-",
    fitReason: "-",
    suitable: [],
    notStrong: "-",
    supportTopics: [],
  };
  const w = deriveReportWordingFromParsed(parsed, {
    seed: "crystal-protect-test",
    objectFamily: "crystal",
  });
  assert.ok(
    /หิน|พลังหิน|คริสตัล/.test(w.heroNaming),
    `expected stone-flavored hero, got: ${w.heroNaming}`,
  );
  assert.ok(
    !w.flexHeadline.includes("กันเรื่องไม่ดี"),
    "crystal flex teaser should not use generic Thai-amulet protection headline tail",
  );
  assert.ok(
    w.flexHeadline.includes("กันแรงลบ") ||
      w.flexHeadline.includes("คุ้มครอง") ||
      /เกราะ|ปกป้อง|กรอง/.test(w.flexHeadline),
    `expected crystal protection teaser, got: ${w.flexHeadline}`,
  );
  assert.equal(w.mainEnergy, ENERGY_TYPES.PROTECT);
});

test("deriveReportWordingFromParsed: protection + scan lines", () => {
  const parsed = {
    mainEnergy: "พลังปกป้องและความมั่นคง",
    overview:
      "ชิ้นนี้เด่นด้านการตั้งหลักและกันความวุ่นวายในใจ เหมาะกับช่วงที่ต้องรับแรงกดดัน",
    fitReason: "สอดคล้องกับคนที่ต้องการความนิ่งมากกว่าความตื่นเต้น",
    suitable: ["ก่อนเข้าประชุมสำคัญ", "ช่วงเครียดสูง"],
    notStrong: "ไม่เน้นเสน่ห์หรือการดึงดูดเป็นหลัก",
    supportTopics: [
      "ช่วยให้ใจไม่แกว่งเมื่อถูกท้าทาย",
      "เหมาะเมื่อต้องตัดสินใจเรื่องใหญ่",
      "ช่วยคุมโทนเมื่อบรรยากาศรอบตัววุ่น",
    ],
  };
  const w = deriveReportWordingFromParsed(parsed, {
    seed: "test-seed",
    energyScore: 7.8,
    compatibilityPercent: 72,
  });
  assert.equal(w.mainEnergy, ENERGY_TYPES.PROTECT);
  assert.ok(w.heroNaming.length > 3);
  assert.ok(w.energyCharacter.includes("ชิ้นนี้") || w.energyCharacter.length > 10);
  assert.ok(w.flexBullets.length === 2);
  assert.notEqual(w.flexBullets[0], w.flexBullets[1]);
  assert.equal(w.energyBreakdown.protection, 78);
  assert.equal(w.energyBreakdown.balance, 0);
  assert.equal(w.wordingFamily, "protection");
  assert.equal(w.clarityLevel, "l2");
});

test("buildReportPayloadFromScan: crystalMode + parsed.crystal_mode (general / spiritual / null)", async () => {
  const base = {
    scanResultId: "00000000-0000-4000-8000-000000000099",
    scanRequestId: "req-1",
    lineUserId: "U1",
    publicToken: "tok",
  };
  const textGeneral = `
ระดับพลัง: 7
พลังหลัก: เด่นเรื่องเงินและงาน
ความสอดคล้อง: 72%

ภาพรวม
โทนนิ่ง

เหตุผลที่เข้ากับเจ้าของ
เหมาะกับช่วงกดดัน

ชิ้นนี้หนุนเรื่อง
• หนุนเรื่องแรก
• หนุนเรื่องสอง

เหมาะใช้เมื่อ
• เหมาะบรรทัดหนึ่ง

อาจไม่เด่นเมื่อ: ไม่ใช่สายดึงดูด
`;
  const textSpiritual = `
ระดับพลัง: 8
พลังหลัก: Moldavite third eye crown chakra หยั่งรู้
ความสอดคล้อง: 80%

ภาพรวม
โทนสูง

เหตุผลที่เข้ากับเจ้าของ
เหมาะกับช่วงเปลี่ยนแปลง

ชิ้นนี้หนุนเรื่อง
• หนุนเรื่องแรก
• หนุนเรื่องสอง

เหมาะใช้เมื่อ
• เหมาะบรรทัดหนึ่ง

อาจไม่เด่นเมื่อ: ไม่ใช่สายดึงดูด
`;
  const pGeneral = await buildReportPayloadFromScan({
    ...base,
    resultText: textGeneral,
    objectFamily: "crystal",
  });
  assert.equal(pGeneral.summary.crystalMode, "general");
  assert.equal(pGeneral.parsed?.crystal_mode, "general");
  assert.equal(pGeneral.diagnostics?.visibleWordingDecisionSource, "db_crystal");
  assert.equal(pGeneral.diagnostics?.visibleWordingCrystalSpecific, true);
  assert.equal(pGeneral.diagnostics?.visibleWordingObjectFamilyUsed, "crystal");

  const pSpirit = await buildReportPayloadFromScan({
    ...base,
    resultText: textSpiritual,
    objectFamily: "crystal",
  });
  assert.equal(pSpirit.summary.crystalMode, "spiritual_growth");
  assert.equal(pSpirit.parsed?.crystal_mode, "spiritual_growth");
  assert.equal(
    pSpirit.summary.energyCategoryCode,
    "spiritual_growth",
    "raw Moldavite line must drive category (not canonical protection)",
  );

  const pThai = await buildReportPayloadFromScan({
    ...base,
    resultText: textGeneral,
    objectFamily: "thai_amulet",
  });
  assert.equal(pThai.summary.crystalMode, null);
  assert.equal(pThai.parsed?.crystal_mode, null);
  assert.equal(pThai.diagnostics?.visibleWordingDecisionSource, "db_family");
  assert.equal(pThai.diagnostics?.visibleWordingCrystalSpecific, false);
});

test("buildReportPayloadFromScan: crystal fills empty whatItGives / bestUse from category fallback", async () => {
  const textThin = `
ระดับพลัง: 8
พลังหลัก: Moldavite หยั่งรู้ crown
ความสอดคล้อง: 80%

ภาพรวม
สั้น

เหตุผลที่เข้ากับเจ้าของ
สั้น

อาจไม่เด่นเมื่อ: ไม่ใช่สายดึงดูด
`;
  const payload = await buildReportPayloadFromScan({
    resultText: textThin,
    scanResultId: "00000000-0000-4000-8000-0000000000aa",
    scanRequestId: "req-thin",
    lineUserId: "U1",
    publicToken: "tok",
    objectFamily: "crystal",
  });
  assert.ok(payload.sections.whatItGives.length >= 1);
  assert.ok(payload.sections.bestUseCases.length >= 1);
  assert.ok(payload.summary.headlineShort?.length > 3);
  assert.ok(payload.summary.fitReasonShort?.length > 3);
  assert.equal(payload.summary.bulletsShort?.length, 2);
});

test("buildReportPayloadFromScan attaches wording and canonical main energy", async () => {
  const text = `
ระดับพลัง: 7.8
พลังหลัก: พลังปกป้อง
ความสอดคล้อง: 72%

ภาพรวม
โทนนิ่งและตั้งหลักในใจ

เหตุผลที่เข้ากับเจ้าของ
เหมาะกับช่วงกดดัน

ชิ้นนี้หนุนเรื่อง
• หนุนเรื่องแรก
• หนุนเรื่องสอง

เหมาะใช้เมื่อ
• เหมาะบรรทัดหนึ่ง
• บรรทัดสอง

อาจไม่เด่นเมื่อ: ไม่ใช่สายดึงดูด
`;
  const payload = await buildReportPayloadFromScan({
    resultText: text,
    scanResultId: "00000000-0000-4000-8000-000000000099",
    scanRequestId: "req-1",
    lineUserId: "U1",
    publicToken: "tok",
  });
  assert.equal(payload.summary.mainEnergyLabel, ENERGY_TYPES.PROTECT);
  assert.ok(payload.wording?.htmlOpeningLine);
  assert.ok(payload.wording?.flexHeadline);
});

test("normalizeReportPayloadForRender preserves wording fields", () => {
  const { payload } = normalizeReportPayloadForRender({
    reportId: "r",
    publicToken: "p",
    scanId: "s",
    userId: "u",
    generatedAt: new Date().toISOString(),
    summary: { summaryLine: "x", mainEnergyLabel: "ปกป้อง" },
    sections: {},
    trust: {},
    actions: {},
    object: {},
    wording: {
      heroNaming: "ทดสอบ",
      mainEnergy: "ปกป้อง",
      flexBullets: ["a", "b"],
      practicalEffects: ["1", "2", "3"],
      energyBreakdown: { protection: 50, balance: 0 },
    },
  });
  assert.equal(payload.wording.heroNaming, "ทดสอบ");
  assert.equal(payload.wording.energyBreakdown.protection, 50);
  assert.equal(payload.wording.practicalEffects.length, 3);
});

test("renderMobileReportHtml includes structured hook when wording present", () => {
  const html = renderMobileReportHtml({
    reportId: "r",
    publicToken: "p",
    scanId: "s",
    userId: "u",
    birthdateUsed: null,
    generatedAt: new Date().toISOString(),
    reportVersion: "1.1.0",
    object: { objectLabel: "ทดสอบ", objectImageUrl: "", objectType: "" },
    summary: {
      energyScore: 8,
      energyLevelLabel: "สูง",
      mainEnergyLabel: "ปกป้อง",
      compatibilityPercent: 80,
      summaryLine: "สรุป",
    },
    sections: {
      whatItGives: [],
      messagePoints: [],
      ownerMatchReason: [],
      bestUseCases: [],
      weakMoments: [],
      guidanceTips: [],
    },
    trust: { trustNote: "n", rendererVersion: "html-1.0.0" },
    actions: {},
    wording: {
      htmlOpeningLine: "บรรทัดเปิดเฉพาะชิ้น",
      heroNaming: "พลังทดสอบ",
      mainEnergy: "ปกป้อง",
      energyCharacter: "ลักษณะ",
      lifeTranslation: "ความหมายในชีวิต",
      bestFor: "สถานการณ์",
      notTheBestFor: "ไม่ใช่จุดเน้น",
      practicalEffects: ["เอฟเฟกต์1", "เอฟเฟกต์2", "เอฟเฟกต์3"],
    },
  });
  assert.ok(html.includes("บรรทัดเปิดเฉพาะชิ้น"));
  assert.ok(html.includes("พลังทดสอบ"));
  assert.ok(html.includes("ความหมายเชิงลึก"));
});

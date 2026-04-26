import test from "node:test";
import assert from "node:assert/strict";
import { renderAmuletLibraryRankingHtml } from "../../src/templates/reports/amuletLibraryRanking.template.js";
import { buildSacredAmuletLibraryViewFromPayloadOnly } from "../../src/services/reports/sacredAmuletLibrary.service.js";
import { normalizeReportPayloadForRender } from "../../src/utils/reports/reportPayloadNormalize.util.js";

test("renderAmuletLibraryRankingHtml: tabs, cards, footer CTA, noindex", () => {
  const payload = {
    reportId: "r1",
    publicToken: "toklib1",
    scanId: "s1",
    userId: "u1",
    birthdateUsed: "1990-06-15",
    generatedAt: "2026-04-24T08:00:00.000Z",
    reportVersion: "1",
    object: { objectImageUrl: "https://example.com/a.jpg" },
    summary: {
      energyScore: 8,
      compatibilityPercent: 80,
      mainEnergyLabel: "คุ้มครอง",
    },
    sections: {
      whatItGives: [],
      messagePoints: [],
      ownerMatchReason: [],
      roleDescription: [],
      bestUseCases: [],
      weakMoments: [],
      guidanceTips: [],
      careNotes: [],
      miniRitual: [],
    },
    trust: { trustNote: "" },
    actions: {},
    amuletV1: {
      version: "1",
      scoringMode: "deterministic_v2",
      detection: { reason: "x", matchedSignals: [] },
      powerCategories: {
        protection: { key: "protection", score: 80, labelThai: "คุ้มครอง" },
        metta: { key: "metta", score: 60, labelThai: "เมตตา" },
        baramee: { key: "baramee", score: 50, labelThai: "บารมี" },
        luck: { key: "luck", score: 50, labelThai: "โชค" },
        fortune_anchor: { key: "fortune_anchor", score: 50, labelThai: "หนุน" },
        specialty: { key: "specialty", score: 50, labelThai: "เฉพาะทาง" },
      },
      primaryPower: "protection",
      secondaryPower: "metta",
      flexSurface: {
        headline: "ทดสอบ",
        fitLine: "",
        bullets: [],
        mainEnergyShort: "คุ้มครอง",
      },
      htmlReport: { lifeAreaBlurbs: {}, usageCautionLines: [] },
    },
  };
  const { payload: norm } = normalizeReportPayloadForRender(payload);
  const library = buildSacredAmuletLibraryViewFromPayloadOnly(norm);
  assert.ok(library);
  const html = renderAmuletLibraryRankingHtml({
    pagePublicToken: "toklib1",
    library,
    pinnedOriginalCount: 2,
    pinFlash: "quota",
    freeTierPinLimit: 10,
  });
  assert.ok(html.includes("คลังพลังของคุณ"));
  assert.ok(
    html.includes(
      "บัญชีฟรีเก็บรูปเต็มได้ 10 รายการ ผลสแกนและคะแนนยังอยู่ แม้รูปเต็มหมดอายุ",
    ),
  );
  assert.ok(html.includes("แพ็กเก็บพื้นที่แบบจ่ายเงินจะเปิดให้บริการภายหลัง"));
  assert.ok(html.includes('content="noindex,nofollow"'));
  assert.ok(html.includes("แรงสุดโดยรวม"));
  assert.ok(html.includes("โชคลาภสูงสุด"));
  assert.ok(html.includes("อยากรู้ว่าองค์อื่นของคุณจะขึ้นอันดับไหน?"));
  assert.ok(html.includes("สแกนวัตถุเพิ่ม"));
  assert.ok(html.includes("คุณมีรายการสแกนแล้ว 1 รายการ"));
  assert.ok(html.includes("พระเด่นประจำพลังของคุณ"));
  assert.ok(html.includes("alib-axis-track"));
  assert.ok(html.includes('id="alib-full-rankings"'));
  assert.ok(html.includes('id="alib-btn-show-rankings"'));
  assert.ok(html.includes("อันดับ 1 โดยรวมตอนนี้"));
  assert.ok(!html.includes("แสดงเฉพาะรายการที่ไม่ซ้ำกันในหน้านี้"));
  assert.ok(
    html.includes(
      "ระบบจัดอันดับจากผลสแกนของคุณเท่านั้น ไม่ได้ระบุชื่อพระหรือรุ่นพระจริง",
    ),
  );
  assert.ok(
    html.includes(
      "สแกนเพิ่มเพื่อเทียบพลังรวม โชคลาภ คุ้มครอง เมตตา บารมี และความเข้ากัน",
    ),
  );
  assert.ok(html.includes("ดูรายงานนี้"));
  assert.ok(html.includes("/r/toklib1"));
  assert.ok(html.includes("[data-alib-tab]"));
  assert.ok(html.includes("เลื่อนดูพลังด้านอื่น ๆ"));
  assert.ok(html.includes("ดูอันดับทั้งหมดในคลัง"));
  assert.ok(html.includes("เด่นสุดในด้านนี้"));
});

test("renderAmuletLibraryRankingHtml: grouped header + duplicate badge", () => {
  const library = {
    totalCount: 5,
    groupedObjectCount: 3,
    items: [
      {
        scanResultV2Id: "s1",
        publicToken: "tok-newest",
        thumbUrl: "https://example.com/x.jpg",
        powerTotal: 84,
        peakPowerLabelTh: "โชคลาภและการเปิดทาง",
        compatPercent: 71,
        scannedAtIso: "2026-04-16T10:00:00.000Z",
        displayReportId: "ES-NEWEST",
        reportId: "rnew",
        axisScores: { luck: 89, protection: 70, metta: 60, baramee: 55 },
        scanCountInGroup: 3,
        groupKey: "image_sha256:abc",
        groupKeySource: "image_sha256",
      },
    ],
    byOverall: [
      {
        scanResultV2Id: "s1",
        publicToken: "tok-newest",
        thumbUrl: "https://example.com/x.jpg",
        powerTotal: 84,
        peakPowerLabelTh: "โชคลาภและการเปิดทาง",
        compatPercent: 71,
        scannedAtIso: "2026-04-16T10:00:00.000Z",
        displayReportId: "ES-NEWEST",
        reportId: "rnew",
        axisScores: { luck: 89, protection: 70, metta: 60, baramee: 55 },
        scanCountInGroup: 3,
        groupKey: "image_sha256:abc",
        groupKeySource: "image_sha256",
      },
    ],
    byLuck: [],
    byProtection: [],
    byMetta: [],
    byBaramee: [],
    byFit: [],
    topOverall: null,
    axisHighlights: [],
  };
  const html = renderAmuletLibraryRankingHtml({
    pagePublicToken: "tok-main",
    library,
  });
  assert.ok(html.includes("คุณมีรายการสแกนแล้ว 5 รายการ"));
  assert.ok(html.includes("แสดงเฉพาะรายการที่ไม่ซ้ำกันในหน้านี้"));
  assert.ok(html.includes("สแกนซ้ำ 3 ครั้ง"));
  assert.ok(html.includes("/r/tok-newest"));
  assert.ok(!html.includes("พระเด่นประจำพลังของคุณ"));
});

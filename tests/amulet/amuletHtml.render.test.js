import test from "node:test";
import assert from "node:assert/strict";
import { renderAmuletReportV2Html } from "../../src/templates/reports/amuletReportV2.template.js";

test("renderAmuletReportV2Html: renders sacred amulet shell", () => {
  const html = renderAmuletReportV2Html({
    reportId: "r1",
    publicToken: "t",
    scanId: "s1",
    userId: "u",
    birthdateUsed: "15/06/1990",
    generatedAt: new Date().toISOString(),
    reportVersion: "1",
    object: {
      objectImageUrl: "https://example.com/amulet-og-preview.jpg",
    },
    summary: {
      energyScore: 7,
      energyLevelLabel: "ปานกลาง",
      mainEnergyLabel: "คุ้มครอง",
      compatibilityPercent: 80,
      compatibilityBand: "เข้ากันได้ดี",
      summaryLine: "",
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
    trust: { trustNote: "ทดสอบ" },
    actions: {},
    wording: {},
    amuletV1: {
      version: "1",
      scoringMode: "deterministic_v2",
      detection: { reason: "sacred_amulet_lane_v1", matchedSignals: [] },
      powerCategories: {
        protection: { key: "protection", score: 88, labelThai: "คุ้มครองป้องกัน" },
        metta: { key: "metta", score: 70, labelThai: "เมตตาและคนเอ็นดู" },
        baramee: { key: "baramee", score: 65, labelThai: "บารมีและอำนาจนำ" },
        luck: { key: "luck", score: 60, labelThai: "โชคลาภและการเปิดทาง" },
        fortune_anchor: {
          key: "fortune_anchor",
          score: 55,
          labelThai: "หนุนดวงและการตั้งหลัก",
        },
        specialty: { key: "specialty", score: 50, labelThai: "งานเฉพาะทาง" },
      },
      primaryPower: "protection",
      secondaryPower: "metta",
      flexSurface: {
        headline: "พระเครื่อง",
        fitLine: "ตอนนี้เด่นสุด: คุ้มครองป้องกัน → เมตตาและคนเอ็นดู",
        bullets: ["a", "b"],
        ctaLabel: "ดูว่าชิ้นนี้ช่วยคุณยังไง",
        mainEnergyShort: "คุ้มครอง",
        tagline: "พระเครื่อง · หกมิติพลัง",
        mainEnergyWordingLine: "x",
        htmlOpeningLine: "y",
        heroNamingLine: "z",
      },
      htmlReport: {
        lifeAreaBlurbs: {},
        usageCautionLines: [],
      },
    },
    timingV1: {
      engineVersion: "timing_v1_1",
      lane: "sacred_amulet",
      ritualMode: "ตั้งจิต",
      confidence: "medium",
      ownerProfile: { lifePath: 9, birthDayRoot: 6, weekday: 5 },
      bestHours: [
        {
          key: "morning_07_10",
          score: 82,
          reasonCode: "LANE_POWER_SUPPORT",
          reasonText: "ช่วงเช้าส่งกับแกนพลัง",
        },
      ],
      bestWeekdays: [
        { key: "weekday_4", score: 80, reasonCode: "BALANCED", reasonText: "ทดสอบ" },
      ],
      bestDateRoots: [
        { key: "6", score: 75, reasonCode: "BALANCED", reasonText: "ทดสอบ" },
      ],
      avoidHours: [
        {
          key: "late_night_23_04",
          score: 35,
          reasonCode: "LOW_RESONANCE",
          reasonText: "ทดสอบ",
        },
      ],
      summary: {
        topWindowLabel: "ช่วงเช้า 07:00–10:59",
        topWeekdayLabel: "วันพฤหัสบดี",
        practicalHint:
          "ใช้ตั้งจิตคู่กับ ช่วงเช้า 07:00–10:59 และ วันพฤหัสบดี หนุนพลังคุ้มครองและเสริมบารมีภายในได้ดี เสริมดวงให้ขึ้นง่าย",
      },
    },
  });
  assert.ok(html.includes("พระเครื่อง"));
  assert.ok(html.includes("level-grade--B"), "ระดับ strip: score 7 → B + sacred_amulet gold lane class");
  assert.ok(html.includes("กราฟหกมิติพลังพระเครื่อง"));
  assert.ok(html.includes("เทียบโปรไฟล์คุณกับพลังพระเครื่อง"));
  assert.ok(html.includes('class="mv2a-radar-svg mv2a-radar-svg--animate"'));
  assert.ok(html.includes('class="mv2a-radar-layer mv2a-radar-layer--owner"'));
  assert.ok(html.includes('class="mv2a-radar-layer mv2a-radar-layer--amulet"'));
  assert.ok(html.includes('<circle class="mv2a-radar-peak"'));
  assert.ok(html.includes('class="mv2a-radar-peak-secondary"'), "เข้ากับคุณที่สุด: จุดรองบนกราฟ + pulse");
  assert.ok(
    html.includes("เข้ากับคุณที่สุด (จุดพลังรองบนกราฟ)"),
    "จุดรองตรงแกนเดียวกับสรุป เข้ากับคุณที่สุด",
  );
  assert.ok(html.includes("พลังเด่นสุดของพระเครื่อง: คุ้มครองป้องกัน"));
  assert.ok(html.includes('class="mv2a-radar-labels"'));
  assert.ok(html.includes("class=\"mv2a-radar-lbl mv2a-radar-lbl--protection mv2a-radar-lbl--top1\""));
  assert.ok(html.includes("class=\"mv2a-radar-lbl mv2a-radar-lbl--metta mv2a-radar-lbl--top2\""));
  assert.ok(html.includes("คุ้มครอง</span> <span class=\"mv2a-radar-axis-n\">88"));
  assert.ok(html.includes("เมตตา</span> <span class=\"mv2a-radar-axis-n\">70"));
  assert.ok(html.includes("งานเฉพาะ</span> <span class=\"mv2a-radar-axis-n\">50"));
  assert.ok(html.includes("พลังทั้ง 6 ด้าน"));
  assert.ok(html.includes("เรียงจากคะแนนสูงไปต่ำ"));
  assert.ok(html.includes('class="mv2-life-row"'));
  assert.ok(html.includes("พลังเด่น"));
  assert.ok(html.includes("สรุปผล"));
  assert.ok(html.includes("เข้ากับคุณที่สุด"));
  assert.ok(html.includes('class="mv2-owner-mini"'));
  assert.ok(html.includes('class="mv2-int-card"'));
  assert.ok(html.includes('class="mv2a-footer-note"'));
  assert.ok(html.includes("จังหวะเสริมพลัง"));
  assert.ok(html.includes('class="mv2-card mv2-timing-card"'));
  assert.ok(html.includes("mv2-et-strip--weekday"));
  assert.ok(html.includes("mv2-et-strip--time"));
  assert.ok(html.includes("mv2-et-pill-shape"));
  assert.ok(html.includes("mv2-et-slot-bar"));
  assert.ok(
    html.includes("ช่วงที่พระเครื่องตอบกับจังหวะของคุณได้ดีที่สุด"),
  );
  assert.ok(html.includes("ช่วงเช้า 07:00–10:59"));
  assert.ok(html.includes("วันพฤหัสบดี"));
  assert.ok(html.includes("วันส่งดี"));
  assert.ok(html.includes("ช่วงเวลาที่ส่งดี"));
  assert.ok(html.includes("แนวใช้ที่แนะนำ"));
  assert.ok(html.includes("mv2-timing-mode-body"));
  assert.ok(html.includes("หนุนพลัง"));
  assert.ok(
    html.includes("เสริมดวงให้ขึ้นง่าย"),
    "timing hint follows engine practicalHint (confident, no disclaimer)",
  );
  assert.ok(!html.includes("เป็นกรอบอ่าน"));
  assert.ok(!html.includes("ไม่การันตีฤกษ์"));
  assert.ok(!html.includes("ไม่การันตี"));
  assert.ok(!html.includes("ข้อจำกัด"));
  assert.ok(html.includes("แชร์รายงาน"));
  assert.ok(html.includes('id="mv2-share-native"'));
  assert.ok(html.includes("https://lin.ee/6YZeFZ1"));
  assert.ok(html.includes("navigator.share"));
  assert.ok(
    html.includes("วันเดือนปีเกิด") &&
      html.includes("Ener Scan") &&
      html.includes("การปฏิบัติตัวของเจ้าของ"),
    "sacred_amulet concise usage disclaimer",
  );
  assert.ok(html.includes("ชิ้นนี้ทำงานกับคุณอย่างไร"));
  assert.ok(html.includes("--mv2-font-th"));
  assert.ok(html.includes("Noto Sans Thai"));
  assert.ok(!html.includes("ควรค่อย ๆ ไป"));
  assert.ok(!html.includes("แกน"));
  assert.ok(!html.includes("โค้ง"));
  assert.ok(html.includes("จังหวะเกิดเดือนมิถุนายน"));
  assert.ok(html.includes("สงบ 7/10"));
  assert.ok(html.includes("มุ่งมั่น 6/10"));
  assert.ok(html.includes("เปิดรับ 8/10"));
  assert.ok(html.includes("ระมัดระวัง 7/10"));
  assert.ok(html.includes("โปรไฟล์คุณดัน"));
  assert.ok(html.includes("โทนหลัก ·"));
  assert.ok(!html.includes("โทนทอง"), "hero subtitle fallback is removed from HTML");
  assert.ok(!html.includes('class="mv2-tag"'), "hero subtitle is not rendered");
  assert.ok(!html.includes("พลังหลัก ·"), "hero uses โทนหลัก, not พลังหลัก");
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes("พระเครื่อง · Ener Scan"), "og:title matches readable title");
  assert.ok(html.includes('property="og:description"'));
  assert.ok(
    html.includes("ดูรายงานพลังพระเครื่องจาก Ener Scan"),
    "og:description summary",
  );
  assert.ok(html.includes('property="og:image"'));
  assert.ok(html.includes("https://example.com/amulet-og-preview.jpg"));
  assert.ok(html.includes('property="og:url"'));
  assert.ok(html.includes("/r/t"), "og:url contains public report path");
  assert.ok(html.includes('name="twitter:card"'));
  assert.ok(html.includes("summary_large_image"));
  assert.ok(html.includes('rel="canonical"'));
  assert.ok(html.includes("render amulet-html-v2"));
  assert.ok(html.includes("--mv2a-bg: #f6f6f4"), "default light neutral shell");
  assert.ok(html.includes("--mv2a-gold: #b8871b"));
  assert.ok(
    html.startsWith(`<!DOCTYPE html>
<html lang="th">
<head>`),
    "default: no html theme class (light tokens in :root)",
  );
});

test("renderAmuletReportV2Html: optional dark-gold dashboard via wording.amuletReportV2Theme dark", () => {
  const base = {
    reportId: "r1",
    publicToken: "t",
    scanId: "s1",
    userId: "u",
    birthdateUsed: "15/06/1990",
    generatedAt: new Date().toISOString(),
    reportVersion: "1",
    object: {
      objectImageUrl: "https://example.com/amulet-og-preview.jpg",
    },
    summary: {
      energyScore: 7,
      energyLevelLabel: "ปานกลาง",
      mainEnergyLabel: "คุ้มครอง",
      compatibilityPercent: 80,
      compatibilityBand: "เข้ากันได้ดี",
      summaryLine: "",
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
    trust: {},
    actions: {},
    wording: { amuletReportV2Theme: "dark" },
    amuletV1: {
      version: "1",
      scoringMode: "deterministic_v2",
      detection: { reason: "sacred_amulet_lane_v1", matchedSignals: [] },
      powerCategories: {
        protection: { key: "protection", score: 88, labelThai: "คุ้มครองป้องกัน" },
        metta: { key: "metta", score: 70, labelThai: "เมตตาและคนเอ็นดู" },
        baramee: { key: "baramee", score: 65, labelThai: "บารมีและอำนาจนำ" },
        luck: { key: "luck", score: 60, labelThai: "โชคลาภและการเปิดทาง" },
        fortune_anchor: {
          key: "fortune_anchor",
          score: 55,
          labelThai: "หนุนดวงและการตั้งหลัก",
        },
        specialty: { key: "specialty", score: 50, labelThai: "งานเฉพาะทาง" },
      },
      primaryPower: "protection",
      secondaryPower: "metta",
      flexSurface: {
        headline: "พระเครื่อง",
        fitLine: "x",
        bullets: [],
        ctaLabel: "c",
        mainEnergyShort: "คุ้มครอง",
        tagline: "t",
      },
      htmlReport: { lifeAreaBlurbs: {}, usageCautionLines: [] },
    },
  };
  const html = renderAmuletReportV2Html(base);
  assert.ok(html.includes('class="mv2a-theme-dark"'));
  assert.ok(html.includes("--mv2a-bg: #090a0d"));
  assert.ok(html.includes("--mv2a-gold: #e8c547"));
  assert.ok(html.includes("var(--mv2a-radar-spoke)"));
  assert.ok(html.includes("กราฟหกมิติพลังพระเครื่อง"));
});

test("renderAmuletReportV2Html: hero clarifier when โทนหลักไม่ตรงพลังเด่นสุด", () => {
  const html = renderAmuletReportV2Html({
    reportId: "r2",
    publicToken: "t",
    scanId: "s1",
    userId: "u",
    birthdateUsed: "15/06/1990",
    generatedAt: new Date().toISOString(),
    reportVersion: "1",
    object: {
      objectImageUrl: "https://example.com/amulet-og-preview.jpg",
    },
    summary: {
      energyScore: 7,
      energyLevelLabel: "ปานกลาง",
      mainEnergyLabel: "เมตตา",
      compatibilityPercent: 80,
      compatibilityBand: "เข้ากันได้ดี",
      summaryLine: "",
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
    trust: {},
    actions: {},
    wording: {},
    amuletV1: {
      version: "1",
      scoringMode: "deterministic_v2",
      detection: { reason: "sacred_amulet_lane_v1", matchedSignals: [] },
      powerCategories: {
        protection: { key: "protection", score: 88, labelThai: "คุ้มครองป้องกัน" },
        metta: { key: "metta", score: 70, labelThai: "เมตตาและคนเอ็นดู" },
        baramee: { key: "baramee", score: 65, labelThai: "บารมีและอำนาจนำ" },
        luck: { key: "luck", score: 60, labelThai: "โชคลาภและการเปิดทาง" },
        fortune_anchor: {
          key: "fortune_anchor",
          score: 55,
          labelThai: "หนุนดวงและการตั้งหลัก",
        },
        specialty: { key: "specialty", score: 50, labelThai: "งานเฉพาะทาง" },
      },
      primaryPower: "protection",
      secondaryPower: "metta",
      flexSurface: {
        headline: "พระเครื่อง",
        fitLine: "เด่นสุด คุ้มครองป้องกัน · รอง เมตตาและคนเอ็นดู",
        bullets: [],
        ctaLabel: "เปิด",
        mainEnergyShort: "เมตตา",
        tagline: "พระเครื่อง · หกมิติพลัง",
        mainEnergyWordingLine: "",
        htmlOpeningLine: "",
        heroNamingLine: "",
      },
      htmlReport: { lifeAreaBlurbs: {}, usageCautionLines: [] },
    },
  });
  assert.ok(html.includes('class="mv2-hero-clarifier"'));
  assert.ok(html.includes("สรุปจากสแกน"));
  assert.ok(!html.includes("สรุปจากสแกน · "));
  assert.ok(html.includes("โทนหลัก · คุ้มครอง"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildAmuletSummaryFirstFlex } from "../src/services/flex/flex.amuletSummary.js";

const basePayload = {
  summary: {
    energyScore: 7.5,
    compatibilityPercent: 78,
    compatibilityBand: "เข้ากันได้ดี",
  },
  object: { objectImageUrl: "https://example.com/x.jpg" },
  amuletV1: {
    version: "1",
    scoringMode: "deterministic_v1",
    powerCategories: {
      protection: { key: "protection", score: 90, labelThai: "คุ้มครองป้องกัน" },
      metta: { key: "metta", score: 80, labelThai: "เมตตาและคนเอ็นดู" },
      baramee: { key: "baramee", score: 70, labelThai: "บารมีและอำนาจนำ" },
      luck: {
        key: "luck",
        score: 60,
        labelThai:
          "โชคลาภและการเปิดทาง (ข้อความยาวเพื่อทดสอบว่า label ไม่ชน bar ในแถวเดียว)",
      },
      fortune_anchor: {
        key: "fortune_anchor",
        score: 55,
        labelThai: "หนุนดวงและการตั้งหลัก",
      },
      specialty: { key: "specialty", score: 50, labelThai: "งานเฉพาะทาง" },
    },
    flexSurface: {
      headline: "พระเครื่อง",
      fitLine: "ตอนนี้เด่นสุด: คุ้มครองป้องกัน → เมตตาและคนเอ็นดู",
      bullets: [
        "เด่นเมตตาและคนเอ็นดู ช่วยให้จังหวะชีวิตเริ่มขยับขึ้น",
        "ข้อสองสั้น ๆ",
      ],
      ctaLabel: "ดูว่าชิ้นนี้ช่วยคุณยังไง",
      mainEnergyShort: "คุ้มครอง",
      tagline: "พระเครื่อง · โทนทอง",
    },
  },
};

test("buildAmuletSummaryFirstFlex: compact flex + top-4 bars + summary block", async () => {
  const flex = await buildAmuletSummaryFirstFlex("ignored", {
    reportPayload: basePayload,
    reportUrl: "https://report.example/x",
    appendReportBubble: false,
  });
  assert.equal(flex.type, "flex");
  const bodyText = JSON.stringify(flex.contents);
  assert.ok(bodyText.includes("พระเครื่อง"));
  assert.ok(bodyText.includes("ตอนนี้เด่นสุด"));
  assert.ok(bodyText.includes("คุ้มครองป้องกัน → เมตตาและคนเอ็นดู"));
  assert.ok(bodyText.includes("ดูว่าชิ้นนี้ช่วยคุณยังไง"));
  assert.ok(bodyText.includes("พลังไปออกกับมิติไหน"));
  assert.ok(
    !bodyText.includes("พลังหลัก"),
    "sacred amulet flex: no main-energy pill section",
  );
  assert.ok(bodyText.includes("เรียงจากคะแนนสูงไปต่ำ"));

  // Top 4 only: 5th / 6th dimension labels must not appear
  assert.ok(!bodyText.includes("หนุนดวงและการตั้งหลัก"));
  assert.ok(!bodyText.includes("งานเฉพาะทาง"));

  const barFillMatches = bodyText.match(/#c9a227/g);
  assert.equal(
    barFillMatches?.length,
    4,
    "flex shows exactly 4 bar fills (top 4 dimensions)",
  );
  const barScoreMuted = bodyText.match(/#8f8265/g);
  assert.equal(
    barScoreMuted?.length,
    4,
    "bar scores use muted gold (skin only)",
  );

  // Summary block: label + value (not single-line "ตอนนี้เด่นสุด: …")
  assert.ok(bodyText.includes('"text":"ตอนนี้เด่นสุด"'));

  // Two bullet lines (compact prefix on first)
  assert.ok(bodyText.includes("เด่นเมตตา "));
  const bulletMarks = bodyText.split("› ").length - 1;
  assert.equal(bulletMarks, 2, "two bullet rows");

  /** Bars block: each category is label row then [meter | score], not 3-column single row. */
  const lifeBlock = flex.contents.body.contents.find(
    (c) =>
      c.type === "box" &&
      Array.isArray(c.contents) &&
      c.contents[0]?.type === "text" &&
      c.contents[0]?.text === "พลังไปออกกับมิติไหน",
  );
  assert.ok(lifeBlock, "bars section present");
  const categoryRows = lifeBlock.contents[2].contents;
  assert.equal(categoryRows.length, 4);
  const first = categoryRows[0];
  assert.equal(first.layout, "vertical");
  assert.equal(first.contents.length, 2);
  assert.equal(first.contents[0].type, "text");
  assert.equal(first.contents[1].layout, "horizontal");
  assert.equal(
    first.contents[1].contents.length,
    2,
    "meter row: track + score only (label on line above)",
  );
  assert.ok(
    bodyText.includes(
      "โชคลาภและการเปิดทาง (ข้อความยาวเพื่อทดสอบว่า label ไม่ชน bar ในแถวเดียว)",
    ),
    "long Thai label still rendered",
  );
});

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
    scoringMode: "deterministic_v2",
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
      fitLine: "เด่นสุด: คุ้มครองป้องกัน → เมตตาและคนเอ็นดู",
      bullets: [
        "เด่นเมตตาและคนเอ็นดู ช่วยให้จังหวะชีวิตเริ่มขยับขึ้น",
        "ข้อสองสั้น ๆ",
      ],
      ctaLabel: "ดูว่าชิ้นนี้ช่วยคุณยังไง",
      mainEnergyShort: "คุ้มครอง",
      tagline: "พระเครื่อง · หกมิติพลัง",
    },
  },
};

/**
 * @param {object|null|undefined} node
 * @returns {object|null}
 */
function findBarLifeBlockDeep(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "box" && Array.isArray(node.contents)) {
    const t0 = node.contents[0];
    if (t0?.type === "text" && t0.text === "พลังเด่น") {
      return node;
    }
    const wrap = node.contents[0];
    if (
      wrap?.type === "box" &&
      wrap.contents?.[0]?.type === "text" &&
      wrap.contents[0].text === "พลังเด่น"
    ) {
      return node;
    }
    for (const c of node.contents) {
      const found = findBarLifeBlockDeep(c);
      if (found) return found;
    }
  }
  return null;
}

test("buildAmuletSummaryFirstFlex: compact flex + top-4 bars + summary block", async () => {
  const flex = await buildAmuletSummaryFirstFlex("ignored", {
    reportPayload: basePayload,
    reportUrl: "https://report.example/x",
    appendReportBubble: false,
  });
  assert.equal(flex.type, "flex");
  assert.equal(flex.contents.hero?.type, "image", "bubble.hero image when URL");
  const bodyText = JSON.stringify(flex.contents);
  assert.ok(bodyText.includes("พระเครื่อง"));
  assert.ok(bodyText.includes("พระเครื่อง · เด่น"), "lane-specific tagline from top power row");
  assert.ok(
    bodyText.includes("พระเครื่อง · เด่นคุ้มครอง"),
    "tagline uses Flex-only short alias for top dimension",
  );
  assert.ok(bodyText.includes("เด่นสุด"));
  assert.ok(
    bodyText.includes("เด่นคุ้มครอง รองเมตตา"),
    "summary uses Flex-only aliases (not full labelThai phrases)",
  );
  assert.ok(
    bodyText.includes("เด่น") && bodyText.includes("รอง"),
    "summary value sharpened (เด่น/รอง), not raw arrow prose",
  );
  assert.ok(
    !bodyText.includes("→"),
    "summary display drops raw arrow (Flex-only เด่น/รอง takeaway)",
  );
  assert.ok(
    !bodyText.includes("› "),
    "no bullet prose — Flex is teaser only",
  );
  assert.ok(
    !bodyText.includes("ช่วยให้จังหวะชีวิต"),
    "flexSurface.bullets not rendered in Flex",
  );
  assert.ok(bodyText.includes("ดูว่าชิ้นนี้ช่วยคุณยังไง"));
  assert.ok(bodyText.includes("พลังเด่น"));
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
  const barScoreMuted = bodyText.match(/#5f5a4f/g);
  assert.equal(
    barScoreMuted?.length,
    4,
    "bar scores stay visually subordinate to labels (skin only)",
  );

  // Summary block: label + value (not single-line raw fitLine)
  assert.ok(bodyText.includes('"text":"เด่นสุด"'));

  /** Bars block: each category is label row then [meter | score], not 3-column single row. */
  const lifeBlock = findBarLifeBlockDeep(flex.contents.body);
  assert.ok(lifeBlock, "bars section present");
  const categoryRows = lifeBlock.contents[1].contents;
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
    "long Thai label still rendered on bars (Flex aliases do not apply to bar labels)",
  );
  assert.ok(
    bodyText.includes("คุ้มครองป้องกัน"),
    "bars still show full labelThai for category rows",
  );
});

test("buildAmuletSummaryFirstFlex: long fitLine value truncates in Flex teaser only", async () => {
  const longValue = `${"ก".repeat(85)} → ${"ข".repeat(85)}`;
  const flex = await buildAmuletSummaryFirstFlex("ignored", {
    reportPayload: {
      ...basePayload,
      amuletV1: {
        ...basePayload.amuletV1,
        flexSurface: {
          ...basePayload.amuletV1.flexSurface,
          fitLine: `เด่นสุด: ${longValue}`,
        },
      },
    },
    reportUrl: "https://report.example/x",
    appendReportBubble: false,
  });
  const bodyText = JSON.stringify(flex.contents);
  assert.ok(bodyText.includes("…"), "long summary value gets ellipsis in Flex");
  assert.ok(!bodyText.includes(longValue), "full long value not in Flex JSON");
});

test("buildAmuletSummaryFirstFlex: empty ctaLabel uses default full-report wording", async () => {
  const flex = await buildAmuletSummaryFirstFlex("ignored", {
    reportPayload: {
      ...basePayload,
      amuletV1: {
        ...basePayload.amuletV1,
        flexSurface: {
          ...basePayload.amuletV1.flexSurface,
          ctaLabel: "   ",
        },
      },
    },
    reportUrl: "https://report.example/x",
    appendReportBubble: false,
  });
  const bodyText = JSON.stringify(flex.contents);
  assert.ok(bodyText.includes("เปิดรายงานฉบับเต็ม"));
});

test("buildAmuletSummaryFirstFlex: no image — headline in body, no bubble.hero", async () => {
  const flex = await buildAmuletSummaryFirstFlex("ignored", {
    reportPayload: { ...basePayload, object: { objectImageUrl: "" } },
    reportUrl: "https://report.example/x",
    appendReportBubble: false,
  });
  assert.equal(flex.contents.hero, undefined);
  const bodyText = JSON.stringify(flex.contents);
  assert.ok(bodyText.includes("พระเครื่อง"));
  assert.ok(findBarLifeBlockDeep(flex.contents.body), "bars still present");
});

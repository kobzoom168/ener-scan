import test from "node:test";
import assert from "node:assert/strict";
import { buildAmuletV1Slice } from "../../src/amulet/amuletPayload.build.js";
import { buildReportPayloadFromScan } from "../../src/services/reports/reportPayload.builder.js";
import { deriveSacredAmuletEnergyScore10FromPowerCategories } from "../../src/amulet/amuletScores.util.js";

test("buildAmuletV1Slice: six power categories + flex surface + deterministic v2", () => {
  const slice = buildAmuletV1Slice({
    scanResultId: "scan-amulet-1",
    seedKey: "seed-amulet-1",
    energyScore: 7,
    mainEnergyLabel: "คุ้มครอง · เปิดทาง",
  });
  assert.equal(slice.version, "1");
  assert.equal(slice.scoringMode, "deterministic_v2");
  assert.equal(slice.detection.reason, "sacred_amulet_lane_v1");
  assert.equal(Object.keys(slice.powerCategories).length, 6);
  assert.ok(slice.primaryPower);
  assert.ok(slice.secondaryPower);
  assert.equal(slice.flexSurface.bullets.length, 2);
  assert.ok(String(slice.flexSurface.fitLine || "").includes("เด่นสุด"));
  assert.ok(String(slice.flexSurface.fitLine || "").includes("รอง"));
  assert.ok(!String(slice.flexSurface.tagline || "").includes("โทนทอง"));
  assert.ok(String(slice.flexSurface.tagline || "").includes("หกมิติ"));
  assert.ok(String(slice.flexSurface.ctaLabel || "").length > 0);
  assert.ok(slice.htmlReport.usageCautionLines.length >= 1);
  const flexJson = JSON.stringify(slice.flexSurface);
  assert.ok(!flexJson.includes("\u2014"), "flex surface copy has no em dash");
  assert.ok(
    slice.flexSurface.bullets.some((b) => String(b).includes("·")),
    "compact bullets use middle dot, not long dash phrasing",
  );
});

test("report summary energyScore matches six-axis graph for sacred_amulet", async () => {
  const text = `
ระดับพลัง: 7
พลังหลัก: พลังปกป้อง
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
  const payload = await buildReportPayloadFromScan({
    resultText: text,
    scanResultId: "00000000-0000-4000-8000-0000000000aa",
    scanRequestId: "req-amulet-summary",
    lineUserId: "U1",
    publicToken: "tok",
    objectFamily: "thai_amulet",
  });
  assert.ok(payload.amuletV1);
  const fromGraph = deriveSacredAmuletEnergyScore10FromPowerCategories(
    payload.amuletV1.powerCategories,
  );
  assert.equal(payload.summary.energyScore, fromGraph);
});

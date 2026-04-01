import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReportHtmlPage } from "../src/services/reports/reportHtmlRenderer.service.js";
import { renderMobileReportHtml } from "../src/templates/reports/mobileReport.template.js";

const minimalPayload = {
  reportId: "r1",
  publicToken: "tok",
  scanId: "s",
  userId: "u",
  birthdateUsed: null,
  generatedAt: new Date().toISOString(),
  reportVersion: "1.2.0",
  object: { objectLabel: "x", objectType: "" },
  summary: {
    energyScore: 8,
    mainEnergyLabel: "สมดุล",
    compatibilityPercent: 70,
    summaryLine: "สรุปทดสอบ",
  },
  sections: {},
  trust: { trustNote: "n", rendererVersion: "html-1.0.0" },
  actions: {},
};

const oeSlice = {
  formulaVersion: "object_energy_v1",
  profile: {
    balance: 62,
    protection: 55,
    authority: 50,
    compassion: 58,
    attraction: 48,
  },
  stars: {
    balance: 3,
    protection: 3,
    authority: 3,
    compassion: 3,
    attraction: 2,
  },
  mainEnergyResolved: { key: "balance", labelThai: "สมดุล" },
  confidence: 0.72,
  inputs: {},
  explain: ["บรรทัดอธิบายหนึ่ง", "บรรทัดสอง"],
};

test("renderMobileReportHtml: shows object energy section from payload.objectEnergy only", () => {
  const html = renderMobileReportHtml({
    ...minimalPayload,
    objectEnergy: oeSlice,
  });
  assert.match(html, /พลังของวัตถุชิ้นนี้/);
  assert.match(html, /สมดุล/);
  assert.match(html, /★/);
  assert.match(html, /62/);
  assert.match(html, /ความมั่นใจของการประเมิน/);
});

test("renderMobileReportHtml: graceful when objectEnergy missing", () => {
  const html = renderMobileReportHtml(minimalPayload);
  assert.doesNotMatch(html, /พลังของวัตถุชิ้นนี้/);
  assert.match(html, /สรุปทดสอบ/);
});

test("renderReportHtmlPage: normalizes and renders object energy block", () => {
  const html = renderReportHtmlPage({
    ...minimalPayload,
    objectEnergy: {
      formulaVersion: "object_energy_v1",
      profile: {
        balance: 50,
        protection: 50,
        authority: 50,
        compassion: 50,
        attraction: 50,
      },
      stars: {
        balance: 3,
        protection: 3,
        authority: 3,
        compassion: 3,
        attraction: 3,
      },
      mainEnergyResolved: { key: "balance", labelThai: "สมดุล" },
      confidence: 0.5,
      inputs: {},
      explain: ["ทดสอบ"],
    },
  });
  assert.match(html, /พลังของวัตถุชิ้นนี้/);
});

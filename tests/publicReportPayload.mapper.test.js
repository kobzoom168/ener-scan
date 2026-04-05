import { test } from "node:test";
import assert from "node:assert/strict";
import { mapLegacyReportPayloadToPublicReportView } from "../src/services/reports/publicReportPayload.mapper.js";

test("mapLegacyReportPayloadToPublicReportView passes objectEnergy through", () => {
  const v = mapLegacyReportPayloadToPublicReportView({
    scanResultId: "sr",
    payload: {
      reportId: "r",
      publicToken: "t",
      scanId: "s",
      userId: "u",
      generatedAt: new Date().toISOString(),
      reportVersion: "1.2.0",
      summary: { summaryLine: "x" },
      sections: {},
      trust: {},
      actions: {},
      object: {},
      objectEnergy: {
        formulaVersion: "object_energy_v1",
        profile: { balance: 50, protection: 50, authority: 50, compassion: 50, attraction: 50 },
        stars: { balance: 3, protection: 3, authority: 3, compassion: 3, attraction: 3 },
        confidence: 0.5,
      },
    },
  });
  assert.equal(v.objectEnergy?.formulaVersion, "object_energy_v1");
  assert.equal(v.objectEnergy?.stars?.balance, 3);
});

test("mapLegacyReportPayloadToPublicReportView passes moldaviteV1 through", () => {
  const mv = {
    version: "1",
    scoringMode: "deterministic_v1",
    detection: { reason: "keyword_match", matchedSignals: [] },
    primaryLifeArea: "work",
    secondaryLifeArea: "money",
    flexSurface: { headline: "h", fitLine: "f", bullets: ["a", "b"], mainEnergyShort: "มอลดาไวต์" },
  };
  const v = mapLegacyReportPayloadToPublicReportView({
    scanResultId: "sr",
    payload: {
      reportId: "r",
      publicToken: "t",
      scanId: "s",
      userId: "u",
      generatedAt: new Date().toISOString(),
      reportVersion: "1.2.10",
      summary: { summaryLine: "x" },
      sections: {},
      trust: {},
      actions: {},
      object: {},
      moldaviteV1: mv,
    },
  });
  assert.equal(v.moldaviteV1?.version, "1");
  assert.equal(v.moldaviteV1?.scoringMode, "deterministic_v1");
});

test("mapLegacyReportPayloadToPublicReportView: missing objectEnergy is undefined", () => {
  const v = mapLegacyReportPayloadToPublicReportView({
    scanResultId: "sr",
    payload: {
      reportId: "r",
      publicToken: "t",
      scanId: "s",
      userId: "u",
      generatedAt: new Date().toISOString(),
      reportVersion: "1.0.0",
      summary: { summaryLine: "x" },
      sections: {},
      trust: {},
      actions: {},
      object: {},
    },
  });
  assert.equal(v.objectEnergy, undefined);
});

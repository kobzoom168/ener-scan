import { test } from "node:test";
import assert from "node:assert/strict";
import { extractStableVisualFeatures } from "../src/services/stableFeatureExtract.service.js";

const tinyB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

test("extractStableVisualFeatures: disabled → null seed", async () => {
  process.env.STABLE_FEATURE_SEED_ENABLED = "false";
  const out = await extractStableVisualFeatures({
    imageBase64: tinyB64,
    mimeType: "image/jpeg",
    objectFamily: "crystal",
    scanResultIdPrefix: "abcdef12",
  });
  assert.equal(out.seed, null);
  assert.equal(out.features, null);
  process.env.STABLE_FEATURE_SEED_ENABLED = undefined;
});

test("extractStableVisualFeatures: mock ok → features + seed", async () => {
  process.env.STABLE_FEATURE_SEED_ENABLED = "true";
  const json = JSON.stringify({
    primaryColor: "green",
    materialType: "quartz",
    formFactor: "bracelet",
    textureHint: "polished",
  });
  const out = await extractStableVisualFeatures(
    {
      imageBase64: tinyB64,
      mimeType: "image/jpeg",
      objectFamily: "crystal",
      scanResultIdPrefix: "seed1234",
    },
    {
      createResponses: async () => ({
        output_text: json,
      }),
    },
  );
  assert.ok(out.features);
  assert.equal(out.features?.primaryColor, "green");
  assert.ok(out.seed && out.seed.length > 0);
  process.env.STABLE_FEATURE_SEED_ENABLED = undefined;
});

test("extractStableVisualFeatures: parse fail → null seed", async () => {
  process.env.STABLE_FEATURE_SEED_ENABLED = "true";
  const out = await extractStableVisualFeatures(
    {
      imageBase64: tinyB64,
      objectFamily: "crystal",
      scanResultIdPrefix: "fail1234",
    },
    {
      createResponses: async () => ({
        output_text: "not-json-at-all",
      }),
    },
  );
  assert.equal(out.seed, null);
  assert.equal(out.features, null);
  process.env.STABLE_FEATURE_SEED_ENABLED = undefined;
});

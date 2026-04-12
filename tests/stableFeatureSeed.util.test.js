import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStableFeatureSeed } from "../src/utils/stableFeatureSeed.util.js";

test("buildStableFeatureSeed: same features → same seed", () => {
  const f = {
    primaryColor: "green",
    materialType: "quartz",
    formFactor: "bracelet",
    textureHint: "polished",
  };
  const a = buildStableFeatureSeed(f);
  const b = buildStableFeatureSeed({ ...f });
  assert.equal(a, b);
  assert.ok(a && a.length > 0);
});

test("buildStableFeatureSeed: normalizes case and whitespace", () => {
  const a = buildStableFeatureSeed({
    primaryColor: "  Green ",
    materialType: "Quartz",
    formFactor: "brace let",
    textureHint: "polished",
  });
  const b = buildStableFeatureSeed({
    primaryColor: "green",
    materialType: "quartz",
    formFactor: "brace_let",
    textureHint: "polished",
  });
  assert.equal(a, b);
});

test("buildStableFeatureSeed: different features → different seed", () => {
  const a = buildStableFeatureSeed({
    primaryColor: "green",
    materialType: "quartz",
    formFactor: "bracelet",
    textureHint: "polished",
  });
  const b = buildStableFeatureSeed({
    primaryColor: "blue",
    materialType: "quartz",
    formFactor: "bracelet",
    textureHint: "polished",
  });
  assert.notEqual(a, b);
});

test("buildStableFeatureSeed: null or all-unknown → null", () => {
  assert.equal(buildStableFeatureSeed(null), null);
  assert.equal(
    buildStableFeatureSeed({
      primaryColor: "unknown",
      materialType: "unknown",
      formFactor: "unknown",
      textureHint: "unknown",
    }),
    null,
  );
});

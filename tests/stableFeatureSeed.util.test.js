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

// เคสคุณชิต (15 ก.ค.): พระคนละองค์ เนื้อ/สี/ทรง/ผิวเหมือนกันหมด ต้องแยก seed ด้วยช่องอัตลักษณ์พิมพ์
test("buildStableFeatureSeed: same coarse fields but different identity fields → different seed", () => {
  const coarse = {
    primaryColor: "brown",
    materialType: "thai_amulet",
    formFactor: "amulet_figure",
    textureHint: "carved",
  };
  const somdej = buildStableFeatureSeed({
    ...coarse,
    shapeOutline: "rectangular",
    mainMotif: "seated_figure",
    figureCount: "one",
    casing: "bare",
  });
  const naPhaya = buildStableFeatureSeed({
    ...coarse,
    shapeOutline: "triangular",
    mainMotif: "seated_figure",
    figureCount: "one",
    casing: "framed_metal",
  });
  const multiFigure = buildStableFeatureSeed({
    ...coarse,
    shapeOutline: "rectangular",
    mainMotif: "multi_figure",
    figureCount: "three_plus",
    casing: "framed_metal",
  });
  assert.notEqual(somdej, naPhaya);
  assert.notEqual(somdej, multiFigure);
  assert.notEqual(naPhaya, multiFigure);
});

test("buildStableFeatureSeed: identity fields all unknown → same seed as legacy 4-field formula", () => {
  const legacy = buildStableFeatureSeed({
    primaryColor: "brown",
    materialType: "thai_amulet",
    formFactor: "amulet_figure",
    textureHint: "carved",
  });
  const withUnknownIdentity = buildStableFeatureSeed({
    primaryColor: "brown",
    materialType: "thai_amulet",
    formFactor: "amulet_figure",
    textureHint: "carved",
    shapeOutline: "unknown",
    mainMotif: "unknown",
    figureCount: "unknown",
    casing: "unknown",
  });
  assert.equal(legacy, withUnknownIdentity);
});

// กันกลุ่มกำไลหิน (15 ก.ค.): กำไลสี/วัสดุ/ผิวเดียวกันคนละเส้น ต้องแยก seed ด้วยลายลูกปัด/ชิ้นเด่น
test("buildStableFeatureSeed: same coarse bracelet fields but different bead identity → different seed", () => {
  const coarse = {
    primaryColor: "green",
    materialType: "jade",
    formFactor: "bracelet",
    textureHint: "polished",
    shapeOutline: "round",
    mainMotif: "pattern_only",
    figureCount: "none",
    casing: "bare",
  };
  const uniform = buildStableFeatureSeed({ ...coarse, beadPattern: "uniform", accentPiece: "none" });
  const charm = buildStableFeatureSeed({ ...coarse, beadPattern: "uniform", accentPiece: "charm" });
  const multi = buildStableFeatureSeed({ ...coarse, beadPattern: "multi_color", accentPiece: "buddha_bead" });
  assert.notEqual(uniform, charm);
  assert.notEqual(uniform, multi);
  assert.notEqual(charm, multi);
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

import test from "node:test";
import assert from "node:assert/strict";
import { selectEnergyCopyFromTemplates } from "../src/utils/energyCopySelect.util.js";

test("selectEnergyCopyFromTemplates prefers specific object_family over all", () => {
  const rows = [
    {
      id: 1,
      object_family: "all",
      copy_type: "headline",
      text_th: "generic",
      weight: 10,
    },
    {
      id: 2,
      object_family: "crystal",
      copy_type: "headline",
      text_th: "crystal headline",
      weight: 10,
    },
  ];
  const out = selectEnergyCopyFromTemplates(rows, "crystal");
  assert.equal(out.headline, "crystal headline");
});

test("selectEnergyCopyFromTemplates picks lower weight first", () => {
  const rows = [
    {
      id: 3,
      object_family: "crystal",
      copy_type: "bullet",
      text_th: "second",
      weight: 20,
    },
    {
      id: 2,
      object_family: "crystal",
      copy_type: "bullet",
      text_th: "first",
      weight: 10,
    },
  ];
  const out = selectEnergyCopyFromTemplates(rows, "crystal");
  assert.deepEqual(out.bullets, ["first", "second"]);
});

test("selectEnergyCopyFromTemplates returns headline fit_line and two bullets", () => {
  const rows = [
    {
      id: 1,
      object_family: "crystal",
      copy_type: "headline",
      text_th: "H",
      weight: 10,
    },
    {
      id: 2,
      object_family: "crystal",
      copy_type: "fit_line",
      text_th: "F",
      weight: 10,
    },
    {
      id: 3,
      object_family: "crystal",
      copy_type: "bullet",
      text_th: "B1",
      weight: 10,
    },
    {
      id: 4,
      object_family: "crystal",
      copy_type: "bullet",
      text_th: "B2",
      weight: 20,
    },
  ];
  const out = selectEnergyCopyFromTemplates(rows, "crystal");
  assert.equal(out.headline, "H");
  assert.equal(out.fitLine, "F");
  assert.deepEqual(out.bullets, ["B1", "B2"]);
});

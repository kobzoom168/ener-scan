import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildObjectUnderstanding,
  deriveUsageProfile,
  filterTipsForUsageProfile,
  OBJECT_TAXONOMY_VERSION,
} from "../src/services/objectTaxonomy/objectTaxonomy.js";

test("เคสธูปหวย: incense_stick + ลายท้าวเวสฯ → อ่านได้ครบ + ห้ามพก", () => {
  const u = buildObjectUnderstanding({
    objectForm: "incense_stick",
    formConfidence: 0.92,
    motifFamily: "vessavana_giant",
    motifConfidence: 0.95,
    sensitiveFlags: [],
  });
  assert.ok(u);
  assert.equal(u.taxonomyVersion, OBJECT_TAXONOMY_VERSION);
  assert.equal(u.formDisplayTh, "ธูปบูชา");
  assert.equal(u.motifDisplayTh, "ลวดลายแนวท้าวเวสสุวรรณ/ยักษ์");
  assert.equal(u.readingLineTh, "ธูปบูชา · ลวดลายแนวท้าวเวสสุวรรณ/ยักษ์");
  assert.equal(u.usageProfile.mode, "ritual_consumable");
  assert.equal(u.usageProfile.canCarry, false);
  assert.ok(u.usageProfile.usageNoteTh.includes("ไม่ใช่ของพกติดตัว"));
});

test("ความมั่นใจกลาง ๆ → ภาษา 'ใกล้เคียง/คล้าย' — ต่ำ → ไม่ขึ้นบรรทัด", () => {
  const near = buildObjectUnderstanding({
    objectForm: "amulet_tablet",
    formConfidence: 0.7,
    motifFamily: "monk_guru",
    motifConfidence: 0.8,
  });
  assert.equal(near.formDisplayTh, "ลักษณะใกล้เคียงพระพิมพ์/พระเนื้อผง");
  assert.equal(near.motifDisplayTh, "ลวดลายคล้ายแนวพระเกจิ/พระสงฆ์");

  const low = buildObjectUnderstanding({
    objectForm: "amulet_tablet",
    formConfidence: 0.4,
    motifFamily: "monk_guru",
    motifConfidence: 0.5,
  });
  assert.equal(low.formDisplayTh, "");
  assert.equal(low.motifDisplayTh, "");
  assert.equal(low.readingLineTh, "");
  // form ไม่ผ่านเกณฑ์ → usage เป็นกลาง ไม่กล้าห้ามอะไร
  assert.equal(low.usageProfile.mode, "unknown");
});

test("slug นอกลิสต์/ค่าพัง → unknown เสมอ (model ห้ามตั้งชื่อเอง)", () => {
  const u = buildObjectUnderstanding({
    objectForm: "LuangPuThuat_wat_changhai",
    formConfidence: 0.99,
    motifFamily: "somdej<script>",
    motifConfidence: 2.5,
    sensitiveFlags: ["ivory_elephant", "possible_animal_part"],
  });
  assert.ok(u); // มี flag ที่ valid เหลืออยู่
  assert.equal(u.objectForm, "unknown");
  assert.equal(u.motifFamily, "unknown");
  assert.equal(u.readingLineTh, "");
  assert.deepEqual(u.sensitiveFlags, ["possible_animal_part"]);

  assert.equal(buildObjectUnderstanding(null), null);
  assert.equal(buildObjectUnderstanding({}), null);
  assert.equal(
    buildObjectUnderstanding({ objectForm: "unknown", motifFamily: "none" }),
    null,
  );
});

test("usage profile ตาม form: ตะกรุดพกได้ กำไลสวม รูปตั้งห้ามพก", () => {
  assert.equal(deriveUsageProfile("takrut").canCarry, true);
  assert.equal(deriveUsageProfile("bracelet_beads").canWear, true);
  const st = deriveUsageProfile("statue");
  assert.equal(st.canCarry, false);
  assert.equal(st.mode, "place_or_altar");
  assert.equal(deriveUsageProfile("whatever").mode, "unknown");
});

test("กรอง tips พก/สวม เมื่อพกไม่ได้ — แต่ไม่ทำรายการว่าง", () => {
  const usage = deriveUsageProfile("incense_stick");
  assert.deepEqual(
    filterTipsForUsageProfile(["พกติดตัวไว้เสริมโชค", "จุดบูชาก่อนงานสำคัญ"], usage),
    ["จุดบูชาก่อนงานสำคัญ"],
  );
  // ทุกบรรทัดโดนกรอง → คืนของเดิม (รายงานห้ามโหว่)
  assert.deepEqual(
    filterTipsForUsageProfile(["พกติดตัวไว้", "ห้อยคอทุกวัน"], usage),
    ["พกติดตัวไว้", "ห้อยคอทุกวัน"],
  );
  // ของพกได้ → ไม่กรองอะไร
  assert.deepEqual(
    filterTipsForUsageProfile(["พกติดตัวไว้เสริมโชค"], deriveUsageProfile("takrut")),
    ["พกติดตัวไว้เสริมโชค"],
  );
});

test("เกตธูป/เทียน: มั่นใจสูง→reject ก้ำกึ่ง→ask_angle ต่ำ/ไม่ใช่→pass", async () => {
  const { evaluateRitualScanGate } = await import(
    "../src/services/objectTaxonomy/objectTaxonomy.js"
  );
  assert.equal(
    evaluateRitualScanGate({ objectForm: "incense_stick", formConfidence: 0.92 }).action,
    "reject",
  );
  assert.equal(
    evaluateRitualScanGate({ objectForm: "candle", formConfidence: 0.7 }).action,
    "ask_angle",
  );
  assert.equal(
    evaluateRitualScanGate({ objectForm: "incense_stick", formConfidence: 0.3 }).action,
    "pass",
  );
  // พระ/เครื่องราง ผ่านเสมอ แม้มั่นใจสูง
  assert.equal(
    evaluateRitualScanGate({ objectForm: "amulet_tablet", formConfidence: 0.99 }).action,
    "pass",
  );
  assert.equal(evaluateRitualScanGate(null).action, "pass");
  assert.equal(evaluateRitualScanGate({}).action, "pass");
});

test("merge สองแหล่ง: Gemini เห็นธูป conf สูงชนะ gpt ที่อ่านเป็นพระพิมพ์", async () => {
  const { mergeUnderstandingSources, evaluateRitualScanGate } = await import(
    "../src/services/objectTaxonomy/objectTaxonomy.js"
  );
  // เคสจริง 18 ก.ค.: gpt=amulet_tablet 0.8 / gemini=incense_stick 0.9 → ธูปชนะ → เกต reject
  const merged = mergeUnderstandingSources(
    { objectForm: "amulet_tablet", formConfidence: 0.8, motifFamily: "other_deity", motifConfidence: 0.7 },
    { mode: "ok", objectForm: "incense_stick", formConfidence: 0.9, motifFamily: "vessavana_giant", motifConfidence: 0.85 },
  );
  assert.equal(merged.objectForm, "incense_stick");
  assert.equal(merged.motifFamily, "vessavana_giant");
  assert.equal(evaluateRitualScanGate(merged).action, "reject");

  // gpt มั่นใจพระ + gemini ก็ว่าพระ → ยึด gpt เดิม
  const keep = mergeUnderstandingSources(
    { objectForm: "amulet_tablet", formConfidence: 0.9, motifFamily: "monk_guru", motifConfidence: 0.8 },
    { mode: "ok", objectForm: "amulet_coin", formConfidence: 0.75, motifFamily: "monk_guru", motifConfidence: 0.6 },
  );
  assert.equal(keep.objectForm, "amulet_tablet");

  // gpt อ่านไม่ออก + gemini รู้ → เชื่อ gemini
  const fill = mergeUnderstandingSources(
    { objectForm: "unknown", formConfidence: 0, motifFamily: "unknown", motifConfidence: 0 },
    { mode: "ok", objectForm: "takrut", formConfidence: 0.8, motifFamily: "yantra_script", motifConfidence: 0.8 },
  );
  assert.equal(fill.objectForm, "takrut");

  // gemini error/disabled → ผล extractor เดิมเป๊ะ
  const e = { objectForm: "amulet_tablet", formConfidence: 0.8 };
  assert.equal(mergeUnderstandingSources(e, { mode: "error" }), e);
  assert.equal(mergeUnderstandingSources(e, null), e);
  assert.equal(mergeUnderstandingSources(null, null), null);
});

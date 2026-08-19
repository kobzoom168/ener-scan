/**
 * Self-tests ของ release gate (Codex รอบ 6): gate เองต้องถูกเทสต์ —
 * บทเรียน: parser พึ่งโครงสร้าง TAP ของ node แล้วให้ผลต่างกันคนละเครื่อง
 * จน false-green มาแล้ว (เครื่องหนึ่งเห็น 1143 leaf อีกเครื่องเห็น 167 ไฟล์)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseTapLeaves, evaluateGate } from "../scripts/lib/releaseGateParse.mjs";

const FLAT = `TAP version 13
# Subtest: alpha case
ok 1 - alpha case
# Subtest: beta case
not ok 2 - beta case
  ---
  error: 'boom'
  ...
1..2`;

const NESTED = `TAP version 13
# Subtest: tests/foo.test.js
    # Subtest: nested leaf ok
    ok 1 - nested leaf ok
    # Subtest: nested leaf bad
    not ok 2 - nested leaf bad
    1..2
not ok 1 - tests/foo.test.js
  ---
  error: 'subtest failed'
  ...`;

test("parseTapLeaves: อ่าน leaf ได้ทั้งแบบ flat และ nested · ไม่นับบรรทัดชื่อไฟล์", () => {
  assert.deepEqual(parseTapLeaves(FLAT), ["beta case"]);
  assert.deepEqual(parseTapLeaves(NESTED), ["nested leaf bad"], "ชื่อไฟล์ต้องไม่ถูกนับเป็น leaf");
  assert.deepEqual(parseTapLeaves(""), []);
});

test("parseTapLeaves: SKIP/TODO ต่อท้ายถูกตัดออกจากชื่อ", () => {
  const out = parseTapLeaves("not ok 1 - some case # SKIP not ready");
  assert.deepEqual(out, ["some case"]);
});

test("gate: known leaf → ผ่าน · new leaf → regression พร้อม identity file::leaf", () => {
  const known = ["tests/a.test.js::beta case"];
  const okRun = evaluateGate({
    files: [{ file: "tests/a.test.js", exitCode: 1, output: FLAT }],
    known,
  });
  assert.equal(okRun.ok, true);
  assert.deepEqual(okRun.newFails, []);
  assert.equal(okRun.totalLeafFails, 1);

  const badRun = evaluateGate({
    files: [{ file: "tests/a.test.js", exitCode: 1, output: FLAT }],
    known: [],
  });
  assert.equal(badRun.ok, false);
  assert.deepEqual(badRun.newFails, ["tests/a.test.js::beta case"]);
});

test("gate: import crash (exit != 0 แต่ไม่มี leaf) = regression เสมอ", () => {
  const crash = evaluateGate({
    files: [{ file: "tests/boom.test.js", exitCode: 1, output: "SyntaxError: bad import\n" }],
    known: ["tests/a.test.js::beta case"],
  });
  assert.equal(crash.ok, false);
  assert.deepEqual(crash.unexplained, ["tests/boom.test.js"]);
});

test("gate: process nonzero โดยไม่มี failure ที่ parse ได้ ห้ามผ่าน (กัน false green)", () => {
  const r = evaluateGate({
    files: [{ file: "tests/x.test.js", exitCode: 7, output: "TAP version 13\n1..0\n" }],
    known: [],
  });
  assert.equal(r.ok, false, "exit code ผิดปกติต้องไม่ปล่อยผ่าน");
  assert.deepEqual(r.unexplained, ["tests/x.test.js"]);
});

test("gate: leaf ชื่อซ้ำคนละไฟล์ — known ต้องระบุรายไฟล์ (ไฟล์ใหม่ห้ามถูกยอมโดยอัตโนมัติ)", () => {
  const dup = `TAP version 13
not ok 1 - shared name`;
  // known ครอบเฉพาะ one.test.js — two.test.js ที่ leaf ชื่อเดียวกันต้องเป็น regression
  const partial = evaluateGate({
    files: [
      { file: "tests/one.test.js", exitCode: 1, output: dup },
      { file: "tests/two.test.js", exitCode: 1, output: dup },
    ],
    known: ["tests/one.test.js::shared name"],
  });
  assert.equal(partial.ok, false, "leaf ชื่อซ้ำในไฟล์ที่ไม่อยู่ใน known = regression");
  assert.deepEqual(partial.newFails, ["tests/two.test.js::shared name"]);

  const known = ["tests/one.test.js::shared name", "tests/two.test.js::shared name"];
  const r = evaluateGate({
    files: [
      { file: "tests/one.test.js", exitCode: 1, output: dup },
      { file: "tests/two.test.js", exitCode: 1, output: dup },
    ],
    known,
  });
  assert.equal(r.ok, true);
  assert.equal(r.totalLeafFails, 2);
  const r2 = evaluateGate({
    files: [
      { file: "tests/one.test.js", exitCode: 1, output: dup },
      { file: "tests/two.test.js", exitCode: 1, output: dup },
    ],
    known: [],
  });
  assert.deepEqual(r2.newFails, ["tests/one.test.js::shared name", "tests/two.test.js::shared name"]);
});

test("gate: known ที่ไม่ปรากฏแล้ว = รายงานว่าเขียวแล้ว (เอาออกจากลิสต์ได้) แต่ไม่ทำให้ fail", () => {
  const r = evaluateGate({
    files: [{ file: "tests/a.test.js", exitCode: 0, output: "TAP version 13\nok 1 - fine\n" }],
    known: ["tests/old.test.js::old flaky case"],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.fixed, ["tests/old.test.js::old flaky case"]);
});

test("gate: ทุกไฟล์เขียว → ok และไม่มี failing files", () => {
  const r = evaluateGate({
    files: [{ file: "tests/a.test.js", exitCode: 0, output: "TAP version 13\nok 1 - fine\n" }],
    known: [],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.failedFiles, []);
  assert.equal(r.totalLeafFails, 0);
});

/* ---------------- integration self-tests (Codex รอบ 7): spawn ไฟล์จริง ---------------- */

import { runTestFile } from "../scripts/lib/runTestFile.mjs";
import path from "node:path";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures");

test("integration: fixture ที่ leaf fail → runner เห็น leaf จริง + exit != 0 (กันเคส node ห่อไฟล์)", async () => {
  const r = await runTestFile(path.join(FIXTURES, "gate-fail.fixture.mjs"));
  assert.notEqual(r.exitCode, 0, "ไฟล์ที่มี leaf fail ต้อง exit != 0");
  const leaves = parseTapLeaves(r.output);
  assert.deepEqual(leaves, ["fixture: failing leaf"], `parser ต้องเห็น leaf จริง ได้: ${JSON.stringify(leaves)}`);
  // ผ่าน evaluateGate: ไม่อยู่ใน known = regression
  const verdict = evaluateGate({ files: [{ ...r, file: "tests/fixtures/gate-fail.fixture.mjs" }], known: [] });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.newFails, ["tests/fixtures/gate-fail.fixture.mjs::fixture: failing leaf"]);
  assert.deepEqual(verdict.unexplained, [], "ไฟล์นี้มี leaf อธิบายแล้ว ห้ามนับเป็น unexplained");
});

test("integration: fixture ที่ผ่านหมด → exit 0 ไม่มี leaf fail", async () => {
  const r = await runTestFile(path.join(FIXTURES, "gate-pass.fixture.mjs"));
  assert.equal(r.exitCode, 0);
  assert.deepEqual(parseTapLeaves(r.output), []);
  const verdict = evaluateGate({ files: [{ ...r, file: "tests/fixtures/gate-pass.fixture.mjs" }], known: [] });
  assert.equal(verdict.ok, true);
});

test("integration: fixture ที่ crash ตอน import → unexplained (regression เสมอ ห้ามเงียบ)", async () => {
  const r = await runTestFile(path.join(FIXTURES, "gate-crash.fixture.mjs"));
  assert.notEqual(r.exitCode, 0);
  assert.deepEqual(parseTapLeaves(r.output), [], "crash ก่อนมี leaf");
  const verdict = evaluateGate({ files: [{ ...r, file: "tests/fixtures/gate-crash.fixture.mjs" }], known: [] });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.unexplained, ["tests/fixtures/gate-crash.fixture.mjs"]);
});

test("integration: known list เป็น file::leaf จริง — ตัวอย่างจาก tests/known-failing.txt", () => {
  const known = fs.readFileSync("tests/known-failing.txt", "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  assert.ok(known.length > 0);
  for (const k of known) {
    assert.match(k, /^tests\/[^\s]+\.(m?js|ts)::.+$/, `known entry ต้องเป็น file::leaf: ${k}`);
  }
});

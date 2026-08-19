/**
 * Self-tests ของ release gate (Codex รอบ 6): gate เองต้องถูกเทสต์ —
 * บทเรียน: parser พึ่งโครงสร้าง TAP ของ node แล้วให้ผลต่างกันคนละเครื่อง
 * จน false-green มาแล้ว (เครื่องหนึ่งเห็น 1143 leaf อีกเครื่องเห็น 167 ไฟล์)
 */
import test from "node:test";
import assert from "node:assert/strict";
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
  const known = ["beta case"];
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
    known: ["beta case"],
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

test("gate: leaf ชื่อซ้ำกันคนละไฟล์ — known ครอบทั้งคู่ได้ แต่ identity แยกไฟล์ชัดเจน", () => {
  const dup = `TAP version 13
not ok 1 - shared name`;
  const known = ["shared name"];
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
    known: ["old flaky case"],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.fixed, ["old flaky case"]);
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

/**
 * Release gate runner (Codex รอบ 6): รัน test "ทีละไฟล์" แล้วประกอบ identity เป็น
 * file::leaf เอง — ไม่พึ่งว่า node จะ flatten หรือ nest TAP (ต่างกันคนละเครื่อง
 * จนหลักฐาน release ไม่ตรงกันมาแล้ว)
 *
 * เกณฑ์: leaf ที่ fail ต้องอยู่ใน tests/known-failing.txt ครบทุกตัว ·
 * ไฟล์ที่ exit != 0 แต่ไม่มี leaf failure อธิบาย (import crash) = regression เสมอ
 */
import { readFileSync } from "node:fs";
import os from "node:os";
import { evaluateGate } from "./lib/releaseGateParse.mjs";
import { runTestFile } from "./lib/runTestFile.mjs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const testScript = String(pkg.scripts?.test || "");
// dedupe: manifest เคยมีไฟล์ซ้ำ (webEnrichmentPolicy) — รันซ้ำทำให้รายงานเพี้ยน
const files = [...new Set(testScript.split(/\s+/).filter((t) => /^tests\/.+\.(m?js|ts)$/.test(t)))];
if (!files.length) {
  console.error("❌ หา test file ใน package.json scripts.test ไม่เจอ");
  process.exit(1);
}

const known = readFileSync("tests/known-failing.txt", "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const CONCURRENCY = Math.max(2, (os.availableParallelism?.() || os.cpus().length || 4) - 2);

const results = [];
let cursor = 0;
async function worker() {
  for (;;) {
    const i = cursor++;
    if (i >= files.length) return;
    results.push(await runTestFile(files[i]));
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

const verdict = evaluateGate({ files: results, known });
const passedFiles = results.filter((r) => r.exitCode === 0).length;

console.log(`files: ${passedFiles}/${results.length} pass · leaf failures: ${verdict.totalLeafFails}`);
if (verdict.failedFiles.length) {
  console.log("--- failing files ---");
  for (const f of verdict.failedFiles) console.log(`  ${f}`);
}
if (verdict.totalLeafFails) {
  console.log("--- leaf failures (file::leaf) ---");
  const { parseTapLeaves } = await import("./lib/releaseGateParse.mjs");
  for (const r of results) {
    for (const leaf of parseTapLeaves(r.output)) {
      const identity = `${r.file}::${leaf}`;
      console.log(`  [${known.includes(identity) ? "known" : "NEW"}] ${identity}`);
    }
  }
}
if (verdict.fixed.length) {
  console.log("--- เขียวแล้ว เอาออกจาก known-failing.txt ได้ ---");
  for (const f of verdict.fixed) console.log(`  ${f}`);
}
if (verdict.unexplained.length) {
  console.log("❌ REGRESSION — ไฟล์ fail โดยไม่มี leaf failure อธิบาย (import crash / process ตาย):");
  for (const f of verdict.unexplained) console.log(`  ${f}`);
}
if (verdict.newFails.length) {
  console.log("❌ REGRESSION — leaf fail ใหม่นอก baseline:");
  for (const f of verdict.newFails) console.log(`  ${f}`);
}
if (!verdict.ok) process.exit(1);
console.log("✅ ไม่มี fail ใหม่นอก baseline (leaf ที่ fail ทั้งหมดอยู่ใน known list)");

/**
 * รัน test file หนึ่งไฟล์ (Codex รอบ 7-8)
 *
 * - execute ไฟล์ตรง ๆ ไม่ผ่าน `node --test` (บางเครื่อง node ห่อเป็น file-level
 *   subtest แล้วซ่อน leaf จน gate มองไม่เห็น)
 * - capture ผ่าน "ไฟล์ชั่วคราว" ไม่ใช่ pipe: การเขียน pipe เป็น async — เมื่อ
 *   process ที่มีเทสต์ fail ปิดตัว output อาจถูกตัดหาย (Codex เจอ {exitCode:1,
 *   output:""} บน Node 22.23.1) · fd ของไฟล์เขียนแบบ sync จึงได้ TAP ครบเสมอ
 * - ล้าง env ของ test runner ที่สืบทอดมา (NODE_TEST_CONTEXT / --test-reporter
 *   ใน NODE_OPTIONS) ไม่งั้น child เปลี่ยนรูปแบบ output
 */
import { spawn } from "node:child_process";
import { openSync, closeSync, readFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function sanitizedEnv(base) {
  const env = { ...base };
  delete env.NODE_TEST_CONTEXT;
  if (env.NODE_OPTIONS) {
    env.NODE_OPTIONS = env.NODE_OPTIONS.replace(/--test-reporter(=|\s+)\S+/g, "").trim();
    if (!env.NODE_OPTIONS) delete env.NODE_OPTIONS;
  }
  return env;
}

/**
 * @param {string} file
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<{ file: string, exitCode: number, output: string }>}
 */
export function runTestFile(file, opts = {}) {
  return new Promise((resolve) => {
    let dir = null;
    let outFd = null;
    let outPath = null;
    const finish = (exitCode, extra = "") => {
      let output = extra;
      try {
        if (outFd !== null) closeSync(outFd);
        outFd = null;
        if (outPath) output = readFileSync(outPath, "utf8") + extra;
      } catch { /* อ่านไม่ได้ = ปล่อยว่าง (จะถูกนับเป็น unexplained ถ้า exit != 0) */ }
      try {
        if (outPath) unlinkSync(outPath);
        if (dir) rmSync(dir, { recursive: true, force: true });
      } catch { /* ignore */ }
      resolve({ file, exitCode, output });
    };
    try {
      dir = mkdtempSync(path.join(tmpdir(), "gate-run-"));
      outPath = path.join(dir, "out.tap");
      outFd = openSync(outPath, "w");
    } catch (e) {
      resolve({ file, exitCode: 1, output: `capture_setup_error: ${e?.message}` });
      return;
    }
    const child = spawn(process.execPath, [file], {
      env: sanitizedEnv(opts.env || process.env),
      stdio: ["ignore", outFd, outFd],
    });
    child.on("close", (code) => finish(code ?? 1));
    child.on("error", (e) => finish(1, `\nspawn_error: ${e?.message}`));
  });
}

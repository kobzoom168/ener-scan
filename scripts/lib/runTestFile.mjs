/**
 * รัน test file หนึ่งไฟล์ (Codex รอบ 7): execute ไฟล์ตรง ๆ ไม่ผ่าน `node --test`
 * เพราะบางเครื่อง node จะห่อเป็น file-level subtest แล้วซ่อน leaf จน gate มองไม่เห็น
 * ใช้ร่วมกันทั้ง runner จริงและ integration self-test (ต้องเป็นเส้นเดียวกัน)
 */
import { spawn } from "node:child_process";

/**
 * @param {string} file
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<{ file: string, exitCode: number, output: string }>}
 */
export function runTestFile(file, opts = {}) {
  return new Promise((resolve) => {
    // ล้าง env ของ test runner ที่สืบทอดมา (Codex รอบ 7): NODE_TEST_CONTEXT /
    // --test-reporter ใน NODE_OPTIONS ทำให้ child เปลี่ยนรูปแบบ output จน parser
    // มองไม่เห็น leaf — gate ต้องได้ TAP มาตรฐานเสมอไม่ว่าใครเป็นคนเรียก
    const env = { ...(opts.env || process.env) };
    delete env.NODE_TEST_CONTEXT;
    if (env.NODE_OPTIONS) {
      env.NODE_OPTIONS = env.NODE_OPTIONS.replace(/--test-reporter(=|\s+)\S+/g, "").trim();
      if (!env.NODE_OPTIONS) delete env.NODE_OPTIONS;
    }
    const child = spawn(process.execPath, [file], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => resolve({ file, exitCode: code ?? 1, output: out }));
    child.on("error", (e) => resolve({ file, exitCode: 1, output: `spawn_error: ${e?.message}` }));
  });
}

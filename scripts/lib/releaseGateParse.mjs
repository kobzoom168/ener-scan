/**
 * Release-gate parsing/decision (Codex รอบ 6): แยกเป็นโมดูล pure เพื่อ "เทสต์ตัว
 * gate เองได้" — บทเรียน: parser ที่พึ่งโครงสร้าง TAP ของ node ให้ผลต่างกันคนละ
 * เครื่อง (บางที่ leaf แบน บางที่ซ้อนใต้ชื่อไฟล์) จนหลักฐาน release ไม่ตรงกัน
 * ทางแก้: รันทีละไฟล์ แล้วประกอบ identity เป็น file::leaf เอง ไม่พึ่ง nesting
 */

/** ชื่อที่เป็น path ของไฟล์เทสต์ ไม่ใช่ชื่อ leaf */
const FILE_NAME_RE = /^[^\s]*tests\/[^\s]+\.(m?js|ts)$/;

/**
 * ดึงชื่อ leaf test ที่ fail จาก TAP ของ "ไฟล์เดียว"
 * @param {string} text
 * @returns {string[]}
 */
export function parseTapLeaves(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    const m = /^\s*not ok \d+\s*-?\s*(.*)$/.exec(line);
    if (!m) continue;
    const name = m[1].replace(/\s*#\s*(SKIP|TODO).*$/i, "").trim();
    if (!name || FILE_NAME_RE.test(name)) continue;
    out.push(name);
  }
  return out;
}

/**
 * @param {{ files: Array<{ file: string, exitCode: number, output: string }>, known: string[] }} p
 * @returns {{ ok: boolean, newFails: string[], unexplained: string[], fixed: string[],
 *   totalLeafFails: number, failedFiles: string[] }}
 */
export function evaluateGate({ files, known }) {
  const knownSet = new Set((known || []).map((k) => k.trim()).filter(Boolean));
  const seenKnown = new Set();
  const newFails = [];
  const unexplained = [];
  const failedFiles = [];
  let totalLeafFails = 0;

  for (const f of files) {
    const leaves = parseTapLeaves(f.output);
    totalLeafFails += leaves.length;
    if (f.exitCode !== 0) failedFiles.push(f.file);
    for (const leaf of leaves) {
      if (knownSet.has(leaf)) seenKnown.add(leaf);
      else newFails.push(`${f.file}::${leaf}`);
    }
    // ไฟล์ล้มแต่ไม่มี leaf failure อธิบาย (import crash / process ตาย) = regression เสมอ
    if (f.exitCode !== 0 && leaves.length === 0) unexplained.push(f.file);
  }

  const fixed = [...knownSet].filter((k) => !seenKnown.has(k)).sort();
  return {
    ok: newFails.length === 0 && unexplained.length === 0,
    newFails: newFails.sort(),
    unexplained: unexplained.sort(),
    fixed,
    totalLeafFails,
    failedFiles: failedFiles.sort(),
  };
}

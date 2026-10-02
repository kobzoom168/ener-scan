// ขั้นหยุด/เก็บหลักฐานของโหมด live (Codex 2 ต.ค. 2026): ทดสอบได้แยกจาก harness
// 1) finalizeEvidence: ตัดสิน "complete" **หลัง** เขียนไฟล์และตรวจอ่านกลับสำเร็จเท่านั้น · เขียนล้ม = ไม่สำเร็จ exit 3 (parent เก็บทรัพยากรจาก exit code แม้เขียน KEEP ไม่ได้)
// 2) trackRouteHandlers: ติดตาม Promise ของ handler จริงจนจบ — res.close (client ตัด connection) ไม่ใช่ handler completion

/** ครอบ handler ตัวสุดท้ายของ route ใน express Router ให้ติดตาม Promise จนจบ */
export function trackRouteHandlers(router, path) {
  const pending = new Set();
  const layers = router.stack.filter((l) => l.route && l.route.path === path);
  if (!layers.length) throw new Error(`route ${path} ไม่พบใน router`);
  for (const layer of layers) {
    const h = layer.route.stack.at(-1);
    const orig = h.handle;
    h.handle = function trackedHandler(req, res, next) {
      let result;
      try { result = orig.call(this, req, res, next); } catch (e) { return next(e); }
      const p = Promise.resolve(result).catch((e) => { try { next(e); } catch { /* ignore */ } });
      pending.add(p); p.finally(() => pending.delete(p));
      return result;
    };
  }
  return {
    pending,
    /** รอ handler ที่รับไว้แล้วจบจริง · คืนจำนวนที่ยังค้างเมื่อหมดเวลา */
    async wait(timeoutMs) {
      const t0 = Date.now();
      while (pending.size > 0 && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 50));
      return pending.size;
    },
  };
}

/**
 * ตัดสินผล + เขียนหลักฐาน · คืน { complete, problems, file, exitCode, keep }
 * writer(file, text) ต้อง throw เมื่อเขียนล้ม · reader(file) คืน text เพื่อตรวจอ่านกลับ
 */
export function finalizeEvidence({ evidence, seedsCount, inflightLeft, handlersLeft, outDir, writer, reader, now = Date.now }) {
  const problems = [];
  if (inflightLeft > 0) problems.push(`in-flight ยังไม่จบ ${inflightLeft}`);
  if (handlersLeft > 0) problems.push(`handler ยังไม่จบ ${handlersLeft} (client อาจตัด connection แต่ RPC ยังทำงาน)`);
  if (!Array.isArray(evidence.payments) || evidence.payments.length !== seedsCount) problems.push("payments ไม่ครบ");
  for (const p of evidence.payments || []) {
    for (const k of ["status", "grants", "paidRemaining", "audit", "tokens", "outbound"]) if (typeof p[k] === "string" && p[k].startsWith("<query-error")) problems.push(`${String(p.pid).slice(0, 8)}.${k}: ${p[k]}`);
    if (typeof p.grants !== "number") problems.push(`${String(p.pid).slice(0, 8)}.grants ไม่ใช่ตัวเลข`);
  }
  if (typeof evidence.deniedAudit === "string") problems.push(`deniedAudit: ${evidence.deniedAudit}`);
  const dataOk = problems.length === 0;
  const file = `${outDir}/evidence${dataOk ? "" : "-PARTIAL"}-${now()}.json`;
  const text = JSON.stringify({ ...evidence, complete: dataOk, problems }, null, 2);
  let written = false;
  try {
    writer(file, text);
    const back = reader(file);
    if (back !== text) throw new Error("อ่านกลับไม่ตรงกับที่เขียน");
    JSON.parse(back);
    written = true;
  } catch (e) { problems.push(`เขียน/ตรวจไฟล์หลักฐานล้ม: ${String(e?.message || e).slice(0, 160)}`); }
  const complete = dataOk && written; // ตัดสินหลังเขียนและตรวจอ่านกลับเท่านั้น
  let keepWritten = false;
  if (!complete) { try { writer(`${outDir}/KEEP`, problems.join("\n") + "\n"); keepWritten = true; } catch { /* เขียน KEEP ไม่ได้ — exit code ยังบังคับให้ parent เก็บทรัพยากร */ } }
  return { complete, problems, file, written, keepWritten, exitCode: complete ? 0 : 3, keep: !complete };
}

// เลือก transport ของ Telegram สำหรับ integration test (Codex 2 ต.ค. 2026): mock เฉพาะ automated/--dry-run · live จริงต้องใช้ transport จริง
export const TG_RE = /^https:\/\/api\.telegram\.org\//;
/** @returns {"mock"|"real"} */
export function selectTelegramTransport({ mode, dryRun }) {
  return mode === "live" && !dryRun ? "real" : "mock";
}
/**
 * ติดตั้ง transport: mock = ตัดจบในเครื่อง (ตอบ ok) · real = ปล่อยผ่าน fetch จริง (guard ด้านล่างต้องอนุญาต host เอง)
 * ทั้งสองแบบบันทึก method/body (ไม่มี token — token อยู่ใน URL ซึ่งไม่ถูกเก็บ) ลง `calls`
 */
export function installTelegramTransport({ mode, dryRun, calls, shortCircuitFetch }) {
  const kind = selectTelegramTransport({ mode, dryRun });
  if (kind === "mock") shortCircuitFetch(TG_RE, () => new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), { status: 200 }));
  const f = globalThis.fetch;
  globalThis.fetch = function tgRecordingFetch(input, init) {
    const u = String(input instanceof Request ? input.url : input);
    if (!TG_RE.test(u)) return f.call(this, input, init);
    const method = u.replace(/^.*\/bot[^/]+\//, "").replace(/\?.*$/, "");
    let body = null; try { body = typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body ? "<form>" : null); } catch { body = "<raw>"; }
    const rec = { at: new Date().toISOString(), transport: kind, method, body };
    calls.push(rec);
    const p = f.call(this, input, init);
    if (kind === "real") p.then((r) => { rec.status = r.status; }, (e) => { rec.error = String(e?.code || e?.cause?.code || e?.message || e).slice(0, 80); });
    return p;
  };
  return kind;
}

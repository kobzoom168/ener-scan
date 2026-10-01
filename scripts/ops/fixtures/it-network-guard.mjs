// กันเครือข่ายออกนอกเครื่อง "ก่อนส่ง" สำหรับ integration test (Codex 1 ต.ค. 2026): ไม่ใช่แค่บันทึกแล้วปล่อยผ่าน
// ครอบทุกช่องทาง TCP/TLS ของ Node (fetch/undici, http/https, axios, ioredis, pg …) เพราะทั้งหมดลงที่ net.Socket#connect
// อนุญาตเฉพาะ loopback (PostgREST/เซิร์ฟเวอร์ทดสอบ) และ unix socket · ต้อง import ก่อนโมดูลแอปทุกตัว
import net from "node:net";
export const blockedAttempts = [];
const ALLOWED = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0"]);
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  let host = "localhost";
  const a0 = args[0];
  if (a0 && typeof a0 === "object") host = a0.path ? "unix" : String(a0.host || "localhost");
  else if (typeof a0 === "number") host = typeof args[1] === "string" ? args[1] : "localhost";
  else if (typeof a0 === "string") host = "unix";
  if (host !== "unix" && !ALLOWED.has(host)) {
    blockedAttempts.push(host);
    const e = new Error(`blocked external network in integration test: ${host}`); e.code = "ENETBLOCKED";
    queueMicrotask(() => this.destroy(e));
    return this;
  }
  return origConnect.apply(this, args);
};
/** fetch ปลอมเฉพาะ URL ที่กำหนด (เช่น LINE loading animation) ส่วนอื่นผ่าน guard ด้านบน */
export function shortCircuitFetch(pattern, response = () => new Response("{}", { status: 200 }), onHit = () => {}) {
  const real = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    const u = String(input instanceof Request ? input.url : input);
    if (pattern.test(u)) { onHit(u); return Promise.resolve(response(u)); }
    return real.call(this, input, init);
  };
}
/** พิสูจน์ว่า guard ทำงานจริงในโปรเซสนี้: ลองออกนอกเครื่อง 1 ครั้ง ต้องถูกบล็อกก่อนส่ง (ไม่ใช่แค่บันทึก) แล้วล้างรายการ */
export async function selfTestGuard() {
  const before = blockedAttempts.length;
  let blocked = false;
  try { await fetch("https://api.openai.com/v1/models", { signal: AbortSignal.timeout(3000) }); }
  catch (e) { blocked = /ENETBLOCKED|blocked external network/.test(String(e?.cause?.code || e?.cause?.message || e?.message)); }
  if (!blocked || blockedAttempts.length !== before + 1) throw new Error("network guard self-test failed — ห้ามรันเทสต์ต่อ");
  blockedAttempts.length = before;
  return true;
}

// กันเครือข่ายออกนอกเครื่อง "ก่อนส่ง" สำหรับ integration test (Codex 1 ต.ค. 2026): ไม่ใช่แค่บันทึกแล้วปล่อยผ่าน
// ครอบทุกช่องทาง TCP/TLS ของ Node (fetch/undici, http/https, axios, ioredis, pg …) เพราะทั้งหมดลงที่ net.Socket#connect
// รูปแบบ arguments ที่ Node ส่งมา: (options[, cb]) · (port[, host][, cb]) · (path[, cb]) · และ **array normalized** จาก
// net.connect/net.createConnection/http.Agent ([options, cb] ที่มี normalizedArgsSymbol) — รูปแบบที่ตีความไม่ได้ = ปฏิเสธ ไม่ default เป็น localhost
// อนุญาตเฉพาะ loopback (PostgREST/เซิร์ฟเวอร์ทดสอบ) และ unix socket · ต้อง import ก่อนโมดูลแอปทุกตัว
import net from "node:net";
export const blockedAttempts = [];
const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|::1|::ffff:127(\.\d{1,3}){3}|0\.0\.0\.0)$/i;
/** @returns {{ allow: boolean, host: string }} */
export function classifyConnectArgs(args) {
  let a0 = args[0];
  if (Array.isArray(a0)) a0 = a0[0]; // normalized [options, cb]
  if (typeof a0 === "string") return { allow: true, host: "unix:" + a0 };
  if (typeof a0 === "number") {
    const h = args[1];
    if (h === undefined || typeof h === "function") return { allow: true, host: "localhost" }; // net semantics: (port[, cb]) = localhost
    return typeof h === "string" && LOOPBACK.test(h) ? { allow: true, host: h } : { allow: false, host: String(h) };
  }
  if (a0 && typeof a0 === "object") {
    if (typeof a0.path === "string" && a0.path) return { allow: true, host: "unix:" + a0.path };
    const h = a0.host ?? a0.hostname;
    if (h === undefined || h === null) {
      // net semantics: options ไม่มี host = localhost — ยอมรับเฉพาะเมื่อมี port ที่ใช้ได้จริง มิฉะนั้นตีความไม่ได้
      return Number.isInteger(Number(a0.port)) && Number(a0.port) > 0 ? { allow: true, host: "localhost" } : { allow: false, host: "<unparseable:no-host>" };
    }
    return typeof h === "string" && LOOPBACK.test(h) ? { allow: true, host: h } : { allow: false, host: String(h) };
  }
  return { allow: false, host: `<unparseable:${typeof a0}>` };
}
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const { allow, host } = classifyConnectArgs(args);
  if (!allow) {
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
const isBlockedErr = (e) => /ENETBLOCKED|blocked external network/.test(String(e?.code || e?.cause?.code || e?.cause?.message || e?.message));
/** พิสูจน์ว่า guard ทำงานจริงในโปรเซสนี้ ทุกช่องทาง: fetch · net.createConnection · net.connect · http · https — host .invalid (ไม่ resolve แม้หลุด) ต้องถูกบล็อกก่อนส่ง */
export async function selfTestGuard() {
  const [http, https] = [await import("node:http"), await import("node:https")];
  const before = blockedAttempts.length;
  const probes = [
    () => fetch("https://guard-selftest.invalid/", { signal: AbortSignal.timeout(3000) }),
    () => new Promise((_, rej) => net.createConnection({ host: "guard-selftest.invalid", port: 443 }).once("error", rej)),
    () => new Promise((_, rej) => net.connect(443, "guard-selftest.invalid").once("error", rej)),
    () => new Promise((_, rej) => http.request("http://guard-selftest.invalid/").once("error", rej).end()),
    () => new Promise((_, rej) => https.request("https://guard-selftest.invalid/").once("error", rej).end()),
  ];
  for (const p of probes) {
    let blocked = false;
    try { await p(); } catch (e) { blocked = isBlockedErr(e); }
    if (!blocked) throw new Error("network guard self-test failed — ห้ามรันเทสต์ต่อ");
  }
  if (blockedAttempts.length !== before + probes.length) throw new Error("network guard self-test: นับการบล็อกไม่ครบ");
  blockedAttempts.length = before;
  return true;
}

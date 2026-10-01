/**
 * regression — network guard ของ integration test (scripts/ops/fixtures/it-network-guard.mjs)
 * Codex 1 ต.ค. 2026: guard เดิมไม่รองรับ normalized array จาก net.createConnection → อ่าน host เป็น localhost แล้วปล่อยผ่าน
 * วิธีพิสูจน์แบบไม่ออกเครือข่ายจริง: วาง spy ทับ net.Socket#connect "ใต้" guard — spy ส่งต่อให้ของจริงเฉพาะ loopback
 * ถ้า guard ปล่อย host นอกหลุดลงมา spy จะบันทึก LEAK และไม่เชื่อมต่อ (ไม่มี egress ไม่ว่ากรณีใด)
 */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import https from "node:https";

const realConnect = net.Socket.prototype.connect;
const spy = { calls: [], leaks: [] };
net.Socket.prototype.connect = function spiedConnect(...args) {
  let a0 = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof a0 === "object" && a0 ? (a0.path ? "unix" : String(a0.host ?? a0.hostname ?? "localhost")) : typeof a0 === "number" ? String(args[1] ?? "localhost") : "unix";
  spy.calls.push(host);
  if (!/^(localhost|127\.0\.0\.1|::1|unix)$/.test(host)) { spy.leaks.push(host); return this; } // ห้ามออกจริง
  return realConnect.apply(this, args);
};
const { blockedAttempts, classifyConnectArgs, selfTestGuard } = await import("../scripts/ops/fixtures/it-network-guard.mjs");

const blockedErr = (p) => p.then(() => { throw new Error("ต้องถูกบล็อก"); }, (e) => { assert.match(String(e?.code || e?.cause?.code || e?.message), /ENETBLOCKED|blocked external network/); });
const onErr = (emitter) => new Promise((_, rej) => emitter.once("error", rej));
const reset = () => { blockedAttempts.length = 0; spy.calls.length = 0; spy.leaks.length = 0; };

test("classifyConnectArgs: ทุกรูปแบบ args รวม normalized array · ตีความไม่ได้ = ปฏิเสธ", () => {
  assert.equal(classifyConnectArgs([[{ host: "example.invalid", port: 443 }, () => {}]]).allow, false);
  assert.equal(classifyConnectArgs([[{ port: 443, host: "example.invalid" }]]).allow, false);
  assert.equal(classifyConnectArgs([{ hostname: "example.invalid", port: 80 }]).allow, false);
  assert.equal(classifyConnectArgs([443, "example.invalid"]).allow, false);
  assert.equal(classifyConnectArgs([{ host: "127.0.0.1", port: 5 }]).allow, true);
  assert.equal(classifyConnectArgs([[{ host: "localhost", port: 5 }]]).allow, true);
  assert.equal(classifyConnectArgs([{ host: "::1", port: 5 }]).allow, true);
  assert.equal(classifyConnectArgs([5]).allow, true);
  assert.equal(classifyConnectArgs(["/tmp/x.sock"]).allow, true);
  assert.equal(classifyConnectArgs([{ path: "/tmp/x.sock" }]).allow, true);
  assert.equal(classifyConnectArgs([{}]).allow, false, "ไม่มี host/port = ตีความไม่ได้");
  assert.equal(classifyConnectArgs([undefined]).allow, false);
  assert.equal(classifyConnectArgs([{ host: "127.0.0.1.evil.invalid", port: 1 }]).allow, false);
});

test("บล็อกก่อนส่ง: net.createConnection / net.connect / http / https / fetch → spy ชั้นล่างไม่ถูกเรียก ไม่มี LEAK", async () => {
  reset();
  await blockedErr(onErr(net.createConnection({ host: "example.invalid", port: 443 })));
  await blockedErr(onErr(net.connect(443, "example.invalid")));
  await blockedErr(onErr(net.connect({ port: 443, host: "example.invalid" })));
  await blockedErr(onErr(http.request("http://example.invalid/").end()));
  await blockedErr(onErr(https.request("https://example.invalid/").end()));
  await blockedErr(fetch("https://example.invalid/", { signal: AbortSignal.timeout(3000) }));
  assert.deepEqual(spy.calls, [], "ชั้นล่างต้องไม่ถูกเรียกเลย"); assert.deepEqual(spy.leaks, []);
  assert.equal(blockedAttempts.length, 6); assert.ok(blockedAttempts.every((h) => h === "example.invalid"), JSON.stringify(blockedAttempts));
});

test("loopback ของระบบทดสอบยังผ่าน: เซิร์ฟเวอร์จริงบน 127.0.0.1 ผ่าน http.request และ fetch", async () => {
  reset();
  const server = http.createServer((req, res) => res.end("ok")).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address();
  const body = await new Promise((resolve, reject) => http.get({ host: "127.0.0.1", port, path: "/" }, (res) => { let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => resolve(t)); }).once("error", reject));
  assert.equal(body, "ok");
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), "ok");
  server.close();
  assert.equal(blockedAttempts.length, 0); assert.ok(spy.calls.length >= 2); assert.deepEqual(spy.leaks, []);
});

test("selfTestGuard ผ่านทุกช่องทาง และไม่ทิ้งรายการค้าง", async () => {
  reset();
  assert.equal(await selfTestGuard(), true);
  assert.equal(blockedAttempts.length, 0); assert.deepEqual(spy.leaks, []); assert.deepEqual(spy.calls, []);
});

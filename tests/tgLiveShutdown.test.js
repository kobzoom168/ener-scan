/**
 * regression — ขั้นหยุด/เก็บหลักฐานโหมด live (Codex 2 ต.ค. 2026)
 * 1) writer ล้ม → ไม่ complete, exit 3, keep (แม้เขียน KEEP ไม่ได้ก็ตาม) → parent ไม่ cleanup
 * 2) client ตัด connection ระหว่าง handler ค้าง → res.close ทำให้ inflight=0 แต่ handler ยังไม่จบ → STOP ต้องไม่สรุป complete; timeout → PARTIAL/keep
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { finalizeEvidence, trackRouteHandlers } from "../scripts/ops/fixtures/tg-live-shutdown.mjs";

const goodEvidence = () => ({ payments: [{ pid: "p1", status: "paid|x", grants: 1, paidRemaining: "4", audit: "a", tokens: "t", outbound: [] }], deniedAudit: [] });
const memfs = () => { const files = new Map(); return { files, writer: (f, t) => files.set(f, t), reader: (f) => { if (!files.has(f)) throw new Error("ENOENT"); return files.get(f); } }; };

test("หลักฐานครบ + เขียน/อ่านกลับสำเร็จ → complete exit 0 ไม่ keep", () => {
  const m = memfs();
  const r = finalizeEvidence({ evidence: goodEvidence(), seedsCount: 1, inflightLeft: 0, handlersLeft: 0, outDir: "/o", ...m, now: () => 1 });
  assert.equal(r.complete, true); assert.equal(r.exitCode, 0); assert.equal(r.keep, false); assert.ok(m.files.has("/o/evidence-1.json")); assert.ok(!m.files.has("/o/KEEP"));
});

test("writer ล้ม (disk full) → ไม่ complete · exit 3 · keep · มีเหตุผล — แม้เขียน KEEP ไม่ได้", () => {
  const r = finalizeEvidence({ evidence: goodEvidence(), seedsCount: 1, inflightLeft: 0, handlersLeft: 0, outDir: "/o", writer: () => { throw new Error("simulated disk full"); }, reader: () => { throw new Error("ENOENT"); }, now: () => 2 });
  assert.equal(r.complete, false); assert.equal(r.exitCode, 3); assert.equal(r.keep, true); assert.equal(r.written, false); assert.equal(r.keepWritten, false);
  assert.ok(r.problems.some((p) => /simulated disk full/.test(p)), JSON.stringify(r.problems));
});

test("เขียนได้แต่อ่านกลับไม่ตรง (เขียนไม่ครบ) → ไม่ complete exit 3", () => {
  const m = memfs(); const truncating = (f, t) => m.writer(f, t.slice(0, 20));
  const r = finalizeEvidence({ evidence: goodEvidence(), seedsCount: 1, inflightLeft: 0, handlersLeft: 0, outDir: "/o", writer: truncating, reader: m.reader, now: () => 3 });
  assert.equal(r.complete, false); assert.equal(r.exitCode, 3); assert.ok(r.problems.some((p) => /อ่านกลับไม่ตรง/.test(p)));
});

test("handler ยังค้าง / in-flight ค้าง / query ล้ม → PARTIAL exit 3 keep", () => {
  const m = memfs();
  const r1 = finalizeEvidence({ evidence: goodEvidence(), seedsCount: 1, inflightLeft: 0, handlersLeft: 1, outDir: "/o", ...m, now: () => 4 });
  assert.equal(r1.complete, false); assert.equal(r1.exitCode, 3); assert.ok(m.files.has("/o/evidence-PARTIAL-4.json")); assert.ok(m.files.has("/o/KEEP"));
  const bad = goodEvidence(); bad.payments[0].status = "<query-error: boom>";
  const r2 = finalizeEvidence({ evidence: bad, seedsCount: 1, inflightLeft: 0, handlersLeft: 0, outDir: "/o", ...m, now: () => 5 });
  assert.equal(r2.complete, false); assert.ok(r2.problems.some((p) => /query-error/.test(p)));
});

test("client ตัด connection ระหว่าง handler ค้าง: res.close → inflight 0 แต่ handler pending 1 · wait หมดเวลา → ยังค้าง · เมื่อ handler จบ pending 0", async () => {
  const app = express();
  const gate = { inflight: 0 };
  app.use((req, res, next) => { gate.inflight++; let d = false; const dec = () => { if (!d) { d = true; gate.inflight--; } }; res.on("finish", dec); res.on("close", dec); next(); });
  const router = express.Router();
  let release; const held = new Promise((r) => { release = r; });
  router.post("/telegram/webhook", express.json(), async (req, res) => { await held; try { res.status(200).json({ ok: true }); } catch { /* socket ปิดแล้ว */ } });
  const tracker = trackRouteHandlers(router, "/telegram/webhook");
  app.use(router);
  const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  const { port } = server.address();
  const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/telegram/webhook", headers: { "content-type": "application/json" } });
  req.on("error", () => {}); req.end("{}");
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(tracker.pending.size, 1, "handler ต้องถูกติดตาม");
  req.destroy(); // client ตัด connection ขณะ handler ยังรอ RPC
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(gate.inflight, 0, "res.close ทำให้ inflight เป็น 0 — ใช้เป็นสัญญาณจบไม่ได้");
  assert.equal(await tracker.wait(300), 1, "handler ยังไม่จบ → wait ต้องหมดเวลาและคืน 1");
  const m = memfs();
  const r = finalizeEvidence({ evidence: goodEvidence(), seedsCount: 1, inflightLeft: gate.inflight, handlersLeft: tracker.pending.size, outDir: "/o", ...m, now: () => 6 });
  assert.equal(r.complete, false); assert.equal(r.exitCode, 3); assert.ok(r.problems.some((p) => /handler ยังไม่จบ 1/.test(p)));
  release(); assert.equal(await tracker.wait(2000), 0, "เมื่อ handler จบจริง pending ต้องเป็น 0");
  server.close();
});

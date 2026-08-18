/**
 * Codex P0-7 behavior: durable inbound idempotency
 * duplicate ข้าม container ถูก drop · handler ล้ม = ปล่อย lease (retry ได้) ·
 * สำเร็จ = done marker 48 ชม. · owner protection: lease ใหม่ลบไม่ได้โดย owner เก่า
 */
import test from "node:test";
import assert from "node:assert/strict";
import { claimInboundMessage, INBOUND_LEASE_PX_MS, INBOUND_DONE_TTL_SEC } from "../src/services/lineWebhook/inboundClaim.util.js";

function fakeRedis() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async set(k, v, ...args) {
      const nx = args.includes("NX");
      if (nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    async eval(script, nkeys, key, token) {
      if (store.get(key) === token) { store.delete(key); return 1; }
      return 0;
    },
  };
}

const deps = (r) => ({ getRedis: async () => r });

test("claim แรกผ่าน · claim ซ้ำระหว่างทำ = in_progress (ข้าม container ก็กัน)", async () => {
  const r = fakeRedis();
  const c1 = await claimInboundMessage("m1", deps(r));
  assert.equal(c1.proceed, true);
  const c2 = await claimInboundMessage("m1", deps(r));
  assert.equal(c2.proceed, false);
  assert.equal(c2.reason, "in_progress");
});

test("release(success=true) → done marker · claim ใหม่ = completed", async () => {
  const r = fakeRedis();
  const c1 = await claimInboundMessage("m2", deps(r));
  await c1.release(true);
  assert.equal(r.store.get("msg:done:m2"), "1");
  assert.equal(r.store.has("msg:lease:m2"), false);
  const c2 = await claimInboundMessage("m2", deps(r));
  assert.equal(c2.proceed, false);
  assert.equal(c2.reason, "completed");
});

test("handler ล้ม (release success=false) → ไม่มี done marker + lease หลุด = retry ได้", async () => {
  const r = fakeRedis();
  const c1 = await claimInboundMessage("m3", deps(r));
  await c1.release(false);
  assert.equal(r.store.has("msg:done:m3"), false);
  const c2 = await claimInboundMessage("m3", deps(r));
  assert.equal(c2.proceed, true, "duplicate หลัง fail ต้องได้ลองใหม่");
});

test("owner protection: lease หมดอายุ + เจ้าของใหม่ claim → release เก่าห้ามลบ lease ใหม่", async () => {
  const r = fakeRedis();
  const c1 = await claimInboundMessage("m4", deps(r));
  // จำลอง lease ของ c1 หมดอายุ (crash) แล้ว c2 มา claim สำเร็จ
  r.store.delete("msg:lease:m4");
  const c2 = await claimInboundMessage("m4", deps(r));
  assert.equal(c2.proceed, true);
  const newToken = r.store.get("msg:lease:m4");
  await c1.release(false); // compare-and-delete ด้วย token เก่า — ต้องไม่ลบของใหม่
  assert.equal(r.store.get("msg:lease:m4"), newToken, "lease ของ owner ใหม่ต้องรอด");
});

test("fail-open: redis null / getRedis throw / id ว่าง → proceed", async () => {
  assert.equal((await claimInboundMessage("m5", { getRedis: async () => null })).proceed, true);
  assert.equal((await claimInboundMessage("m6", { getRedis: async () => { throw new Error("x"); } })).proceed, true);
  assert.equal((await claimInboundMessage("", deps(fakeRedis()))).proceed, true);
});

test("ค่าคงที่ contract: lease 5 นาที · done 48 ชม.", () => {
  assert.equal(INBOUND_LEASE_PX_MS, 300000);
  assert.equal(INBOUND_DONE_TTL_SEC, 172800);
});

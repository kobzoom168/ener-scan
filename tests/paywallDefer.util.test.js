/**
 * Paywall defer resolver (Codex รอบ 3): invariant "ต้องได้รับคุณค่าก่อนขาย"
 * outcome 3 ทาง defer|paywall|recovery — behavior tests ทุกกิ่ง
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePaywallDeferDecision,
  gatherPaywallDeferEvidence,
  selectRecoveryText,
  assignRecoveryOwner,
  PAYWALL_DEFER_SAFETY_BOUND_MS,
  PAYWALL_DEFER_TEXT,
  PAYWALL_RECOVERY_TEXTS,
  RECOVERY_OWNER_ASSIGNED_SUFFIX,
} from "../src/services/lineWebhook/paywallDefer.util.js";

test("pending ทุกสถานะภายใน bound → defer (ไม่ว่าลูกค้าใหม่/เก่า) · delivered → paywall", () => {
  for (const status of ["queued", "processing", "claimed", "completed", "delivery_queued"]) {
    for (const hasVal of [true, false]) {
      const r = resolvePaywallDeferDecision({
        inFlightActive: false,
        job: { status, ageMs: 60000 },
        hasAnyDeliveredReport: hasVal,
      });
      assert.equal(r.decision, "defer", `${status} hasVal=${hasVal}`);
    }
  }
  assert.equal(
    resolvePaywallDeferDecision({ inFlightActive: false, job: { status: "delivered", ageMs: 60000 } }).decision,
    "paywall",
  );
});

test("ลูกค้าใหม่ (ไม่เคยได้ผล) + queued เกิน 30 นาที → recovery ไม่ใช่ paywall", () => {
  const r = resolvePaywallDeferDecision({
    inFlightActive: false,
    job: { status: "queued", ageMs: PAYWALL_DEFER_SAFETY_BOUND_MS + 1 },
    hasAnyDeliveredReport: false,
  });
  assert.equal(r.decision, "recovery");
  assert.equal(r.reason, "stale_pending_no_value");
});

test("ลูกค้าใหม่ + failed/cancelled → recovery ห้ามขาย", () => {
  for (const status of ["failed", "cancelled", "weird_status", ""]) {
    const r = resolvePaywallDeferDecision({
      inFlightActive: false,
      job: { status, ageMs: 1000 },
      hasAnyDeliveredReport: false,
    });
    assert.equal(r.decision, "recovery", status);
  }
});

test("ลูกค้าเก่า (เคย delivered แล้ว) + stale/failed/cancelled → paywall policy ปกติ", () => {
  assert.equal(
    resolvePaywallDeferDecision({
      inFlightActive: false,
      job: { status: "queued", ageMs: PAYWALL_DEFER_SAFETY_BOUND_MS + 1 },
      hasAnyDeliveredReport: true,
    }).decision,
    "paywall",
  );
  for (const status of ["failed", "cancelled"]) {
    assert.equal(
      resolvePaywallDeferDecision({
        inFlightActive: false,
        job: { status, ageMs: 1000 },
        hasAnyDeliveredReport: true,
      }).decision,
      "paywall",
      status,
    );
  }
});

test("ageMs invalid (NaN/ติดลบ/missing) → outcome ชัดเจน ไม่ defer ค้าง + reason invalid_job_age", () => {
  for (const ageMs of [NaN, -5000, undefined]) {
    const newCust = resolvePaywallDeferDecision({
      inFlightActive: false,
      job: { status: "queued", ageMs },
      hasAnyDeliveredReport: false,
    });
    assert.equal(newCust.decision, "recovery", String(ageMs));
    assert.equal(newCust.reason, "invalid_job_age");
    const oldCust = resolvePaywallDeferDecision({
      inFlightActive: false,
      job: { status: "queued", ageMs },
      hasAnyDeliveredReport: true,
    });
    assert.equal(oldCust.decision, "paywall", String(ageMs));
    assert.equal(oldCust.reason, "invalid_job_age");
  }
});

test("in-flight → defer เสมอ · dbError/ไม่มี job → fail-open paywall", () => {
  assert.equal(resolvePaywallDeferDecision({ inFlightActive: true, job: null }).decision, "defer");
  assert.equal(
    resolvePaywallDeferDecision({ inFlightActive: false, job: null, dbError: true }).decision,
    "paywall",
  );
  assert.equal(resolvePaywallDeferDecision({ inFlightActive: false, job: null }).decision, "paywall");
});

test("copy: defer/recovery ไม่มีราคา ไม่สัญญาผลมาเอง/handoff ลอย · stale ห้ามฟันธงว่าล้ม", () => {
  for (const txt of [PAYWALL_DEFER_TEXT, ...Object.values(PAYWALL_RECOVERY_TEXTS)]) {
    assert.doesNotMatch(txt, /บาท|จ่าย|ค่าครู|แพ็ก|ราคา/);
    assert.doesNotMatch(txt, /เดี๋ยวผล|ผลจะมา|กำลังอ่าน|ไม่เกิน\s*\d/);
    // ห้ามสัญญา handoff ถ้าไม่มี enqueue จริง (branch นี้ไม่ส่งให้อาจารย์)
    assert.doesNotMatch(txt, /ส่งให้อาจารย์|อาจารย์อ่านให้/);
  }
  // recovery ทุกแบบต้องบอกชัดว่าไม่ต้องส่งซ้ำ (รูปถูกถือไว้แล้ว — ไม่ใช่ dead end ที่สั่งส่งใหม่)
  for (const txt of Object.values(PAYWALL_RECOVERY_TEXTS)) {
    assert.match(txt, /ไม่ต้องส่งซ้ำ/);
  }
  // failed = พูดได้ว่าอ่านไม่สำเร็จ · stale/neutral = ห้าม
  assert.match(PAYWALL_RECOVERY_TEXTS.failed, /อ่านไม่สำเร็จ/);
  assert.doesNotMatch(PAYWALL_RECOVERY_TEXTS.stale, /ไม่สำเร็จ|ล้มเหลว/);
  assert.doesNotMatch(PAYWALL_RECOVERY_TEXTS.neutral, /ไม่สำเร็จ|ล้มเหลว/);
  // mapping reason → copy · "แอดมินรับเรื่อง" โผล่เฉพาะเมื่อ owner assigned จริง
  assert.equal(selectRecoveryText("no_value_failed"), PAYWALL_RECOVERY_TEXTS.failed);
  assert.equal(selectRecoveryText("no_value_cancelled"), PAYWALL_RECOVERY_TEXTS.failed);
  assert.equal(selectRecoveryText("stale_pending_no_value"), PAYWALL_RECOVERY_TEXTS.stale);
  assert.equal(selectRecoveryText("invalid_job_age"), PAYWALL_RECOVERY_TEXTS.neutral);
  assert.equal(selectRecoveryText("no_value_unknown"), PAYWALL_RECOVERY_TEXTS.neutral);
  for (const reason of ["no_value_failed", "stale_pending_no_value", "invalid_job_age"]) {
    assert.doesNotMatch(selectRecoveryText(reason, { ownerAssigned: false }), /แอดมินรับเรื่อง/);
    assert.match(selectRecoveryText(reason, { ownerAssigned: true }), /แอดมินรับเรื่องแล้ว/);
  }
  assert.doesNotMatch(RECOVERY_OWNER_ASSIGNED_SUFFIX, /บาท|จ่าย|ค่าครู|แพ็ก|ราคา/);
});

/* ---------------- owner assignment ซื่อสัตย์ (Codex รอบ 5) ---------------- */

function ownerDeps({ sendResult, sendThrows = false }) {
  const state = { dedupe: new Set(), cleared: [], sent: 0 };
  return {
    state,
    deps: {
      tryDedupeOnce: async (k) => {
        if (state.dedupe.has(k)) return false;
        state.dedupe.add(k);
        return true;
      },
      clearDedupeKey: async (k) => {
        state.dedupe.delete(k);
        state.cleared.push(k);
      },
      sendTelegramText: async () => {
        state.sent += 1;
        if (sendThrows) throw new Error("network down");
        return sendResult;
      },
    },
  };
}

test("owner: Telegram {ok:true} → assigned + dedupe คงอยู่ (ไม่แจ้งซ้ำในชั่วโมง)", async () => {
  const { state, deps } = ownerDeps({ sendResult: { ok: true } });
  const r1 = await assignRecoveryOwner({ userId: "U1", reason: "no_value_failed", deps });
  assert.equal(r1.ownerAssigned, true);
  assert.equal(state.sent, 1);
  // ครั้งที่สองในชั่วโมงเดียว: ไม่ส่งซ้ำ แต่ owner ยังถือว่ามี (แจ้งสำเร็จไปแล้ว)
  const r2 = await assignRecoveryOwner({ userId: "U1", reason: "no_value_failed", deps });
  assert.equal(r2.ownerAssigned, true);
  assert.equal(state.sent, 1);
  assert.equal(state.cleared.length, 0);
});

test("owner: {ok:false}/not_configured/throw → ไม่ assigned + clear dedupe ให้รอบหน้าลองใหม่", async () => {
  for (const setup of [
    ownerDeps({ sendResult: { ok: false, reason: "http_500" } }),
    ownerDeps({ sendResult: { ok: false, reason: "not_configured" } }),
    ownerDeps({ sendResult: null, sendThrows: true }),
  ]) {
    const r = await assignRecoveryOwner({ userId: "U2", reason: "no_value_failed", deps: setup.deps });
    assert.equal(r.ownerAssigned, false);
    assert.equal(setup.state.cleared.length, 1); // dedupe ถูกล้าง
    // interaction ถัดไปลองส่งใหม่ได้จริง (dedupe ว่างแล้ว)
    const r2 = await assignRecoveryOwner({ userId: "U2", reason: "no_value_failed", deps: setup.deps });
    assert.equal(setup.state.sent, 2, "รอบสองต้องพยายามส่งใหม่");
    void r2;
  }
});

/* ---------------- evidence gatherer: PostgREST คืน {error} ไม่ throw (Codex รอบ 4) ---------------- */

function fakeSupabase({ jobResult, markerResult }) {
  const chain = (result) => {
    const o = {
      select: () => o, eq: () => o, order: () => o, limit: () => o, filter: () => o,
      maybeSingle: async () => result,
    };
    return o;
  };
  return {
    from: (table) => chain(table === "scan_jobs" ? jobResult : markerResult),
  };
}

test("evidence: job query คืน error object (ไม่ throw) → dbError=true", async () => {
  const ev = await gatherPaywallDeferEvidence({
    supabase: fakeSupabase({
      jobResult: { data: null, error: { message: "db down" } },
      markerResult: { data: { id: 1 }, error: null },
    }),
    userId: "U1",
    inFlightActive: false,
  });
  assert.equal(ev.dbError, true);
  assert.equal(ev.job, null);
  // dbError → resolver fail-open paywall
  assert.equal(resolvePaywallDeferDecision(ev).decision, "paywall");
});

test("evidence: marker query คืน error object → hasAnyDeliveredReport=true (fail-open) + markerError flag", async () => {
  const ev = await gatherPaywallDeferEvidence({
    supabase: fakeSupabase({
      jobResult: { data: { status: "failed", created_at: new Date().toISOString() }, error: null },
      markerResult: { data: null, error: { message: "db down" } },
    }),
    userId: "U1",
    inFlightActive: false,
  });
  assert.equal(ev.markerError, true);
  assert.equal(ev.hasAnyDeliveredReport, true); // ตรงข้ามกับบั๊กเดิมที่กลายเป็น false
  assert.equal(resolvePaywallDeferDecision(ev).decision, "paywall"); // policy ปกติ ไม่ recovery มั่ว
});

test("evidence: ทางปกติ — job แปลง ageMs ถูก · marker ไม่มี = hasAnyDeliveredReport=false", async () => {
  const now = Date.now();
  const ev = await gatherPaywallDeferEvidence({
    supabase: fakeSupabase({
      jobResult: { data: { status: "failed", created_at: new Date(now - 5000).toISOString() }, error: null },
      markerResult: { data: null, error: null },
    }),
    userId: "U1",
    inFlightActive: false,
    nowMs: now,
  });
  assert.equal(ev.dbError, false);
  assert.equal(ev.hasAnyDeliveredReport, false);
  assert.equal(ev.job.status, "failed");
  assert.ok(ev.job.ageMs >= 4000 && ev.job.ageMs <= 6000);
  assert.equal(resolvePaywallDeferDecision(ev).decision, "recovery"); // ลูกค้าใหม่+failed
});

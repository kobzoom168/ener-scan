/**
 * P0-2 (Codex raw log 19-20 ส.ค. 2026): scan job status ต้องตรงการส่งจริง —
 * เกตเก็บข้อมูลชิ้น re-enqueue โดยไม่มี related_job_id ทำ 62/85 งานค้าง
 * delivery_queued ทั้งที่ outbound sent จริง (และข้าม paid quota decrement)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DELIVER = fs.readFileSync(
  path.join(process.cwd(), "src", "services", "scanV2", "deliverOutbound.service.js"),
  "utf8",
);
const GATE = fs.readFileSync(
  path.join(process.cwd(), "src", "services", "objectInfoGate", "objectInfoGate.service.js"),
  "utf8",
);

test("hold call ส่ง relatedJobId + pending เก็บ + re-enqueue คง related_job_id (source contract)", () => {
  assert.ok(
    DELIVER.includes("relatedJobId: msg.related_job_id"),
    "deliverOutbound ต้องส่ง relatedJobId เข้าเกตยึดรายงาน",
  );
  assert.ok(
    /relatedJobId:\s*String\(relatedJobId/.test(GATE),
    "pending ของเกตต้องเก็บ relatedJobId",
  );
  const reEnq = GATE.slice(GATE.indexOf("async function reEnqueueHeldReport"), GATE.indexOf("async function reEnqueueHeldReport") + 700);
  assert.ok(
    reEnq.includes("related_job_id: pending.relatedJobId"),
    "outbound ที่ re-enqueue หลังปล่อยเกตต้องมี related_job_id — ไม่งั้น job ค้าง delivery_queued ตลอด",
  );
});

test("post-delivery finalize เป็น delivered แบบ idempotent — delivered แล้วไม่ทำซ้ำ · ห้ามทับ terminal failure (source contract)", () => {
  const fn = DELIVER.slice(
    DELIVER.indexOf("async function handleScanResultPostDelivery"),
    DELIVER.indexOf("async function handleScanResultPostDelivery") + 1600,
  );
  assert.ok(fn.includes('if (st === "delivered") return;'), "delivered แล้วต้อง return ก่อนแตะอะไร (กัน quota decrement ซ้ำ)");
  assert.ok(/\["failed", "cancelled", "suppressed_banned"\]\.includes\(st\)/.test(fn), "terminal failure ห้ามถูกทับเป็น delivered");
  assert.ok(fn.indexOf('if (st === "delivered")') < fn.indexOf('status: "delivered"'), "guard ต้องมาก่อน update");
  // send fail ห้าม mark delivered: postDelivery ต้องถูกเรียกเฉพาะใน delivery.sent branch
  const sentIdx = DELIVER.indexOf("if (delivery.sent) {");
  const postIdx = DELIVER.indexOf("await handleScanResultPostDelivery(msg, payload);");
  assert.ok(sentIdx > 0 && postIdx > sentIdx, "postDelivery ต้องอยู่ใต้ delivery.sent เท่านั้น");
});

test("backfill มีจริงและใช้หลักฐาน outbound sent เท่านั้น (source contract)", () => {
  const sqlPath = path.join(process.cwd(), "sql", "backfill_delivered_status_20260820.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  assert.ok(/o\.kind = 'scan_result' AND o\.status = 'sent'/.test(sql), "backfill ต้องมีหลักฐาน outbound sent จริง");
  assert.ok(sql.includes("j.status = 'delivery_queued'"), "backfill เฉพาะงานที่ค้างคิว — ห้ามแตะ failed/cancelled");
  assert.ok(!/^\d/.test(path.basename(sqlPath)), "ชื่อไฟล์ห้ามขึ้นต้นด้วยเลข — กันเข้า auto-migration");
});

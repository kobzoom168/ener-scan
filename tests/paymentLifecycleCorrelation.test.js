import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLifecycleCorrelation,
  LIFECYCLE_SCHEMA_VERSION,
} from "../src/core/telemetry/paymentLifecycleCorrelation.js";

test("buildLifecycleCorrelation normalizes ids and drops empty", () => {
  const c = buildLifecycleCorrelation({
    userId: " U1 ",
    paymentId: "550e8400-e29b-41d4-a716-446655440000",
    paymentRef: " REF1 ",
    packageKey: "49baht_4scans_24h",
  });
  assert.equal(c.lifecycleSchemaVersion, LIFECYCLE_SCHEMA_VERSION);
  assert.equal(c.userId, "U1");
  assert.equal(c.lineUserId, "U1");
  assert.equal(c.paymentId, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(c.paymentRef, "REF1");
  assert.equal(c.packageKey, "49baht_4scans_24h");
});

test("buildLifecycleCorrelation omits missing optional fields", () => {
  const c = buildLifecycleCorrelation({ userId: "u" });
  assert.equal(c.userId, "u");
  assert.equal("paymentId" in c, false);
  assert.equal("paymentRef" in c, false);
});

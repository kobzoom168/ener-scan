import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeClaimNextOutboundRpcPayload,
  pickOutboundClaimFields,
  isOutboundClaimRowEffectivelyEmpty,
  isAllNullishCompositeRecord,
} from "../src/utils/outboundClaim.util.js";

test("normalizeClaimNextOutboundRpcPayload: null → null", () => {
  assert.equal(normalizeClaimNextOutboundRpcPayload(null), null);
});

test("normalizeClaimNextOutboundRpcPayload: array wraps row", () => {
  const r = { id: "a", line_user_id: "U1", status: "sending" };
  assert.deepEqual(normalizeClaimNextOutboundRpcPayload([r]), r);
});

test("normalizeClaimNextOutboundRpcPayload: unwrap single-key wrapper", () => {
  const inner = { id: "x", line_user_id: "U", status: "queued" };
  const wrapped = { claim_next_outbound_message: inner };
  assert.deepEqual(normalizeClaimNextOutboundRpcPayload(wrapped), inner);
});

test("normalizeClaimNextOutboundRpcPayload: all-null composite → null (empty queue)", () => {
  const row = {
    id: null,
    line_user_id: null,
    status: null,
    kind: null,
    payload_json: null,
  };
  assert.equal(isAllNullishCompositeRecord(row), true);
  assert.equal(normalizeClaimNextOutboundRpcPayload(row), null);
  assert.equal(
    normalizeClaimNextOutboundRpcPayload({
      claim_next_outbound_message: row,
    }),
    null,
  );
});

test("isOutboundClaimRowEffectivelyEmpty: PG all-null composite", () => {
  const row = {
    id: null,
    line_user_id: null,
    status: null,
    kind: null,
    payload_json: null,
  };
  const picked = pickOutboundClaimFields(row);
  assert.equal(isOutboundClaimRowEffectivelyEmpty(row, picked), true);
});

test("isOutboundClaimRowEffectivelyEmpty: valid row", () => {
  const row = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    line_user_id: "Uabc",
    status: "sending",
    kind: "scan_result",
  };
  const picked = pickOutboundClaimFields(row);
  assert.equal(isOutboundClaimRowEffectivelyEmpty(row, picked), false);
});

test("pickOutboundClaimFields: camelCase fallback", () => {
  const row = {
    id: "550e8400-e29b-41d4-a716-446655440001",
    lineUserId: "Ux",
    status: "queued",
  };
  const p = pickOutboundClaimFields(row);
  assert.equal(p.line_user_id, "Ux");
});

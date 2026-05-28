import test from "node:test";
import assert from "node:assert/strict";
import { SignatureValidationFailed } from "@line/bot-sdk";
import {
  isLineSignatureError,
  lineWebhookErrorHandler,
} from "../src/middleware/lineWebhookError.middleware.js";

test("isLineSignatureError detects SignatureValidationFailed", () => {
  const err = new SignatureValidationFailed("bad", "sig");
  assert.equal(isLineSignatureError(err), true);
});

test("isLineSignatureError detects message fallback", () => {
  assert.equal(isLineSignatureError(new Error("no signature")), true);
});

test("lineWebhookErrorHandler returns 401 JSON for signature errors", () => {
  const err = new SignatureValidationFailed("missing", "");
  let statusCode = 0;
  let body = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
    },
  };
  let passed = false;
  lineWebhookErrorHandler(err, { path: "/webhook/line" }, res, () => {
    passed = true;
  });
  assert.equal(passed, false);
  assert.equal(statusCode, 401);
  assert.deepEqual(body, { ok: false, error: "invalid_line_signature" });
});

test("lineWebhookErrorHandler forwards unknown errors", () => {
  const err = new Error("other");
  let passed = false;
  lineWebhookErrorHandler(err, { path: "/x" }, {}, () => {
    passed = true;
  });
  assert.equal(passed, true);
});

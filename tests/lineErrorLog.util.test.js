import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeLineErrorSafe } from "../src/utils/lineErrorLog.util.js";

test("serializeLineErrorSafe: reads nested originalError.response.data (LINE SDK style)", () => {
  const inner = {
    response: {
      status: 400,
      data: {
        message: "A message (icons) in Flex Message is wrong. For more information, see the Flex Message reference.",
        details: [
          {
            message: "must be greater than or equal to 0, less than or equal to 3",
            property: "/contents/0/contents/body/contents/4/contents/1/flex",
          },
        ],
      },
    },
  };
  const err = /** @type {Error & { originalError?: unknown }} */ (
    new Error("Request failed with status code 400")
  );
  err.originalError = inner;

  const s = serializeLineErrorSafe(err);
  assert.equal(s.status, 400);
  assert.equal(
    s.lineApiDetailProperty,
    "/contents/0/contents/body/contents/4/contents/1/flex",
  );
  assert.ok(String(s.lineApiDetailMessage || "").includes("less than or equal to 3"));
});

test("serializeLineErrorSafe: string response body", () => {
  const err = {
    message: "fail",
    response: { status: 400, data: '{"message":"x"}'.repeat(20) },
  };
  const s = serializeLineErrorSafe(err);
  assert.equal(s.status, 400);
  assert.equal(typeof s.responseData, "string");
  assert.ok(String(s.responseData).length <= 801);
});

import test from "node:test";
import assert from "node:assert/strict";
test("fixture: passing leaf", () => { assert.equal(1, 1); });
test("fixture: failing leaf", () => { assert.equal(1, 2); });

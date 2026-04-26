import test from "node:test";
import assert from "node:assert/strict";
import { isSupabaseStorageObjectAlreadyRemovedError } from "../../src/utils/storage/supabaseStorageRemove.util.js";

test("isSupabaseStorageObjectAlreadyRemovedError: 404 status", () => {
  assert.equal(isSupabaseStorageObjectAlreadyRemovedError({ statusCode: 404 }), true);
  assert.equal(isSupabaseStorageObjectAlreadyRemovedError({ status: 404 }), true);
});

test("isSupabaseStorageObjectAlreadyRemovedError: message heuristics", () => {
  assert.equal(
    isSupabaseStorageObjectAlreadyRemovedError({
      message: "Object not found",
    }),
    true,
  );
  assert.equal(
    isSupabaseStorageObjectAlreadyRemovedError({ message: "The resource was not found" }),
    true,
  );
  assert.equal(
    isSupabaseStorageObjectAlreadyRemovedError({ message: "permission denied" }),
    false,
  );
});

test("isSupabaseStorageObjectAlreadyRemovedError: null", () => {
  assert.equal(isSupabaseStorageObjectAlreadyRemovedError(null), false);
});

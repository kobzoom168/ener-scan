import test from "node:test";
import assert from "node:assert/strict";
import { parseSupabasePublicObjectUrl } from "../../src/utils/storage/supabasePublicStorageUrl.util.js";

test("parseSupabasePublicObjectUrl: extracts bucket and path", () => {
  const u =
    "https://abc.supabase.co/storage/v1/object/public/payment-slips/U123/pid/msg.jpg";
  const p = parseSupabasePublicObjectUrl(u);
  assert.deepEqual(p, { bucket: "payment-slips", path: "U123/pid/msg.jpg" });
});

test("parseSupabasePublicObjectUrl: strips query string", () => {
  const u =
    "https://x.supabase.co/storage/v1/object/public/bucket/folder/a.png?v=1";
  const p = parseSupabasePublicObjectUrl(u);
  assert.equal(p?.bucket, "bucket");
  assert.equal(p?.path, "folder/a.png");
});

test("parseSupabasePublicObjectUrl: null on invalid", () => {
  assert.equal(parseSupabasePublicObjectUrl(""), null);
  assert.equal(parseSupabasePublicObjectUrl("https://example.com/a.jpg"), null);
});

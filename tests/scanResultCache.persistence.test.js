import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldPersistDominantColorForCache,
  cacheRowHasPersistedObjectCategory,
  cacheRowHasPersistedDominantColor,
} from "../src/stores/scanResultCache.db.js";

test("shouldPersistDominantColorForCache: vision_v1 + non-unknown slug", () => {
  assert.equal(shouldPersistDominantColorForCache("Gold", "vision_v1"), true);
});

test("shouldPersistDominantColorForCache: rejects unknown slug", () => {
  assert.equal(shouldPersistDominantColorForCache("unknown", "vision_v1"), false);
  assert.equal(shouldPersistDominantColorForCache("UNKNOWN", "vision_v1"), false);
});

test("shouldPersistDominantColorForCache: rejects non-vision source", () => {
  assert.equal(shouldPersistDominantColorForCache("red", "pipeline_opts"), false);
  assert.equal(shouldPersistDominantColorForCache("red", null), false);
});

test("cacheRowHasPersistedObjectCategory: empty / legacy row", () => {
  assert.equal(cacheRowHasPersistedObjectCategory(null), false);
  assert.equal(cacheRowHasPersistedObjectCategory({}), false);
  assert.equal(
    cacheRowHasPersistedObjectCategory({
      object_category: null,
    }),
    false,
  );
  assert.equal(
    cacheRowHasPersistedObjectCategory({
      object_category: " พระเครื่อง ",
    }),
    true,
  );
});

test("cacheRowHasPersistedDominantColor: requires vision_v1 + not unknown", () => {
  assert.equal(
    cacheRowHasPersistedDominantColor({
      dominant_color: "gold",
      dominant_color_source: "vision_v1",
    }),
    true,
  );
  assert.equal(
    cacheRowHasPersistedDominantColor({
      dominant_color: "unknown",
      dominant_color_source: "vision_v1",
    }),
    false,
  );
  assert.equal(
    cacheRowHasPersistedDominantColor({
      dominant_color: "gold",
      dominant_color_source: null,
    }),
    false,
  );
  assert.equal(
    cacheRowHasPersistedDominantColor({
      result_text: "โทนสีทองจากข้อความ",
    }),
    false,
  );
});

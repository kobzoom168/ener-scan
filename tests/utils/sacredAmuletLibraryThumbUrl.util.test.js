import test from "node:test";
import assert from "node:assert/strict";
import { resolveSacredAmuletLibraryThumbUrl } from "../../src/utils/reports/sacredAmuletLibraryThumbUrl.util.js";

test("resolveSacredAmuletLibraryThumbUrl: prefers HTTPS thumbnail over object URL", () => {
  const out = resolveSacredAmuletLibraryThumbUrl(
    "https://cdn.example/thumb.webp",
    "https://report.example/object.jpg",
    () => "",
  );
  assert.equal(out, "https://cdn.example/thumb.webp");
});

test("resolveSacredAmuletLibraryThumbUrl: falls back to object when no thumbnail_path", () => {
  const out = resolveSacredAmuletLibraryThumbUrl(null, "https://report.example/object.jpg", () => "");
  assert.equal(out, "https://report.example/object.jpg");
});

test("resolveSacredAmuletLibraryThumbUrl: storage path uses pathToPublicUrl", () => {
  const out = resolveSacredAmuletLibraryThumbUrl(
    "Uabc/uuid-here/thumb.webp",
    "https://report.example/object.jpg",
    (p) => `https://sb.test/storage/${p}`,
  );
  assert.equal(out, "https://sb.test/storage/Uabc/uuid-here/thumb.webp");
});

test("resolveSacredAmuletLibraryThumbUrl: empty thumbnail + bad publicUrl falls back to object", () => {
  const out = resolveSacredAmuletLibraryThumbUrl(
    "relative/path.webp",
    "https://report.example/object.jpg",
    () => "",
  );
  assert.equal(out, "https://report.example/object.jpg");
});

test("resolveSacredAmuletLibraryThumbUrl: original_deleted scenario — DB thumb path wins over stale object URL", () => {
  const thumbPublic = resolveSacredAmuletLibraryThumbUrl(
    "user1/upload-1/thumb.webp",
    "https://deleted-bucket/original.jpg",
    () => "https://keep.example/user1/upload-1/thumb.webp",
  );
  assert.equal(thumbPublic, "https://keep.example/user1/upload-1/thumb.webp");
});

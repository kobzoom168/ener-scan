import test from "node:test";
import assert from "node:assert/strict";
import { resolveSacredAmuletLibraryThumbUrl } from "../../src/utils/reports/sacredAmuletLibraryThumbUrl.util.js";

test("resolveSacredAmuletLibraryThumbUrl: full-URL thumbnail wins over object", async () => {
  const out = await resolveSacredAmuletLibraryThumbUrl(
    "https://cdn.example/thumb.webp",
    "https://report.example/object.jpg",
    {},
  );
  assert.equal(out, "https://cdn.example/thumb.webp");
});

test("resolveSacredAmuletLibraryThumbUrl: no thumbnail_path → objectImageUrl", async () => {
  const out = await resolveSacredAmuletLibraryThumbUrl(
    null,
    "https://report.example/object.jpg",
    {},
  );
  assert.equal(out, "https://report.example/object.jpg");
});

test("resolveSacredAmuletLibraryThumbUrl: storage path + signed success → signed URL", async () => {
  const out = await resolveSacredAmuletLibraryThumbUrl(
    "Uabc/uuid-here/thumb.webp",
    "https://report.example/object.jpg",
    {
      createSignedUrlForPath: async () => "https://signed.example/v1/token",
    },
  );
  assert.equal(out, "https://signed.example/v1/token");
});

test("resolveSacredAmuletLibraryThumbUrl: storage path + signed fail → objectImageUrl", async () => {
  const out = await resolveSacredAmuletLibraryThumbUrl(
    "Uabc/uuid-here/thumb.webp",
    "https://report.example/object.jpg",
    {
      createSignedUrlForPath: async () => "",
    },
  );
  assert.equal(out, "https://report.example/object.jpg");
});

test("resolveSacredAmuletLibraryThumbUrl: signed fail + no object → empty", async () => {
  const out = await resolveSacredAmuletLibraryThumbUrl(
    "path/thumb.webp",
    "",
    { createSignedUrlForPath: async () => "" },
  );
  assert.equal(out, "");
});

test("resolveSacredAmuletLibraryThumbUrl: original_deleted scenario — signed thumb wins", async () => {
  const out = await resolveSacredAmuletLibraryThumbUrl(
    "user1/upload-1/thumb.webp",
    "https://deleted-bucket/original.jpg",
    {
      createSignedUrlForPath: async () => "https://keep.example/signed",
    },
  );
  assert.equal(out, "https://keep.example/signed");
});

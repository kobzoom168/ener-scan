import test from "node:test";
import assert from "node:assert/strict";
import { ensureScanUploadThumbnail } from "../../src/services/scanV2/scanUploadThumbnail.service.js";

test("ensureScanUploadThumbnail: skips when thumbnail_path already set", async () => {
  let uploadCalls = 0;
  let updateCalls = 0;
  const path = await ensureScanUploadThumbnail({
    upload: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      thumbnail_path: "u1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/thumb.webp",
      storage_path: "orig.bin",
    },
    lineUserId: "Uline",
    imageBuffer: Buffer.from("fake-image"),
    deps: {
      encodeWebp: async () => Buffer.from("webp"),
      uploadThumbnail: async () => {
        uploadCalls += 1;
        return { path: "x" };
      },
      updateThumbnailPath: async () => {
        updateCalls += 1;
      },
    },
  });
  assert.equal(
    path,
    "u1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/thumb.webp",
  );
  assert.equal(uploadCalls, 0);
  assert.equal(updateCalls, 0);
});

test("ensureScanUploadThumbnail: encodes, uploads, updates DB", async () => {
  let updatedId = "";
  let updatedPath = "";
  const upload = {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    thumbnail_path: null,
    storage_path: "Uline/msg-1.bin",
  };
  const path = await ensureScanUploadThumbnail({
    upload,
    lineUserId: "Uline",
    imageBuffer: Buffer.from("fake-image"),
    deps: {
      encodeWebp: async () => Buffer.from("webp-bytes"),
      uploadThumbnail: async ({ lineUserId, uploadId, buffer }) => {
        assert.equal(lineUserId, "Uline");
        assert.equal(uploadId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        assert.ok(Buffer.isBuffer(buffer));
        return { path: "Uline/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/thumb.webp" };
      },
      updateThumbnailPath: async (id, p) => {
        updatedId = id;
        updatedPath = p;
      },
    },
  });
  assert.equal(path, "Uline/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/thumb.webp");
  assert.equal(updatedId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  assert.equal(updatedPath, "Uline/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/thumb.webp");
});

test("ensureScanUploadThumbnail: returns null on encode failure without throwing", async () => {
  const path = await ensureScanUploadThumbnail({
    upload: {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      thumbnail_path: null,
      storage_path: "x",
    },
    lineUserId: "U1",
    imageBuffer: Buffer.from("x"),
    deps: {
      encodeWebp: async () => {
        throw new Error("sharp fail");
      },
    },
  });
  assert.equal(path, null);
});

import crypto from "node:crypto";
const mem = new Map();
export async function uploadScanImageToStorage({ lineUserId, lineMessageId, buffer, mimeType = "image/jpeg" }) {
  const path = `it/${lineUserId}/${lineMessageId}.jpg`;
  mem.set(path, Buffer.from(buffer));
  return { bucket: "it-bucket", path, mimeType, sizeBytes: buffer.length, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
}
export async function readScanImageFromStorage(bucket, path) {
  const b = mem.get(path); if (!b) throw new Error("fake_storage_missing:" + path); return b;
}
export async function uploadScanUploadThumbnail({ uploadId }) {
  return { bucket: "it-bucket", path: `thumb/${uploadId}.webp`, contentType: "image/webp", sizeBytes: 1 };
}

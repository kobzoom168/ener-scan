import crypto from "crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_ENABLED } from "../config/s3Storage.js";
import { env } from "../config/env.js";

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function s3Upload(bucket, key, body, contentType) {
  await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

async function s3Download(bucket, key) {
  const res = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * @param {object} opts
 * @param {string} opts.lineUserId
 * @param {string} opts.lineMessageId
 * @param {Buffer} opts.buffer
 * @param {string} [opts.mimeType]
 * @returns {Promise<{ bucket: string, path: string, mimeType: string, sizeBytes: number, sha256: string }>}
 */
export async function uploadScanImageToStorage({ lineUserId, lineMessageId, buffer, mimeType = "image/jpeg" }) {
  const bucket = env.SCAN_V2_UPLOAD_BUCKET;
  const uid = String(lineUserId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "unknown";
  const mid = String(lineMessageId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "msg";
  const path = `${uid}/${mid}-${Date.now()}.bin`;
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  if (!S3_ENABLED) throw new Error("S3_not_configured");
  await s3Upload(bucket, path, body, mimeType);

  return { bucket, path, mimeType, sizeBytes: body.length, sha256: sha256Hex(body) };
}

/**
 * @param {string} bucket
 * @param {string} path
 * @returns {Promise<Buffer>}
 */
export async function readScanImageFromStorage(bucket, path) {
  const b = bucket || env.SCAN_V2_UPLOAD_BUCKET;
  if (!S3_ENABLED) throw new Error("S3_not_configured");
  return s3Download(b, path);
}

/**
 * @param {object} opts
 * @param {string} opts.lineUserId
 * @param {string} opts.uploadId
 * @param {Buffer} opts.buffer
 * @param {string} [opts.contentType]
 * @returns {Promise<{ bucket: string, path: string, contentType: string, sizeBytes: number }>}
 */
export async function uploadScanUploadThumbnail({ lineUserId, uploadId, buffer, contentType = "image/webp" }) {
  const bucket = env.SCAN_V2_UPLOAD_BUCKET;
  const uid = String(lineUserId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "unknown";
  const up = String(uploadId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "up";
  const path = `${uid}/${up}/thumb.webp`;
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  if (!S3_ENABLED) throw new Error("S3_not_configured");
  await s3Upload(bucket, path, body, contentType);

  return { bucket, path, contentType, sizeBytes: body.length };
}

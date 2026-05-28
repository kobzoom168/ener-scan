import crypto from "crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_ENABLED } from "../config/s3Storage.js";
import { supabase } from "../config/supabaseStorage.js";
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

  if (S3_ENABLED) {
    await s3Upload(bucket, path, body, mimeType);
  } else {
    const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: mimeType, upsert: false });
    if (error) {
      console.error(JSON.stringify({ event: "SCAN_V2_STORAGE_UPLOAD_FAILED", bucket, pathPrefix: path.slice(0, 48), message: error.message }));
      throw error;
    }
  }

  return { bucket, path, mimeType, sizeBytes: body.length, sha256: sha256Hex(body) };
}

/**
 * @param {string} bucket
 * @param {string} path
 * @returns {Promise<Buffer>}
 */
export async function readScanImageFromStorage(bucket, path) {
  const b = bucket || env.SCAN_V2_UPLOAD_BUCKET;
  if (S3_ENABLED) {
    return s3Download(b, path);
  }
  const { data, error } = await supabase.storage.from(b).download(path);
  if (error) throw error;
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
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

  if (S3_ENABLED) {
    await s3Upload(bucket, path, body, contentType);
  } else {
    const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: true });
    if (error) {
      console.error(JSON.stringify({ event: "SCAN_V2_THUMB_STORAGE_UPLOAD_FAILED", bucket, pathPrefix: path.slice(0, 64), message: error.message }));
      throw error;
    }
  }

  return { bucket, path, contentType, sizeBytes: body.length };
}

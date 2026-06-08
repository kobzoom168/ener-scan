/**
 * migrate-storage-to-r2.mjs
 *
 * Copies every file from Supabase Storage buckets into the equivalent
 * Cloudflare R2 buckets the local stack already serves from.
 *
 * Idempotent: skips objects that already exist in R2 (HEAD check), so it can
 * be safely re-run / resumed if interrupted.
 *
 * Run inside ener-scan container:
 *   docker compose exec ener-scan node /app/scripts/migrate-storage-to-r2.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// Load .env
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 1 || line.startsWith("#")) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const S3_ENDPOINT = process.env.S3_ENDPOINT_URL;
const S3_REGION = process.env.S3_REGION || "auto";
const S3_KEY = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET = process.env.S3_SECRET_ACCESS_KEY;
if (!S3_ENDPOINT || !S3_KEY || !S3_SECRET) { console.error("Missing S3_ENDPOINT_URL / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: { accessKeyId: S3_KEY, secretAccessKey: S3_SECRET },
  forcePathStyle: true, // required for Cloudflare R2
});

// ---------------------------------------------------------------------------
// Supabase bucket -> destination R2 bucket (mirrors the names the running
// app already reads/writes via SCAN_V2_UPLOAD_BUCKET / SCAN_OBJECT_IMAGE_BUCKET
// / PAYMENT_SLIP_BUCKET; video-assets has no app-side mapping, copy 1:1)
// ---------------------------------------------------------------------------
const BUCKET_MAP = {
  "scan-uploads": process.env.SCAN_V2_UPLOAD_BUCKET || "scan-uploads",
  "scan-object-images": process.env.SCAN_OBJECT_IMAGE_BUCKET || "scan-object-images",
  "payment-slips": process.env.PAYMENT_SLIP_BUCKET || "payment-slips",
  "video-assets": "video-assets",
};

// ---------------------------------------------------------------------------
// Recursively list every leaf object under a Supabase Storage bucket
// (list() only returns one folder level at a time; folders show up with id=null)
// ---------------------------------------------------------------------------
async function listAllFiles(bucket, prefix = "") {
  const out = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) { console.error(`\n  [LIST ERROR] ${bucket}/${prefix}: ${error.message}`); return out; }
  for (const item of data || []) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      out.push(...(await listAllFiles(bucket, fullPath)));
    } else {
      out.push({ path: fullPath, contentType: item.metadata?.mimetype || null });
    }
  }
  return out;
}

async function existsInR2(bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function r2BucketExists(bucket) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}

async function migrateBucket(supaBucket, r2Bucket) {
  console.log(`\n=== ${supaBucket}  ->  r2:${r2Bucket} ===`);

  if (!(await r2BucketExists(r2Bucket))) {
    console.log(`  [SKIP] destination bucket "${r2Bucket}" does not exist on R2 — create it first, then re-run`);
    return { bucket: supaBucket, r2Bucket, skippedBucket: true, total: 0, copied: 0, skipped: 0, errors: 0 };
  }

  const files = await listAllFiles(supaBucket);
  console.log(`  found ${files.length} files in Supabase`);

  let copied = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    process.stdout.write(`  [${i + 1}/${files.length}] copied=${copied} skipped=${skipped} errors=${errors}\r`);

    if (await existsInR2(r2Bucket, f.path)) { skipped += 1; continue; }

    try {
      const { data, error } = await supabase.storage.from(supaBucket).download(f.path);
      if (error || !data) {
        errors += 1;
        console.error(`\n  [DOWNLOAD ERROR] ${f.path}: ${error?.message || "no data"}`);
        continue;
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      await s3.send(new PutObjectCommand({
        Bucket: r2Bucket,
        Key: f.path,
        Body: buffer,
        ContentType: f.contentType || data.type || "application/octet-stream",
      }));
      copied += 1;
    } catch (e) {
      errors += 1;
      console.error(`\n  [ERROR] ${f.path}: ${String(e?.message || e).slice(0, 150)}`);
    }
  }

  console.log(`\n  [${errors === 0 ? "OK" : "PARTIAL"}] copied=${copied} skipped(existing)=${skipped} errors=${errors}`);
  return { bucket: supaBucket, r2Bucket, total: files.length, copied, skipped, errors };
}

// ---------------------------------------------------------------------------
const summary = [];
for (const [supaBucket, r2Bucket] of Object.entries(BUCKET_MAP)) {
  try {
    summary.push(await migrateBucket(supaBucket, r2Bucket));
  } catch (e) {
    console.error(`\n[FATAL] ${supaBucket}: ${e.message}`);
    summary.push({ bucket: supaBucket, r2Bucket, error: e.message });
  }
}

console.log("\n\n========== STORAGE MIGRATION SUMMARY ==========");
for (const s of summary) {
  if (s.error) {
    console.log(`❌ ${s.bucket.padEnd(20)} fatal: ${s.error}`);
  } else if (s.skippedBucket) {
    console.log(`⚪ ${s.bucket.padEnd(20)} -> ${s.r2Bucket.padEnd(20)} destination bucket missing — skipped`);
  } else {
    const icon = s.errors === 0 ? "✅" : "⚠️ ";
    console.log(`${icon} ${s.bucket.padEnd(20)} -> ${s.r2Bucket.padEnd(20)} total=${s.total} copied=${s.copied} skipped=${s.skipped} errors=${s.errors}`);
  }
}
console.log("================================================\n");

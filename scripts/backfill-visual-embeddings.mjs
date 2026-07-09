/**
 * One-off: backfill DINOv2 visual embeddings for existing global_object_baselines
 * rows (visual_embedding is null, thumbnail available). Run inside a stack
 * container so env/storage/postgrest are wired:
 *   docker exec ener-scan-staging-worker-scan node scripts/backfill-visual-embeddings.mjs
 */
import { supabase } from "../src/config/supabase.js";
import { env } from "../src/config/env.js";
import { readScanImageFromStorage } from "../src/storage/scanUploadStorage.js";
import { visionEmbedImage } from "../src/services/scanV2/visionSidecar.client.js";
import { updateGlobalObjectBaselineVisualEmbedding } from "../src/stores/scanV2/globalObjectBaselines.db.js";

const { data, error } = await supabase
  .from("global_object_baselines")
  .select("id, thumbnail_path")
  .is("visual_embedding", null)
  .not("thumbnail_path", "is", null)
  .limit(2000);

if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}

let ok = 0;
let fail = 0;
for (const row of data || []) {
  try {
    const buf = await readScanImageFromStorage(env.SCAN_V2_UPLOAD_BUCKET, row.thumbnail_path);
    if (!Buffer.isBuffer(buf) || !buf.length) throw new Error("empty_thumbnail");
    const emb = await visionEmbedImage(buf.toString("base64"));
    if (!emb) throw new Error("sidecar_embed_failed");
    await updateGlobalObjectBaselineVisualEmbedding(String(row.id), emb.embedding, emb.model);
    ok++;
    if (ok % 25 === 0) console.log(`progress: ${ok} embedded`);
  } catch (e) {
    fail++;
    console.error(`row ${String(row.id).slice(0, 8)}: ${String(e?.message || e).slice(0, 100)}`);
  }
}
console.log(`done: embedded=${ok} failed=${fail} total=${(data || []).length}`);
process.exit(0);

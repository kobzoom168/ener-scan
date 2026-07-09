/**
 * คลังพิมพ์พระ — scan-time matcher: DINOv2 embedding of the new photo vs
 * กบ-confirmed example images. A strong, unambiguous match overrides the LLM
 * classifier's label; anything weaker keeps the neutral headline.
 *
 * Decision (tunable via env):
 *   top similarity ≥ AMULET_TYPE_REF_MIN_SIM (default 0.74)
 *   AND (no second type OR top − best-other-type ≥ AMULET_TYPE_REF_MARGIN 0.04)
 */
import { env } from "../../config/env.js";
import { visionEmbedImage } from "./visionSidecar.client.js";
import { matchAmuletTypeExamples } from "../../stores/amuletTypeRefs.db.js";
import { scanV2TraceTs, idPrefix8 } from "../../utils/scanV2Trace.util.js";

/**
 * @param {{ imageBase64: string, jobId?: string }} p
 * @returns {Promise<{ labelThai: string, typeKey: string, similarity: number } | null>}
 */
export async function matchAmuletTypeByExamples(p) {
  if (!env.AMULET_TYPE_REF_MATCH_ENABLED) return null;
  try {
    const emb = await visionEmbedImage(String(p.imageBase64 || ""));
    if (!emb) return null;
    const hits = await matchAmuletTypeExamples(emb.embedding, 8);
    if (!hits.length) return null;

    const top = hits[0];
    const topSim = Number(top.similarity) || 0;
    const bestOther = hits.find((h) => h.type_key !== top.type_key);
    const margin = bestOther ? topSim - (Number(bestOther.similarity) || 0) : 1;

    const accepted =
      topSim >= env.AMULET_TYPE_REF_MIN_SIM && margin >= env.AMULET_TYPE_REF_MARGIN;

    console.log(
      JSON.stringify({
        event: "AMULET_TYPE_REF_MATCH",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId || ""),
        topType: top.type_key,
        topSim: topSim.toFixed(3),
        margin: margin.toFixed(3),
        accepted,
        timestamp: scanV2TraceTs(),
      }),
    );

    if (!accepted) return null;
    const labelThai = String(top.label_thai || "").trim();
    if (!labelThai) return null;
    return { labelThai, typeKey: top.type_key, similarity: topSim };
  } catch {
    return null;
  }
}

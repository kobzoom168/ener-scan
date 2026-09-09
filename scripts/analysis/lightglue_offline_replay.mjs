/**
 * Cost Rescue Week 2 — LightGlue offline shadow replay (Codex spec, read-only)
 *
 * รัน "นอก request path" (docker exec, concurrency=1): เอาคู่ (รูปงานลูกค้า, thumbnail candidate)
 * ที่ LLM verifier เคยตัดสินแล้วในหน้าต่างวัด มา match ด้วย LightGlue sidecar เพื่อเทียบ
 * — ไม่เรียก external LLM · ไม่แตะ production decision · ใช้ LLM verdict ที่บันทึกแล้วเป็น
 *   comparator เท่านั้น (ไม่ใช่ ground truth)
 * — จำแนก: high_same (inliers ≥ accept) / ambiguous (arbiter band) / insufficient_geometry
 *   (ต่ำกว่า band — **ห้ามตีเป็น different**) / unusable (โหลดรูป/match ไม่ได้)
 * — output aggregate ต่อคู่: id prefix + ตัวเลขเท่านั้น (ไม่มีรูป/UID/prompt)
 *
 * Usage (ใน container pro worker):
 *   node scripts/analysis/lightglue_offline_replay.mjs --pairs pairs.json --out replay.jsonl [--limit N]
 *   node scripts/analysis/lightglue_offline_replay.mjs --selftest   (hermetic, no network)
 */
import { readFileSync, appendFileSync, existsSync } from "node:fs";

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--selftest") a.selftest = true;
    else if (k === "--pairs") a.pairs = argv[++i];
    else if (k === "--out") a.out = argv[++i];
    else if (k === "--limit") a.limit = Number(argv[++i]);
    else if (k === "--help") a.help = true;
  }
  return a;
}

export function classify(m, acceptInliers, arbiterMin) {
  if (!m || !Number.isFinite(Number(m.inliers))) return "unusable";
  const inl = Number(m.inliers);
  if (inl >= acceptInliers) return "high_same";
  if (inl >= arbiterMin) return "ambiguous";
  return "insufficient_geometry"; // ห้ามตีเป็น different (มุม/หน้า-หลัง/คุณภาพต่ำ)
}

export async function runReplay({ pairs, deps, out, limit }) {
  const {
    acceptInliers, arbiterMin, resolveJobImage, resolveCandidateThumb, matchPair, log = () => {},
  } = deps;
  const summary = { total: 0, done: 0, unusable: 0, high_same: 0, ambiguous: 0, insufficient_geometry: 0,
                    agree_same: 0, disagree_llm_diff_geo_same: 0, geo_same_llm_same: 0, ms_total: 0 };
  const list = limit ? pairs.slice(0, limit) : pairs;
  for (const p of list) {
    summary.total += 1;
    const { jobImagePath: _jp, candThumbPath: _cp, ...pub } = p;
    let rec = { ...pub };
    try {
      const [imgB64, candB64] = [await resolveJobImage(p.jobIdPrefix, p), await resolveCandidateThumb(p.candidateIdPrefix, p)];
      if (!imgB64 || !candB64) {
        rec.cls = "unusable";
        rec.reason = !imgB64 ? "no_job_image" : "no_candidate_thumb";
      } else {
        const t = Date.now();
        const m = await matchPair(candB64, imgB64); // concurrency 1 โดยโครงสร้าง (await ทีละคู่)
        rec.ms = Date.now() - t;
        summary.ms_total += rec.ms;
        rec.inliers = m?.inliers ?? null;
        rec.rawMatches = m?.raw_matches ?? null;
        rec.cls = classify(m, acceptInliers, arbiterMin);
      }
    } catch (e) {
      rec.cls = "unusable";
      rec.reason = String(e?.message || e).slice(0, 80);
    }
    summary[rec.cls] = (summary[rec.cls] || 0) + 1;
    summary.done += 1;
    if (rec.cls === "high_same" && p.llmSame) summary.geo_same_llm_same += 1;
    if (rec.cls === "high_same" && !p.llmSame) summary.disagree_llm_diff_geo_same += 1;
    if (out) appendFileSync(out, JSON.stringify(rec) + "\n");
    log(summary.done, rec.cls);
  }
  return summary;
}

async function realDeps() {
  const ROOT = process.env.ENER_APP_ROOT || "/app"; // รันจาก /tmp ใน container ได้
  const { env } = await import(`${ROOT}/src/config/env.js`);
    const { readScanImageFromStorage } = await import(`${ROOT}/src/storage/scanUploadStorage.js`);
  const { visionMatchPair } = await import(`${ROOT}/src/services/scanV2/visionSidecar.client.js`);
  return {
    acceptInliers: env.VISION_REID_INLIERS_ACCEPT,
    arbiterMin: env.VISION_REID_INLIERS_ARBITER_MIN,
    matchPair: visionMatchPair,
    // path มากับไฟล์คู่ (เตรียมจาก psql ล่วงหน้า) — runner ไม่แตะ DB (uuid like ใช้ไม่ได้บน PostgREST)
    async resolveJobImage(jobIdPrefix, pair) {
      const path = pair?.jobImagePath;
      if (!path) return null;
      const buf = await readScanImageFromStorage(env.SCAN_V2_UPLOAD_BUCKET, path);
      return Buffer.isBuffer(buf) && buf.length ? buf.toString("base64") : null;
    },
    async resolveCandidateThumb(candidateIdPrefix, pair) {
      const path = pair?.candThumbPath;
      if (!path) return null;
      const buf = await readScanImageFromStorage(env.SCAN_V2_UPLOAD_BUCKET, path);
      return Buffer.isBuffer(buf) && buf.length ? buf.toString("base64") : null;
    },
    log: (n, cls) => { if (n % 25 === 0) console.error(`[replay] ${n} done (${cls})`); },
  };
}

async function selftest() {
  // hermetic: fake deps ไม่มี network — พิสูจน์ classify + สรุป + ห้ามตี different
  const pairs = [
    { jobIdPrefix: "j1", candidateIdPrefix: "c1", llmSame: true },   // geometry same → agree
    { jobIdPrefix: "j2", candidateIdPrefix: "c2", llmSame: false },  // geometry same แต่ LLM ว่า diff → disagreement (เสี่ยง false reuse)
    { jobIdPrefix: "j3", candidateIdPrefix: "c3", llmSame: false },  // ambiguous
    { jobIdPrefix: "j4", candidateIdPrefix: "c4", llmSame: false },  // ต่ำ → insufficient_geometry (ไม่ใช่ different)
    { jobIdPrefix: "j5", candidateIdPrefix: "c5", llmSame: false },  // โหลดรูปไม่ได้ → unusable
  ];
  const inl = { j1: 40, j2: 33, j3: 15, j4: 3 };
  let cur = null; // matchPair รู้ว่าคู่ไหนผ่าน job ล่าสุดที่ resolve
  const deps = {
    acceptInliers: 25, arbiterMin: 12,
    resolveJobImage: async (j) => { cur = j; return j === "j5" ? null : "imgb64"; },
    resolveCandidateThumb: async () => "candb64",
    matchPair: async () => ({ inliers: inl[cur], raw_matches: 50 }),
  };
  const s = await runReplay({ pairs, deps });
  const assert = (c, m) => { if (!c) { console.error("SELFTEST_FAIL " + m); process.exit(1); } };
  assert(s.total === 5 && s.done === 5, "total/done");
  assert(s.high_same === 2 && s.ambiguous === 1 && s.insufficient_geometry === 1 && s.unusable === 1, "classes");
  assert(s.geo_same_llm_same === 1, "agree");
  assert(s.disagree_llm_diff_geo_same === 1, "disagreement ต้องถูกนับเป็นความเสี่ยง");
  assert(!("different" in s), "ห้ามมี class different");
  console.log("SELFTEST_OK classify/summary/no-different/hermetic");
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log("--pairs <json> --out <jsonl> [--limit N] | --selftest");
} else if (args.selftest) {
  await selftest();
} else if (args.pairs) {
  const pairs = JSON.parse(readFileSync(args.pairs, "utf8"));
  const deps = await realDeps();
  const summary = await runReplay({ pairs, deps, out: args.out, limit: args.limit });
  console.log(JSON.stringify(summary));
}

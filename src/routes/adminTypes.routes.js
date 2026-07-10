/**
 * /admin/types — คลังพิมพ์พระ: curated example images per amulet type.
 * Add examples 3 ways: upload / pick from scan library / system-suggest + approve.
 * Scan-time matching lives in amuletTypeExampleMatch.service.js.
 */
import express from "express";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAdminSession } from "../middleware/requireAdmin.js";
import { s3Client } from "../config/s3Storage.js";
import { env } from "../config/env.js";
import {
  listAmuletTypes,
  createAmuletType,
  setAmuletTypeEnabled,
  deleteAmuletType,
  listExamplesForType,
  addTypeExample,
  deleteTypeExample,
} from "../stores/amuletTypeRefs.db.js";
import { supabase } from "../config/supabase.js";
import { visionEmbedImage } from "../services/scanV2/visionSidecar.client.js";
import { matchGlobalObjectBaselinesByVisualEmbedding } from "../stores/scanV2/globalObjectBaselines.db.js";
import { createScanUploadBucketSignedUrl } from "../utils/storage/scanUploadStorageSignedUrl.util.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function signedUrlSafe(path) {
  try {
    return path ? String((await createScanUploadBucketSignedUrl(path, 900)) || "") : "";
  } catch {
    return "";
  }
}

/** Average embedding of a type's examples (centroid) for suggestions. */
async function typeCentroid(typeKey) {
  const { data, error } = await supabase
    .from("amulet_type_examples")
    .select("embedding")
    .eq("type_key", String(typeKey))
    .eq("status", "confirmed")
    .limit(50);
  if (error || !Array.isArray(data) || !data.length) return null;
  const vecs = data
    .map((r) => {
      try {
        return typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
      } catch {
        return null;
      }
    })
    .filter((v) => Array.isArray(v) && v.length === 384);
  if (!vecs.length) return null;
  const c = new Array(384).fill(0);
  for (const v of vecs) for (let i = 0; i < 384; i++) c[i] += Number(v[i]);
  let norm = 0;
  for (let i = 0; i < 384; i++) {
    c[i] /= vecs.length;
    norm += c[i] * c[i];
  }
  norm = Math.sqrt(norm) || 1;
  return c.map((x) => x / norm);
}

export default function createAdminTypesRouter() {
  const router = express.Router();
  const jsonBig = express.json({ limit: "10mb" });

  router.get("/admin/types", requireAdminSession, async (req, res) => {
    try {
      const types = await listAmuletTypes();
      const focus = String(req.query.type || types[0]?.type_key || "").trim();
      const focusType = types.find((t) => t.type_key === focus) || null;
      const examples = focusType ? await listExamplesForType(focusType.type_key) : [];
      const exCards = (
        await Promise.all(
          examples.map(async (e) => {
            const url = await signedUrlSafe(e.image_path);
            return `<div class="ex">
              ${url ? `<img src="${esc(url)}" loading="lazy"/>` : `<div class="noimg">ไม่มีรูป</div>`}
              <form method="post" action="/admin/types/example/${esc(e.id)}/delete"><button class="x" onclick="return confirm('ลบตัวอย่างนี้?')">🗑</button></form>
            </div>`;
          }),
        )
      ).join("");

      const tabs = types
        .map(
          (t) =>
            `<a class="tab${t.type_key === focus ? " on" : ""}${t.enabled ? "" : " off"}" href="/admin/types?type=${esc(t.type_key)}">${esc(t.label_thai)}</a>`,
        )
        .join("");

      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(`<!doctype html><html lang="th"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>คลังพิมพ์พระ · Ener Admin</title>
<style>
  :root{--bg:#f6f6f4;--card:#fff;--line:#e2ddd2;--ink:#241c12;--sub:#7a6a58;--gold:#b8871b;--gold-deep:#8f6710}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 "Noto Sans Thai","Sarabun",system-ui,sans-serif;padding:20px;max-width:920px;margin-inline:auto}
  h1{font-size:1.3rem} a{color:var(--gold-deep);text-decoration:none}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:14px}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
  .tab{background:#fff;border:1.5px solid var(--line);border-radius:99px;padding:7px 16px;font-weight:700;color:var(--ink)}
  .tab.on{border-color:var(--gold-deep);color:var(--gold-deep)}
  .tab.off{opacity:.45}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
  .ex{position:relative;border:1px solid var(--line);border-radius:10px;overflow:hidden;aspect-ratio:1}
  .ex img{width:100%;height:100%;object-fit:cover}
  .noimg{display:grid;place-items:center;height:100%;color:var(--sub);font-size:.75rem}
  .ex .x{position:absolute;top:4px;right:4px;border:none;background:rgba(255,255,255,.9);border-radius:7px;padding:2px 6px;cursor:pointer}
  .btn{font:inherit;font-weight:700;border:1px solid var(--line);background:#fff;border-radius:9px;padding:9px 16px;cursor:pointer}
  .btn.gold{background:var(--gold);border-color:var(--gold);color:#fff}
  input,select{font:inherit;border:1px solid var(--line);border-radius:9px;padding:8px 11px}
  .muted{color:var(--sub);font-size:.85rem}
  .row{display:flex;gap:9px;flex-wrap:wrap;align-items:center}
</style></head><body>
<h1>🗂 คลังพิมพ์พระ</h1>
<p class="muted"><a href="/admin/payments">← กลับหน้า admin</a> · ระบบใช้รูปตัวอย่างเทียบตอนลูกค้าส่งรูป — ตรงชัดถึงติดป้ายชื่อ ไม่ตรงขึ้น "พระ / เครื่องราง"</p>

<div class="tabs">${tabs}</div>

<div class="card">
  <form method="post" action="/admin/types/create" class="row">
    <input name="labelThai" placeholder="เพิ่มประเภทใหม่ เช่น พระปิดตาจัมโบ้" required style="flex:1"/>
    <button class="btn gold">➕ เพิ่มประเภท</button>
  </form>
</div>

${
  focusType
    ? `
<div class="card">
  <div class="row" style="justify-content:space-between">
    <b style="font-size:1.15rem">${esc(focusType.label_thai)} <span class="muted">(${examples.length} ตัวอย่าง)</span></b>
    <span class="row">
      <form method="post" action="/admin/types/${esc(focusType.type_key)}/toggle"><button class="btn">${focusType.enabled ? "⏸ ปิดใช้" : "▶️ เปิดใช้"}</button></form>
      <form method="post" action="/admin/types/${esc(focusType.type_key)}/delete"><button class="btn" onclick="return confirm('ลบทั้งประเภทและตัวอย่างทั้งหมด?')">🗑 ลบประเภท</button></form>
    </span>
  </div>
  <p class="muted">แนะนำอย่างน้อย 3-5 รูปต่อประเภท มุม/แสงหลากหลายยิ่งแม่น</p>
  <div class="row" style="margin:9px 0 13px">
    <label class="btn gold" style="cursor:pointer">📤 อัพโหลดรูปตัวอย่าง<input id="up" type="file" accept="image/*" multiple style="display:none"/></label>
    <a class="btn" href="/admin/types/${esc(focusType.type_key)}/library">🔍 เลือกจากคลังสแกน</a>
    <a class="btn" href="/admin/types/${esc(focusType.type_key)}/suggest">✨ ให้ระบบหา (กดอนุมัติ)</a>
  </div>
  <div class="grid">${exCards || '<p class="muted">ยังไม่มีตัวอย่าง</p>'}</div>
</div>
<script>
  const up = document.getElementById("up");
  up && up.addEventListener("change", async () => {
    for (const f of up.files) {
      const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(f); });
      const res = await fetch("/admin/types/${esc(focusType.type_key)}/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageB64: b64 })
      });
      if (!res.ok) { alert("อัพโหลดไม่สำเร็จ: " + f.name); }
    }
    location.reload();
  });
</script>`
    : '<p class="muted">ยังไม่มีประเภท — เพิ่มด้านบนก่อน</p>'
}
</body></html>`);
    } catch (e) {
      res.status(500).send(`โหลดไม่สำเร็จ: ${esc(e?.message)}`);
    }
  });

  router.post("/admin/types/create", requireAdminSession, express.urlencoded({ extended: false }), async (req, res) => {
    try {
      const label = String(req.body.labelThai || "").trim();
      const key = `t${Date.now().toString(36)}`;
      await createAmuletType({ typeKey: key, labelThai: label });
      res.redirect(`/admin/types?type=${key}`);
    } catch (e) {
      res.status(500).send(`เพิ่มไม่สำเร็จ: ${esc(e?.message)}`);
    }
  });

  router.post("/admin/types/:key/toggle", requireAdminSession, async (req, res) => {
    try {
      const types = await listAmuletTypes();
      const t = types.find((x) => x.type_key === req.params.key);
      if (t) await setAmuletTypeEnabled(t.type_key, !t.enabled);
      res.redirect(`/admin/types?type=${esc(req.params.key)}`);
    } catch (e) {
      res.status(500).send(esc(e?.message));
    }
  });

  router.post("/admin/types/:key/delete", requireAdminSession, async (req, res) => {
    try {
      await deleteAmuletType(req.params.key);
      res.redirect("/admin/types");
    } catch (e) {
      res.status(500).send(esc(e?.message));
    }
  });

  /** Upload example: JSON base64 → R2 + sidecar embed + insert. */
  router.post("/admin/types/:key/upload", requireAdminSession, jsonBig, async (req, res) => {
    try {
      const b64 = String(req.body?.imageB64 || "").trim();
      if (!b64) return res.status(400).json({ ok: false, error: "no_image" });
      const emb = await visionEmbedImage(b64);
      if (!emb) return res.status(502).json({ ok: false, error: "sidecar_embed_failed" });
      const path = `type_refs/${req.params.key}/${Date.now().toString(36)}.jpg`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: env.SCAN_V2_UPLOAD_BUCKET,
          Key: path,
          Body: Buffer.from(b64, "base64"),
          ContentType: "image/jpeg",
        }),
      );
      await addTypeExample({ typeKey: req.params.key, embedding: emb.embedding, imagePath: path, source: "upload" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message).slice(0, 160) });
    }
  });

  /** Shared grid page: library browse (recent baselines) or suggestions (centroid NN). */
  async function renderPickGrid(req, res, mode) {
    try {
      const key = req.params.key;
      const types = await listAmuletTypes();
      const t = types.find((x) => x.type_key === key);
      if (!t) return res.redirect("/admin/types");

      // แบ่งหน้า: ไล่ดูได้ครบทุกองค์ในคลัง (รวมของลูกค้าทั้งหมด)
      const PAGE_SIZE = 120;
      const page = Math.max(1, Math.floor(Number(req.query?.page)) || 1);
      let totalCount = 0;
      let rows = [];
      if (mode === "suggest") {
        const centroid = await typeCentroid(key);
        if (centroid) {
          rows = await matchGlobalObjectBaselinesByVisualEmbedding(centroid, {
            lane: "sacred_amulet",
            objectFamily: "sacred_amulet",
            minSimilarity: 0.55,
            matchCount: 30,
          });
        }
      } else {
        const { data, count } = await supabase
          .from("global_object_baselines")
          .select("id, thumbnail_path, created_at", { count: "exact" })
          .not("thumbnail_path", "is", null)
          .order("created_at", { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
        rows = Array.isArray(data) ? data : [];
        totalCount = Number(count) || 0;
      }

      const { data: usedRows } = await supabase
        .from("amulet_type_examples")
        .select("source_baseline_id")
        .not("source_baseline_id", "is", null);
      const used = new Set((usedRows || []).map((r) => String(r.source_baseline_id)));

      const cards = (
        await Promise.all(
          rows
            .filter((r) => !used.has(String(r.id)))
            .map(async (r) => {
              const thumb = r.thumbnailPath ?? r.thumbnail_path;
              const url = await signedUrlSafe(thumb);
              if (!url) return "";
              const sim = r.similarity != null ? `<span class="sim">${(Number(r.similarity) * 100).toFixed(0)}%</span>` : "";
              return `<form class="pick" method="post" action="/admin/types/${esc(key)}/pick">
                <input type="hidden" name="baselineId" value="${esc(r.id)}"/>
                <img src="${esc(url)}" loading="lazy"/>${sim}
                <button class="ok">✓ ใช่</button>
              </form>`;
            }),
        )
      ).join("");

      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(`<!doctype html><html lang="th"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${mode === "suggest" ? "ระบบหาให้" : "เลือกจากคลัง"} · ${esc(t.label_thai)}</title>
<style>
  body{margin:0;background:#f6f6f4;color:#241c12;font:16px/1.6 "Noto Sans Thai",system-ui,sans-serif;padding:20px;max-width:920px;margin-inline:auto}
  a{color:#8f6710} .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:14px}
  .pick{position:relative;border:1px solid #e2ddd2;border-radius:10px;overflow:hidden;aspect-ratio:1;margin:0}
  .pick img{width:100%;height:100%;object-fit:cover;display:block}
  .pick .ok{position:absolute;bottom:6px;left:6px;right:6px;border:none;background:#b8871b;color:#fff;font-weight:800;border-radius:8px;padding:6px;cursor:pointer;font:inherit}
  .sim{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);color:#fff;font-size:.7rem;border-radius:6px;padding:1px 6px}
  .muted{color:#7a6a58;font-size:.85rem}
</style></head><body>
<b>${mode === "suggest" ? "✨ ระบบหาให้ — กดอนุมัติที่ใช่" : "🔍 เลือกจากคลังสแกน"}: ${esc(t.label_thai)}</b>
<p class="muted"><a href="/admin/types?type=${esc(key)}">← กลับ</a> · ${mode === "suggest" ? "เรียงจากใกล้เคียงสุด (ต้องมีตัวอย่างอย่างน้อย 1 รูปก่อนระบบถึงหาได้)" : `ทุกองค์ในคลังสแกน (รวมของลูกค้า) ${totalCount} องค์ · หน้า ${page}/${Math.max(1, Math.ceil(totalCount / PAGE_SIZE))} · กดที่ใช่เพื่อติดป้าย`}</p>
<div class="grid">${cards || '<p class="muted">ไม่มีรายการ</p>'}</div>
${
  mode === "library"
    ? `<p style="display:flex;gap:14px;justify-content:center;margin-top:18px">
        ${page > 1 ? `<a class="btn" href="/admin/types/${esc(key)}/library?page=${page - 1}">← ก่อนหน้า</a>` : ""}
        ${page * PAGE_SIZE < totalCount ? `<a class="btn" href="/admin/types/${esc(key)}/library?page=${page + 1}">ถัดไป →</a>` : ""}
      </p>`
    : ""
}
</body></html>`);
    } catch (e) {
      res.status(500).send(`โหลดไม่สำเร็จ: ${esc(e?.message)}`);
    }
  }

  router.get("/admin/types/:key/library", requireAdminSession, (req, res) => renderPickGrid(req, res, "library"));
  router.get("/admin/types/:key/suggest", requireAdminSession, (req, res) => renderPickGrid(req, res, "suggest"));

  /** Approve a baseline into the type (embedding + thumbnail copied from baseline). */
  router.post("/admin/types/:key/pick", requireAdminSession, express.urlencoded({ extended: false }), async (req, res) => {
    try {
      const baselineId = String(req.body.baselineId || "").trim();
      const { data: b, error } = await supabase
        .from("global_object_baselines")
        .select("id, thumbnail_path, visual_embedding")
        .eq("id", baselineId)
        .maybeSingle();
      if (error || !b) throw new Error("baseline_not_found");
      let embedding = null;
      try {
        embedding = typeof b.visual_embedding === "string" ? JSON.parse(b.visual_embedding) : b.visual_embedding;
      } catch {
        embedding = null;
      }
      if (!Array.isArray(embedding) || embedding.length !== 384) throw new Error("baseline_missing_embedding");
      await addTypeExample({
        typeKey: req.params.key,
        embedding,
        imagePath: b.thumbnail_path || null,
        sourceBaselineId: baselineId,
        source: "library",
      });
      const back = String(req.headers.referer || "").includes("/suggest") ? "suggest" : "library";
      res.redirect(`/admin/types/${esc(req.params.key)}/${back}`);
    } catch (e) {
      res.status(500).send(`ติดป้ายไม่สำเร็จ: ${esc(e?.message)} <a href="/admin/types?type=${esc(req.params.key)}">กลับ</a>`);
    }
  });

  router.post("/admin/types/example/:id/delete", requireAdminSession, async (req, res) => {
    try {
      await deleteTypeExample(req.params.id);
      res.redirect(String(req.headers.referer || "/admin/types"));
    } catch (e) {
      res.status(500).send(esc(e?.message));
    }
  });

  return router;
}

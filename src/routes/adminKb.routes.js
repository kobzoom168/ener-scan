/**
 * /admin/kb — คลังความรู้ของอาจารย์ (kb_entries): list / add / edit / toggle /
 * delete + "ลองถาม" box that shows exactly what the consult brain would pull.
 * Server-rendered like the other admin pages; ESCAPE everything user-typed.
 */
import express from "express";
import { requireAdminSession } from "../middleware/requireAdmin.js";
import {
  listKbEntriesForAdmin,
  createKbEntry,
  updateKbEntry,
  deleteKbEntry,
} from "../stores/kb.db.js";
import { buildKbContext } from "../core/conversation/geminiFront/kbRetrieval.util.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageHtml({ rows, testQ, testResult, savedMsg }) {
  const rowsHtml = rows
    .map((r) => {
      const disabled = r.status !== "active";
      return `
      <details class="kb-item${disabled ? " off" : ""}">
        <summary>
          <span class="kb-type ${r.entry_type}">${r.entry_type === "faq" ? "สคริปต์" : "ความรู้"}</span>
          <b>${esc(r.title)}</b>
          ${disabled ? '<span class="kb-off-chip">ปิดใช้</span>' : ""}
        </summary>
        <form method="post" action="/admin/kb/${esc(r.id)}/update" class="kb-form">
          <label>ชื่อเรื่อง <input name="title" value="${esc(r.title)}" required /></label>
          <label>ชนิด
            <select name="entryType">
              <option value="knowledge"${r.entry_type !== "faq" ? " selected" : ""}>ความรู้ (AI เรียบเรียงได้)</option>
              <option value="faq"${r.entry_type === "faq" ? " selected" : ""}>สคริปต์ (ยึดตามนี้)</option>
            </select>
          </label>
          <label>คำที่ลูกค้ามักถาม (คั่นด้วย , )
            <textarea name="questionPatterns" rows="2">${esc(r.question_patterns)}</textarea></label>
          <label>คำตอบ
            <textarea name="answer" rows="5" required>${esc(r.answer)}</textarea></label>
          <label>แท็ก <input name="tags" value="${esc(r.tags)}" /></label>
          <div class="kb-actions">
            <button class="btn save">💾 บันทึก</button>
            <button class="btn" name="toggle" value="1">${disabled ? "▶️ เปิดใช้" : "⏸ ปิดใช้"}</button>
            <button class="btn danger" formaction="/admin/kb/${esc(r.id)}/delete"
              onclick="return confirm('ลบเรื่องนี้ถาวร?')">🗑 ลบ</button>
          </div>
        </form>
      </details>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>คลังความรู้อาจารย์ · Ener Admin</title>
<style>
  :root{--bg:#f6f6f4;--card:#fff;--line:#e2ddd2;--ink:#241c12;--sub:#7a6a58;--gold:#b8871b;--gold-deep:#8f6710}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);
    font:16px/1.6 "Noto Sans Thai","Sarabun",system-ui,sans-serif;padding:20px;max-width:860px;margin-inline:auto}
  h1{font-size:1.3rem} a{color:var(--gold-deep)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:16px}
  .kb-item{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:10px;padding:4px 14px}
  .kb-item.off{opacity:.55}
  summary{cursor:pointer;padding:9px 0;display:flex;gap:9px;align-items:center;flex-wrap:wrap}
  .kb-type{font-size:.72rem;font-weight:700;border-radius:99px;padding:2px 10px}
  .kb-type.faq{background:#fdeeda;color:#9a6210;border:1px solid #ecd2a8}
  .kb-type.knowledge{background:#e7f0e9;color:#3e7d55;border:1px solid #c4dccb}
  .kb-off-chip{font-size:.7rem;color:#a33;border:1px solid #d9b0b0;border-radius:99px;padding:1px 8px}
  .kb-form{display:flex;flex-direction:column;gap:9px;padding:6px 0 13px}
  label{font-size:.82rem;color:var(--sub);display:flex;flex-direction:column;gap:4px}
  input,textarea,select{font:inherit;border:1px solid var(--line);border-radius:9px;padding:8px 11px;width:100%}
  textarea{resize:vertical}
  .kb-actions{display:flex;gap:9px;flex-wrap:wrap}
  .btn{font:inherit;font-weight:700;border:1px solid var(--line);background:#fff;border-radius:9px;padding:8px 15px;cursor:pointer}
  .btn.save{background:var(--gold);border-color:var(--gold);color:#fff}
  .btn.danger{color:#a33;border-color:#d9b0b0}
  .testbox{background:#fbf7ec;border:1px solid #e8d9b0;border-radius:12px;padding:13px 15px;margin-top:9px;white-space:pre-wrap;font-size:.9rem}
  .flash{background:#e7f0e9;border:1px solid #c4dccb;color:#2e6a45;border-radius:10px;padding:9px 14px;margin-bottom:14px;font-weight:700}
  .muted{color:var(--sub);font-size:.85rem}
</style></head><body>
<h1>📚 คลังความรู้อาจารย์ <span class="muted">(${rows.length} เรื่อง)</span></h1>
<p class="muted"><a href="/admin/payments">← กลับหน้า admin</a> · สคริปต์ = AI ต้องยึดเนื้อหาตามนี้ · ความรู้ = AI เรียบเรียงเป็นเสียงอาจารย์</p>
${savedMsg ? `<div class="flash">${esc(savedMsg)}</div>` : ""}

<div class="card">
  <b>🔍 ลองถามดู</b> <span class="muted">พิมพ์เหมือนลูกค้าถาม แล้วดูว่าระบบหยิบเรื่องไหนไปให้ AI</span>
  <form method="get" action="/admin/kb" style="display:flex;gap:9px;margin-top:9px">
    <input name="q" value="${esc(testQ)}" placeholder="เช่น หินต้องล้างไหม" style="flex:1"/>
    <button class="btn save">ลองถาม</button>
  </form>
  ${testQ ? `<div class="testbox">${testResult ? esc(testResult) : "ไม่พบเรื่องที่ตรง — AI จะตอบจากความรู้ทั่วไปของมัน"}</div>` : ""}
</div>

<div class="card">
  <b>➕ เพิ่มเรื่องใหม่</b>
  <form method="post" action="/admin/kb/create" class="kb-form">
    <label>ชื่อเรื่อง <input name="title" required placeholder="เช่น วิธีบูชาพระราหู"/></label>
    <label>ชนิด
      <select name="entryType">
        <option value="knowledge">ความรู้ (AI เรียบเรียงได้)</option>
        <option value="faq">สคริปต์ (ยึดตามนี้)</option>
      </select>
    </label>
    <label>คำที่ลูกค้ามักถาม (คั่นด้วย , )
      <textarea name="questionPatterns" rows="2" placeholder="พระราหู, บูชาราหู, ของดำ 8 อย่าง"></textarea></label>
    <label>คำตอบ <textarea name="answer" rows="5" required></textarea></label>
    <label>แท็ก <input name="tags" placeholder="ราหู, บูชา"/></label>
    <div class="kb-actions"><button class="btn save">➕ เพิ่มเข้าคลัง</button></div>
  </form>
</div>

${rowsHtml || '<p class="muted">ยังไม่มีความรู้ในคลัง</p>'}
</body></html>`;
}

export default function createAdminKbRouter() {
  const router = express.Router();

  router.get("/admin/kb", requireAdminSession, async (req, res) => {
    try {
      const rows = await listKbEntriesForAdmin();
      const testQ = String(req.query.q || "").trim().slice(0, 300);
      const testResult = testQ ? await buildKbContext(testQ).catch(() => null) : null;
      const savedMsg = req.query.saved ? "บันทึกแล้ว" : req.query.deleted ? "ลบแล้ว" : "";
      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(pageHtml({ rows, testQ, testResult, savedMsg }));
    } catch (e) {
      res.status(500).send(`โหลดคลังไม่สำเร็จ: ${esc(e?.message)}`);
    }
  });

  router.post("/admin/kb/create", requireAdminSession, express.urlencoded({ extended: false }), async (req, res) => {
    try {
      await createKbEntry({
        entryType: req.body.entryType,
        title: req.body.title,
        questionPatterns: req.body.questionPatterns,
        answer: req.body.answer,
        tags: req.body.tags,
      });
      res.redirect("/admin/kb?saved=1");
    } catch (e) {
      res.status(500).send(`เพิ่มไม่สำเร็จ: ${esc(e?.message)} <a href="/admin/kb">กลับ</a>`);
    }
  });

  router.post("/admin/kb/:id/update", requireAdminSession, express.urlencoded({ extended: false }), async (req, res) => {
    try {
      const patch = {
        entryType: req.body.entryType,
        title: req.body.title,
        questionPatterns: req.body.questionPatterns,
        answer: req.body.answer,
        tags: req.body.tags,
      };
      if (req.body.toggle) {
        const rows = await listKbEntriesForAdmin();
        const cur = rows.find((r) => String(r.id) === String(req.params.id));
        patch.status = cur?.status === "active" ? "disabled" : "active";
      }
      await updateKbEntry(req.params.id, patch);
      res.redirect("/admin/kb?saved=1");
    } catch (e) {
      res.status(500).send(`บันทึกไม่สำเร็จ: ${esc(e?.message)} <a href="/admin/kb">กลับ</a>`);
    }
  });

  router.post("/admin/kb/:id/delete", requireAdminSession, express.urlencoded({ extended: false }), async (req, res) => {
    try {
      await deleteKbEntry(req.params.id);
      res.redirect("/admin/kb?deleted=1");
    } catch (e) {
      res.status(500).send(`ลบไม่สำเร็จ: ${esc(e?.message)} <a href="/admin/kb">กลับ</a>`);
    }
  });

  return router;
}

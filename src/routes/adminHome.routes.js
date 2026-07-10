/**
 * /admin — หน้ารวมเมนูหลังบ้านทุกหน้า (กบจำลิงก์แยกไม่ไหว) — login แล้วเด้งมาหน้านี้
 */
import express from "express";
import { requireAdminSession } from "../middleware/requireAdmin.js";

const MENUS = [
  {
    href: "/admin/payments",
    icon: "💳",
    title: "Payments",
    desc: "อนุมัติสลิป · รายการจ่ายเงิน · เติม/ถอนสิทธิ์จากใบจ่าย",
  },
  {
    href: "/admin/users",
    icon: "👥",
    title: "จัดการ User",
    desc: "ลูกค้าทั้งหมด · ข้อมูลลงทะเบียน LIFF · ปรับสิทธิ์ · โน้ต · leads จาก ads",
  },
  {
    href: "/admin/types",
    icon: "🕉️",
    title: "คลังพิมพ์พระ",
    desc: "รูปตัวอย่างพิมพ์พระ (อัพเอง/เลือกจากคลัง/ระบบเสนอ) — ใช้ระบุพิมพ์ตอนสแกน",
  },
  {
    href: "/admin/kb",
    icon: "📚",
    title: "คลังความรู้อาจารย์",
    desc: "FAQ · สคริปต์ตอบ · ความรู้ที่สมองแชทดึงไปใช้ · กล่องลองถาม",
  },
  {
    href: "/admin/voice",
    icon: "🎙️",
    title: "เสียงอาจารย์",
    desc: "เลือกเสียง ElevenLabs · ความเร็วพูด · เปิด/ปิด · พรีวิวสคริปต์จริง",
  },
];

function pageHtml() {
  const cards = MENUS.map(
    (m) => `
    <a class="menu" href="${m.href}">
      <span class="ic">${m.icon}</span>
      <span class="tx"><b>${m.title}</b><small>${m.desc}</small></span>
      <span class="go">›</span>
    </a>`,
  ).join("\n");

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Ener Scan — Admin</title>
<style>
  :root{--bg:#14120d;--card:#1e1b14;--line:#3a3426;--ink:#efe8d8;--muted:#9c937d;--accent:#e6c34a}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:640px;margin:0 auto;padding:26px 16px 60px}
  .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
  h1{font-size:1.5rem;margin:0}
  h1 small{display:block;font-size:.8rem;color:var(--muted);font-weight:500;margin-top:3px}
  form{margin:0}
  button{background:#2a2618;border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:8px 14px;font-size:.85rem;font-weight:700;cursor:pointer}
  .grid{display:flex;flex-direction:column;gap:12px;margin-top:20px}
  .menu{display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:16px;
    padding:16px 16px;text-decoration:none;color:var(--ink);transition:border-color .12s ease}
  .menu:hover{border-color:var(--accent)}
  .ic{font-size:1.7rem;width:48px;height:48px;display:grid;place-items:center;background:#26210f;border-radius:12px;flex:0 0 auto}
  .tx{display:flex;flex-direction:column;gap:3px;min-width:0}
  .tx b{font-size:1.05rem}
  .tx small{color:var(--muted);font-size:.8rem;line-height:1.5}
  .go{margin-left:auto;color:var(--muted);font-size:1.4rem}
  .foot{margin-top:26px;color:var(--muted);font-size:.75rem;text-align:center}
</style></head>
<body>
<div class="wrap">
  <div class="top">
    <h1>⚡ Ener Scan Admin<small>รวมทุกเมนูหลังบ้าน</small></h1>
    <form method="POST" action="/admin/logout"><button type="submit">ออกจากระบบ</button></form>
  </div>
  <div class="grid">
${cards}
  </div>
  <p class="foot">my-ener.uk/admin — จำลิงก์เดียวพอ</p>
</div>
</body></html>`;
}

export default function createAdminHomeRouter() {
  const router = express.Router();
  router.get("/admin", requireAdminSession, (req, res) => {
    res.status(200).type("html").send(pageHtml());
  });
  return router;
}

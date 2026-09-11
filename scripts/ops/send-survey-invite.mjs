/**
 * ส่งลิงก์แบบสอบถาม Revenue Discovery ให้ผู้รับที่ระบุไว้ล่วงหน้า (11 ก.ย. 2026)
 *
 * ⚠️ ยังไม่เคยรัน — เตรียมไว้รอกบอนุมัติฟอร์ม + รายชื่อก่อน
 *
 * หลักการ: ยิง LINE push ตรง ไม่เรียก AI ไม่แตะ DB ไม่อ่านข้อความลูกค้า
 *   DRY RUN (ค่าเริ่มต้น — พิมพ์ให้ดูเฉย ๆ ไม่ส่ง):
 *     docker exec ener-scan-pro node /tmp/send-survey-invite.mjs
 *   ส่งจริง (หลังกบเคาะ):
 *     docker exec -e SEND=1 -e FORM_URL='https://forms.gle/xxxx' ener-scan-pro node /tmp/send-survey-invite.mjs
 *
 * กันพลาด: รายชื่อมาจากไฟล์เท่านั้น · เกิน MAX_RECIPIENTS = ปฏิเสธ ·
 *          ต้องมี FORM_URL ถึงส่งจริง · พิมพ์ UID แบบปกปิดเสมอ · ส่งทีละคนเว้น 1.2 วิ
 */
import { readFileSync } from "node:fs";

const RECIPIENTS_FILE = process.env.RECIPIENTS_FILE || "/tmp/survey-recipients.txt";
const FORM_URL = String(process.env.FORM_URL || "").trim();
const SEND = process.env.SEND === "1";
const TOKEN = process.env.CHANNEL_ACCESS_TOKEN || "";
const MAX_RECIPIENTS = 10;
const DELAY_MS = 1200;

// รอบแรกไม่แจกสิทธิ์ฟรี (Codex 11 ก.ย.): การแจกจะเปลี่ยนพฤติกรรมซื้อที่กำลังวัดอยู่พอดี
const message = (formUrl) =>
  `สวัสดีครับพี่ ผมกบ คนทำ Ener Scan เองครับ

ผมกำลังปรับปรุงระบบ อยากขอความเห็นจากคนที่ใช้จริงสัก 6 ข้อสั้น ๆ
ใช้เวลาประมาณ 2-3 นาทีครับ ไม่ต้องพิมพ์ตอบในแชทนะครับ กดลิงก์นี้ได้เลย

${formUrl}

ตอบแบบไม่ต้องบอกชื่อ ไม่สะดวกตอบก็ไม่เป็นไรเลยครับ
ใช้งานได้ตามปกติเหมือนเดิม ขอบคุณมากครับ`;

function loadRecipients(path) {
  // รูปแบบไฟล์: <รหัส>|<lineUserId>|<ชื่อเล่น>|<ข้อมูลอื่น...>
  const lines = readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const [code, uid] = line.split("|");
    if (!uid || !/^U[0-9a-f]{16,}$/i.test(uid)) {
      throw new Error(`บรรทัดผิดรูปแบบหรือ UID ไม่ถูกต้อง: ${String(code || line).slice(0, 12)}`);
    }
    out.push({ code: code || "?", uid });
  }
  return out;
}

async function pushLine(to, text) {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`line push ${r.status} ${body.slice(0, 120)}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const recipients = loadRecipients(RECIPIENTS_FILE);
  if (recipients.length > MAX_RECIPIENTS) {
    console.error(`ปฏิเสธ: รายชื่อ ${recipients.length} คน เกินเพดาน ${MAX_RECIPIENTS} — งานนี้ตั้งใจส่งแค่กลุ่มเล็ก`);
    process.exit(1);
  }
  const url = FORM_URL || "[ยังไม่ใส่ FORM_URL]";
  console.log(`ผู้รับ ${recipients.length} คน · โหมด ${SEND ? "ส่งจริง" : "DRY RUN (ไม่ส่ง)"} · ฟอร์ม: ${url}`);
  console.log("--- ข้อความที่จะส่ง ---\n" + message(url) + "\n---");

  if (SEND && !FORM_URL) { console.error("ปฏิเสธ: SEND=1 แต่ไม่มี FORM_URL"); process.exit(1); }
  if (SEND && !TOKEN) { console.error("ปฏิเสธ: ไม่มี CHANNEL_ACCESS_TOKEN"); process.exit(1); }

  let sent = 0;
  for (const r of recipients) {
    const masked = `${r.uid.slice(0, 8)}…`;
    if (!SEND) { console.log(`[DRY] ${r.code} ${masked}`); continue; }
    try {
      await pushLine(r.uid, message(FORM_URL));
      sent += 1;
      console.log(`[SENT] ${r.code} ${masked}`);
    } catch (e) {
      console.error(`[FAIL] ${r.code} ${masked}: ${String(e.message).slice(0, 100)}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(SEND ? `ส่งสำเร็จ ${sent}/${recipients.length}` : "DRY RUN จบ — ยังไม่ส่งอะไรเลย");
}

main().catch((e) => { console.error(String(e?.message || e)); process.exit(1); });

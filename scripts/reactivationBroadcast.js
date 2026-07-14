/**
 * Broadcast ปลุกลูกค้าเก่า (แผนการตลาด W1 — กบ 15 ก.ค. 2026)
 * แบ่งกลุ่มจากข้อมูลจริง แล้วส่งข้อความ personalize (ชื่อเล่น + ดาวประจำวันเกิด)
 *
 *   กลุ่ม A: เคยสแกน แต่ไม่เคยจ่าย   → ชวนกลับมาสแกนซ้ำ (ไม่ขาย)
 *   กลุ่ม B: ลงทะเบียนแล้ว ไม่เคยสแกน → พาข้ามเส้นแรก ส่งรูปชิ้นแรก
 *   กลุ่ม C: เคยจ่าย แต่เงียบไป       → ต้อนกลับ บอกของใหม่ในแอป
 *
 * วิธีรัน (ในคอนเทนเนอร์ ener-scan):
 *   DRY RUN (ค่าเริ่มต้น — นับยอด + ตัวอย่างข้อความ ไม่ส่งจริง):
 *     docker exec ener-scan-pro node scripts/reactivationBroadcast.js
 *   ส่งจริง (หลังกบเคาะร่าง):
 *     docker exec -e SEND=1 ener-scan-pro node scripts/reactivationBroadcast.js
 *   ส่งเฉพาะบางกลุ่ม: -e SEGMENTS=A,B
 *
 * กันพลาด: ข้ามคนที่แอคทีฟใน 3 วันล่าสุด, ส่งช้า ๆ ทีละคน (กัน rate limit),
 * กันส่งซ้ำด้วยตาราง log ใน memory ต่อรอบรัน (รันซ้ำวันเดียวกันไม่ยิงซ้ำเพราะเช็ค outbound ไม่ได้ —
 * อย่ารันซ้ำในวันเดียวกันโหมด SEND)
 */
const POSTGREST = process.env.LOCAL_POSTGREST_URL;
const ANON = process.env.LOCAL_POSTGREST_ANON_KEY || "";
const TOKEN = process.env.CHANNEL_ACCESS_TOKEN || "";
const SEND = process.env.SEND === "1";
const SEGMENTS = String(process.env.SEGMENTS || "A,B,C")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

async function pg(path) {
  const r = await fetch(`${POSTGREST}${path}`, { headers: H });
  if (!r.ok) throw new Error(`postgrest ${r.status} ${path.slice(0, 80)}`);
  return r.json();
}

const THAI_DAY = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const DAY_STAR = ["ดาวอาทิตย์", "ดาวจันทร์", "ดาวอังคาร", "ดาวพุธ", "ดาวพฤหัส", "ดาวศุกร์", "ดาวเสาร์"];

function birthdayBits(birthdate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthdate || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const wd = d.getUTCDay();
  return { dayTh: THAI_DAY[wd], star: DAY_STAR[wd] };
}

function buildMessage(segment, nickname, bd) {
  const name = nickname ? `คุณ${nickname}` : "คุณลูกค้า";
  const dayTh = bd?.dayTh || null;
  const star = bd?.star || "ดาวประจำวัน";
  if (segment === "B") {
    const bornLine = dayTh
      ? `คนเกิดวัน${dayTh}อย่างคุณ ${star}คุมดวงอยู่`
      : `${star}ของคุณรออยู่`;
    return `สวัสดีครับ${name} อาจารย์เห็นว่าลงทะเบียนไว้เรียบร้อยแต่ยังไม่ได้ส่งรูปมาสักชิ้นเลย เสียดายแทนครับ ${bornLine} ลองส่งรูปพระหรือเครื่องรางที่พกอยู่มาสักชิ้น เดี๋ยวอาจารย์อ่านพลังเทียบกับดวงคุณให้ ฟรีครับ`;
  }
  if (segment === "C") {
    return `หายไปนานเลยนะครับ${name} ช่วงนี้อาจารย์เพิ่มของใหม่ในแอป Ener เปิดดูได้ว่าชิ้นไหนในคลังคุณหนุนดวงวันนี้ อาจารย์เลือกให้ทุกเช้า แวะมาส่งรูปชิ้นใหม่ได้เสมอครับ`;
  }
  const starLine = dayTh ? `วันนี้${star}เปิดทาง` : "จังหวะวันนี้กำลังดี";
  return `${name}ครับ ชิ้นที่เคยส่งมาให้อาจารย์ดู อาจารย์ยังจำได้อยู่เลย ที่บ้านมีชิ้นอื่นอีกไหมครับ ${starLine} ลองส่งมาเทียบกันดูว่าชิ้นไหนหนุนดวงคุณกว่ากัน สิทธิ์ฟรีวันนี้ยังอยู่ครับ`;
}

async function pushLine(to, text) {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`line push ${r.status} ${body.slice(0, 120)}`);
  }
}

async function main() {
  if (!POSTGREST) throw new Error("LOCAL_POSTGREST_URL missing — run inside the app container");

  const [profiles, users, paidRows, scanRows, convRows] = await Promise.all([
    pg("/liff_profiles?select=line_user_id,nickname,birthdate&limit=5000"),
    pg("/app_users?select=line_user_id,paid_until,paid_remaining_scans&limit=5000"),
    pg("/payments?select=line_user_id&status=eq.paid&limit=5000"),
    pg("/scan_results_v2?select=line_user_id&limit=20000"),
    pg("/conversation_state?select=line_user_id,last_inbound_at&limit=5000"),
  ]);

  const paidSet = new Set(paidRows.map((r) => r.line_user_id).filter(Boolean));
  const scannedSet = new Set(scanRows.map((r) => r.line_user_id).filter(Boolean));
  const lastInbound = new Map(
    convRows.map((r) => [r.line_user_id, Date.parse(r.last_inbound_at || "") || 0]),
  );
  const profileBy = new Map(profiles.map((p) => [p.line_user_id, p]));

  const now = Date.now();
  const RECENT_MS = 3 * 24 * 3600 * 1000;
  const activePaid = (u) =>
    u?.paid_until && Date.parse(u.paid_until) > now && Number(u.paid_remaining_scans) > 0;

  const segments = { A: [], B: [], C: [] };
  const seen = new Set();
  for (const u of users) {
    const uid = u.line_user_id;
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    if (now - (lastInbound.get(uid) || 0) < RECENT_MS) continue; // เพิ่งคุยอยู่ ไม่ต้องปลุก
    if (activePaid(u)) continue; // แพ็กยังวิ่ง ไม่ใช่กลุ่มปลุก
    const paid = paidSet.has(uid);
    const scanned = scannedSet.has(uid);
    if (paid) segments.C.push(uid);
    else if (scanned) segments.A.push(uid);
    else segments.B.push(uid);
  }

  console.log("=== REACTIVATION SEGMENTS ===");
  for (const k of ["A", "B", "C"]) {
    console.log(`${k}: ${segments[k].length} คน${SEGMENTS.includes(k) ? "" : " (ข้าม — ไม่อยู่ใน SEGMENTS)"}`);
  }

  let sent = 0;
  let failed = 0;
  for (const k of ["A", "B", "C"]) {
    if (!SEGMENTS.includes(k)) continue;
    for (const uid of segments[k]) {
      const p = profileBy.get(uid) || {};
      const msg = buildMessage(k, String(p.nickname || "").trim(), birthdayBits(p.birthdate));
      if (!SEND) {
        if (sent < 3 || segments[k].indexOf(uid) < 1) {
          console.log(`--- [DRY ${k}] ${uid.slice(0, 10)}…\n${msg}\n`);
        }
        sent++;
        continue;
      }
      try {
        await pushLine(uid, msg);
        sent++;
        console.log(JSON.stringify({ event: "REACTIVATION_SENT", segment: k, uidPrefix: uid.slice(0, 8) }));
      } catch (e) {
        failed++;
        console.error(JSON.stringify({ event: "REACTIVATION_FAILED", segment: k, uidPrefix: uid.slice(0, 8), message: String(e?.message || e).slice(0, 120) }));
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  console.log(`=== DONE mode=${SEND ? "SEND" : "DRY_RUN"} target=${sent} failed=${failed} ===`);
}

main().catch((e) => {
  console.error("FATAL:", e?.message || e);
  process.exit(1);
});

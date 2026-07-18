# STATE — สถานะระบบปัจจุบัน
(อัปเดตล่าสุด: 18 ก.ค. 2026 — ใครแก้สถานะระบบต้องอัปเดตไฟล์นี้ + วันที่บรรทัดนี้)

## ระบบคืออะไร
LINE OA "อาจารย์เอเนอร์" — ลูกค้าส่งรูปพระ/เครื่องราง/กำไลหิน → ระบบสแกนให้คะแนนพลัง 6 แกน + คำอ่านอาจารย์ + แชทถามต่อได้
ราคา (LIVE pro ตั้งแต่ 17 ก.ค. 2026 เย็น — promo_jul2026_v2): ฟรี 1/วัน · **29 รายองค์ 1 ครั้ง/24ชม** · ⭐**49 เปิดพลัง 4 ครั้ง/24ชม (default)** · **399 สมาชิกอาจารย์ 30 ครั้ง/30วัน** — **เลิกขาย unlimited ถาวร** · ลูกค้าเดือนเดิม 2 คน grandfather (หมดอายุ 12/16 ส.ค.) · โปรจริงคุมด้วย DB override ผ่าน /admin/promo (ชนะไฟล์ default)
**เกตของพรีเมียม (18 ก.ค.):** สองชั้น —
- **เสียงอาจารย์:** "เคยจ่ายเงินสักครั้ง" (hasEverPaid) — เคยจ่าย = มีเสียงตลอด
- **คลังพระ/อันดับ/พระเด่น (เซ็นเซอร์):** hasRecentPaidAccess — เปิดเมื่อ paid_until ยังไม่หมด (399 เปิดตลอด 30 วัน + 2 คน grandfather + ชม.แรกของ 29/49) **หรือ**จ่ายใบล่าสุดไม่เกิน 3 วัน · เกิน 3 วัน = เบลอ+เซ็นเซอร์ทุกชิ้น (ดึงกลับมาจ่ายซ้ำ — กบ 18 ก.ค.)
**จำแนกประเภทวัตถุ (18 ก.ค. — เคสธูปหวย):** objectUnderstanding ใน extractor v2 (call เดิม ไม่เพิ่มต้นทุน) — objectForm 17 แบบ (ธูป/ตะกรุด/รูปตั้ง/ผ้ายันต์…) + motifFamily 14 สาย (ท้าวเวสฯ/พิฆเนศ/นาค…) + confidence + sensitiveFlags → โค้ด map ชื่อไทย (`objectTaxonomy.js`) + derive usageProfile (ธูป/เทียน/รูปตั้ง ห้ามได้คำแนะนำ "พกติดตัว" — กรอง tips อัตโนมัติ) → โชว์ "ลักษณะที่อ่านได้: …" ใน hero รายงาน + ส่งเข้า consult context + เก็บใน global baseline (reuse ข้ามบัญชีได้) — **ไม่แตะ seed/คะแนนเด็ดขาด** (10 slug เดิมความหมายเดิม คง extract version v2) · ไม่ยืนยันรุ่น/วัด/เกจิ/แท้เก๊

## เครื่อง/สภาพแวดล้อม
- Server: `ssh -p 2222 root@204.168.246.103` (hostname: ener-ai) — Python 3.11 / Node
- Prod: `/root/ener-scan-pro` (:3100, scan.my-ener.uk) · Staging: `/root/ener-scan-staging` (:3200, test.my-ener.uk)
- Stack: Node ESM + Express · PostgREST local (Supabase เลิกใช้แล้ว) · Redis · R2 storage · resvg (การ์ด PNG)
- Sidecar: ener-vision :8077 (DINOv2+LightGlue จำวัตถุเดิมข้ามรูป — Re-ID) เปิดใช้บน pro แล้ว
- DB query จากนอก: `docker exec ener-scan-pro node -e "..."` ใช้ LOCAL_POSTGREST_URL/ANON_KEY ในคอนเทนเนอร์

## วิธี deploy (blue-green ไม่มี downtime)
```
# บนเครื่อง dev: งานทำบน branch staging
git add ... && git commit && git push origin staging
git checkout main && git cherry-pick staging && git push origin main && git checkout staging
ssh -p 2222 root@204.168.246.103 'bash /root/deploy-ener.sh staging'   # staging
ssh -p 2222 root@204.168.246.103 'bash /root/deploy-ener.sh pro'      # pro — ต้องให้กบสั่งเท่านั้น
```

## สมองแชท (แก้ 16 ก.ค. 2026 — ลดค่า OpenRouter)
- consult ลูกค้าแพ็กแอคทีฟ = Opus 4.8 (`LLM_CONSULT_MODEL`) / ฟรี = DeepSeek V4 Flash (`LLM_CONSULT_MODEL_FREE`, ตอบสั้น, ปิด reasoning)
- system prompt แคชผ่าน OpenRouter (`cacheSystemPrompt`) ประหยัด ~91%
- persona ห้ามหลุดบท: ไม่มีคำว่า AI/บอท/แอดมิน · เคสสดฝากบอทเล่า: redis `admin_case_note:{uid}`

## คะแนน (กติกาสำคัญ)
- วัตถุเดิม → คะแนนเดิมเสมอ (stable seed จาก identity slugs v2 + dHash รูปผสมใน seed เลนพระ)
- ห้ามแตะ: forensic/ท้าถ่ายสด (เคสคนลองของ) · เกรดการ์ดโชว์เฉพาะ S/A/B

## ที่ LIVE ล่าสุด (17 ก.ค. 2026)
- การ์ดแชร์โฉมหรู `/r/:token/card.png` (ดำทอง+เรดาร์+เข้ากับดวงเจ้าของ★%) — resvg gotcha: ต้อง fontDirs, สระ ำ ต้องแตกเป็น ํ+า ใน escapeXml
- การ์ดลงทะเบียน Flex (โลโก้+ปุ่มทอง) แทนลิงก์เปล่า · แท่นรางวัลคลัง อันดับ1-2 เฉพาะรายเดือน

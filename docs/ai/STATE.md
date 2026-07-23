# STATE — สถานะระบบปัจจุบัน
(อัปเดตล่าสุด: 24 ก.ค. 2026 — ใครแก้สถานะระบบต้องอัปเดตไฟล์นี้ + วันที่บรรทัดนี้)

## ระบบคืออะไร
LINE OA "อาจารย์เอเนอร์" — ลูกค้าส่งรูปพระ/เครื่องราง/กำไลหิน → ระบบสแกนให้คะแนนพลัง 6 แกน + คำอ่านอาจารย์ + แชทถามต่อได้
ราคา (LIVE pro ตั้งแต่ 17 ก.ค. 2026 เย็น — promo_jul2026_v2): ฟรี 1/วัน · **29 รายองค์ 1 ครั้ง/24ชม** · ⭐**49 เปิดพลัง 4 ครั้ง/24ชม (default)** · **399 สมาชิกอาจารย์ 30 ครั้ง/30วัน** — **เลิกขาย unlimited ถาวร** · ลูกค้าเดือนเดิม 2 คน grandfather (หมดอายุ 12/16 ส.ค.) · โปรจริงคุมด้วย DB override ผ่าน /admin/promo (ชนะไฟล์ default)
**เกตของพรีเมียม (19 ก.ค.):** กติกาเดียวทั้งเสียง+คลัง —
- **เสียงอาจารย์ + คลังพระ/อันดับ/พระเด่น:** hasRecentPaidAccess · **ข้อยกเว้นเซ็นเซอร์ภาพ (19 ก.ค.): คลัง ≤5 ชิ้น (นับรวมทุกเลนแบบ Daily Pick) ไม่เซ็นเซอร์** — เกิน 5 ชิ้นค่อยใช้กติกา 3 วัน (เสียงไม่มีข้อยกเว้นนี้) — เปิดเมื่อ paid_until ยังไม่หมด (399 เปิดตลอด 30 วัน + 2 คน grandfather + ชม.แรกของ 29/49) **หรือ**จ่ายใบล่าสุดไม่เกิน 3 วัน · เกิน 3 วัน = เบลอ+เซ็นเซอร์ทุกชิ้น (ดึงกลับมาจ่ายซ้ำ — กบ 18 ก.ค.)
**ภาษาอังกฤษ (21 ก.ค.):** consult ตอบตามภาษาลูกค้า (MATCH LANGUAGE โทน lock เดิม) + หน้ารายงาน HTML มีปุ่ม EN (?lang=en — dict + LLM แปล+cache 30 วัน + ตัวเก็บตกระดับ HTML ครอบ 3 หน้า: หลัก/อธิบายพลัง/จังหวะ) · template ตายตัว LINE (การ์ด/paywall) ยังไทย
**ข้อความหลัง report (18 ก.ค.):** ส่ง report จบ = เงียบ ไม่ยิง "สแกนต่อ/วันนี้หมด+โปร" ตามหลัง — แจ้งเฉพาะตอนลูกค้าส่งรูปใหม่แล้วสิทธิ์หมด (การ์ด paywall เส้น webhook) · เปิดกลับ: POST_REPORT_QUOTA_NOTICE_ENABLED=true
**จำแนกประเภทวัตถุ (18 ก.ค. — เคสธูปหวย):** objectUnderstanding ใน extractor v2 (call เดิม ไม่เพิ่มต้นทุน) — objectForm 17 แบบ (ธูป/ตะกรุด/รูปตั้ง/ผ้ายันต์…) + motifFamily 14 สาย (ท้าวเวสฯ/พิฆเนศ/นาค…) + confidence + sensitiveFlags → โค้ด map ชื่อไทย (`objectTaxonomy.js`) + derive usageProfile (ธูป/เทียน/รูปตั้ง ห้ามได้คำแนะนำ "พกติดตัว" — กรอง tips อัตโนมัติ) → โชว์ "ลักษณะที่อ่านได้: …" ใน hero รายงาน + ส่งเข้า consult context + เก็บใน global baseline (reuse ข้ามบัญชีได้) — **ไม่แตะ seed/คะแนนเด็ดขาด** (10 slug เดิมความหมายเดิม คง extract version v2) · ไม่ยืนยันรุ่น/วัด/เกจิ/แท้เก๊ · จำแนก 2 ชั้น: gpt-4.1-mini (extractor) + Gemini flash-lite second opinion (GEMINI_OBJECT_FORM_ENABLED — ธูปหวยแบนหลอก gpt ได้ Gemini จับได้) · **เกตธูป/เทียน:** มั่นใจ ≥85% → ไม่อ่านพลัง+คืนสิทธิ์ (ตอบสั้น ไม่ฟันธงชนิด) / ก้ำกึ่ง 50-84% → ขอรูปมุมใหม่ 1 รอบ (redis 2 ชม) / พระ-เครื่องรางผ่านปกติ

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

## ที่ LIVE 24 ก.ค. 2026 (ชุดใหญ่: การ์ดใหม่ + โพสต์เพจ + ชวนเพื่อน)
- **การ์ดพลังงานโฉมใหม่ `/r/:token/photo-card.png`** (แทนบทบาทการ์ดแชร์ในแชท+เพจ · card.png เดิมยังอยู่): layout 2 คอลัมน์ — ENER SCAN + พลังเด่น (ชื่อ=แกนคะแนนสูงสุดจริง) + เกรด RANK (ไม่มีโล่ ไม่มีดาวใต้ชื่อ) + รูปเต็มมุมมนไม่มีกรอบ + พลังรวม/เข้ากับคุณ + เรดาร์เลขครบ 6 แกน + สกิลท็อป 2 + วันที่เหมาะ (timingV1 จริง) + เหมาะกับ/คำแนะนำ (map ตายตัวต่อแกน AXIS_AUDIENCE/AXIS_ADVICE — ไม่มโน) + QR ชวน add OA · **ธีมสีตามเกรด: S/A ทองดำ · B ฟ้าเงิน · ต่ำกว่า/ไม่มีเกรด ขาว** (CARD_THEMES ใน showcasePhotoCard.service.js) · รูป crop centre (attention เคยพลาดโฟกัสนิ้ว) · resvg ไม่รองรับ clip-path — mask ด้วย sharp
- **แชทส่งการ์ดแทน Flex สรุปเดิม** (เลนพระ): SCAN_CHAT_PHOTO_CARD_ENABLED=true + SCAN_CHAT_PHOTO_CARD_STYLE=single_flex → Flex ใบเดียว giga: การ์ดเป็น hero (กดเปิดภาพเต็ม) + ปุ่ม kilo "เปิดรายงานพลังงานเต็ม" · สไตล์สำรอง image_plus_flex (รูปซูมได้+ปุ่มแยก) สลับได้ · การ์ดพัง = ถอยไป Flex เดิมอัตโนมัติ · HTML report เดิมไม่แตะ
- **Auto post Facebook เพจ Ener** (fbShowcase): ลูกค้าสแกนเลนพระคะแนน ≥8 → ถาม consent ในแชท (kind fb_consent_ask + quickReply, ชิ้นละครั้ง+คูลดาวน์คน 3 วัน) → กดยินดีเข้าคิว fb_showcase_queue (migration 044) → sweep 11:00/19:00 โพสต์รอบละ 1 (การ์ด photo-card + แคปชัน LLM ตัวถูก sanitize) → คิวว่างหยิบคลังกบ (FB_LIBRARY_LINE_USER_ID) · Telegram แจ้งทุกโพสต์พร้อม permalink · token เพจอยู่ .env (FB_PAGE_ID/FB_PAGE_TOKEN — เชื่อมผ่าน /admin/facebook ของ ener-ai) · **staging เท่านั้น**: FB_AUTOPOST_ON_SCAN=true (สแกนปุ๊บโพสต์ปั๊บ ล็อกบัญชีกบ) — pro ใช้ consent+รอบเวลาปกติ · PostgREST: ตารางใหม่ต้อง GRANT web_anon+service_role + NOTIFY pgrst reload
- **ระบบชวนเพื่อน** (migration 045): พิมพ์/ปุ่ม "ชวนเพื่อน" (ปุ่มใหม่ใน paywall) → การ์ดโค้ด ENER-XXXX + ข้อความ forward · เพื่อนใหม่ (0 สแกน, รับได้ครั้งเดียว) พิมพ์โค้ด → bonus_scans +1 ทั้งคู่ (คนชวน ≤5/เดือน REFERRAL_MONTHLY_CAP) + push ขอบคุณ · โบนัสใช้เมื่อฟรีรายวันหมด consume ที่จุดสแกนจริงเท่านั้น (checkScanAccess consumeBonus:true) — **ไม่แตะ paid_until = ไม่ปลดเซ็นเซอร์** · consult รู้กติกา (ตอบเมื่อถาม)
- แผน Free→Paid: docs/ai/plans/ener-free-to-paid-conversion.md (รอกบเคาะลำดับ)

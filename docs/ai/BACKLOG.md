# BACKLOG — คิวงานทั้งหมด (มุมมองรวมทั้งธุรกิจ ณ 18 ก.ค. 2026)
(กติกา: งานใหม่เพิ่มเข้าหมวด · เริ่มทำ/เสร็จ ให้ย้ายหมวด พร้อมวันที่ · คิวฝั่ง ener-ai ดูไฟล์เดียวกันใน repo ener-ai ประกอบ)

## 🔔 มีกำหนดเวลา
- **ถึง ~31 ก.ค. 2026** — เฝ้าโปรใหม่ v2 บน pro (ขึ้นแล้ว 17 ก.ค.เย็น): conversion ฟรี→29→49 · ยอด/บิล · มีใครงงโปรเปลี่ยนไหม · แอด 20 ก.ค. อ่าน funnel แยกช่วงก่อน/หลัง 17 ก.ค.เย็น
- **~19 ก.ค. 2026** — เฝ้าคำตอบ DeepSeek ชั้นฟรีครบ 2-3 วัน: ถ้าหลุดบท/ปัดลูกค้าจ่าย → จูน prompt ชั้นฟรี หรือสลับ env `LLM_CONSULT_MODEL_FREE`
- **20 ก.ค. 2026** — นัดดูผลแอดหลังเพิ่มงบ 200→500: เช็ค Amount spent ต้อง >350 (ไม่ถึง = ติด cap ฿200 ระดับแคมเปญ ให้แก้ที่ Campaign level), ฿/ทะเบียน, funnel ทะเบียน→สแกน→จ่าย + ดูบิล OpenRouter ว่าลดจริงหลังเปิดแคช/สองชั้น

## ⭐ รอเคาะ (ออกแบบเสร็จแล้ว กบสั่งคำเดียวลุยได้)
0. **G Synergy "จัดชุดพลัง"** — สเปกนิ่งสนิท (docs/ai/plans/ener-synergy-report.md): แท่นจัดชุด + คำตอบวันนี้ + ค่าครู 99/4 ครั้งใน 399 + trigger 3/5 ชิ้น · demo 3 รอบแล้วที่ /payment/synergy-demo.html · ~2-3 วัน ← **คิวแรกตาม roadmap (ทุก AI เคาะตรงกัน)**
0.5 **ทะเบียนเกียรติคลังนักสะสม** — สเปกนิ่ง (docs/ai/plans/ener-collector-rank.md): ยศ 7 ขั้น + บัตรเกียรติคลัง + เลขทะเบียน ES + percentile + ตรา · ทำต่อจาก Synergy ~3-4 วัน
1. **แชร์การ์ดแลกสิทธิ์ฟรี +1** — ปุ่มส่งหลักฐานแชร์ → redis state 10 นาที → AI ตรวจแคป → บวก `free_scan_daily_offset` (กันโกง: วันละ 1 / phash dedupe / สัปดาห์ละ 3) ← แนะนำทำตัวแรก: การ์ดหรูเพิ่งขึ้น ใส่ตัวคูณ viral ได้จังหวะ
2. **ไดคัทพระลอยตัว** บนการ์ดแชร์ เฟส 2 (ตัดพื้นหลังด้วย ener-vision — ต้นทุนศูนย์)

## 🎯 คิวคุณภาพแชท (Codex เคาะแผนร่วม 20 ส.ค. 2026 — ทำ "หลัง" deploy pro @995d469 เท่านั้น ห้ามแซง)
1. **Deploy @995d469 Pro + smoke ตาม GO เดิม** — รอกบสั่ง "เอาขึ้น pro" (ปิดกลุ่ม B ของรายงานคุณภาพ 16-18 ส.ค. ทันที: exact utility ก่อน payment lanes รวม "ประวัติ" / in-flight bypass / identity deterministic / ranking gate / status routing)
2. **C1 Evidence-aware no-fabrication guard** — contract กลาง `enforceGroundedChatOutput(text, {expectedRole, intent, reportEvidence, kbEvidence, allowedFacts, userAskedAdvice})` ครอบ customer-visible LLM ทุก surface (direct consult, paywall consult, phrasing, conversation surface, state clarifier) · คะแนน/10, %, สี, เลข, พลังเฉพาะชิ้น ต้องตรง reportEvidence ของ user/job นั้น · KB facts ผ่านได้แต่ห้ามแปลงเป็นพลังเฉพาะชิ้น · สถิติรวมห้ามตอบถ้าไม่มี authorized query · ไม่มีหลักฐาน → retry พร้อม allowed facts 1 ครั้ง → deterministic fallback "ยังไม่มีข้อมูลยืนยัน" · **ห้าม regex กว้างบล็อกตัวเลข** (ราคา 49 บาท/วันเกิด/เวลา ต้องรอด) + ห้าม sanitize ตัวเลขมโนให้ดูจริง · prompt เป็นชั้นช่วย pre-send guard เป็นชั้นบังคับ
3. **C2 Language/link/role guard** — ①inbound external URL → deterministic ไทย AI=0 ("ลิงก์นี้อ่านเนื้อหาข้างในไม่ได้ ส่งข้อความหรือภาพมาแทน") ②LLM ตอบไทยเป็นหลัก ยอม proper noun/URL ③role-leak guard ตาม expectedRole/intent (อาจารย์ห้ามเล่ากลไกภายใน/แก้ตัวเป็นคน-โปรแกรม · identity route ใช้ factual copy เดิม · retry 1 ครั้ง → factual fallback) · **ห้าม global regex แบนคำ "ระบบ/โปรแกรม/AI"** (ชน identity/support ที่ถูกต้อง)
4. **C7 report idempotency** — chatQualityDailyReport เลิกพึ่ง tryDedupeOnce (fail-open + claim ก่อนรู้ผลส่ง) → durable outbox unique(reportDateTH, OA, chunkHash): instance เดียวสร้าง/ส่งต่อ chunk · mark sent หลังส่งสำเร็จ · partial failure retry เฉพาะ chunk ขาด · cron 2 instance วันเดียวกันส่งครั้งเดียว
5. **C3+C5 replay จาก metadata ก่อนแก้** — ack ซ้ำ: ดึง messageId/uploadId/scanJobId/outboundId ของเคสจริง (messageId เดิมซ้ำ→ack ครั้งเดียว · job เดียวมี pre_scan_ack >1 → unique ต่อ related_job_id+kind · คนละรูป/job → ไม่ใช่ bug แก้ quality detector ให้ correlate) · object-info ซ้ำ: replay objectKey+scanJobId+scanResultId (delivered/ครบแล้ว→ห้ามถามซ้ำ ผูก idempotency ที่ job/result) · **ห้าม cooldown ต่อ uid** ทั้งคู่ (กลืนของจริง)
6. **C6 Synergy persona policy** — ฟีเจอร์ไม่ใช่ bug · mixed voice ในข้อความเดียว = policy bug: แจ้งคลังครบ/URL/CTA = เสียงแอดมิน (exact "จัดชุด" ผ่าน sendNonScanReply speakerRole=admin) · คำแนะนำจับคู่ชิ้น = อาจารย์ เฉพาะเมื่อถูกถามหรือในรายงาน Synergy · เนื้อหาวิชาอยู่ในหน้ารายงาน

## 📋 คิว ener-scan (เรียงตามลำดับแนะนำ)
0.4 **Scoring v4 — shadow phase** (implement เสร็จ 11 ส.ค. เปิดบน staging) — กบสแกนสะสม 10-20 ชิ้นหลากสาย → Claude calibrate band 46-70 จาก scan จริง + distribution report → เคาะเปิด pro · แผน: ener-scoring-v4.md

0. **จำแนกประเภทวัตถุ เฟส 3** (เฟส 1+2 เสร็จ 18 ก.ค. — form 17 แบบ + motif 14 สาย LIVE ใน extractor): ชื่อสายเฉพาะ (หลวงปู่ทวด/ไอ้ไข่/จตุคาม — กบอาจเพิ่มลิสต์) + ปุ่ม feedback "ตรง/ไม่ตรง" ในรายงานเก็บสถิติ + ชุดภาพทดสอบ gold set วัด accuracy/abstention — รอข้อมูลจริงจากเฟส 1+2 ก่อน
3. **Scoring upgrade 4 ขั้น** (จาก 3-AI consensus 16 ก.ค.): ① ช่องภาพใหม่ ผิว/จาร/สมมาตร → ② คำอ่านอาจารย์ต่อองค์แบบมี trade-off → ③ Synergy จัดชุด (ตัวขายแพ็ก 299) → ④ กลไกพลัง 8 แบบ + หรี่ดวงสุ่ม
4. **Daily Match + streak** — "คุณ×องค์นี้×วันนี้ = N%" จากวันเกิด+วันที่ (เปลี่ยนทุกวัน ไม่กระทบคะแนนวัตถุที่ล็อกนิ่งแล้ว) — เครื่องยนต์ retention
5. **บุญร่วม referral** — สองฝั่งได้สิทธิ์ฟรี (flow ออกแบบครบ รอฐานลูกค้าขยับ)
6. **Batch scan 10 รูป** — เฉพาะแพ็ก 299 ผ่าน LIFF (1รูป=1job เดิม + batch_id + หน้าสรุป)
7. **คลังพระของฉัน** + บัตรสมาชิก/ต่ออายุ
8. **การ์ดกำไลหิน → ยิงแอดกลุ่มผู้หญิง** (ขยายตลาดแนวนอน — กำไลกันคะแนนชนแล้วตั้งแต่ extractor v2)

## 🎬 คิว ener-ai (รายละเอียดใน repo ener-ai: docs/ai/BACKLOG.md)
9. **TikTok รายวันจาก Auto Post** ท้ายคลิปชี้ LINE OA — เชื่อมสองโปรเจกต์ อยู่ในแผน growth เดือนนี้
10. Story Studio: **talking-drama** (OmniHuman lip-sync)
11. Field Shoot module (หลัง Auto Post นิ่ง)
12. Ener Platform PaaS (ระยะยาว)

## 🖥 จิปาถะ
- **Ener on WhatsApp — ตลาดต่างชาติ สิงคโปร์เป้าแรก (เคาะแล้ว 21 ก.ค. รอกบจดทะเบียนพาณิชย์)**: แผนเต็ม `docs/ai/plans/ener-whatsapp-global.md` — Web Scan MVP → GB Prime Pay รับบัตร → English funnel LINE → WhatsApp Cloud API (สมองเดิม) → แอดทดสอบสิงคโปร์ 2,000฿ · รวมงาน ~5-7 วัน
- **"Ener Home Scan" — ฮวงจุ้ยจากรูป (รอกบเคาะ A/B/C — แผนเต็มอยู่ที่ `docs/ai/plans/ener-home-scan-fengshui.md`)**: ทำเฉพาะ Form School (การจัดวาง/เตียง/เตา/กระจก/คาน — ห้ามเล่นทิศจากรูป) · สมอง 3 ชั้น: vision อ่านข้อเท็จจริง → rule engine (คลังกฎ structured ~60 ข้อ สร้างเอง ไม่มี open source ในโลก = moat) → LLM เรียบเรียงจากกฎที่ match เท่านั้น · คะแนน 5 มิติ/ห้อง + แยกคะแนนความมั่นใจ · **บทเรียนจีน: เงินจริงอยู่ที่ "วิเคราะห์ถูก→ชี้จุด→ขายของแก้" (margin 80%, เราขายพระถูกกฎหมาย+มี Ener Bridge รอ) + รายงานบาง=ตาย (จีน repeat <8%) รายงานหนา repeat 38%** · แผน: ① teaser 49฿ "ตรวจมุมวางพระ/1 ห้อง" add-on หลังสแกนพระ (~1-2 วัน) วัด conversion ② ติดแล้วค่อยเต็ม 3 พื้นที่ (ห้องนอน/โต๊ะทำงาน/ทางเข้า) 99/249/399 ไม่ทำรายเดือน (Recheck Pass 90 วันแทน) ③ ปลายทางเชื่อมขายวัตถุมงคล · repeat สร้างจากฉากใหม่: ย้ายบ้าน/เปิดร้าน/ตรวจให้เพื่อน/พระใหม่วางมุมไหน · Privacy: เบลอเอกสาร/หน้า + นโยบายลบรูป · เครื่องมือ: ใช้ multimodal LLM อ่านรูปตรง ๆ เฟสแรก (floor plan model มีให้ยืมทีหลัง: Structify-AI, 华为云 API)
- **โปรเจกต์ใหม่ "Ener Bridge" — วัตถุมงคลไทยสู่ eBay** (อัปเดต 18 ก.ค. หลังสังเคราะห์ 2-AI): เฟส 0 กบลองขายเองบน eBay ~1 เดือน · ก่อนขาย: เช็คส่งออกกับศุลกากร/กรมศิลป์ + Material Whitelist (โลหะ/เรซิน/เซรามิก/หินระบุได้ — เลี่ยงผงไม่ทราบส่วนผสม/สมุนไพร/กระดูก/ชิ้นส่วนสัตว์) · ขายเป็น "ชุดพร้อมใช้" $45-70 (พระ+กรอบ+สร้อย+กล่อง) ไม่ขายเดี่ยวราคาต่ำ (ค่าส่งฆ่า+ของถูกผิดปกติดูปลอม) · การ์ด 2 ใบ: Provenance Card (ข้อเท็จจริง) + Ener Scan card (ของแถมเชิงความเชื่อ ห้ามเรียก certificate) · เผื่อ fee 25-30% เป้ากำไร $15-20/ออเดอร์ · ตลาด: US→SG→AU→UK/CA · เกณฑ์ทำระบบ API: ส่งสำเร็จ 20-30 ออเดอร์ + dispute <3% · moat ระยะยาว: Digital Provenance Passport (QR ต่อชิ้น + ยอดช่วยวัดตรวจสอบได้) + QR ดึงเข้า Ener Scan
- ลอง kob-dev จาก Mac บ้าน (ลง Tailscale + Windows App แล้วต่อ 100.80.106.63 / เปิด vscode.dev)
- ไฟล์เศษใน ener-ai (SESSION_HANDOFF.md, ร่างพรอมต์ DeepSeek, รูปเทส) — ไม่ใช้แล้วลบได้

## ✅ เสร็จแล้ว (ล่าสุดอยู่บน)
- 17 ก.ค. 2026 (เย็น) — โปรใหม่ v2 (29/49/399 เลิก unlimited) + เกต "เคยจ่ายสักครั้ง" (ล็อกคลัง/เสียงคนไม่เคยจ่าย) → **LIVE pro** · 2 คนเดือนเดิม grandfather
- 17 ก.ค. 2026 — การ์ดแชร์โฉมหรู + แก้สระ ำ + แถวเข้ากับดวงเจ้าของ★% → LIVE pro · ห้องทำงาน kob-dev บน VPS ครบ (tunnel/RDP/Claude) · โครงบันทึกงาน AI ทั้งสอง repo
- 16 ก.ค. 2026 — สมองแชท 2 ชั้น (Opus/DeepSeek) + prompt cache ลดค่า OpenRouter · การ์ดลงทะเบียน Flex → LIVE pro
- 15-16 ก.ค. 2026 — เคสคุณชิต seed collision: extractor v2 + dHash ใน seed + ชดเชยลูกค้า — ปิดเคส
- 15 ก.ค. 2026 — เซ็นเซอร์คลังอันดับ 1-2 เฉพาะสมาชิกรายเดือน

- [ ] delivery worker: อัป scan_jobs.status → delivered หลัง outbound ส่งสำเร็จ (พบ 17 ส.ค.: 72 งานค้าง delivery_queued — result-status ตอบ "กำลังส่ง" กับงานที่ส่งไปแล้ว)
- [ ] A/B harness: deepScan.draft→mini (≥50 รูป) · forensic screen_check shadow (≥100 oversample เสี่ยง) · voiceScript blind 20-30 ชิ้น — เกณฑ์ตาม Codex 17 ส.ค.
- [ ] verifier: หลังข้อมูล rank 7 วัน → เสนอ cap/threshold ทีละตัว (สงวน recent quota ≥1)
- [ ] text awaiting_slip recency: helper กลาง resolveAwaitingPaymentConversationMode (SSOT isPaymentCommand/isPromoInquiryText + slip/status intents · >60 นาที + ไม่ใช่เรื่องเงิน = release สู่แชทปกติ + telemetry STALE_PAYMENT_TEXT_RELEASED) — Codex เคาะแนวแล้ว 18 ส.ค.
- [ ] rename supabase→db ทั้ง repo (54 ไฟล์ / 90 call sites): alias `db` เพิ่มแล้ว 18 ส.ค. ใน src/config/supabase.js — ทยอยย้ายไฟล์ที่แตะอยู่แล้วทีละงาน แล้วถอด alias ตอนครบ (ห้ามทำ big-bang ช่วงใกล้ deploy)
- [ ] recovery owner hardening (Codex 18 ส.ค. ไม่บล็อก): แยก dedupe "กำลังส่ง" กับ "ส่งสำเร็จ" กัน concurrent race + เพิ่ม job id/ลิงก์ /admin/payments ใน Telegram alert

## 🔐 ความปลอดภัย (26 ส.ค. 2026 — ทำแยกรอบ ต้องมีกบ)
- [ ] ล้าง shell history ทุกไฟล์ + ตั้ง HISTIGNORE · rotate key ตามรายการชื่อตัวแปร · revoke ของเก่า — แผน: docs/ai/plans/security-shell-history-rotation.md

## ❌ ยกเลิก (26 ส.ค. 2026)
- ชุด tone-hard / คิวคุณภาพแชท C1–C7 แบบ global — กบเลือก Pro เป็น baseline · ถ้าจะแก้แชท: เคสจริงทีละจุด

## 🧭 flow-role (26 ส.ค. 2026 — branch flow-role รอ staging replay)
- [ ] deploy staging + replay 13 เคสด้วยข้อความเดิม → GO Pro (ไม่แตะโทน ไม่มี global guard)
- [x] hasReport = delivered evidence (27 ส.ค.)
- [x] Codex P0-1 typed persistence / P0-2 ผม ทุกแบบ / P0-3 งบ AI ≤2 ต่อเทิร์น / P1 gate manifest + redis integration script (27 ส.ค. บ่าย)
- [x] redis integration บน staging container (live 13/13 + unavailable 4/4, 27 ส.ค.)
- [x] Codex รอบสี่: stale bind check ผ่าน scan_jobs / ตัด ครับผม / AI budget enforcement ที่ LLM boundary (27 ส.ค. เย็น)
- [ ] กบ/Codex เคาะ: งบ AI ต่อเทิร์น 2 (ตัด consult ใน 3.3% เทิร์นที่มี semanticCatcher นำ) หรือ 3
- [ ] H (product decision): auto-release รายงานที่ถูก gate ยึดเมื่อไม่กรอกข้อมูล — ยังไม่ทำ

# Flow/Role audit — 13 เคสจริง 20–25 ส.ค. 2026 (read-only, Pro `main@9a19b87`)

แหล่ง: `line_conversation_messages` + `scan_jobs` + `outbound_messages` + `payments` + docker log Pro (ย้อนถึง 19 ส.ค.) — ไม่ใช้ cron summary ตัดสิน · ยังไม่แก้โค้ด ยังไม่ deploy · โทนเดิมคงไว้ทั้งหมด

## 1. ตารางเคส

| # | เคส | raw state ที่พบ | root cause | ประเภท |
|---|---|---|---|---|
| 1 | 20 ส.ค. 20:48 U7d2012 ตอบชื่อ/ปี/พลังทั้งที่ยังไม่มีผล | ลูกค้าพิมพ์ "พระสมเด็จวัดประสาทบุญญาวาสปี 2506" 20:48:21 → consult 20:48:30 ตอบ "ทางอาจารย์อ่านพลังจากรูปแล้ว พลังเด่นออกทางสมดุลกับเมตตา" · รูปเพิ่งเข้าคิว 20:48:30 (job fffc8ac4) ผลจริง 20:49:55 · gate ถามข้อมูลซ้ำ 20:49:56 | ข้อความ "ข้อมูลชิ้น" ที่ลูกค้าพิมพ์**ก่อน/พร้อม**รูป ไม่มีตัวจับ → ตกไป consult ซึ่งแต่งผลจากชื่อรุ่น + อ้างว่าอ่านแล้ว · ข้อมูลไม่ถูกเก็บ gate จึงถามซ้ำ | **flow + role bug** (ชุด A) |
| 2 | 21 ส.ค. 15:29 Ubd31e แอดมินตอบปกป้อง/สมดุล/บารมีเอง | รายงาน 15:29:12 → purpose ask push ~15:29:19 → ลูกค้าพิมพ์ "เสริมบารมีครับ" 15:29:42 → consult (speakerRole=consult) "ชิ้นที่สแกนไว้เด่นด้านปกป้องกับสมดุล … เจอชิ้นไหนส่งรูปมาให้อาจารย์สแกนดูได้" | คำตอบ purpose แบบพิมพ์เอง "เสริมบารมี" ไม่อยู่ใน KEYMAP (งาน/การเงิน/ความรัก/คุ้มครอง/เสี่ยงโชค/สะสมบูชา) → หลุดไป consult → ตีความพลังในเสียงแอดมิน (ลงท้ายส่งให้อาจารย์) | **flow bug** (purpose) + **role bug** (ชุด C) |
| 3 | 21 ส.ค. 08:54 U5c070 ขอข้อมูลหลังอ้างว่าอ่านเสร็จ | 08:54:18 in_flight_wait "อีก 1-2 นาทีผลออก" → 08:54:22 gate ask "อาจารย์อ่านพลังเสร็จแล้ว ก่อนส่งผล ขอข้อมูล" · job 00c8cdab มี result 08:54:21 (delivery_queued → hold) · ส่งผล 08:54:34 หลังลูกค้าตอบ | state ตรงตามคำพูด: คำนวณเสร็จจริง ยึดก่อน delivery ตามดีไซน์ | **cron false positive** |
| 4 | 22 ส.ค. 07:46 U9ab979 ตีความพลังจากชื่อรุ่น | "เหรียญหลวงปู่หนูเพชร รุ่นหนุนดวง" 07:46:44 (รูปมา 07:47:14) → consult "รุ่นนี้เด่นด้านหนุนดวงครับ ดูจากชื่อรุ่นก็ตรงกับพุทธคุณ…" | เหมือนเคส 1 | **flow + role bug** (ชุด A) |
| 5 | 22 ส.ค. 06:38 Ua1f60 "จัดชุดพระ" ถูกขายสแกน | "จัดชุดพระให้หน่อยครับ" → planner noop_phrase (phase1 paywall_selecting_package) → phrasing "ยังจัดชุดไม่ได้ ต้องสแกนก่อน 4 ชิ้น … 49 บาท สนใจไหม" · คลังลูกค้า **234 ชิ้น** | `maybeHandleSynergyRequest` จับเฉพาะ `^(จัดชุด\|ชุดวันนี้\|ชุดพลัง\|จัดชุดพลัง)$` (exact) → ประโยคยาวไม่เข้า → ตกไป orchestrator ใน paywall state → phrasing มโน "4 ชิ้น" + ขาย (handler บรรทัด 4893 อยู่ก่อน paywall แล้ว แค่ regex แคบ) | **flow bug** (ชุด D) |
| 6 | 22 ส.ค. 21:24 U4c3b97 ถามพลังแต่โดนเสนอแพ็ก | "มีแบบพลังเต็มไหมครับ" 21:22:26 → consult **timeout** ("This operation was aborted" 12 วิ) → fallback idle_post_scan "ส่งรูปมาได้เลย" 21:22:43 → ลูกค้าส่งรูป → paywall_deferred (สิทธิ์หมด) → "โอเคครับ" → เมนูแพ็ก | คำถามไม่ได้คำตอบเพราะ consult timeout แล้ว fallback เป็น nudge ส่งรูป ไม่ใช่คำตอบ · เมนูแพ็กมาหลังลูกค้าตอบ "โอเค" ต่อ paywall = ถูก state · consult error 2/54 ใน 7 วัน | **flow bug** (fallback หลัง timeout) — ส่วน "แพ็กแซง" = false positive |
| 7 | 22 ส.ค. 10:45 Uc2c4e ส่งให้อาจารย์แล้วแต่ไม่มีผล | ack 10:45:44 → gate ask 10:47:00 (job 73b7cada delivery_queued มี result) → `OBJECT_INFO_SAVED via:form` 11:02:33 → ผล 11:02:35 | ผลมาจริงหลังลูกค้ากรอกฟอร์ม 15 นาที — รายงานถูกยึดรอข้อมูลตามดีไซน์ ไม่ใช่งานหาย | **cron false positive** (UX: ack สัญญา "เดี๋ยวผลมา" แล้วต้องกรอกก่อน) |
| 8 | 22 ส.ค. 21:29/21:33 U4c3b97 ทวงสลิปซ้ำ | 21:24:35 QR → สลิป 21:25 → `slip_manual_review` ×2 (รูปสลิป 2 ครั้ง) → payment 0187e2a9 manual_review → ลูกค้าส่ง**รูปพระ** 21:29 และ 21:33 → `pending_verify_block_scan` "รูปนี้อาจารย์เก็บไว้ก่อน สลิปกำลังตรวจอยู่" → อนุมัติ 23:15 | ไม่ได้ทวงสลิป — บอกสถานะ "กำลังตรวจ" ถูกตามสถานะจริง (manual_review 1 ชม. 50 นาที) | **cron false positive** (ค้างจริงคือเวลา review ของแอดมิน) |
| 9 | 22 ส.ค. 07:48 U9ab979 ถามข้อมูลซ้ำ | เหมือนเคส 4: ข้อมูลที่พิมพ์ก่อนรูปไม่ถูกเก็บ → gate ถาม 07:48:28 | เหมือนเคส 1/4 | **flow bug** (ชุด A) |
| 10 | 23 ส.ค. 19:22 U9e79b3 สัญญาว่าผลจะมาแต่ไม่มี | ack 19:22:25 "เดี๋ยวผลมาในแชทนี้" → gate ask 19:23:38 → ลูกค้ากรอกฟอร์ม 19:59:26 → ผล 19:59:27 | ผลมาจริงหลังกรอก 36 นาที — ยึดตามดีไซน์ | **cron false positive** (UX เดียวกับเคส 7) |
| 11 | 23 ส.ค. 23:50 U03877 ตอบอันดับ/คะแนนบทบาทไม่ชัด | "พระชิ้นไหนที่เข้ากับผมมากที่สุด" → consult (role=consult) "ชิ้นแรก… 63% กับชิ้นที่สอง 65%" + ลิงก์ 2 อัน · ไม่มี payment ใน 3 วัน → ไม่มีสิทธิ์อันดับ | `RANKING_RE` ไม่มี "เข้ากับ…มากที่สุด" → ไม่เข้า deterministic redirect (AI=0) → consult ให้ % ทั้งที่ไม่มีสิทธิ์ และเสียง unknown | **flow + role bug** (ชุด E) |
| 12 | 24 ส.ค. 07:11 U339c61 แอดมินตีความเมตตา/แคล้วคลาด/บารมี | "หลวงปู่ศุข วัดปากคลองมะขามเฒ่า…" 07:11:05 (รูปมา 07:12:07) → consult "ท่านเด่นด้านเมตตาและแคล้วคลาดครับ … ส่งรูปมาให้อาจารย์สแกนดูได้เลยครับ" | เหมือนเคส 1/4 | **flow + role bug** (ชุด A) |
| 13 | 25 ส.ค. 16:46 Ua1f60 แนะนำสายเสน่หาในเสียงแอดมิน | "สายเสน่ห์ ต้องหาพระแบบไหน" → consult (role=consult) "สายเสน่หาเชื่อกันว่า พระขุนแผน ตะกรุด… ส่งรูปมาให้อาจารย์สแกนดูได้" | คำแนะนำทั่วไปเรื่องพระ = งานอาจารย์ แต่โมเดลตอบเสียงกลาง/แอดมิน + ปิดด้วย handoff · `resolveSpeakerRole` ให้ unknown→consult (ไม่มี "อาจารย์+กริยา") ไม่มีตัวบังคับเสียง | **role bug** (ชุด C) |

**"ระบบ" ใน customer-visible (19–25 ส.ค.)**: 2 ข้อความ ทั้งคู่ U4c3b97 23 ส.ค. 08:51/08:53 consult "…มีแค่ชิ้นเดียว**ในระบบ**ทั้งหมด" · ต้นเหตุ: `customerFactsContext.util.js:40` ป้อน "สถิติคะแนนรวมทั้ง**ระบบ**" ให้โมเดล → โมเดลทวนคำ · deterministic copy ที่ลูกค้าเห็นและมี "ระบบ": `lineWebhook.js:2327` "รับรูปแรกไว้แล้วครับ **ระบบ**อ่านครั้งละ 1 ชิ้น…" (multi-image hold) — ที่เหลือเป็น admin command / HTTP error page / LLM prompt (ไม่ใช่แชทลูกค้า)

สรุป: bug จริง 9 (ชุด A ×4 · C ×2 · D ×1 · E ×1 · timeout fallback ×1) · cron false positive 4 (#3, #7, #8, #10) · แก้แล้วในโค้ดปัจจุบัน 0

## 2. Minimal patch plan (ไม่แตะโทน ไม่รื้อ prompt ไม่มี global guard)

| ชุด | ไฟล์/flow | แก้ | เคส |
|---|---|---|---|
| **A** ข้อมูลชิ้นพิมพ์ก่อน/พร้อมรูป | `objectInfoGate.service.js` + จุดเรียกใน `lineWebhook.js` handleTextMessage (ก่อน consult) | เพิ่ม `maybeCapturePreScanObjectInfo`: ข้อความสั้น (≤80) ไม่ใช่คำถาม และ `parseOwnerInfo` (LLM JSON ที่มีอยู่แล้ว) ให้ `isObjectInfo=true` → เก็บ `objinfo:preprovided:{uid}` (TTL 15 นาที) + ตอบแอดมินสั้นตามโทนเดิม ("รับข้อมูลชิ้นนี้ไว้แล้วครับ ส่งรูปมาได้เลย") · ห้ามเข้า consult · `maybeHoldReportForObjectInfo` เจอ preprovided → บันทึก object_owner_info ทันที **ไม่ถาม** | 1, 4, 9, 12 |
| **B** purpose พิมพ์เอง | `maybeHandlePurposeAnswer` | มี `objinfo:purpose` ค้าง + ข้อความสั้น (≤30) ไม่ใช่คำถาม/คำสั่ง → เก็บเป็น purpose free-text (คอลัมน์รับ 40 ตัว) + ตอบด้วย copy เดิม "รับทราบครับ ชิ้นนี้พกเพื่อ{ข้อความ}…" · ไม่ตกไป consult | 2 |
| **C** เสียงอาจารย์สำหรับคำแนะนำพระ/พลัง | `geminiFrontOrchestrator.service.js` `tryConsultReply` (ต่อจาก money guard เดิม) | targeted role guard: ข้อความมี energy/amulet advice (เด่นด้าน/พุทธคุณ/สาย…/ควรพก/เหมาะกับ) **และ** `resolveSpeakerRole` ≠ ajarn → retry ครั้งเดียวด้วย extraDirective "ตอบส่วนนี้เป็นเสียงอาจารย์ ไม่ต้องบอกให้ส่งรูปให้อาจารย์" · retry ยังไม่ผ่าน → ส่งของเดิมแต่ tag speakerRole ตามจริง (ไม่เงียบ) · กลไกเดียวกับ money guard เดิม ไม่ใช่ sanitizer | 2, 13 (+กันชุด A ซ้ำ) |
| **D** จัดชุด | `maybeHandleSynergyRequest` | regex exact → `/จัดชุด|ชุดวันนี้|ชุดพลัง/` บนข้อความ ≤40 ตัว (deterministic เดิม, handler อยู่ก่อน paywall แล้ว) · copy เดิมคงไว้ | 5 |
| **E** ranking | `rankingQueryGate.util.js` | เพิ่ม `เข้ากับ(ผม\|ฉัน\|เรา\|ดวง)?(มาก)?ที่สุด\|เหมาะ(กับผม)?(มาก)?ที่สุด` ใน `RANKING_RE` → redirect deterministic เดิม (AI=0, copy เดิม) | 11 |
| **F** consult timeout fallback | true-idle caller ของ `replyIdleTextNoDuplicate` | orchestrator คืน `idle_bypass_consult_null` **และ** ข้อความเป็นคำถาม → fallback แอดมินตามโทนเดิม "ขอเวลาอาจารย์ดูคำถามนี้แป๊บครับ พิมพ์ถามอีกทีได้เลย" แทน nudge ส่งรูป (ไม่สัญญาตอบเอง เพราะไม่มีงาน durable) | 6 |
| **G** "ระบบ" | `customerFactsContext.util.js:19,20,40,46,88` (LLM context) · `lineWebhook.js:2327` | context: "ทั้งระบบ"→"ทั้งหมดที่อาจารย์เคยดู", "ระบบมองวัตถุไม่ชัด"→"ภาพมองวัตถุไม่ชัด" · copy 2327: "ระบบอ่านครั้งละ 1 ชิ้น"→"อาจารย์อ่านครั้งละ 1 ชิ้น" · **ไม่ทำ sanitizer** แก้ต้นทางที่โมเดลทวน | ระบบ ×2 |
| **H** UX gate (ไม่ใช่ bug) | pre_scan_ack copy | ไม่แก้รอบนี้ — แค่บันทึก: "เดี๋ยวผลมา" + gate ยึด = ลูกค้ารอจนกรอก (เคส 7/10) ถ้ากบอยากปรับค่อยสั่ง | 7, 10 |

## 3. Test acceptance ต่อเคส (behavior, hermetic)
1. admin route (pre-scan info / purpose / synergy / ranking redirect) ห้ามมี energy interpretation
2. ajarn route ตอบผลได้เมื่อมี report evidence (regression เดิมคงอยู่)
3. ก่อนมี report: ข้อความ "ชื่อ/วัด/รุ่น/ปี" → capture preprovided, transport 1 (ack แอดมิน), consult ไม่ถูกเรียก (fake generate = 0)
4. มี preprovided/object_owner_info แล้ว → `maybeHoldReportForObjectInfo` คืน not_held (ไม่ถาม)
5. slip pending_verify → รูปพระ = `pending_verify_block_scan` (คงเดิม) และไม่มีข้อความ "ส่งสลิป" ซ้ำ — regression ล็อกเคส 8
6. "จัดชุดพระให้หน่อยครับ" กับคลัง ≥3 → synergy link (copy เดิม) ไม่เข้า orchestrator
7. customer outbound ทุก boundary ห้ามมี "ระบบ" → static scan เฉพาะสตริงที่ส่งลูกค้า (ไม่ใช่ log/prompt/admin)
8. role guard C: fake consult ตอบ advice เสียงแอดมิน → retry 1 ครั้ง → ยังไม่ผ่านก็ยังส่ง (transport 1) ไม่เงียบ
9. speakerRole/replyType/source บันทึกหลัง `sent===true` เท่านั้น (handler A/B/F)
10. consult timeout (fake generate throw abort) + ข้อความคำถาม → fallback F transport 1

## 4. ปรับ rubric `ener_chat_quality` (`chatQualityDailyReport.service.js` ANALYZER_SYSTEM)
- เพิ่ม: แอดมินพูดเรื่องพลัง = ปัญหา · อาจารย์พูดเรื่องพลังจาก evidence (มีรายงานของลูกค้า) = ปกติ · แอดมินตอบเรื่องเงิน/สถานะ/คิว = ปกติ · ไม่ต้องบังคับให้ทุกข้อความเป็นอาจารย์
- เพิ่ม: คำว่า "ระบบ" ใน customer-visible output = ปัญหา (ทุกเสียง)
- เพิ่ม false-positive trap: `object_info_gate_ask` หลัง in_flight_wait/ack = ปกติถ้ามี scan_result ตามมา (ดู state) · `pending_verify_block_scan` ที่บอก "สลิปกำลังตรวจ" ไม่ใช่การทวงสลิป
- ไม่แตะเกณฑ์โทนเดิม

## 5. ยืนยัน
- ไม่เปลี่ยนโทนเดิม ไม่รื้อ prompt (แก้เฉพาะ 5 บรรทัด context ที่มี "ระบบ") ไม่มี global contract/sanitizer/length cap
- ทุก guard ใหม่ (C) มี fallback ส่งจริง ไม่เงียบ
- ลำดับ: กบ/Codex เคาะแผน → แก้บน branch `flow-role` → gate → deploy staging → replay 13 เคสด้วยข้อความเดิม → ขอ GO Pro

# CODEX REVIEW — สมุดตรวจงาน Ener Scan

อัปเดตล่าสุด: 12 ส.ค. 2026  
เจ้าของเอกสาร: Codex ใช้ตรวจและเสนอความเห็นให้ Claude  
ขอบเขต: บันทึกสิ่งที่กบเคยถาม, สิ่งที่ Codex ตรวจพบ, สิ่งที่แก้แล้ว และจุดที่ต้องตรวจต่อ

> ไฟล์นี้เป็นดัชนีการ review ไม่ใช่ source of truth ของ production
> ก่อนตรวจทุกครั้งให้อ่าน `STATE.md`, `LOG.md`, `BACKLOG.md` และยืนยันกับโค้ด/commit จริงเสมอ

## วิธีใช้รอบถัดไป

1. ดู branch, working tree และ commit ล่าสุดก่อน
2. อ่านหัวข้อ "งานที่ยังเปิด" ในไฟล์นี้
3. เทียบคำกล่าวอ้างของ Claude กับ diff และ test ที่เกี่ยวข้อง ห้ามรับจากข้อความสรุปอย่างเดียว
4. แยกผลเป็น `ยืนยันแล้ว`, `แก้บางส่วน`, `ยังไม่ทำ`, `เห็นต่างโดยมีเหตุผล`
5. ห้ามเสนอเรื่องเดิมซ้ำ ถ้าแก้แล้วและไม่มี regression
6. หลังตรวจ ให้เติม Review Ledger ด้านล่างพร้อม commit และหลักฐาน test

## ภาพรวมระบบที่เกี่ยวกับการตรวจ

- Ener Scan เป็น LINE OA ลูกค้าส่งรูปพระ/เครื่องราง/กำไลหิน แล้วได้รับรายงานพลัง คะแนน/เกรด และเสียง
- ฟรีวันละ 1 ชิ้น มีสิทธิ์แบบชำระเงิน รายละเอียดราคาและสถานะ LIVE ให้ยึด `STATE.md` และ DB override ไม่ยึดข้อความเก่าในแชท
- flow persona เป้าหมายมี 2 บทบาทในห้อง LINE เดียว:
  - `admin`: รับรูป, ขอข้อมูล, แจ้งคิว/เวลา, สิทธิ์, โปร, QR และการชำระเงิน ห้ามอ่านหรือตีความพลัง
  - `ajarn`: อ่านพลังและให้คำแนะนำเชิงวิชา ห้ามพูดเรื่องเงินหรือชวนจ่ายทุกกรณี
- handoff เป้าหมาย: แอดมินแจ้งว่าจะเรียนถาม → อาจารย์ตอบ; ไม่จำเป็นต้องเกริ่นซ้ำทุกข้อความเมื่อยังอยู่ในช่วงอาจารย์ตอบต่อเนื่อง
- ข้อจำกัดด้านข้อความ: ห้ามขู่ให้กลัว, FOMO ปลอม, การันตีผล, อวยเกินหลักฐาน หรือทำให้สองบทบาทดูเป็นละครหลอกลูกค้า
- scan flow เป็น asynchronous มี webhook ingestion, scan worker, outbound delivery, conversation history, Redis state และ Telegram monitoring

## เรื่องที่กบเคยให้ Codex ตรวจ/เสนอ

### A. คะแนนและคำอ่านพลัง

- ตรวจสูตรคะแนนเดิมและที่มาของคะแนนเมื่อส่งพระ
- พบเดิมว่า hash `% 25 - 9` ให้ช่วง `-9..+15` ไม่ใช่ ±10 ทำให้คะแนนเฉลี่ยถูกดันขึ้น
- พบปัญหาเลขสองเจ้าของ: LLM ออก `energyScore` พร้อมกับสูตร deterministic อีกชุด
- พบ `mainEnergyLabel` nudge และตัวอย่าง prompt แนว "ปังมาก...ฟันธง" ขัดกติกาห้ามอวย
- แผนที่เคยเสนอและกบ/Claude รับไป: hash สมมาตรขนาดเล็ก, เลขชุดเดียว, LLM ห้ามสร้างคะแนนเอง, ตัด nudge, เก็บ score breakdown ฝั่ง admin และใช้สูตร overall ใหม่แบบ shadow ก่อน
- เอกสารหลัก: `docs/ai/plans/ener-scoring-v4.md`
- สถานะล่าสุดที่ทราบ: scoring v4 อยู่ shadow บน staging ต้อง calibrate จากรูปจริง 10–20 ชิ้นก่อนพิจารณา production
- รอบหน้าตรวจ: distribution, คะแนนต่ำ/สูง, stable seed ของชิ้นเดิม, evidence contribution, collision, coherence และยืนยันว่าไม่เปลี่ยนรายงานเก่า

### B. Persona แอดมิน → อาจารย์

- กบตัดสินใจแล้วว่าต้องแยกสองบทบาท ไม่ต้องย้อนกลับไปเสนอ persona เดียว
- Codex เคยเสนอชุดข้อความ 5 จังหวะ, รูปแบบเปิดข้อความอาจารย์, handoff ที่ไม่ทำซ้ำเกินไป, edge cases และเส้นจิตวิทยาที่ห้ามข้าม
- เหตุจริงที่ต้องแก้: อาจารย์เคยเสนอขายระหว่างลูกค้าเพียงถามคำถาม ทำให้เสียความขลังและลูกค้าไม่พอใจ
- release criterion สำคัญ: ต้องกันก่อนส่ง ไม่ใช่เพียงแจ้ง Telegram หลังลูกค้าเห็นแล้ว

### C. Flow scan และ conversation monitoring

- ตรวจการรับรูป, pre-scan acknowledgement, multi-image, object-info gate, delivery history, dangling handoff, payment QR metadata และ human delay
- กบต้องการใช้ Hermes Agent/ระบบเดิม monitor flow chat และส่งสรุป Telegram ทุกวัน
- สิ่งที่ monitor ควรเห็น: transcript ครบ, speakerRole/replyType/source, อาจารย์พูดเงิน, handoff ค้าง, ข้อความวน, ลูกค้าด่า/ทวง, scan/result latency, report ข้ามลำดับ และคำตอบผูกผิดชิ้น

### D. Growth และ conversion

- กบเคยถามเรื่องฐาน LINE OA ราว 400 คน, การหาลูกค้าจาก Facebook Ads, ทำอย่างไรให้คนยอมจ่าย และเป้าหมาย 10,000 คนใน LINE
- แนวคิดต้องรักษากติกา: conversion เป็นหน้าที่แอดมิน/ระบบ ไม่ใช่อาจารย์; ห้ามใช้ความกลัว, scarcity/FOMO ปลอม หรือคำรับประกัน
- ก่อนทำ growth เพิ่ม ควรวัด funnel อย่างน้อย: add → ส่งรูป → ได้ผล → ถามต่อ → paywall → intent → จ่ายสำเร็จ → กลับมาใช้ซ้ำ และแยก source/campaign

## สิ่งที่ยืนยันว่าแก้แล้วบน staging

### Commit `db2fef8`

- เพิ่ม conversation history ของ `pre_scan_ack` และ marker `scan_result` พร้อม metadata
- เพิ่ม QR path metadata ฝั่งแอดมิน
- ปรับ multi-image ครั้งที่ 2 ให้ไม่ตำหนิและบอกว่ารูปเพิ่มไม่หักสิทธิ์
- ตัด emoji ที่หลุดในข้อความแนบรูป
- เพิ่ม priority rule: paywall เป็นข้อยกเว้นเดียวที่แอดมินเสนอทางจ่ายได้

### Commit `5eeff5c`

- `detectDanglingHandoff` ไม่นับ `speakerRole=consult`; สำเร็จเฉพาะ `ajarn` หรือ `replyType=scan_result`
- no-tag หลัง metadata rollout ไม่นับเป็นคำตอบ ป้องกัน metadata regression ถูกซ่อน
- history insert ของ ack/result เปลี่ยนเป็น `await`
- marker ผลสแกนย้ายมาหลัง delivery สำเร็จทันที ก่อน hooks และ quota notice
- multi-image copy หลักเปลี่ยนเป็นเสียงแอดมิน ไม่มี emoji และ test ตรงกับ runtime
- pre-scan ack ทั้ง 10 variants ตัดคำสัญญาเวลาสั้นเกินจริง ใช้ 2–3 นาทีหรือข้อความกลาง ๆ
- Codex รันยืนยันเฉพาะจุด: `chatQualityDeterministic` 7/7 และ `multiImageRejection` 5/5 ผ่าน

## งานที่ยังเปิด — ต้องตรวจซ้ำก่อน persona split ขึ้น production

### Blocker หลัก

- **C2 pre-send money guard (เริ่มใน `bccf43f`, ยังไม่ผ่าน review):** มี retry/fallback ก่อนส่ง consult แล้ว แต่ guard ปัจจุบันถือว่าแค่มีคำว่า `ผม` ก็อนุญาตเรื่องเงิน ทำให้ข้อความ `mixed` หรืออาจารย์ใช้สรรพนามผิดยังผ่านได้; fallback ยังชวนเลือกซื้อ จึงอาจทำซ้ำเหตุเดิมในเสียงแอดมิน และ guard ยังไม่ได้ครอบทุก ajarn outbound
- **C3 role router (เริ่มใน `bccf43f`, ยังไม่ผ่าน review):** deterministic router มี `admin/ajarn/mixed/unknown` แต่ข้อความอ่านพลังทั่วไปที่ไม่มีคำว่า “อาจารย์” ยังเป็น `unknown` และถูกเก็บกลับเป็น `consult`; คำกล่าวว่า consult ใหม่ทุกตัวมี tag เสียงจริงจึงยังไม่ครบ ต้องใช้ route/intent เป็นข้อมูลหลักและ surface text เป็นสัญญาณเสริม
- **H6 handoff state (MVP ใน `bccf43f`, ยังไม่ใช่ state เต็ม):** มีเพียง `last_speaker` TTL 30 นาที; ยังไม่มี topic/turn/scanResultId/handoffDone และปัจจุบันอาจ set state หลัง gateway suppress เพราะ wrapper ไม่คืนผล `sent`
- **Gateway regression ใน `bccf43f`:** `sendNonScanSequenceReply` และ `sendNonScanPushMessage` อ้าง `speakerRoleOverride` โดยไม่ได้ destructure จาก `opts`; Codex reproduce ได้ว่า LINE transport ส่งออกแล้วจึงเกิด `ReferenceError` ทั้งสองเส้น ต้องแก้และเพิ่ม test ก่อน deploy
- ยังห้ามปลด `consult` กลับเข้า dangling-success จน router coverage วัดจากข้อมูลจริงและ state ผูก handoff ถูก turn

### Review commit `5583238`

- **ปิดแล้ว:** ReferenceError ของ sequence/push; targeted tests รวม persona+gateway ผ่าน 11/11 · gateway wrapper คืนผล และ last-speaker hint เขียนเฉพาะ `sent === true` · mixed/ajarn/unknown ที่มีคำเงินถูก block
- **Blocker — defer ไม่ถึง deterministic payment:** `tryConsultReply()` คืน `false` เมื่อ retry ยังเสี่ยงและ user มี money intent แต่ caller ของ `consult_amulet`, `send_help_reply` และ `consult_chat` จะไหลต่อเข้า `runGeminiPhrasing()` ใน orchestrator เดิม ไม่ได้ส่งตรงเข้า deterministic payment flow ตาม comment
- **Blocker — unsolicited admin money ยังผ่าน:** ถ้า retry เปลี่ยนข้อความเป็นเสียง admin ที่มีคำว่า `ผม` + เงิน guard ถือว่าปลอดภัยทันที แม้ลูกค้าถามเฉพาะพลัง; ต้องมี guard อีกแกน `hasMoney && !userMoneyIntent && !paywall/paymentState` เพื่อกันปัญหาต้นเรื่อง “เสนอขายเอง” ไม่ใช่ตรวจแค่ใครพูด
- **Blocker — neutral fallback สร้าง dangling เอง:** ข้อความ `เดี๋ยวผมเรียนถามอาจารย์ให้ใหม่อีกทีครับ` ถูกส่งแล้วจบรอบโดยไม่มี ajarn follow-up; regex handoff จะจับ และลูกค้าถูกปล่อยให้รอ ต้องใช้ recovery ที่ไม่สัญญา future action หรือส่งคำตอบอาจารย์จริงใน turn เดียวกัน
- **Test gap:** sequence/push tests ยืนยัน transport + `sent` + no throw แต่ยังไม่ assert ว่า history ได้ `speakerRoleOverride` ถูกต้อง; orchestrator ยังไม่มี branch tests ของ blocked→retry→defer/fallback

### Review commit `4460f1d`

- **ปิดแล้ว:** unsolicited-money guard แยก speaker/timing ถูกทิศ; payment state อนุญาต admin money · neutral fallback ไม่ match handoff และไม่สัญญางานอนาคต · Codex รัน targeted 13/13 และ baseline 959 pass / 19 known-fail ไม่มี regression ใหม่
- **ยังไม่ปิด — `deferTo` ไม่มี consumer:** orchestrator คืน `{ handled:false, deferTo:"deterministic_payment" }` ครบสาม call sites และไม่ fall through เข้า phrasing ภายในแล้วจริง แต่ค้นทั้ง repoพบ `deferTo` เฉพาะสามจุดที่ return ไม่มี webhook/caller จุดใดอ่านค่า; caller ทุกจุดตรวจเพียง `.handled` แล้วไหลไป deterministic fallback ของ branch ปัจจุบัน ซึ่งไม่ได้รับประกันว่าเป็น payment flow
- ต้องเลือกอย่างใดอย่างหนึ่ง: (A) ให้ wrapper กลาง consume `deferTo` และเรียก deterministic payment handlerพร้อมกัน recursion หรือ (B) เปลี่ยน contract เป็น outcome ที่ caller แต่ละ insertion point จัดการและมี integration test ยืนยัน customer money turn ได้ price/QR/clarifier เพียงหนึ่งคำตอบ
- **Intent vocabulary gap:** `USER_MONEY_INTENT_RE` ยังไม่ครอบคำที่ระบบ payment เดิมรู้จักทั้งหมด เช่น `โปร`, `QR/คิวอาร์`, `ซื้อ`, `เพิ่มรอบ`, `ต่อสมาชิก`; ควร reuse SSOT `isPaymentCommand/isPromoInquiryText` หรือส่ง boolean intent จาก webhook/planner แทน regex ชุดใหม่

### Review commit `058c151`

- **ปิด blocker defer contract:** main webhook wrapper consume `deferTo=deterministic_payment` แล้วเรียก `handlePaymentCommandTextRoute(... forcePaymentIntent:true)` หนึ่งครั้ง; success คืน handled=true ให้ call sites เดิมหยุด และ failure คืน handled=false ให้ deterministic branch เดิมเดินต่อ
- **recursion guard ถูกต้อง:** payment handler เรียก snapshot orchestrator path ซึ่งไม่ consume defer ซ้ำ จึงไม่มีวงวนกลับ wrapper
- **ปิด intent drift ระยะแรก:** main และ snapshot entries ส่ง `userMoneyIntent = isPaymentCommand || isPromoInquiryText` จาก SSOT เดิม; regex local เหลือ deprecated fallback เท่านั้น
- Codex รัน targeted persona+detector 14/14 และ baseline 960 pass / 19 known-fail ไม่มี regression ใหม่
- หมายเหตุไม่เป็น blocker: ชื่อ “deterministic payment route” ยังมี Phase-1 Gemini hook ภายในบาง branch แต่ hook ไม่ consume ซ้ำและ deterministic fallback ยังเป็นเจ้าของผลสุดท้าย
- สถานะ: C2/C3/H6 **ระยะแรกครบวงจรบน staging**; ยังไม่เท่ากับ C3/H6 ฉบับเต็ม — mixed-split, planner-intent role routing และ state topic/turnId/scanResultId/handoffDone ยังเป็นรอบถัดไป

### Object-info gate / concurrent scans

- ไม่บล็อกลูกค้าสแกนชิ้นถัดไประหว่างเกตค้าง เพราะเคยทำให้ลูกค้าสแกนจำนวนมากโดนถามซ้ำหลายรอบ
- ก่อนเปิด flow รอบใหม่บน production ต้องมี:
  - thumbnail ของชิ้นที่กำลังถาม
  - `relatedScanResultId` หรือ correlation id บน card/reply
  - telemetry `out_of_order_delivery` และ `answer_bound_to_wrong_item` หรือสัญญาณเทียบเท่า
  - ทดสอบ A รอข้อมูล → B ส่งผลก่อน → ลูกค้าตอบข้อความทั่วไป ว่าคำตอบยังผูก A ถูกต้อง

### Test hygiene

- full suite ยังมี technical debt 19 tests แต่ commit `52a00ce` เพิ่ม exact manifest ที่ `tests/known-failing.txt` และตัวตรวจ `scripts/test-baseline-check.sh` แล้ว
- Codex รันสคริปต์จริงเมื่อ 12 ส.ค. 2026: `952 pass / 19 fail` และไม่พบ failure ใหม่นอก baseline
- กติกาถาวรใน `CLAUDE.md`: ห้ามใช้เพียง "จำนวน fail เท่า baseline"; ต้องเทียบชื่อ test ที่ fail
- ถ้ามี fail ใหม่นอก manifest สคริปต์ exit 1; ถ้า known-fail กลับมาเขียว สคริปต์แจ้งให้ลบออกจาก manifest
- งานแยก `test:unit-clean` พักไว้จนถึงรอบล้างหนี้ 19 tests

### จุดเล็กที่ต้องยืนยัน

- M10 human delay เป็น product decision ของกบ; ข้อเสนอค้างคือยกเว้น QR, ยืนยันชำระ, error/status และข้อความที่ต้องตอบทันที
- M12 บังคับทุก outbound ผ่าน gateway ที่ require metadata ยังเป็น refactor รอบถัดไป

### จุดที่ปิดแล้วใน commit `52a00ce`

- ยืนยัน `META_ROLLOUT_MS = 12 ส.ค. 00:00 ไทย` เป็น intentional grace period ราว 5 ชั่วโมง หลัง deploy metadata จริงประมาณ 19:00 วันที่ 11 เพื่อรองรับ blue-green instance เก่า/ใหม่คาบเกี่ยว
- เพิ่ม exact known-fail manifest, baseline check script และกติกา release ถาวรใน `CLAUDE.md`

## แนวทางตรวจเมื่อ Claude ส่งสรุปมา

- หา commit ที่อ้างถึงและตรวจ `git show --stat` + diff เฉพาะไฟล์
- ตรวจทั้ง implementation และ test; test ที่แก้ expected อย่างเดียวไม่พิสูจน์ behavior
- รัน targeted tests ด้วย dummy env โดยห้ามอ่านค่า `.env` จริง
- ตรวจตำแหน่ง side effect ด้วย เช่น "ส่ง LINE สำเร็จ → บันทึก history → hooks/notice"
- สำหรับ detector ให้ทดสอบอย่างน้อย: admin ตามหลัง, ajarn ตามหลัง, consult, no-tag ก่อน/หลัง rollout, เกินเวลา, ข้อความคนละงาน และข้อมูลไม่เรียงเวลา
- สำหรับ persona ให้ทดสอบ adversarial เช่น คำถามพลังมีคำว่า "ราคา", คำถามเงินปนพลัง, paywall side question และข้อความ mixed
- ห้าม deploy production เว้นแต่กบสั่งชัดเจน

## Review Ledger

| วันที่ | ผู้ตรวจ | Commit/ขอบเขต | ผล | ค้าง |
|---|---|---|---|---|
| 12 ส.ค. 2026 | Codex | scoring/flow/persona รอบแรก | พบ score bias, เลขสองเจ้าของ, nudge, history/tag/handoff gaps | scoring v4 calibration, persona hardening |
| 12 ส.ค. 2026 | Codex | `db2fef8` | รับบางส่วน; พบ consult/no-tag false success, history fire-and-forget, stale multi-image test | แก้ใน `5eeff5c` |
| 12 ส.ค. 2026 | Codex | `5eeff5c` | targeted tests ผ่าน; 4 จุดแก้ตรงข้อเสนอ | C2/C3/H6, C1 card correlation, test baseline, rollout cutoff |
| 12 ส.ค. 2026 | Codex | `52a00ce` | ยืนยัน grace-period comment; baseline script รันจริง 952/19 และไม่พบ fail ใหม่ | C2/C3/H6, C1 card correlation, หนี้ known-fail 19 ตัว |
| 12 ส.ค. 2026 | Codex | `bccf43f` persona hardening ระยะแรก | รับทิศทาง แต่พบ gateway ReferenceError, money guard bypass ด้วย `ผม`, unknown ยังเป็น consult และ state ไม่รู้ send/suppress | แก้ก่อน production; C2/C3/H6 ยังเป็น partial |
| 12 ส.ค. 2026 | Codex | `5583238` | ReferenceError/role guard/send-result แก้จริง; targeted 11/11 ผ่าน แต่ defer routing, unsolicited admin money และ dangling fallback ยังผิด | แก้ 3 logic blockers + เพิ่ม orchestrator branch tests |
| 12 ส.ค. 2026 | Codex | `4460f1d` | guard timing/fallback ปิด; targeted 13/13 + baseline 959/19 ผ่าน | `deferTo` ยังไม่มี consumer; intent regex ต้องใช้ payment SSOT |
| 12 ส.ค. 2026 | Codex | `058c151` | defer consumer + payment SSOT ต่อครบ; targeted 14/14 + baseline 960/19 ผ่าน | mixed-split/planner router, handoff state เต็ม, DI integration debts |

## กติกาการอัปเดตไฟล์นี้

- สิ่งที่ deploy แล้วต้องระบุ `LIVE pro` พร้อม commit/date; คำว่า staging ห้ามตีความว่า production
- เมื่อรายการเสร็จ ให้ย้ายจาก "งานที่ยังเปิด" ไป "ยืนยันว่าแก้แล้ว" พร้อมหลักฐาน
- ถ้า Claude เห็นต่าง ให้เก็บเหตุผลและผลตัดสินของกบ ไม่ลบประวัติ
- อย่าใส่ secret, LINE user id เต็ม, ข้อมูลลูกค้า หรือค่าจริงจาก `.env`

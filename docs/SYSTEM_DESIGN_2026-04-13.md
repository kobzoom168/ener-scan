# Ener Scan — System Design (Current Working Truth)
**Last updated: 13-Apr-2026**

Ener Scan ตอนนี้เป็น **Hybrid LINE + Web async scanning platform** แกนที่ล็อกชัดคือ **HTML report เป็นผลลัพธ์หลัก**, **Flex เป็น summary-first handoff**, และ **truth ของระบบอยู่ที่ payload/code/db**

---

## 1) Product direction

- **LINE / Flex** = summary-first handoff
- **HTML report** = primary artifact
- **Payload/code/db** = truth layer
- ใช้ **Object Family Report Framework** เป็นแกน
- แต่ละ object family มี **lane ของตัวเอง** แยก identity, axes, wording, visual framing

---

## 2) Core runtime architecture

- webhook รับรูป → persist → enqueue → return เร็ว
- `worker-scan` ทำ object check, deep scan, build payload, persist result, publish report
- `worker-delivery` ส่ง LINE outbound
- `worker-maintenance` ดู queue health / sweep / dead-letter / **DLQ alert LINE push**
- DB + storage เป็น source of truth
- legacy inline scan path ถูกถอดออกจาก production runtime แล้ว

ตารางแกนของ runtime:
- `scan_uploads` / `scan_jobs` / `scan_results_v2`
- `outbound_messages` / `conversation_state` / `report_publications`

---

## 3) Lane routing — 3-lane strict closed-world (ล็อกแล้ว)

```
moldavite → sacred_amulet → crystal_bracelet → unsupported
```

ผ่าน `resolveSupportedLaneStrict()` ใน `src/utils/reports/supportedLaneStrict.util.js`

| Lane | เงื่อนไข |
|---|---|
| `moldavite` | Gemini crystal subtype + moldavite detection pass |
| `sacred_amulet` | objectFamily = thai_amulet / takrud / somdej / sacred_amulet |
| `crystal_bracelet` | ผ่าน 2 GPT passes (family + form) + `braceletEligible: true` |
| `unsupported` | ทุกอย่างที่พิสูจน์ lane ไม่ได้ |

Worker reject ทันทีถ้าไม่ผ่าน lane ใด — ไม่มีทาง fallback กลับ generic/legacy

---

## 4) Object Gate hardening (ทำแล้ว)

`src/services/objectCheck.service.js`:

- เพิ่มคีย์เวิร์ด tarot / card / trading card / slip / screenshot / bank slip
- **Hard reject** เมื่อ pass 1 + pass 2 เป็น `unsupported` ทั้งคู่
- JSON parse fail → `inconclusive` (ไม่ default เป็น unsupported ผิดพลาด)
- `permissiveAllowsSingleSupportedUpgrade` — อนุญาต upgrade เฉพาะ confidence ≥ 0.72 + family ถูก + objectCount === 1
- export `permissiveLabelFromParsedJson`, `normalizeObjectCheckOutput`

**classifyObjectCategory bias fix (ทำแล้ว):**
- error path คืน `"อื่นๆ"` แทน `"พระเครื่อง"` (ลด bias เมื่อ OpenAI ล้มเหลว)
- empty image guard คืน `"อื่นๆ"` เช่นกัน
- log event: `OBJECT_CLASSIFY_ERROR_DEFAULT_USED`

---

## 5) Crystal Bracelet lane (ครบ stack แล้ว)

**Routing (Gate 3a/3b):**
- `runStrictCrystalFamilyCheck` (GPT) → crystal / sacred_amulet / unknown
- `runStrictBraceletFormCheck` (GPT) → bracelet / necklace / unknown
- **Gate 3 Rescue:** `classifyBraceletFormWithGemini` (`src/integrations/gemini/braceletFormRescue.service.js`) — เรียกเฉพาะเมื่อ Gate 3b ตอบ unknown/inconclusive

**Payload:**
- `buildCrystalBraceletStrictLaneReportPayload` — early-exit ก่อน generic pipeline
- ไม่ผ่าน generic crystal energy-copy / DB wording / `applyCrystalMinimumSections`
- log event: `REPORT_PAYLOAD_CRYSTAL_BRACELET_EARLY_EXIT`

**Flex:** `src/services/flex/flex.crystalBraceletSummary.js`
- สีฟ้า (`CB_ACCENT = "#7dd3fc"`, `CB_CTA_BG = "#0ea5e9"`)
- identity: "กำไลหินคริสตัล · อ่านจากพลังรวม"
- copy จาก `crystalBraceletV1.flexSurface` เท่านั้น

**HTML:** `src/templates/reports/crystalBraceletReportV2.template.js`
- standalone ไม่ import Moldavite/Amulet
- disclaimer คงที่: "ผลนี้อ่านจากพลังรวมของกำไลทั้งเส้น ไม่ยืนยันชนิดหินรายเม็ด"

**Worker:** `buildSummaryLinkFlexShell` ใน `processScanJob.service.js` จัดการทุก 3 lanes

---

## 6) Moldavite lane (ปรับเพิ่มแล้ว)

| Feature | รายละเอียด |
|---|---|
| Owner identity card | ไม่แสดง trait score แต่แสดง identity phrase + chips ราศี + SVG glyph (deterministic จาก seed) |
| จังหวะเสริมพลัง section | derive v1: วันแนะนำ / ช่วงเวลา / โหมด / เหตุผล ใน `moldaviteEnergyTimingDerive.util.js` |
| Radar compatibility dot | จุดเทา = alignment.axisKey (|owner−หิน| น้อยสุด) + pulse animation |
| Graph summary 3 แถว | พลังเด่น / เข้ากับคุณที่สุด / มุมที่ควรค่อย ๆ ไป |
| Footer trust note | `[หมายเหตุ] Moldavite ไม่ได้ทำงานกับทุกคนเหมือนกัน…` |
| ระดับพลัง | S / A / B / D ผ่าน `energyLevelGrade.util.js` |
| Score strip | ชิด hero ก่อน radar (spacing ปรับแล้ว) |
| Energy timing animation | ค่าเวลากระพริบ `mv2EtTimeSoftBlink` 2.6s |

**Radar:** จุดเขียว = crystalPeakAxisKey, จุดเทา = alignAxisKey (ถ้าต่างจาก peak)

---

## 7) Sacred Amulet lane (ปรับเพิ่มแล้ว)

| Feature | รายละเอียด |
|---|---|
| Hero โทนหลัก | = แกนสูงสุดบนกราฟจริง (peakShort จาก ord[0]) ไม่ใช่ mainEnergyShort จาก LLM |
| แถว 2 กราฟ | "เข้ากับคุณที่สุด" = alignKey จาก `pickAlignKeyAmongTopTwo` (`amuletOrdAlign.util.js`) |
| Radar secondary dot | จุดเทา = alignKey (ถ้าต่างจาก peak) + pulse |
| Clarifier line | เหลือแค่ "สรุปจากสแกน" ไม่ต่อ mainEnergyShort อีกแล้ว |
| ระดับพลัง | S / A / B / D (สีทอง/bronze ตามเกรด) |
| Footer disclaimer | `<p class="mv2a-footer-note">` ย้ายเข้า `<footer class="mv2-trust">` เป็นบล็อกแรก |
| ปุ่มแชร์ | สีน้ำเงิน #1877F2 (Facebook brand) |
| ลบ em dash | ไม่มี `—` ในข้อความที่ผู้ใช้เห็น (copy / timing / placeholder) |

---

## 8) Shared helpers ที่ทุก lane ใช้ร่วมกัน

| Helper | ที่อยู่ | ใช้โดย |
|---|---|---|
| `energyLevelGrade.util.js` | `src/utils/reports/` | Moldavite, Amulet |
| `amuletOrdAlign.util.js` | `src/amulet/` | Amulet HTML + Flex |
| `buildSummaryLinkFlexShell` | `scanFlexReply.builder.js` | Worker (ทุก lane) |
| `renderReportHtmlPage` | `reportHtmlRenderer.service.js` | Report controller |
| `fnv1a32` | `moldaviteScores.util.js` | Deterministic seeding |
| `resolveSupportedLaneStrict` | `supportedLaneStrict.util.js` | Worker routing |

---

## 9) Graceful shutdown (ทำแล้ว)

`src/workers/workerGracefulShutdown.util.js`:
- `waitForGracefulDrain({ getActiveCount, timeoutMs, pollMs })` — poll จนกว่า active jobs = 0 หรือ timeout

**scanWorker:** `isShuttingDown=true` → หยุดรับ job ใหม่ → รอ `activeJobs===0` → exit
**deliveryWorker:** pattern เดียวกัน ใช้ `activeDeliveries`

| ENV | Default | ความหมาย |
|---|---|---|
| `SCAN_WORKER_GRACEFUL_TIMEOUT_MS` | 90000 | รอสูงสุด 90s ก่อน force exit |
| `DELIVERY_WORKER_GRACEFUL_TIMEOUT_MS` | 30000 | รอสูงสุด 30s |

log events: `SCAN_WORKER_SHUTDOWN_CLEAN` / `SCAN_WORKER_SHUTDOWN_TIMEOUT`

---

## 10) Dead Letter Queue alert (ทำแล้ว)

`src/services/maintenanceDlqAlert.service.js`:
- `maybeSendDlqAlert({ outDead, outFailed })` — LINE push ถึง admin เมื่อ `outDead >= threshold`
- เรียกจาก `maintenanceWorker.js` ทุก cycle หลัง `logQueueHealthAndDlq()`
- push ล้มเหลว → log error แต่ไม่ throw (maintenance loop ไม่หยุด)

| ENV | Default | ความหมาย |
|---|---|---|
| `ADMIN_LINE_USER_ID` | — | LINE userId ของ admin (ใส่ใน worker-maintenance) |
| `CANARY_DLQ_DEAD_ALERT_THRESHOLD` | 1 | จำนวน dead ขั้นต่ำก่อน alert |

ข้อความที่ส่ง: `[DLQ Alert] outbound_messages.dead = N, failed = M`

---

## 11) Score consistency — stableFeatureSeed (ทำแล้ว — env ปิดอยู่)

`src/services/stableFeatureExtract.service.js` — GPT สกัด `{ primaryColor, materialType, formFactor, textureHint }` จากรูป
`src/utils/stableFeatureSeed.util.js` — hash features ด้วย `fnv1a32` → seedKey คงที่
ใช้ seedKey แทน UUID ใน `computeXxxScoresDeterministicV1` — wired ใน `processScanJob.service.js` และ `reportPayload.builder.js` แล้ว
fallback เป็น UUID ถ้า extract ล้มเหลว

`STABLE_FEATURE_SEED_ENABLED=false` (default ปิด — เปิดได้เมื่อพร้อม)

---

## 12) Gemini integration ปัจจุบัน

| Service | ไฟล์ | ทำอะไร |
|---|---|---|
| Crystal subtype classifier | `integrations/gemini/crystalSubtypeClassifier.service.js` | แยก moldavite vs อื่น |
| Bracelet form rescue | `integrations/gemini/braceletFormRescue.service.js` | Gate 3 rescue เมื่อ GPT ตอบ unknown |
| Front orchestrator | `geminiFront/` | Conversation layer |

---

## 13) Security

- **Webhook signature verify** — `line.middleware(lineConfig)` ของ `@line/bot-sdk` ตรวจ `x-line-signature` ทุก request อัตโนมัติ — request ปลอมถูก reject ก่อนเข้า handler
- **Per-user rate limit** — ยังไม่มี (known gap)

---

## 14) ENV flags สำคัญ

| Flag | Default | ความหมาย |
|---|---|---|
| `CRYSTAL_BRACELET_ENABLE_STRICT_PASS` | true | เปิด Gate 3a/3b GPT passes |
| `CRYSTAL_BRACELET_FAMILY_MIN_CONFIDENCE` | 0.8 | confidence threshold family check |
| `CRYSTAL_BRACELET_FORM_MIN_CONFIDENCE` | 0.8 | confidence threshold form check |
| `GEMINI_BRACELET_RESCUE_ENABLED` | false | Gemini rescue Gate 3 |
| `GEMINI_BRACELET_RESCUE_MIN_CONFIDENCE` | 0.65 | confidence threshold rescue |
| `GEMINI_CRYSTAL_SUBTYPE_ENABLED` | — | Gemini moldavite subtype classifier |
| `STABLE_FEATURE_SEED_ENABLED` | false | stable score seed (ทำแล้ว รอเปิด) |
| `SCAN_WORKER_GRACEFUL_TIMEOUT_MS` | 90000 | graceful shutdown timeout scan |
| `DELIVERY_WORKER_GRACEFUL_TIMEOUT_MS` | 30000 | graceful shutdown timeout delivery |
| `ADMIN_LINE_USER_ID` | — | LINE userId admin รับ DLQ alert |
| `CANARY_DLQ_DEAD_ALERT_THRESHOLD` | 1 | จำนวน dead ก่อน alert |

---

## 15) Known gaps / next

| เรื่อง | สถานะ |
|---|---|
| Per-user rate limit | ยังไม่มี — LINE 429 เป็น signal หลักตอนนี้ |
| Graceful shutdown scanWorker | ✅ ทำแล้ว |
| classifyObjectCategory default bias | ✅ แก้แล้ว (คืน "อื่นๆ" เมื่อ error) |
| Dead letter alert | ✅ ทำแล้ว |
| stableFeatureSeed | ✅ ทำแล้ว (env ปิดอยู่) |
| Out-of-domain lane (tarot/ของนอกขอบเขต) | object gate กัน hard keyword แต่ยังไม่มี dedicated UX |

---

## สรุปสั้นที่สุด

Ener Scan ตอนนี้คือ:

- **shared async scan core** (webhook → worker-scan → worker-delivery)
- **HTML-first, Flex-summary-first**
- **payload/code/db เป็น truth**
- **3-lane strict routing: moldavite | sacred_amulet | crystal_bracelet**
- **legacy amulet path = unreachable from normal routing**
- **Moldavite** = framework prototype + timing/identity/graph/S-A-B-D ครบ
- **Sacred amulet** = graph-first, hero ตรงกราฟ, alignKey radar, S-A-B-D grade
- **Crystal bracelet** = lane ใหม่ครบ stack, Gemini rescue ready (env ปิดอยู่)
- **Score stability** = ทำแล้ว wired ครบ (env ปิดอยู่)
- **Graceful shutdown** = ทำแล้ว ทั้ง scan + delivery worker
- **DLQ alert** = ทำแล้ว push LINE ถึง admin อัตโนมัติ
- **Object gate** = classifyObjectCategory bias แก้แล้ว + keyword hard-reject ครบ

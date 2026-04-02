# Ener Scan — System Design Updates (V2 Lockover Candidate)

**Version:** 03-Mar-2026 · V2 lockover candidate summary (operational / as-built)

---

## ภาพโครงสร้างแบบง่าย

```
[ผู้ใช้ใน LINE]
      |
      | 1) ส่งรูปพระ / วัตถุ
      v
[LINE Messaging API]
      |
      v
[ener-scan / webhook]
      |
      | 2) ตรวจสิทธิ์เบื้องต้น
      | 3) ดึงรูปจาก LINE
      | 4) เก็บรูปลง Storage
      | 5) สร้าง scan job ใน DB
      | 6) enqueue ข้อความ "ได้รับรูปแล้ว"
      v
+-------------------------------+
| DB / Queue / Storage          |
|-------------------------------|
| scan_uploads                  |
| scan_jobs                     |
| scan_results_v2               |
| outbound_messages             |
| conversation_state            |
| payment_notifications         |
|                               |
| Supabase Storage / S3 bucket  |
+-------------------------------+
      |
      | 7) worker-scan มาหยิบ job
      v
[worker-scan]
      |
      | 8) โหลดรูปจาก Storage
      | 9) object check
      | 10) GPT / AI วิเคราะห์
      | 11) แปลงผลเป็นโครงกลาง
      |     - report payload
      |     - flex payload
      |     - summary text
      | 12) publish HTML report
      | 13) save result ลง DB
      | 14) enqueue final delivery
      v
[outbound_messages]
      |
      | 15) worker-delivery มาหยิบคิว
      v
[worker-delivery]
      |
      | 16) ส่งกลับ LINE
      |     - pre-scan ack
      |     - final Flex
      |     - link ไป HTML report
      |     - approve/reject/payment messages
      v
[ผู้ใช้ใน LINE เห็นผลลัพธ์]
```

---

## ภาพแบบ “เส้นทางข้อมูล”

- รูปจากลูกค้า → เก็บเป็นไฟล์ใน Storage → สร้างแถว `scan_uploads` → สร้างแถว `scan_jobs` (`status=queued`)
- `scan_jobs` → worker-scan claim → GPT อ่านรูป / วิเคราะห์ → สร้างผลลัพธ์กลาง (ReportPayload)
- ReportPayload → HTML Report + Flex Summary + ข้อความสั้นสำหรับแชต
- ทั้งหมดถูกบันทึกลง `scan_results_v2` → enqueue `outbound_messages` (`kind=scan_result`)
- worker-delivery → ส่ง Flex + ข้อความ + ลิงก์ report กลับเข้า LINE

---

## ถ้าจะมองเป็น “สมอง 3 ก้อน”

### 1) สมองรับงาน — ener-scan / webhook

- รับรูป เก็บรูป สร้าง job
- ไม่ทำ AI หนักใน request นี้เป็นหลัก

### 2) สมองวิเคราะห์ — worker-scan

- โหลดรูปจาก storage → GPT / AI → ผลลัพธ์กลาง → HTML/Flex payload

### 3) สมองส่งกลับ — worker-delivery

- ส่งข้อความกลับ LINE, retry / backoff / 429, scan result / approve / payment / pre-ack

---

## GPT อยู่ตรงไหน

```
Storage -> worker-scan -> GPT วิเคราะห์ -> ReportPayload -> save DB
```

- GPT ไม่อ่านจาก webhook ตรง ๆ — อ่านจากรูปที่เก็บแล้ว
- restart / retry ยังหยิบ job เดิมทำต่อได้ — ลดภาระ webhook

---

## Output หลังวิเคราะห์ (3 ชั้น)

1. **`scan_results_v2`** — truth ของผลวิเคราะห์ใน DB  
2. **HTML report** — artifact หลัก  
3. **Flex summary** — การ์ดสรุปใน LINE  

สอดคล้อง product direction: **HTML report = artifact หลัก**, **Flex = summary / handoff layer**

---

## ภาพ flow ละเอียด (ย่อ)

```
User sends image in LINE
          -> Webhook API (verify, access, download, upload storage, create job)
          -> Storage (original / object / report assets)
          -> Postgres (scan_uploads, scan_jobs, scan_results_v2, outbound_messages, conversation_state)
          -> Scan Worker (object validation, GPT, result parsing, report build, flex build)
          -> Report Payload -> Flex card | HTML report
          -> Delivery Worker (send LINE, retry/backoff, 429)
          -> User sees result in LINE
```

---

## 1) Product direction ชัดขึ้น

Ener Scan เป็น **async AI scanning platform** แยกชัด: ingestion / AI processing / delivery / truth-state

- **HTML report = artifact หลัก**
- **Flex = summary / handoff layer**

---

## 2) จาก sync bot เป็น async queue architecture

```
LINE user
  -> webhook รับรูป
  -> เก็บรูปลง storage
  -> create scan job
  -> enqueue outbound ack
  -> worker-scan หยิบ job
  -> GPT / AI วิเคราะห์
  -> สร้าง report payload
  -> publish HTML report
  -> สร้าง Flex summary
  -> enqueue outbound result
  -> worker-delivery ส่งกลับ LINE
```

เป้ารองรับ concurrent load โดยให้ webhook เบาและ drain ผ่าน worker/queue

---

## 3) Service split (4 processes)

| Service | หน้าที่หลัก |
|---------|-------------|
| **ener-scan (web)** | Webhook, access, ดึงรูป, storage, `scan_jobs`, enqueue outbound, ตอบเร็ว |
| **worker-scan** | claim job, object check, GPT, report + flex, `scan_results_v2` |
| **worker-delivery** | pre-ack, scan_result, approve/reject/payment, retry/429 |
| **worker-maintenance** | stale requeue, queue health, DLQ/replay support |

---

## 4) แยกรูปออกจาก processing

- รับรูป → **save storage ก่อน** → worker โหลดจาก storage ประมวลผล  
- webhook เบาขึ้น, restart/retry ได้, scale ง่ายขึ้น — **แกนสำคัญของ V2**

---

## 5) Truth layer ใหม่

ตารางหลัก: `scan_uploads`, `scan_jobs`, `scan_results_v2`, `outbound_messages`, `conversation_state`, `payment_notifications`

- **conversation_state** dual-write — session memory ไม่ใช่ truth เดี่ยว ๆ  
- migration แบบ DB + fallback memory

---

## 6) Outbound unify

เส้นสำคัญย้ายเข้า `outbound_messages` — delivery worker เป็นจุดส่งจริง → retry / DLQ / rate เป็นระบบ

---

## 7) Redis เป็น runtime layer (PR3)

- short locks, dedupe, rate hint, 429 canary, heartbeat, cutover safety

---

## 8) Scan path policy

- `ENABLE_ASYNC_SCAN_V2=true` สำหรับ production scan flow
- เส้น **inline sync / `runScanFlow`** ถูกถอดออกจาก runtime แล้ว — ไม่มี emergency sync scan ผ่าน env flag ชุดเก่า

---

## 9) Report wiring บน V2 path

- public report, `report_url` / `html_public_token` / `report_payload_json` ใน `scan_results_v2`
- guard: ไม่ commit token/url จนกว่า report insert สำเร็จ

---

## 10) Quota policy

- **หัก paid quota หลัง final delivery success** — ไม่หักตอน create job / GPT จบ / save result เท่านั้น

---

## 11) Canary / cutover readiness

องค์ประกอบ: queue health, stale requeue, safe replay, dedupe ต่อ `line_message_id`, `/health/scan-v2`, canary thresholds

สถานะ: **พร้อม canary จริง** / **lockover candidate** — cleanup legacy เป็นช่วงถัดไป

---

## 12) Current status

**Primary path:** webhook ingest → `scan_jobs` / `outbound_messages` → worker-scan → report publish → worker-delivery — legacy inline scan ถูกลบออกจากโค้ดแล้ว

---

## สรุปสั้นที่สุด

จาก **webhook-centric synchronous bot** → **async AI scanning platform**: webhook รับเข้า → storage → worker scan → report publish แยก → outbound queue → LINE — DB/Redis ถือ truth และ runtime — HTML report หลัก, Flex เป็น handoff

---

## Related docs

- [`ENER_SCAN_V2_ROLLOUT.md`](./ENER_SCAN_V2_ROLLOUT.md)
- [`ENER_SCAN_V2_PR3_CUTOVER.md`](./ENER_SCAN_V2_PR3_CUTOVER.md)
- [`ENER_SCAN_V2_FINAL_MIGRATION_PLAN.md`](./ENER_SCAN_V2_FINAL_MIGRATION_PLAN.md)

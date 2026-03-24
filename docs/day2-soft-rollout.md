# Day 2 — Soft rollout + production verification

ไม่เปลี่ยน copy หนักในรอบนี้ — โฟกัสแค่ **presentation / cohort** + **log + metric**

## 1) เปิด summary-first แค่ 10–20% traffic

ตั้งค่า env (production):

| Variable | ค่าแนะนำ (soft rollout) | หมายเหตุ |
|----------|-------------------------|----------|
| `FLEX_SCAN_SUMMARY_FIRST` | `true` | master เปิดฟีเจอร์ |
| `FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT` | `15` (หรือ `10`–`20`) | เปอร์เซ็นต์ผู้ใช้ที่ได้ UI แบบ summary-first (stable hash จาก LINE `userId`) |
| `ROLLOUT_WINDOW_LABEL` | e.g. `day2-2026-03-20` | optional — แยกช่วงใน log |

- **ค่าเริ่มต้น** ของ `FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT` = **100** (ถ้าไม่ตั้ง env = ทุกคนได้ summary-first เมื่อ master เป็น `true`)
- User เดิมจะอยู่ cohort เดิมเสมอ (bucket 0–99 จาก `userId`)

## 2) Log ที่ต้องเห็นใน production

| Event | ควรมี field สำคัญ |
|-------|---------------------|
| `SCAN_RESULT_FLEX_ROLLOUT` | `schemaVersion`, `flexPresentationMode`, `reportLinkPlacement`, `hasObjectImage`, `summaryFirstBuildFailed`, `envFlexScanSummaryFirst`, `flexScanSummaryFirstRolloutPct`, **`flexScanSummaryFirstSelected`**, **`flexRolloutBucket0to99`** |
| `REPORT_PAGE_OPEN` | `schemaVersion`, `tokenPrefix`, `outcome`, `httpStatus`, `hasObjectImage` |
| `REPORT_RENDER_TIMEZONE_OK` | `schemaVersion`, `timeZone: Asia/Bangkok`, `generatedAtBangkok` |
| `FLEX_SUMMARY_FIRST_FAIL` | `schemaVersion`, `lineUserIdPrefix`, `flexScanSummaryFirstRolloutPct`, `flexRolloutBucket0to99` |

ตัวอย่าง grep (stdout / log aggregator):

```text
SCAN_RESULT_FLEX_ROLLOUT
REPORT_PAGE_OPEN
REPORT_RENDER_TIMEZONE_OK
FLEX_SUMMARY_FIRST_FAIL
```

## 3) Metric ปลายวัน (สรุปใน spreadsheet)

- **summary-first traffic (effective):** นับ `SCAN_RESULT_FLEX_ROLLOUT` ที่ `flexScanSummaryFirstSelected === true`
- **report open:** นับ `REPORT_PAGE_OPEN` ที่ `outcome === "ok"` และ `httpStatus === 200`
- **open rate:** opens / scanc complete ที่มีลิงก์รายงาน (หรือ / `REPORT_PUBLIC_OK` ตามนิยามทีม)
- **hasObjectImage vs no-image:** แยกจาก `hasObjectImage` ใน `SCAN_RESULT_FLEX_ROLLOUT` / `REPORT_PAGE_OPEN`
- **fallback count:** นับ `FLEX_SUMMARY_FIRST_FAIL` + `flexPresentationMode === "summary_first_fallback_legacy"` ใน rollout log

## 4) ยืนยันเวลา LINE / HTML / admin หลัง deploy

- ใช้เคสเดียวกัน (scan เดียวกัน): เวลาใน LINE (history/stats), hero บน HTML report, admin dashboard ต้องสอดคล้อง **Asia/Bangkok** (ดู `REPORT_RENDER_TIMEZONE_OK`)

## 5) Rollback (เฉพาะ presentation — ไม่รื้อ scan logic)

| สถานการณ์ | การทำ |
|------------|--------|
| **Rollback ทันที** ให้ทุกคนกลับ legacy Flex | ตั้ง `FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT=0` **หรือ** `FLEX_SCAN_SUMMARY_FIRST=false` |
| ไม่ต้องแก้ scan / DB / ReportPayload | แค่ env + redeploy / reload |

ถ้า **fallback สูง** หรือ **report open ต่ำผิดปกติ:** ลด `%` หรือปิด master ตามตารางด้านบน แล้ววิเคราะห์จาก log ก่อนปรับ copy (Day 3)

---

หลังจบ rollout window ให้กรอก **`docs/post-rollout-review-template.md`** เป็น decision memo สำหรับ Day 3 (อ่าน log อย่างเดียว — ไม่แก้ copy ในเอกสารนั้น)
